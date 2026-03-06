'use client';

import React, { useEffect, useState } from 'react';
import { Card, Select, Input, Table, Tag, Typography, Spin, message, Modal, Form, Button, DatePicker } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import { SearchOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, ExclamationCircleOutlined, EditOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

export default function TaskListingPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    const [filterCustomer, setFilterCustomer] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterPIC, setFilterPIC] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [editForm] = Form.useForm();

    const supabase = createClient();
    const { role } = useRole();

    useEffect(() => {
        fetchData();

        const subscription = supabase
            .channel('tasks-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const fetchData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || null;

            let query = supabase.from('tsk_tasks').select(`
                *,
                assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
                    id,
                    full_name,
                    avatar_url
                )
            `).order('created_at', { ascending: false });

            // If user is not admin, only fetch their tasks
            if (role !== 'admin' && userId) {
                query = query.eq('assignee_id', userId);
            }

            const [tasksRes, profilesRes, customersRes] = await Promise.all([
                query,
                supabase.from('lv_profiles').select('id, full_name').order('full_name'),
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
    };

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

        return matchesSearch && matchesCustomer && matchesStatus && matchesPIC;
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
            render: (text: string, record: Task) => (
                <div className="font-semibold text-indigo-900">
                    {text}
                    <div className="mt-1">{getPriorityColor(record.priority_type)}</div>
                </div>
            )
        },
        {
            title: 'Nota / Description',
            dataIndex: 'description',
            key: 'description',
            width: '35%',
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
            render: (text: string) => <Text strong className="text-slate-700">{text || '-'}</Text>
        },
        {
            title: 'PIC / Assignee',
            dataIndex: 'assignee',
            key: 'assignee',
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
            render: (status: string) => getStatusTag(status)
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: '12%',
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
                <div className="flex flex-wrap gap-4 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1 min-w-[200px]">
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
                    <div className="w-48">
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
                    <div className="w-56">
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
                    <div className="w-56">
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
                </div>

                <Table
                    columns={columns}
                    dataSource={sortedTasks}
                    rowKey="id"
                    pagination={{ pageSize: 15 }}
                    className="border border-slate-100 rounded-lg overflow-hidden"
                />
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
            >
                <Form form={editForm} layout="vertical" onFinish={handleUpdateTask}>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="customer_name" label="Customer Name" className="col-span-2" rules={[{ required: true, message: 'Customer name is required' }]}>
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children" disabled={role !== 'admin'}>
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="title" label="Task Title" className="col-span-2" rules={[{ required: true, message: 'Please enter a title' }]}>
                            <Input placeholder="Enter task title" size="large" disabled={role !== 'admin'} />
                        </Form.Item>

                        <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Assignee is required' }]}>
                            <Select placeholder="Select Assignee" size="large" showSearch optionFilterProp="children" disabled={role !== 'admin'}>
                                {profiles.map(p => (
                                    <Option key={p.id} value={p.id}>{p.full_name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="priority_type" label="Eisenhower Priority" rules={[{ required: true, message: 'Please select a priority' }]}>
                            <Select placeholder="Select Priority" size="large" disabled={role !== 'admin'}>
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
                        <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-none" disabled={role !== 'admin'} />
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

                    <Form.Item className="flex justify-end mb-0 mt-6 pt-4 border-t">
                        <Button onClick={() => {
                            setIsEditModalOpen(false);
                            setSelectedTask(null);
                        }} className="mr-3" size="large">Cancel</Button>
                        <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Update Task</Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
