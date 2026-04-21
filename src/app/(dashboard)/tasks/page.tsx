'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Select, Input, Table, Tag, Typography, Spin, message, Modal, Form, Button, DatePicker } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import { SearchOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, ExclamationCircleOutlined, EditOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import EscalateModal from '@/components/task/EscalateModal';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export default function TaskListingPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    const [filterCustomer, setFilterCustomer] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterPIC, setFilterPIC] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');
    const [filterDateRange, setFilterDateRange] = useState<[any, any]>([null, null]);
    const [filterDateField, setFilterDateField] = useState<string>('created_at');

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [editForm] = Form.useForm();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);

    const supabase = createClient();
    const { role } = useRole();

    const fetchData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || null;
            setCurrentUserId(userId);

            let query = supabase.from('tsk_tasks').select(`
                *,
                assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
                    id,
                    full_name,
                    avatar_url
                ),
                creator:lv_profiles!tsk_tasks_created_by_fkey (
                    id,
                    full_name,
                    avatar_url
                )
            `).order('created_at', { ascending: false });

            // If user is not admin, only fetch their tasks
            if (role !== 'admin' && role !== 'manager' && userId) {
                query = query.eq('assignee_id', userId);
            }

            const [tasksRes, profilesRes, customersRes] = await Promise.all([
                query,
                supabase.from('lv_profiles').select('id, full_name').eq('status', 'active').order('full_name'),
                supabase.from('tsk_customers').select('id, name').order('name')
            ]);

            if (tasksRes.error) throw tasksRes.error;
            if (profilesRes.error) throw profilesRes.error;
            if (customersRes.error && customersRes.error.code !== '42P01') throw customersRes.error;

            setTasks(tasksRes.data as Task[] || []);
            setProfiles(profilesRes.data || []);
            setCustomers(customersRes.data || []);
        } catch (error: any) {
            console.error('Error fetching data:', error.message);
            message.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        fetchData();

        const subscription = supabase
            .channel('tasklisting-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchData]);

    const handleUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        try {
            const { title, description, priority_type, due_date, customer_name, assignee_id, status } = values;

            const { error } = await supabase.from('tsk_tasks').update({
                title,
                description,
                priority_type,
                customer_name,
                assignee_id,
                due_date: due_date?.toISOString(),
                status,
            }).eq('id', selectedTask.id);

            if (error) throw error;

            message.success('Task updated successfully!');
            setIsEditModalOpen(false);
            setSelectedTask(null);
            editForm.resetFields();
        } catch (error: any) {
            console.error('Error updating task:', error.message);
            message.error('Failed to update task');
        }
    };

    const handleDeleteTask = () => {
        if (!selectedTask) return;
        Modal.confirm({
            title: 'Delete Task',
            icon: <ExclamationCircleFilled className="text-red-500" />,
            content: `Are you sure you want to delete "${selectedTask.title}"? This action cannot be undone.`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            centered: true,
            onOk: async () => {
                try {
                    const { error } = await supabase.from('tsk_tasks').delete().eq('id', selectedTask.id);
                    if (error) throw error;
                    message.success('Task deleted successfully');
                    setIsEditModalOpen(false);
                    setSelectedTask(null);
                    editForm.resetFields();
                } catch (error: any) {
                    console.error('Error deleting task:', error.message);
                    message.error('Failed to delete task');
                }
            }
        });
    };

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'DONE': return <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>;
            case 'IN_PROGRESS': return <Tag icon={<SyncOutlined spin />} color="processing">In Progress</Tag>;
            case 'REVIEW': return <Tag icon={<ExclamationCircleOutlined />} color="warning">Review</Tag>;
            case 'BACKLOG': return <Tag icon={<ClockCircleOutlined />} color="default">Backlog</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    const getPriorityColor = (priority: string | null) => {
        switch (priority) {
            case 'DO_FIRST': return <Tag color="error">Do First</Tag>;
            case 'SCHEDULE': return <Tag color="blue">Schedule</Tag>;
            case 'DELEGATE': return <Tag color="orange">Delegate</Tag>;
            case 'ELIMINATE': return <Tag color="default">Eliminate</Tag>;
            default: return null;
        }
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchText.toLowerCase()) ||
            (t.description && t.description.toLowerCase().includes(searchText.toLowerCase()));
        const matchesCustomer = filterCustomer ? t.customer_name === filterCustomer : true;
        const matchesStatus = filterStatus ? t.status === filterStatus : true;
        const matchesPIC = filterPIC ? t.assignee_id === filterPIC : true;

        let matchesDate = true;
        if (filterDateRange[0] && filterDateRange[1]) {
            const fieldValue = (t as any)[filterDateField];
            if (fieldValue) {
                const d = new Date(fieldValue);
                const start = filterDateRange[0].startOf('day').toDate();
                const end = filterDateRange[1].endOf('day').toDate();
                matchesDate = d >= start && d <= end;
            } else {
                matchesDate = false;
            }
        }

        return matchesSearch && matchesCustomer && matchesStatus && matchesPIC && matchesDate;
    });

    const sortedTasks = [...filteredTasks].sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const columns = [
        {
            title: 'Task Title',
            dataIndex: 'title',
            key: 'title',
            sorter: (a: Task, b: Task) => a.title.localeCompare(b.title),
            render: (text: string, record: Task) => (
                <div className="font-semibold text-indigo-900">
                    <div className="flex items-center gap-2">
                        {text}
                        {(record as any).is_recurring && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                🔄 Recurring
                            </span>
                        )}
                    </div>
                    <div className="mt-1">{getPriorityColor(record.priority_type)}</div>
                </div>
            )
        },
        {
            title: 'Nota / Description',
            dataIndex: 'description',
            key: 'description',
            width: '30%',
            sorter: (a: Task, b: Task) => (a.description || '').localeCompare(b.description || ''),
            render: (text: string) => (
                <div className="text-gray-600 whitespace-pre-wrap text-sm">
                    {text || <span className="text-gray-400 italic">Tiada nota...</span>}
                </div>
            )
        },
        {
            title: 'Customer',
            dataIndex: 'customer_name',
            key: 'customer_name',
            sorter: (a: Task, b: Task) => (a.customer_name || '').localeCompare(b.customer_name || ''),
            render: (text: string) => <Text strong className="text-slate-700">{text || '-'}</Text>
        },
        {
            title: 'PIC / Assignee',
            dataIndex: 'assignee',
            key: 'assignee',
            sorter: (a: Task, b: Task) => {
                const nameA = a.assignee?.full_name || '';
                const nameB = b.assignee?.full_name || '';
                return nameA.localeCompare(nameB);
            },
            render: (assignee: Profile | undefined) => (
                assignee ? (
                    <div className="flex items-center gap-2">
                        <img
                            src={assignee.avatar_url || `https://ui-avatars.com/api/?name=${assignee.full_name}&background=6366f1&color=fff`}
                            className="w-6 h-6 rounded-full"
                            alt={assignee.full_name}
                        />
                        <span className="text-sm font-medium">{assignee.full_name}</span>
                    </div>
                ) : '-'
            )
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            sorter: (a: Task, b: Task) => a.status.localeCompare(b.status),
            render: (status: string) => getStatusTag(status)
        },
        {
            title: 'Created By',
            dataIndex: 'creator',
            key: 'creator',
            sorter: (a: Task, b: Task) => {
                const nameA = a.creator?.full_name || '';
                const nameB = b.creator?.full_name || '';
                return nameA.localeCompare(nameB);
            },
            render: (creator: Profile | undefined) => (
                creator ? (
                    <div className="flex items-center gap-2">
                        <img
                            src={creator.avatar_url || `https://ui-avatars.com/api/?name=${creator.full_name}&background=10b981&color=fff`}
                            className="w-5 h-5 rounded-full"
                            alt={creator.full_name}
                        />
                        <span className="text-xs font-medium text-slate-600">{creator.full_name}</span>
                    </div>
                ) : <span className="text-xs text-gray-400">System / Unknown</span>
            )
        },
        {
            title: 'Date Created',
            dataIndex: 'created_at',
            key: 'created_at',
            width: '10%',
            sorter: (a: Task, b: Task) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
            render: (date: string | null) => date ? new Date(date).toLocaleDateString() : '-'
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: '10%',
            sorter: (a: Task, b: Task) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime(),
            render: (date: string | null) => date ? new Date(date).toLocaleDateString() : '-'
        },
        {
            title: 'Action',
            key: 'action',
            width: '8%',
            render: (_: any, record: Task) => (
                <Button
                    type="text"
                    icon={<EditOutlined />}
                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                    onClick={() => {
                        setSelectedTask(record);
                        editForm.setFieldsValue({
                            ...record,
                        });
                        setIsEditModalOpen(true);
                    }}
                />
            )
        }
    ];

    if (loading) return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Spin size="large" /></div>;

    return (
        <div className="flex flex-col gap-6 font-sans">
            <div className="bg-white/80 p-6 rounded-2xl shadow-sm border border-slate-100">
                <Title level={2} className="!text-indigo-900 !mb-2 mt-0">Task Listing</Title>
                <Text type="secondary" className="text-base">Lihat dan urus semua tugasan termasuk yang telah siap (DONE).</Text>
            </div>

            <Card bordered={false} className="shadow-sm rounded-xl border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 bg-slate-50 p-4 rounded-lg">
                    <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search Title / Nota</label>
                        <Input
                            placeholder="Cari tugasan..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            size="large"
                            allowClear
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
                        <Select
                            placeholder="Semua Status"
                            value={filterStatus || undefined}
                            onChange={val => setFilterStatus(val || '')}
                            allowClear
                            size="large"
                            className="w-full"
                        >
                            <Option value="BACKLOG">Backlog</Option>
                            <Option value="IN_PROGRESS">In Progress</Option>
                            <Option value="REVIEW">Review</Option>
                            <Option value="DONE">Done</Option>
                        </Select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Customer</label>
                        <Select
                            placeholder="Semua Customer"
                            value={filterCustomer || undefined}
                            onChange={val => setFilterCustomer(val || '')}
                            allowClear
                            showSearch
                            size="large"
                            className="w-full"
                        >
                            {customers.map(c => (
                                <Option key={c.id} value={c.name}>{c.name}</Option>
                            ))}
                        </Select>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">PIC / Assignee</label>
                        <Select
                            placeholder="Semua PIC"
                            value={filterPIC || undefined}
                            onChange={val => setFilterPIC(val || '')}
                            allowClear
                            showSearch
                            size="large"
                            className="w-full"
                        >
                            {profiles.map(p => (
                                <Option key={p.id} value={p.id}>{p.full_name}</Option>
                            ))}
                        </Select>
                    </div>
                    {/* Date Range Filter */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tapis Mengikut Tarikh</label>
                        <Select
                            value={filterDateField}
                            onChange={val => setFilterDateField(val)}
                            size="large"
                            className="w-full"
                        >
                            <Option value="created_at">Date Created</Option>
                            <Option value="due_date">Due Date</Option>
                        </Select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Julat Tarikh</label>
                        <RangePicker
                            size="large"
                            className="w-full"
                            value={filterDateRange as any}
                            onChange={dates => setFilterDateRange(dates ? [dates[0], dates[1]] : [null, null])}
                            allowClear
                            format="DD/MM/YYYY"
                            placeholder={['Mula', 'Akhir']}
                        />
                    </div>
                </div>

                {/* Record Count Badge */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-semibold text-slate-600">
                        Menunjukkan
                    </span>
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-bold bg-indigo-100 text-indigo-700">
                        {sortedTasks.length} rekod
                    </span>
                    {sortedTasks.length !== tasks.length && (
                        <span className="text-xs text-slate-400">
                            daripada {tasks.length} jumlah
                        </span>
                    )}
                </div>

                {/* Mobile Card View — hidden on md+ */}
                <div className="md:hidden flex flex-col gap-3 mb-4">
                    {sortedTasks.length === 0 ? (
                        <div className="text-center text-gray-400 py-10 italic">Tiada tugasan dijumpai.</div>
                    ) : sortedTasks.map(task => (
                        <div
                            key={task.id}
                            className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col gap-2"
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="font-semibold text-indigo-900 flex-1 text-sm">{task.title}</div>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    className="text-indigo-500 shrink-0"
                                    onClick={() => {
                                        setSelectedTask(task);
                                        editForm.setFieldsValue({ ...task });
                                        setIsEditModalOpen(true);
                                    }}
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5 items-center">
                                {getPriorityColor(task.priority_type)}
                                {getStatusTag(task.status)}
                            </div>
                            {task.customer_name && (
                                <div className="text-xs text-slate-500">🏢 {task.customer_name}</div>
                            )}
                            {task.assignee && (
                                <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1 rounded-md">
                                    <img
                                        src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${task.assignee.full_name}&background=6366f1&color=fff`}
                                        className="w-4 h-4 rounded-full"
                                        alt={task.assignee.full_name}
                                    />
                                    PIC: {task.assignee.full_name}
                                </div>
                            )}
                            {task.creator && (
                                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] mt-1">
                                    <span className="opacity-70">Created by:</span> {task.creator.full_name}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-1">
                                {task.created_at && (
                                    <div className="text-[11px] font-semibold text-indigo-500 flex items-center gap-1 bg-indigo-50 w-fit px-2 py-0.5 rounded-md border border-indigo-100">
                                        📅 Created: {new Date(task.created_at).toLocaleDateString()}
                                    </div>
                                )}
                                {task.due_date && (
                                    <div className="text-[11px] font-semibold text-rose-500 flex items-center gap-1 bg-rose-50 w-fit px-2 py-0.5 rounded-md border border-rose-100">
                                        ⏱️ Due: {new Date(task.due_date).toLocaleDateString()}
                                    </div>
                                )}
                            </div>
                            {task.description && (
                                <div className="text-xs text-gray-500 line-clamp-2">{task.description}</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Desktop Table View — hidden on mobile */}
                <div className="hidden md:block">
                <Table
                    columns={columns}
                    dataSource={sortedTasks}
                    rowKey="id"
                    pagination={{ pageSize: 15 }}
                    className="border border-slate-100 rounded-lg overflow-hidden"
                />
                </div>
            </Card>

            <Modal
                title={<div className="font-bold text-lg mb-4 text-indigo-900 border-b pb-2">Edit Task Details</div>}
                open={isEditModalOpen}
                onCancel={() => {
                    setIsEditModalOpen(false);
                    setSelectedTask(null);
                    editForm.resetFields();
                }}
                footer={null}
                width={600}
                style={{ maxWidth: '95vw' }}
            >
                <Form form={editForm} layout="vertical" onFinish={handleUpdateTask}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Form.Item name="customer_name" label="Customer Name" className="col-span-2" rules={[{ required: true, message: 'Customer name is required' }]}>
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children" disabled={role !== 'admin' && role !== 'manager'}>
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="title" label="Task Title" className="col-span-2" rules={[{ required: true, message: 'Please enter a title' }]}>
                            <Input placeholder="Enter task title" size="large" disabled={role !== 'admin' && role !== 'manager'} />
                        </Form.Item>

                        <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Assignee is required' }]}>
                            <Select placeholder="Select Assignee" size="large" showSearch optionFilterProp="children" disabled={role !== 'admin' && role !== 'manager'}>
                                {profiles.map(p => (
                                    <Option key={p.id} value={p.id}>{p.full_name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="priority_type" label="Eisenhower Priority" rules={[{ required: true, message: 'Please select a priority' }]}>
                            <Select placeholder="Select Priority" size="large" disabled={role !== 'admin' && role !== 'manager'}>
                                <Option value="DO_FIRST"><span className="text-red-600 font-medium">🔴 DO FIRST (Urgent & Important)</span></Option>
                                <Option value="SCHEDULE"><span className="text-blue-600 font-medium">🔵 SCHEDULE (Not Urgent, Important)</span></Option>
                                <Option value="DELEGATE"><span className="text-yellow-600 font-medium">🟡 DELEGATE (Urgent, Not Important)</span></Option>
                                <Option value="ELIMINATE"><span className="text-gray-500 font-medium">⚫ ELIMINATE (Not Urgent, Not Important)</span></Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="status" label="Task Status" rules={[{ required: true, message: 'Please select a status' }]}>
                            <Select placeholder="Select Status" size="large">
                                <Option value="BACKLOG">Backlog</Option>
                                <Option value="IN_PROGRESS">In Progress</Option>
                                <Option value="REVIEW">Review</Option>
                                <Option value="DONE">Done</Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item name="description" label="Description">
                        <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-none" disabled={role !== 'admin' && role !== 'manager'} />
                    </Form.Item>

                    {selectedTask?.due_date && (
                        <div className="mb-4 text-sm text-gray-500">
                            <strong>Current Due Date:</strong> {new Date(selectedTask.due_date).toLocaleString()}
                        </div>
                    )}

                    {selectedTask?.updated_at && (
                        <div className="mb-4 text-sm text-gray-500">
                            <strong>{selectedTask.status === 'DONE' ? 'Completed On:' : 'Last Updated:'}</strong> {new Date(selectedTask.updated_at).toLocaleString()}
                        </div>
                    )}

                    <Form.Item className="mb-0 mt-6 pt-4 border-t">
                        <div className="flex items-center justify-between w-full">
                            <div>
                                {((role === 'admin' || role === 'manager') || (selectedTask && (selectedTask.status !== 'DONE' || selectedTask.assignee_id === currentUserId))) && selectedTask && (
                                    <Button danger type="text" onClick={handleDeleteTask} size="large" icon={<DeleteOutlined />}>
                                        Delete
                                    </Button>
                                )}
                            </div>
                            <div>
                                <Button onClick={() => {
                                    setIsEditModalOpen(false);
                                    setSelectedTask(null);
                                }} className="mr-3" size="large">Cancel</Button>

                                {selectedTask && (role === 'admin' || role === 'manager' || selectedTask.assignee_id === currentUserId) && (
                                    <Button
                                        type="default"
                                        size="large"
                                        className="border-orange-500 text-orange-600 hover:bg-orange-50 bg-white mr-3"
                                        onClick={() => setIsEscalateModalOpen(true)}
                                    >
                                        🚩 Escalate
                                    </Button>
                                )}

                                <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Update Task</Button>
                            </div>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            {selectedTask && (
                <EscalateModal
                    isOpen={isEscalateModalOpen}
                    onClose={() => setIsEscalateModalOpen(false)}
                    task={selectedTask}
                    profiles={profiles}
                    currentUserId={currentUserId || ''}
                    currentTaskDescription={selectedTask.description || ''}
                    onSuccess={() => {
                        setIsEscalateModalOpen(false);
                        setIsEditModalOpen(false);
                        setSelectedTask(null);
                    }}
                />
            )}
        </div>
    );
}
