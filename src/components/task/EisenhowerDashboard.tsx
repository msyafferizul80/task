'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Modal, Form, Select, DatePicker, message, Spin, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task, PriorityType } from '@/lib/types';
import KanbanBoard from '@/components/task/KanbanBoard';
import { useRole } from '@/components/layout/RoleProvider';

const { Title } = Typography;
const { Option } = Select;

export default function EisenhowerDashboard() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const [filterCustomer, setFilterCustomer] = useState<string>('');
    const [filterPIC, setFilterPIC] = useState<string>('');

    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const { role } = useRole();
    const supabase = createClient();

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const fetchTasksAndProfiles = useCallback(async () => {
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
                )
            `).order('created_at', { ascending: false });

            // If an assignee is looking at the dashboard, default to their tasks
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
        fetchTasksAndProfiles();

        const subscription = supabase
            .channel('eisenhower-tasks-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, () => {
                fetchTasksAndProfiles();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchTasksAndProfiles]);

    const handleCreateTask = async (values: any) => {
        try {
            const { title, description, priority_type, due_date, customer_name, assignee_id } = values;

            const { error } = await supabase.from('tsk_tasks').insert([{
                title,
                description,
                priority_type,
                customer_name,
                assignee_id,
                due_date: due_date?.toISOString(),
                status: 'BACKLOG',
            }]);

            if (error) throw error;

            message.success('Task created successfully!');
            setIsModalOpen(false);
            form.resetFields();
        } catch (error: any) {
            console.error('Error creating task:', error.message);
            message.error('Failed to create task');
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

    const getPriorityColor = (type: PriorityType | null) => {
        switch (type) {
            case 'DO_FIRST': return 'border-rose-200 hover:border-rose-400 shadow-rose-100/50';
            case 'SCHEDULE': return 'border-sky-200 hover:border-sky-400 shadow-sky-100/50';
            case 'DELEGATE': return 'border-amber-200 hover:border-amber-400 shadow-amber-100/50';
            case 'ELIMINATE': return 'border-slate-200 hover:border-slate-400 shadow-slate-100/50';
            default: return 'border-gray-100';
        }
    };

    if (loading) return <div className="flex justify-center items-center h-full min-h-[500px]"><Spin size="large" /></div>;

    // Apply Filters
    const filteredTasks = tasks.filter(t => {
        const matchesCustomer = t.customer_name?.toLowerCase().includes(filterCustomer.toLowerCase()) ?? true;
        const matchesPIC = filterPIC ? t.assignee_id === filterPIC : true;
        return (filterCustomer ? matchesCustomer : true) && matchesPIC;
    });
    // Exclude DONE tasks from the main Priority Grid. REVIEW tasks will still show.
    const activeFilteredTasks = filteredTasks.filter(t => t.status !== 'DONE');

    const doFirstTasks = activeFilteredTasks.filter(t => t.priority_type === 'DO_FIRST');
    const scheduleTasks = activeFilteredTasks.filter(t => t.priority_type === 'SCHEDULE');
    const delegateTasks = activeFilteredTasks.filter(t => t.priority_type === 'DELEGATE');
    const eliminateTasks = activeFilteredTasks.filter(t => t.priority_type === 'ELIMINATE');

    const renderTaskCard = (task: Task) => (
        <div
            key={task.id}
            className={`p-5 bg-white rounded-2xl transition-all duration-300 cursor-pointer border hover:-translate-y-1 hover:shadow-lg group ${getPriorityColor(task.priority_type)}`}
            onClick={() => {
                setSelectedTask(task);
                editForm.setFieldsValue({
                    ...task,
                });
                setIsEditModalOpen(true);
            }}
        >
            <div className="font-semibold text-slate-800 text-[15px] mb-4 group-hover:text-indigo-600 transition-colors">{task.title}</div>
            <div className="flex flex-col gap-3 text-xs">
                {task.customer_name && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[11px] shadow-sm border border-slate-200">🏢</div>
                        <span className="font-medium">{task.customer_name}</span>
                    </div>
                )}
                {task.assignee && (
                    <div className="flex items-center gap-2">
                        <img
                            src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${task.assignee.full_name}&background=6366f1&color=fff`}
                            className="w-6 h-6 rounded-full shadow-sm"
                            alt={task.assignee.full_name}
                        />
                        <span className="font-medium text-slate-700">{task.assignee.full_name}</span>
                    </div>
                )}
            </div>
            {task.due_date && (
                <div className="text-[11px] font-semibold text-rose-500 mt-4 flex items-center gap-1 bg-rose-50 w-fit px-2 py-1 rounded-md border border-rose-100">
                    ⏱️ Due: {new Date(task.due_date).toLocaleDateString()}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-6 font-sans">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50">
                <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 mb-1 tracking-tight">Syazna World Priority Grid</h1>
                    <p className="text-slate-500 font-medium text-xs sm:text-sm">Strategic planning and task capitalization for premium clients</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)} size="large" className="bg-gradient-to-r from-indigo-600 to-violet-600 border-0 shadow-lg shadow-indigo-200/50 hover:shadow-indigo-400/50 rounded-xl h-12 px-4 sm:px-6 font-semibold transition-all hover:-translate-y-0.5 w-full sm:w-auto">
                    New Strategic Task
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white/60 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-slate-100">
                <span className="font-bold text-slate-700 uppercase tracking-widest text-[11px] opacity-70 block mb-3">Filters:</span>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Select
                        placeholder="Search Client Organization..."
                        value={filterCustomer || undefined}
                        onChange={val => setFilterCustomer(val || '')}
                        className="w-full sm:w-64"
                        size="large"
                        allowClear
                        showSearch
                        optionFilterProp="children"
                    >
                        {customers.map(c => (
                            <Option key={c.id} value={c.name}>{c.name}</Option>
                        ))}
                    </Select>
                    <Select
                        placeholder="Select Executive Assignee..."
                        value={filterPIC || undefined}
                        onChange={val => setFilterPIC(val)}
                        className="w-full sm:w-64"
                        size="large"
                        allowClear
                        showSearch
                        optionFilterProp="children"
                    >
                        {profiles.map(p => (
                            <Option key={p.id} value={p.id}>{p.full_name}</Option>
                        ))}
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* DO FIRST */}
                <div className="bg-gradient-to-b from-rose-50/80 to-white/50 backdrop-blur-xl border border-rose-100 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                        <h3 className="font-bold text-rose-950 text-lg m-0">Do First</h3>
                        <span className="text-[10px] font-bold px-3 py-1 bg-rose-100 text-rose-700 rounded-full ml-auto uppercase tracking-wider relative overflow-hidden">Urgent & Important</span>
                    </div>
                    <div className="flex flex-col gap-4 min-h-[150px]">
                        {doFirstTasks.length === 0 ? <p className="text-rose-300 text-center mt-8 font-medium italic text-sm">No critical objectives pending</p> :
                            doFirstTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* SCHEDULE */}
                <div className="bg-gradient-to-b from-sky-50/80 to-white/50 backdrop-blur-xl border border-sky-100 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div>
                        <h3 className="font-bold text-sky-950 text-lg m-0">Schedule</h3>
                        <span className="text-[10px] font-bold px-3 py-1 bg-sky-100 text-sky-700 rounded-full ml-auto uppercase tracking-wider">Not Urgent, Important</span>
                    </div>
                    <div className="flex flex-col gap-4 min-h-[150px]">
                        {scheduleTasks.length === 0 ? <p className="text-sky-300 text-center mt-8 font-medium italic text-sm">No scheduled objectives</p> :
                            scheduleTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* DELEGATE */}
                <div className="bg-gradient-to-b from-amber-50/80 to-white/50 backdrop-blur-xl border border-amber-100 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                        <h3 className="font-bold text-amber-950 text-lg m-0">Delegate</h3>
                        <span className="text-[10px] font-bold px-3 py-1 bg-amber-100 text-amber-700 rounded-full ml-auto uppercase tracking-wider">Urgent, Not Important</span>
                    </div>
                    <div className="flex flex-col gap-4 min-h-[150px]">
                        {delegateTasks.length === 0 ? <p className="text-amber-300 text-center mt-8 font-medium italic text-sm">No assignments to delegate</p> :
                            delegateTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* ELIMINATE */}
                <div className="bg-gradient-to-b from-slate-50/80 to-white/50 backdrop-blur-xl border border-slate-200 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.5)]"></div>
                        <h3 className="font-bold text-slate-800 text-lg m-0">Eliminate</h3>
                        <span className="text-[10px] font-bold px-3 py-1 bg-slate-200 text-slate-600 rounded-full ml-auto uppercase tracking-wider">Not Urgent, Not Important</span>
                    </div>
                    <div className="flex flex-col gap-4 min-h-[150px]">
                        {eliminateTasks.length === 0 ? <p className="text-slate-400 text-center mt-8 font-medium italic text-sm">Clean slate</p> :
                            eliminateTasks.map(renderTaskCard)
                        }
                    </div>
                </div>
            </div>

            <Title level={3} className="px-1">Kanban Board (Workload View)</Title>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <KanbanBoard tasks={filteredTasks} role={role} />
            </div>

            <Modal
                title={<div className="font-bold text-lg mb-4 text-indigo-900 border-b pb-2">Create New Task</div>}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={600}
                style={{ maxWidth: '95vw' }}
            >
                <Form form={form} layout="vertical" onFinish={handleCreateTask}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Form.Item name="customer_name" label="Customer Name" className="col-span-2" rules={[{ required: true, message: 'Customer name is required' }]}>
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children">
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
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
                    </div>

                    <Form.Item name="description" label="Description">
                        <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-none" />
                    </Form.Item>

                    <Form.Item name="due_date" label="Due Date">
                        <DatePicker className="w-full" size="large" showTime />
                    </Form.Item>

                    <Form.Item className="flex justify-end mb-0 mt-6 pt-4 border-t">
                        <Button onClick={() => setIsModalOpen(false)} className="mr-3" size="large">Cancel</Button>
                        <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Create Task</Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Edit Task Modal */}
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

                    {/* Note: due_date parsing requires Dayjs which we omitted for briefness, so we keep it simple or read-only if we used string date. Skipping due_date in edit form to avoid dayjs dependency errors without full setup, or we can just render it as text */}
                    {selectedTask?.due_date && (
                        <div className="mb-4 text-sm text-gray-500">
                            <strong>Current Due Date:</strong> {new Date(selectedTask.due_date).toLocaleString()}
                        </div>
                    )}

                    <Form.Item className="mb-0 mt-6 pt-4 border-t">
                        <div className="flex items-center justify-between w-full">
                            <div>
                                {(role === 'admin' || role === 'manager') && selectedTask && (
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
                                <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Update Task</Button>
                            </div>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
