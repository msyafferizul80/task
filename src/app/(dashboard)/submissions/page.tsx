'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Select, Input, InputNumber, Table, Tag, Typography, Spin, message, Modal, Form, Button, DatePicker, Space } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile, PriorityType } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import { PlusOutlined, EditOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface Submission {
    id: number;
    reference_number: string;
    client_id: number;
    title: string;
    description: string | null;
    category: string | null;
    priority: 'Low' | 'Medium' | 'High';
    status: string;
    assigned_company_id: number | null;
    company_name: string | null;
    created_at: string;
    updated_at: string;
    task_id?: string | null;
    archived?: boolean;
}

export default function SubmissionsPage() {
    const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [form] = Form.useForm();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [matchesInOppositeView, setMatchesInOppositeView] = useState<Submission[]>([]);
    const [syncing, setSyncing] = useState(false);

    const [searchText, setSearchText] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDateRange, setFilterDateRange] = useState<[any, any]>([null, null]);

    // Helper function to add N business days, skipping weekends
    const addBusinessDays = (date: dayjs.Dayjs, days: number) => {
        let result = date.startOf('day');
        let addedDays = 0;
        while (addedDays < days) {
            result = result.add(1, 'day');
            const dayOfWeek = result.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                addedDays++;
            }
        }
        return result;
    };

    const supabase = createClient();
    const { role } = useRole();

    const fetchAllSubmissions = useCallback(async () => {
        try {
            // Fetch both active and archived to check for matches
            const [activeRes, archivedRes] = await Promise.all([
                fetch(`/api/submissions?archived=false`).then(res => {
                    if (!res.ok) throw new Error('Failed to fetch active submissions');
                    return res.json();
                }),
                fetch(`/api/submissions?archived=true`).then(res => {
                    if (!res.ok) throw new Error('Failed to fetch archived submissions');
                    return res.json();
                })
            ]);

            const all = [
                ...(Array.isArray(activeRes) ? activeRes : []).map(s => ({ ...s, archived: false })),
                ...(Array.isArray(archivedRes) ? archivedRes : []).map(s => ({ ...s, archived: true }))
            ];
            setAllSubmissions(all);
            return all;
        } catch (err) {
            console.error('Error fetching all submissions:', err);
            return [];
        }
    }, []);

    const fetchData = useCallback(async (archived = false) => {
        setLoading(true);
        setSubmissions([]);
        setFilteredSubmissions([]);
        setMatchesInOppositeView([]);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || null;
            setCurrentUserId(userId);

            const [submissionsRes, profilesRes, customersRes] = await Promise.all([
                fetch(`/api/submissions?archived=${archived}`).then(res => {
                    if (!res.ok) throw new Error('Failed to fetch submissions');
                    return res.json();
                }),
                supabase.from('lv_profiles').select('id, full_name').eq('status', 'active').order('full_name'),
                supabase.from('tsk_customers').select('id, name, is_internal').order('name'),
                fetchAllSubmissions()
            ]);

            if (profilesRes.error) throw profilesRes.error;
            if (customersRes.error && customersRes.error.code !== '42P01') throw customersRes.error;

            setSubmissions(Array.isArray(submissionsRes) ? submissionsRes : []);
            setProfiles(profilesRes.data || []);
            setCustomers(customersRes.data || []);
        } catch (error: any) {
            console.error('Error fetching data:', error.message);
            message.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [role, fetchAllSubmissions]);

    const handleArchiveToggle = async (submission: Submission) => {
        try {
            message.loading({ content: submission.archived ? 'Unarchiving...' : 'Archiving...', key: 'archive' });
            setLoading(true);
            setSubmissions([]);
            setFilteredSubmissions([]);

            const res = await fetch('/api/submissions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: submission.id,
                    archived: !submission.archived
                })
            });

            const responseData = await res.json();

            if (!res.ok) {
                console.error('Error updating submission:', responseData);
                throw new Error(responseData?.error || 'Failed to update submission');
            }

            message.success({ content: submission.archived ? 'Unarchived!' : 'Archived!', key: 'archive' });
            fetchData(showArchived);
        } catch (error: any) {
            console.error('Error updating submission:', error);
            setLoading(false);
            message.error({
                content: error.message || 'Failed to update - make sure you ran the SQL script to add the archived column!',
                key: 'archive',
                duration: 5
            });
        }
    };

    const handleToggleView = () => {
        setLoading(true);
        setSubmissions([]);
        setFilteredSubmissions([]);
        setShowArchived(!showArchived);
        // fetchData is triggered by the useEffect that depends on showArchived
    };

    const handleTriggerSync = useCallback(() => {
        setSyncing(true);
        message.loading({ content: 'Triggering sync...', key: 'sync' });

        // Open a small popup window
        const popup = window.open(
            'https://syazna-world-app.xo.je/rcs-0.7/function/trigger-sync.php',
            'syncPopup',
            'width=600,height=400,left=100,top=100,resizable=yes,scrollbars=yes,toolbar=no,menubar=no'
        );

        message.success({
            content: 'Sync triggered! Popup will close automatically...',
            key: 'sync'
        });

        // Auto-close popup after 5 seconds (enough time for sync to complete)
        setTimeout(() => {
            if (popup && !popup.closed) {
                popup.close();
                message.success({ content: 'Sync complete!', key: 'sync' });
            }
        }, 5000);

        // Refresh submissions after delays
        setTimeout(() => {
            fetchData(showArchived);
        }, 3000);
        setTimeout(() => {
            fetchData(showArchived);
        }, 6000);

        setTimeout(() => {
            setSyncing(false);
        }, 6000);
    }, [fetchData, showArchived]);

    // Fetch data on initial mount
    useEffect(() => {
        if (role === 'admin' || role === 'manager') {
            fetchData(showArchived);
        }
    }, [role, fetchData, showArchived]);

    useEffect(() => {
        // Don't auto-trigger sync on page load to avoid MySQL connection errors
        // Only sync when user explicitly clicks the button
    }, [role, handleTriggerSync]);

    // Add real-time subscription to refresh data when tsk_submissions changes
    useEffect(() => {
        if (!supabase) return;

        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'tsk_submissions'
                },
                () => {
                    console.log('tsk_submissions changed! Refreshing...');
                    fetchData(showArchived);
                }
            )
            .subscribe();

        // Cleanup subscription on unmount
        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchData, showArchived]);

    useEffect(() => {
        let filtered = [...submissions];

        if (searchText) {
            const searchLower = searchText.toLowerCase();
            filtered = filtered.filter(sub =>
                sub.title.toLowerCase().includes(searchLower) ||
                (sub.description && sub.description.toLowerCase().includes(searchLower)) ||
                sub.reference_number.toLowerCase().includes(searchLower)
            );

            // Also check all submissions for matches in opposite view
            const oppositeMatches = allSubmissions.filter(sub => {
                const isOpposite = sub.archived !== showArchived;
                const matchesSearch =
                    sub.title.toLowerCase().includes(searchLower) ||
                    (sub.description && sub.description.toLowerCase().includes(searchLower)) ||
                    sub.reference_number.toLowerCase().includes(searchLower);
                return isOpposite && matchesSearch;
            });
            setMatchesInOppositeView(oppositeMatches);
        } else {
            setMatchesInOppositeView([]);
        }

        if (filterPriority) {
            filtered = filtered.filter(sub => sub.priority === filterPriority);
        }

        if (filterStatus) {
            filtered = filtered.filter(sub => sub.status === filterStatus);
        }

        if (filterDateRange[0] && filterDateRange[1]) {
            const startDate = filterDateRange[0].startOf('day');
            const endDate = filterDateRange[1].endOf('day');
            filtered = filtered.filter(sub => {
                const subDate = dayjs(sub.created_at);
                return subDate.isAfter(startDate) && subDate.isBefore(endDate);
            });
        }

        setFilteredSubmissions(filtered);
    }, [submissions, allSubmissions, searchText, filterPriority, filterStatus, filterDateRange, showArchived]);

    const handleCreateTask = async (values: any) => {
        try {
            message.loading({ content: 'Creating Task...', key: 'createTask' });

            const { title, description, priority_type, due_date, start_date, estimated_hours, customer_name, assignee_id, department } = values;

            const { data: newTaskData, error } = await supabase.from('tsk_tasks').insert([{
                title,
                description,
                priority_type,
                customer_name,
                assignee_id,
                due_date: due_date?.toISOString(),
                status: 'IN_PROGRESS',
                created_by: currentUserId,
                // is_internal is auto-set by trg_sync_task_is_internal trigger
                department: department || 'Outsourcing',
                start_date: start_date?.toISOString(),
                estimated_hours: estimated_hours,
                reference_number: selectedSubmission?.reference_number,
            }]).select('id, created_at').single();

            if (error) throw error;

            const { error: historyError } = await supabase
                .from('tsk_task_history')
                .insert({
                    task_id: newTaskData.id,
                    status_before: null,
                    new_status: 'IN_PROGRESS',
                    changed_by: currentUserId,
                    status_before_entered_at: null,
                    duration_seconds: null,
                    duration_minutes: null,
                    duration_hours: null
                });

            if (historyError) {
                console.error('Error inserting initial task history:', historyError);
            }

            // Link submission to task
            if (selectedSubmission) {
                const { error: linkError } = await supabase
                    .from('tsk_submissions')
                    .update({ task_id: newTaskData.id })
                    .eq('id', selectedSubmission.id);

                if (linkError) {
                    console.error('Error linking submission to task:', linkError);
                }
            }

            message.success({ content: 'Task created successfully!', key: 'createTask', duration: 2 });
            setIsModalOpen(false);
            setSelectedSubmission(null);
            form.resetFields();
            fetchData(showArchived); // Refresh submissions list
        } catch (error: any) {
            console.error('Error creating task:', error.message);
            message.error({ content: 'Failed to create task', key: 'createTask', duration: 2 });
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'High': return <Tag color="error">High</Tag>;
            case 'Medium': return <Tag color="warning">Medium</Tag>;
            case 'Low': return <Tag color="success">Low</Tag>;
            default: return <Tag>{priority}</Tag>;
        }
    };

    const mapPriorityToEisenhower = (priority: string): PriorityType => {
        switch (priority) {
            case 'High': return 'DO_FIRST';
            case 'Medium': return 'SCHEDULE';
            case 'Low': return 'SCHEDULE';
            default: return 'SCHEDULE';
        }
    };

    const [copiedId, setCopiedId] = useState<number | null>(null);

    const copyToClipboard = async (text: string, id: number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            message.error('Failed to copy to clipboard');
        }
    };

    const columns = [
        {
            title: 'Ref. Number',
            dataIndex: 'reference_number',
            key: 'reference_number',
            width: 170,
            render: (text: string, record: any) => (
                <div className="flex items-center gap-1">
                    <span className="font-mono text-slate-700">{text}</span>
                    <Button
                        type="text"
                        size="small"
                        icon={copiedId === record.id ? <CheckOutlined /> : <CopyOutlined />}
                        className={copiedId === record.id ? "text-green-500" : "text-gray-400 hover:text-gray-600"}
                        onClick={() => copyToClipboard(text, record.id)}
                    />
                </div>
            )
        },
        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            width: 300,
            sorter: (a: any, b: any) => a.title.localeCompare(b.title),
            render: (text: string, record: any) => (
                <div className="font-semibold text-indigo-900">
                    {text}
                    {record.task_id && (
                        <Tag color="green" className="ml-2">
                            ✅ Has Tasks
                        </Tag>
                    )}
                </div>
            )
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (text: string) => (
                <div className="text-gray-600 whitespace-pre-wrap text-sm">
                    {text || <span className="text-gray-400 italic">No description...</span>}
                </div>
            )
        },
        {
            title: 'Priority',
            dataIndex: 'priority',
            key: 'priority',
            width: 110,
            render: (priority: string) => getPriorityColor(priority)
        },
        // {
        //     title: 'Status',
        //     dataIndex: 'status',
        //     key: 'status',
        //     width: 120,
        //     render: (status: string) => <Tag color={status?.toLowerCase().includes('cancelled') ? 'red' : 'blue'}>{status}</Tag>
        // },
        {
            title: 'Created At',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 180,
            sorter: (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            render: (date: string) => new Date(date).toLocaleString()
        },
        {
            title: 'Action',
            key: 'action',
            width: 250,
            render: (_: any, record: any) => (
                <div className="flex gap-2">
                    <Button
                        type="text"
                        icon={<PlusOutlined />}
                        className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                        onClick={() => {
                            setSelectedSubmission(record);
                            const startDate = dayjs().startOf('day'); // Today as start date
                            const dueDate = addBusinessDays(startDate, 2).hour(18).minute(30).second(0).millisecond(0); // 2 business days later at 6:30 PM

                            form.setFieldsValue({
                                title: '',
                                description: `Submission Details:\nTitle: ${record.title}\nDescription: ${record.description || 'N/A'}\nPriority: ${record.priority}\nReference Number: ${record.reference_number}`,
                                priority_type: mapPriorityToEisenhower(record.priority),
                                due_date: dueDate,
                                start_date: startDate,
                                estimated_hours: undefined,
                                customer_name: '',
                                assignee_id: '',
                                department: 'Outsourcing'
                            });
                            setIsModalOpen(true);
                        }}
                    >
                        Create Task
                    </Button>
                    <Button
                        type="text"
                        className={record.archived ? "text-green-600 hover:text-green-800 hover:bg-green-50" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"}
                        onClick={() => handleArchiveToggle(record)}
                    >
                        {record.archived ? 'Unarchive' : 'Archive'}
                    </Button>
                </div>
            )
        }
    ];

    if (!(role === 'admin' || role === 'manager')) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-100px)]">
                <div className="text-center">
                    <Title level={4} className="text-gray-500">Access Denied</Title>
                    <Text type="secondary">Only managers and admins can access this page.</Text>
                </div>
            </div>
        );
    }

    if (loading) return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Spin size="large" /></div>;

    return (
        <div className="flex flex-col gap-6 font-sans">
            <div className="bg-white/80 p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <Title level={2} className="!text-indigo-900 !mb-2 mt-0">Client Submissions</Title>
                        <Text type="secondary" className="text-base">View and create tasks from client submissions.</Text>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            type="default"
                            onClick={handleTriggerSync}
                            loading={syncing}
                        >
                            Trigger Sync
                        </Button>
                        <Button
                            type={showArchived ? 'primary' : 'default'}
                            onClick={handleToggleView}
                            className={showArchived ? 'bg-indigo-600' : ''}
                        >
                            {showArchived ? 'View Active' : 'View Archived'}
                        </Button>
                    </div>
                </div>

                <div className="space-y-3">
                    <Input.Search
                        placeholder="Search by title, description, or reference number..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        size="large"
                        allowClear
                    />

                    <div className="flex flex-wrap gap-3">
                        <Select
                            placeholder="Filter by Priority"
                            value={filterPriority || undefined}
                            onChange={setFilterPriority}
                            size="large"
                            style={{ width: 200 }}
                            allowClear
                        >
                            <Option value="Low">Low</Option>
                            <Option value="Medium">Medium</Option>
                            <Option value="High">High</Option>
                        </Select>

                        <Select
                            placeholder="Filter by Status"
                            value={filterStatus || undefined}
                            onChange={setFilterStatus}
                            size="large"
                            style={{ width: 200 }}
                            allowClear
                        >
                            <Option value="Pending">Pending</Option>
                            <Option value="In Progress">In Progress</Option>
                            <Option value="Completed">Completed</Option>
                            <Option value="Cancelled">Cancelled</Option>
                        </Select>

                        <RangePicker
                            placeholder={['Start Date', 'End Date']}
                            value={filterDateRange}
                            onChange={(dates) => setFilterDateRange(dates || [null, null])}
                            size="large"
                            style={{ width: 350 }}
                            allowClear
                        />

                        {(searchText || filterPriority || filterStatus || filterDateRange[0]) && (
                            <Button
                                size="large"
                                onClick={() => {
                                    setSearchText('');
                                    setFilterPriority('');
                                    setFilterStatus('');
                                    setFilterDateRange([null, null]);
                                }}
                            >
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {matchesInOppositeView.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-amber-600 text-xl">⚠️</span>
                            <div>
                                <p className="text-amber-800 font-medium">
                                    Found {matchesInOppositeView.length} matching {matchesInOppositeView.length === 1 ? 'request' : 'requests'} in {showArchived ? 'active' : 'archived'} view!
                                </p>
                                <p className="text-amber-700 text-sm mt-1">
                                    {matchesInOppositeView.map(s => s.reference_number).join(', ')}
                                </p>
                            </div>
                        </div>
                        <Button
                            type="primary"
                            onClick={handleToggleView}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Switch to {showArchived ? 'Active' : 'Archived'} View
                        </Button>
                    </div>
                </div>
            )}

            <Card bordered={false} className="shadow-sm rounded-xl border border-slate-100">
                <Table
                    columns={columns}
                    dataSource={filteredSubmissions}
                    rowKey="id"
                    pagination={{ pageSize: 15 }}
                    className="border border-slate-100 rounded-lg overflow-hidden"
                />
            </Card>

            <Modal
                title={<div className="font-bold text-lg mb-4 text-indigo-900 border-b pb-2">Create Task from Submission</div>}
                open={isModalOpen}
                onCancel={() => {
                    setIsModalOpen(false);
                    setSelectedSubmission(null);
                    form.resetFields();
                }}
                footer={null}
                width={600}
                style={{ maxWidth: '95vw' }}
            >
                <Form form={form} layout="vertical" onFinish={handleCreateTask}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Form.Item name="customer_name" label="Customer Name" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Customer name is required' }]}>
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children">
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.customer_name !== cur.customer_name}>
                            {({ getFieldValue }) => {
                                const selCustomer = customers.find((c: any) => c.name === getFieldValue('customer_name'));
                                const isInternal = selCustomer?.is_internal ?? false;
                                return (
                                    <Form.Item name="department" label="Jabatan (Department)" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Please select a department' }]} initialValue="Outsourcing">
                                        <Select placeholder="Select Department" size="large">
                                            {!isInternal && <Option value="Outsourcing">Outsourcing</Option>}
                                            <Option value="IT">IT</Option>
                                            <Option value="Sales">Sales</Option>
                                            <Option value="Marketing">Marketing</Option>
                                            <Option value="Recruitment">Recruitment</Option>
                                            <Option value="Human Resources">Human Resources</Option>
                                            <Option value="Account">Account</Option>
                                        </Select>
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>

                        <Form.Item name="title" label="Task Title" className="col-span-2" rules={[{ required: true, message: 'Please enter a title' }]}>
                            <Input placeholder="Enter task title" size="large" />
                        </Form.Item>

                        <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Assignee is required' }]}>
                            <Select placeholder="Select Assignee" size="large" showSearch optionFilterProp="children">
                                {profiles.map(p => (
                                    <Option key={p.id} value={p.id}>{p.full_name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="priority_type" label="Eisenhower Priority" rules={[{ required: true, message: 'Please select a priority' }]}>
                            <Select placeholder="Select Priority" size="large">
                                <Option value="DO_FIRST"><span className="text-red-600 font-medium">🔴 DO FIRST (Urgent & Important)</span></Option>
                                <Option value="SCHEDULE"><span className="text-blue-600 font-medium">🔵 SCHEDULE (Not Urgent, Important)</span></Option>
                                <Option value="DELEGATE"><span className="text-yellow-600 font-medium">🟡 DELEGATE (Urgent, Not Important)</span></Option>
                                <Option value="ELIMINATE"><span className="text-gray-500 font-medium">⚫ ELIMINATE (Not Urgent, Not Important)</span></Option>
                            </Select>
                        </Form.Item>


                        <Form.Item name="description" label="Description" className="col-span-2">
                            <Input.TextArea rows={6} placeholder="Detailed task requirements..." className="resize-none" />
                        </Form.Item>


                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <Form.Item name="start_date" label="Start Date">
                            <DatePicker className="w-full" size="large" showTime disabled={role !== 'admin' && role !== 'manager'} />
                        </Form.Item>
                        <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Due date is required' }]}>
                            <DatePicker className="w-full" size="large" showTime disabled={role !== 'admin' && role !== 'manager'} />
                        </Form.Item>
                        <Form.Item name="estimated_hours" label="Est. Hours">
                            <InputNumber className="w-full" size="large" min={0} step={0.5} placeholder="e.g. 4.5" disabled={role !== 'admin' && role !== 'manager'} />
                        </Form.Item>
                    </div>

                    <Form.Item className="flex justify-end mb-0 mt-6 pt-4 border-t">
                        <Button onClick={() => {
                            setIsModalOpen(false);
                            setSelectedSubmission(null);
                            form.resetFields();
                        }} className="mr-3" size="large">Cancel</Button>
                        <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Create Task</Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
