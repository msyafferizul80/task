'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Modal, Form, Select, DatePicker, message, Spin, Typography, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task, PriorityType } from '@/lib/types';
import KanbanBoard from '@/components/task/KanbanBoard';
import { useRole } from '@/components/layout/RoleProvider';
import EscalateModal from './EscalateModal';
import TaskHistoryTab from './TaskHistoryTab';
import TaskStatusHistory from './TaskStatusHistory';

import dayjs from 'dayjs';  


const { Title } = Typography;
const { Option } = Select;

export default function EisenhowerDashboard() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskChecklist, setTaskChecklist] = useState<any[]>([]);
    const [pendingUpdateValues, setPendingUpdateValues] = useState<any>(null);

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
            if (userId) {
                setFilterPIC(userId);
            }

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
                supabase.from('tsk_customers').select('id, name').eq('status', 'active').order('name')
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
            message.loading({ content: 'Creating Task & Analyzing via AI...', key: 'createTask' });
            
            const { title, description, priority_type, due_date, customer_name, assignee_id, department } = values;
            let finalTitle = title;
            let aiChecklist: string[] = [];

            // AI Integration
            if (description && description.trim().length > 5) {
                try {
                    const res = await fetch('/api/ai-assistant', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, description })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data.suggested_title && data.suggested_title !== title) {
                            finalTitle = data.suggested_title;
                            message.info(`AI auto-formatted title to "${finalTitle}"`);
                        }
                        if (data.checklist_items && Array.isArray(data.checklist_items)) {
                            aiChecklist = data.checklist_items;
                        }
                    }
                } catch (aiErr) {
                    console.error("AI Error:", aiErr);
                }
            }

            const { data: newTaskData, error } = await supabase.from('tsk_tasks').insert([{
                title: finalTitle,
                description,
                priority_type,
                customer_name,
                assignee_id,
                due_date: due_date?.toISOString(),
                status: 'IN_PROGRESS',
                created_by: currentUserId,
                is_internal: customer_name === 'SYAZNA WORLD (INTERNAL)',
                department: department || 'Outsourcing',
            }]).select('id, created_at').single();

            if (error) throw error;

            // Insert initial history record for new task
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

            if (aiChecklist.length > 0 && newTaskData) {
                const insertData = aiChecklist.map((item: string) => ({
                    task_id: newTaskData.id,
                    item_text: item,
                    is_completed: false
                }));
                await supabase.from('tsk_task_checklist').insert(insertData);
            }

            message.success({ content: 'Task created successfully!', key: 'createTask', duration: 2 });
            setIsModalOpen(false);
            form.resetFields();
            fetchTasksAndProfiles();
        } catch (error: any) {
            console.error('Error creating task:', error.message);
            message.error({ content: 'Failed to create task', key: 'createTask', duration: 2 });
        }
    };

    const doUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        try {
            message.loading({ content: 'Updating Task & Generating AI Checklist...', key: 'updateTask' });

            // Check if status is set to DONE
            let totalTimeMessage = '';
            if (values.status === 'DONE') {
                try {
                    // 1. Check if there is an active timer for this task and current user
                    const { data: activeLog } = await supabase
                        .from('tsk_time_logs')
                        .select('*')
                        .eq('task_id', selectedTask.id)
                        .eq('user_id', currentUserId)
                        .eq('status', 'RUNNING')
                        .maybeSingle();

                    if (activeLog) {
                        const stopTime = new Date();
                        const duration = Math.max(0, Math.round((stopTime.getTime() - new Date(activeLog.start_time).getTime()) / 1000));
                        
                        await supabase
                            .from('tsk_time_logs')
                            .update({
                                end_time: stopTime.toISOString(),
                                duration,
                                status: 'COMPLETED'
                            })
                            .eq('id', activeLog.id);
                    }

                    // 2. Fetch all completed logs for this task to calculate total time spent
                    const { data: logs } = await supabase
                        .from('tsk_time_logs')
                        .select('duration')
                        .eq('task_id', selectedTask.id)
                        .eq('status', 'COMPLETED');

                    const totalSeconds = (logs || []).reduce((acc: number, log: any) => acc + (log.duration || 0), 0);
                    
                    if (totalSeconds > 0) {
                        const hrs = Math.floor(totalSeconds / 3600);
                        const mins = Math.floor((totalSeconds % 3600) / 60);
                        const secs = totalSeconds % 60;
                        
                        const parts = [];
                        if (hrs > 0) parts.push(`${hrs} ${hrs === 1 ? 'Hour' : 'Hours'}`);
                        if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'Minute' : 'Minutes'}`);
                        if (secs > 0 || parts.length === 0) parts.push(`${secs} ${secs === 1 ? 'Second' : 'Seconds'}`);
                        totalTimeMessage = parts.join(', ');
                    }
                } catch (timerErr) {
                    console.error('Error handling timer auto-stop:', timerErr);
                }
            }

            let finalTitle = values.title;
            const descChanged = values.description !== selectedTask.description;
            
            // AI Integration
            if (descChanged && values.description && values.description.trim().length > 5) {
                try {
                    const res = await fetch('/api/ai-assistant', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: values.title, description: values.description })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data.suggested_title && data.suggested_title !== values.title) {
                            finalTitle = data.suggested_title;
                            message.info(`AI renamed task to "${finalTitle}"`);
                        }
                        if (data.checklist_items && Array.isArray(data.checklist_items) && data.checklist_items.length > 0) {
                            await supabase.from('tsk_task_checklist').delete().eq('task_id', selectedTask.id);
                            const insertData = data.checklist_items.map((item: string) => ({
                                task_id: selectedTask.id,
                                item_text: item,
                                is_completed: false
                            }));
                            await supabase.from('tsk_task_checklist').insert(insertData);
                        }
                    }
                } catch (aiErr) {
                    console.error("AI Error:", aiErr);
                }
            }

            const { error } = await supabase.from('tsk_tasks').update({
                title: finalTitle,
                description: values.description,
                priority_type: values.priority_type,
                customer_name: values.customer_name,
                assignee_id: values.assignee_id,
                due_date: values.due_date?.toISOString(),
                status: values.status,
                is_internal: values.customer_name === 'SYAZNA WORLD (INTERNAL)',
                department: values.department || 'Outsourcing',
            }).eq('id', selectedTask.id);

            if (error) throw error;

            if (values.status === 'DONE' && totalTimeMessage) {
                message.success({ content: `Task updated to Done! Total time spent: ${totalTimeMessage}`, key: 'updateTask', duration: 8 });
            } else {
                message.success({ content: 'Task updated successfully!', key: 'updateTask', duration: 2 });
            }
            setIsEditModalOpen(false);
            setSelectedTask(null);
            editForm.resetFields();
            fetchTasksAndProfiles();
        } catch (error: any) {
            console.error('Error updating task:', error.message);
            message.error({ content: 'Failed to update task', key: 'updateTask', duration: 2 });
        }
    };

    const handleUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        
        // Check if status is changing to REVIEW
        if (values.status === 'REVIEW' && selectedTask.status !== 'REVIEW') {
            setPendingUpdateValues(values);
            setIsEscalateModalOpen(true);
            return;
        }

        // Otherwise, proceed with normal update
        await doUpdateTask(values);
    };

    const fetchChecklist = async (taskId: string) => {
        const { data } = await supabase.from('tsk_task_checklist').select('*').eq('task_id', taskId).order('created_at', { ascending: true });
        setTaskChecklist(data as any || []);
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
                    
                    // Immediately update local state to hide the deleted task
                    setTasks((prevTasks) => prevTasks.filter((task) => task.id !== selectedTask.id));
                    
                    setIsEditModalOpen(false);
                    setSelectedTask(null);
                    editForm.resetFields();
                    
                    // Optional: fetch background if needed, but setState is enough for instant UX
                    fetchTasksAndProfiles();
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
            className={`p-5 bg-white rounded-2xl transition-all duration-300 cursor-pointer border hover:-translate-y-1 hover:shadow-lg group ${getPriorityColor(task.priority_type)} ${task.is_escalated ? 'bg-orange-50/50 ring-2 ring-orange-500 ring-offset-2' : ''}`}
            onClick={() => {
                setSelectedTask(task);
                fetchChecklist(task.id);
                editForm.setFieldsValue({
                    ...task,
                });
                setIsEditModalOpen(true);
            }}
        >
            <div className="flex items-start justify-between gap-2 mb-4">
                <div className="font-semibold text-slate-800 text-[15px] group-hover:text-indigo-600 transition-colors flex-1">{task.title}</div>
                <div className="flex flex-col items-end gap-1">
                    {task.is_escalated && (
                        <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-0.5 shadow-sm">
                            🚩 Escalated
                        </span>
                    )}
                    {(task as any).is_recurring && (
                        <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                            🔄 Recurring
                        </span>
                    )}
                </div>
            </div>
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
                <div className="flex flex-col sm:flex-row gap-3 items-center">
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
                    {(role === 'admin' || role === 'manager') && (
                        <Button
                            onClick={() => {
                                setFilterCustomer('');
                                setFilterPIC('');
                            }}
                            className="ml-auto"
                            size="large"
                        >
                            Reset Filter
                        </Button>
                    )}
                </div>
            </div>

            <Title level={3} className="px-1">Kanban Board (Workload View)</Title>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <KanbanBoard tasks={filteredTasks} role={role} profiles={profiles} currentUserId={currentUserId} />
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
                        <Form.Item name="customer_name" label="Customer Name" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Customer name is required' }]}>
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children">
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item name="department" label="Jabatan (Department)" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Please select a department' }]} initialValue="Outsourcing">
                            <Select 
                                placeholder="Select Department" 
                                size="large"
                                onChange={(val) => {
                                    if (val === 'IT' || val === 'Marketing') {
                                        form.setFieldsValue({ customer_name: 'SYAZNA WORLD (INTERNAL)' });
                                    } else {
                                        form.setFieldsValue({ customer_name: undefined });
                                    }
                                }}
                            >
                                <Option value="Outsourcing">Outsourcing</Option>
                                <Option value="IT">IT</Option>
                                <Option value="Sales">Sales</Option>
                                <Option value="Marketing">Marketing</Option>
                                <Option value="Recruitment">Recruitment</Option>
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

                    <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Please select a due date' }]}>
                        <DatePicker className="w-full" size="large" showTime disabledDate={(current) => current && current < dayjs().startOf('day')} />   
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
                width={1200}
                style={{ maxWidth: '95vw', top: 20 }}
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="lg:border-r lg:pr-6">
                        <Tabs defaultActiveKey="1" items={[
                            {
                                key: '1',
                                label: 'Details',
                                children: (
                                    <Form form={editForm} layout="vertical" onFinish={handleUpdateTask}>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Form.Item name="customer_name" label="Customer Name" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Customer name is required' }]}>
                                                <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children" disabled={role !== 'admin' && role !== 'manager'}>
                                                    {customers.map(c => (
                                                        <Option key={c.id} value={c.name}>{c.name}</Option>
                                                    ))}
                                                </Select>
                                            </Form.Item>

                                            <Form.Item name="department" label="Jabatan (Department)" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Please select a department' }]}>
                                                <Select 
                                                    placeholder="Select Department" 
                                                    size="large" 
                                                    disabled={role !== 'admin' && role !== 'manager'}
                                                    onChange={(val) => {
                                                        if (val === 'IT' || val === 'Marketing') {
                                                            editForm.setFieldsValue({ customer_name: 'SYAZNA WORLD (INTERNAL)' });
                                                        } else {
                                                            editForm.setFieldsValue({ customer_name: undefined });
                                                        }
                                                    }}
                                                >
                                                    <Option value="Outsourcing">Outsourcing</Option>
                                                    <Option value="IT">IT</Option>
                                                    <Option value="Sales">Sales</Option>
                                                    <Option value="Marketing">Marketing</Option>
                                                    <Option value="Recruitment">Recruitment</Option>
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
                                                    <Option value="CLIENT_HOLD">Client Hold</Option>
                                                    <Option value="IN_PROGRESS">In Progress</Option>
                                                    <Option value="REVIEW">Review</Option>
                                                    <Option value="DONE">Done</Option>
                                                </Select>
                                            </Form.Item>
                                        </div>

                                        <Form.Item name="description" label="Description">
                                            <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-y" disabled={role !== 'admin' && role !== 'manager'} />
                                        </Form.Item>

                                        {taskChecklist.length > 0 && (
                                            <div className="mb-4 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                                                <div className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                                                    <span>✨ AI Action Items</span>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {taskChecklist.map(checkItem => (
                                                        <div key={checkItem.id} className="flex items-start gap-3">
                                                            <input 
                                                                type="checkbox" 
                                                                className="mt-1 flex-shrink-0 w-4 h-4 cursor-pointer accent-indigo-600" 
                                                                checked={checkItem.is_completed}
                                                                onChange={async (e) => {
                                                                    const newStatus = e.target.checked;
                                                                    setTaskChecklist(prev => prev.map(c => c.id === checkItem.id ? { ...c, is_completed: newStatus } : c));
                                                                    await supabase.from('tsk_task_checklist').update({ is_completed: newStatus }).eq('id', checkItem.id);
                                                                }}
                                                            />
                                                            <span className={`text-sm tracking-wide ${checkItem.is_completed ? 'line-through text-gray-400' : 'text-slate-700 font-medium'}`}>
                                                                {checkItem.item_text}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedTask?.due_date && (
                                            <div className="mb-4 text-sm text-gray-500">
                                                <strong>Current Due Date:</strong> {new Date(selectedTask.due_date).toLocaleString()}
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
                                                <div className="flex items-center gap-2" style={{ marginTop: '20px' }}>
                                                    <Button onClick={() => {
                                                        setIsEditModalOpen(false);
                                                        setSelectedTask(null);
                                                    }} size="large">Cancel</Button>

                                                    {selectedTask && (selectedTask.assignee_id === currentUserId || role === 'admin' || role === 'manager') && (
                                                        <Button 
                                                            type="default" 
                                                            size="large" 
                                                            className="border-orange-500 text-orange-600 hover:bg-orange-50 bg-white"
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
                                )
                            },
                            {
                                key: '2',
                                label: 'History & Escalations',
                                children: <TaskHistoryTab taskId={selectedTask?.id} />
                            }
                        ]} />
                    </div>
                    <div className="lg:pl-0">
                        {selectedTask && (
                            <TaskStatusHistory 
                                taskId={selectedTask.id} 
                                currentStatus={selectedTask.status}
                                taskCreatedAt={selectedTask.created_at}
                            />
                        )}
                    </div>
                </div>
            </Modal>

            <EscalateModal 
                isOpen={isEscalateModalOpen}
                onClose={() => {
                    setIsEscalateModalOpen(false);
                    setPendingUpdateValues(null);
                }}
                task={selectedTask}
                profiles={profiles}
                currentUserId={currentUserId}
                currentTaskDescription={pendingUpdateValues?.description || editForm.getFieldValue('description')}
                nextStatus={pendingUpdateValues?.status === 'REVIEW' ? 'REVIEW' : 'BACKLOG'}
                onSuccess={() => {
                    fetchTasksAndProfiles();
                    setIsEditModalOpen(false); 
                    setPendingUpdateValues(null);
                }}
            />
        </div>
    );
}
