'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Modal, Form, Select, DatePicker, message, Spin, Typography, Tabs, InputNumber } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  AuditOutlined,
  TeamOutlined,
  BankOutlined,
  FlagOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task, PriorityType } from '@/lib/types';
import KanbanBoard from '@/components/task/KanbanBoard';
import { useRole } from '@/components/layout/RoleProvider';
import EscalateModal from './EscalateModal';
import ReviewResolutionModal from './ReviewResolutionModal';
import TaskHistoryTab from './TaskHistoryTab';
import TaskStatusHistory from './TaskStatusHistory';
import TaskComments from './TaskComments';
import { useTimer } from '@/components/task/TimerProvider';

import dayjs from 'dayjs';  


const { Title } = Typography;
const { Option } = Select;

export default function EisenhowerDashboard() {
    const { handleStatusChange } = useTimer();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [isReviewResolutionModalOpen, setIsReviewResolutionModalOpen] = useState(false);
    const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskChecklist, setTaskChecklist] = useState<any[]>([]);
    const [pendingUpdateValues, setPendingUpdateValues] = useState<any>(null);

    const [filterCustomer, setFilterCustomer] = useState<string>('');
    const [filterPIC, setFilterPIC] = useState<string>('');

    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const { role, department: currentUserDept, accessibleDepartments, hasDepartmentAccess } = useRole();
    const supabase = createClient();

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [userDepartments, setUserDepartments] = useState<{ user_id: string; department: string }[]>([]);

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
                ),
                escalated_group:tsk_review_groups!tsk_tasks_escalated_to_group_id_fkey (
                    id,
                    name
                ),
                reviewed_by_user:lv_profiles!tsk_tasks_reviewed_by_fkey (
                    id,
                    full_name
                )
            `).order('created_at', { ascending: false });

            // If user is supervisor, fetch all tasks in their accessible departments. If employee, fetch their own tasks.
            if (role === 'supervisor') {
                if (accessibleDepartments.length > 0) {
                    query = query.in('department', accessibleDepartments);
                } else if (currentUserDept) {
                    query = query.eq('department', currentUserDept);
                }
            } else if (role !== 'admin' && role !== 'manager' && userId) {
                query = query.eq('assignee_id', userId);
            }

            const [tasksRes, profilesRes, customersRes, userDeptsRes] = await Promise.all([
                query,
                supabase.from('lv_profiles').select('id, full_name, department, role').eq('status', 'active').order('full_name'),
                supabase.from('tsk_customers').select('id, name, is_internal').eq('status', 'active').order('name'),
                supabase.from('user_departments').select('user_id, department')
            ]);

            if (tasksRes.error) throw tasksRes.error;
            if (profilesRes.error) throw profilesRes.error;
            if (customersRes.error && customersRes.error.code !== '42P01') throw customersRes.error;

            setTasks(tasksRes.data as Task[] || []);
            setProfiles(profilesRes.data || []);
            setCustomers(customersRes.data || []);
            setUserDepartments(userDeptsRes.data || []);
        } catch (error: any) {
            console.error('Error fetching data:', error.message);
            message.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [role, currentUserDept, accessibleDepartments]);

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
            message.loading({ content: 'Mencipta tugasan...', key: 'createTask' });
            
            const { title, description, priority_type, start_date, due_date, customer_name, assignee_id, department, estimated_hours } = values;
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
                            message.info(`Tajuk tugasan dikemaskini: "${finalTitle}"`);
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
                start_date: start_date?.toISOString(),
                due_date: due_date?.toISOString(),
                estimated_hours: estimated_hours || null,
                status: 'IN_PROGRESS',
                created_by: currentUserId,
                // is_internal is auto-set by trigger
                department: department || (accessibleDepartments.length === 1 ? accessibleDepartments[0] : (currentUserDept || 'Outsourcing')),
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

            message.success({ content: 'Tugasan berjaya dicipta', key: 'createTask', duration: 2 });
            setIsModalOpen(false);
            form.resetFields();
            fetchTasksAndProfiles();
        } catch (error: any) {
            console.error('Error creating task:', error.message);
            message.error({ content: 'Gagal mencipta tugasan', key: 'createTask', duration: 2 });
        }
    };

    const doUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        try {
            message.loading({ content: 'Mengemaskini tugasan...', key: 'updateTask' });

            // Check if status is set to DONE
            let totalTimeMessage = '';
            if (values.status === 'DONE') {
                try {
                    // Fetch all completed logs for this task to calculate total time spent
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
                    console.error('Error handling timer stats:', timerErr);
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
                            message.info(`Tajuk tugasan dikemaskini: "${finalTitle}"`);
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
                start_date: values.start_date?.toISOString() || null,
                due_date: values.due_date?.toISOString() || null,
                status: values.status,
                // is_internal is auto-set by trg_sync_task_is_internal trigger
                department: values.department || 'Outsourcing',
                estimated_hours: values.estimated_hours || null,
                updated_at: new Date().toISOString()
            }).eq('id', selectedTask.id);

            if (error) throw error;

            message.success({ content: 'Tugasan berjaya dikemaskini', key: 'updateTask', duration: 2 });
            setIsEditModalOpen(false);
            setSelectedTask(null);
            editForm.resetFields();
            fetchTasksAndProfiles();
        } catch (error: any) {
            console.error('Error updating task:', error.message);
            message.error({ content: 'Gagal mengemaskini tugasan', key: 'updateTask', duration: 2 });
        }
    };

    const formatDateDisplay = (dateStr?: string | null) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handleUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        
        // Check if status is changing
        if (values.status === selectedTask.status) {
            await doUpdateTask(values);
            return;
        }

        // Check if status is changing to REVIEW
        if (values.status === 'REVIEW' && selectedTask.status !== 'REVIEW') {
            setPendingUpdateValues(values);
            setIsEscalateModalOpen(true);
            return;
        }

        // Intercept with handleStatusChange
        await handleStatusChange(selectedTask.id, values.status, async () => {
            await doUpdateTask(values);
        });
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
            case 'DO_FIRST': return 'border-rose-200 hover:border-rose-400 bg-rose-50/20';
            case 'SCHEDULE': return 'border-sky-200 hover:border-sky-400 bg-sky-50/20';
            case 'DELEGATE': return 'border-amber-200 hover:border-amber-400 bg-amber-50/20';
            case 'ELIMINATE': return 'border-slate-200 hover:border-slate-400 bg-slate-50/20';
            default: return 'border-slate-200';
        }
    };

    const getAssignableProfilesForDept = useCallback((dept?: string | null) => {
        if (!dept) {
            if (role === 'supervisor') {
                return profiles.filter(p => 
                    p.role === 'admin' || p.role === 'manager' ||
                    (p.department && accessibleDepartments.includes(p.department)) ||
                    userDepartments.some(ud => ud.user_id === p.id && accessibleDepartments.includes(ud.department))
                );
            }
            return profiles;
        }
        return profiles.filter(p => {
            if (p.role === 'admin' || p.role === 'manager') return true;
            if (p.department === dept) return true;
            return userDepartments.some(ud => ud.user_id === p.id && ud.department === dept);
        });
    }, [profiles, userDepartments, role, accessibleDepartments]);

    const canEditTaskFields = role === 'admin' || role === 'manager' || (role === 'supervisor' && !!selectedTask?.department && accessibleDepartments.includes(selectedTask.department));

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
            className={`p-4 bg-white rounded-xl transition-all duration-200 cursor-pointer border hover:-translate-y-0.5 hover:shadow-md group ${getPriorityColor(task.priority_type)} ${task.is_escalated ? 'bg-amber-50/40 ring-1 ring-amber-400' : ''}`}
            onClick={() => {
                setSelectedTask(task);
                fetchChecklist(task.id);
                editForm.setFieldsValue({
                    ...task,
                    start_date: task.start_date ? dayjs(task.start_date) : null,
                    due_date: task.due_date ? dayjs(task.due_date) : null,
                });
                setIsEditModalOpen(true);
            }}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="font-semibold text-slate-800 text-sm group-hover:text-cyan-600 transition-colors flex-1">{task.title}</div>
                <div className="flex flex-col items-end gap-1">
                    {task.is_escalated && (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shadow-2xs">
                            <FlagOutlined className="text-[9px]" /> Eskalasi
                        </span>
                    )}
                    {(task as any).is_recurring && (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <SyncOutlined className="text-[9px]" /> Berkala
                        </span>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-2 text-xs">
                {task.customer_name && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                        <BankOutlined className="text-slate-400 text-xs" />
                        <span className="font-medium truncate">{task.customer_name}</span>
                    </div>
                )}
                {task.assignee && (
                    <div className="flex items-center gap-2">
                        <img
                            src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${task.assignee.full_name}&background=35c0ed&color=fff`}
                            className="w-5 h-5 rounded-full shadow-2xs"
                            alt={task.assignee.full_name}
                        />
                        <span className="font-medium text-slate-700 text-xs">{task.assignee.full_name}</span>
                    </div>
                )}
            </div>
            {task.due_date && (
                <div className="text-[11px] font-semibold text-rose-600 mt-3 flex items-center gap-1 bg-rose-50/80 w-fit px-2 py-0.5 rounded-md border border-rose-200 font-mono tabular-nums">
                    <ClockCircleOutlined className="text-[10px]" /> Due: {formatDateDisplay(task.due_date)}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-6 font-sans">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-5 sm:p-6 rounded-2xl shadow-2xs border border-slate-200/80">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 tracking-tight">Task Matrix</h1>
                    <p className="text-slate-500 font-normal text-xs sm:text-sm">Manage and prioritize tasks using the Eisenhower Matrix and Kanban board</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)} size="large" className="rounded-xl h-11 px-5 font-semibold transition-all w-full sm:w-auto shadow-sm">
                    Add Task
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-2xs border border-slate-200/80">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px] block mb-2.5">Filters:</span>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <Select
                        placeholder="Filter by Customer..."
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
                        placeholder="Filter by Assignee / PIC..."
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
                            Reset Filters
                        </Button>
                    )}
                </div>
            </div>

            <Title level={4} className="px-1 !text-slate-800 !mb-0">Kanban Workflow</Title>
            <div className="bg-white p-4 rounded-2xl shadow-2xs border border-slate-200/80">
                <KanbanBoard tasks={filteredTasks} role={role} profiles={profiles} currentUserId={currentUserId} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                {/* DO FIRST */}
                <div className="bg-white border border-rose-200/80 p-5 rounded-2xl shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 mb-5 pb-3 border-b border-rose-100">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                        <h3 className="font-bold text-slate-800 text-sm m-0">Do First</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md ml-auto uppercase tracking-wider">Urgent & Important</span>
                    </div>
                    <div className="flex flex-col gap-3 min-h-[140px]">
                        {doFirstTasks.length === 0 ? <p className="text-slate-400 text-center mt-8 font-normal italic text-xs">No critical tasks remaining</p> :
                            doFirstTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* SCHEDULE */}
                <div className="bg-white border border-sky-200/80 p-5 rounded-2xl shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 mb-5 pb-3 border-b border-sky-100">
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                        <h3 className="font-bold text-slate-800 text-sm m-0">Schedule</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md ml-auto uppercase tracking-wider">Not Urgent, Important</span>
                    </div>
                    <div className="flex flex-col gap-3 min-h-[140px]">
                        {scheduleTasks.length === 0 ? <p className="text-slate-400 text-center mt-8 font-normal italic text-xs">No scheduled tasks</p> :
                            scheduleTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* DELEGATE */}
                <div className="bg-white border border-amber-200/80 p-5 rounded-2xl shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 mb-5 pb-3 border-b border-amber-100">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                        <h3 className="font-bold text-slate-800 text-sm m-0">Delegate</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md ml-auto uppercase tracking-wider">Urgent, Not Important</span>
                    </div>
                    <div className="flex flex-col gap-3 min-h-[140px]">
                        {delegateTasks.length === 0 ? <p className="text-slate-400 text-center mt-8 font-normal italic text-xs">No tasks for delegation</p> :
                            delegateTasks.map(renderTaskCard)
                        }
                    </div>
                </div>

                {/* ELIMINATE */}
                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                        <h3 className="font-bold text-slate-800 text-sm m-0">Eliminate</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md ml-auto uppercase tracking-wider">Not Urgent, Not Important</span>
                    </div>
                    <div className="flex flex-col gap-3 min-h-[140px]">
                        {eliminateTasks.length === 0 ? <p className="text-slate-400 text-center mt-8 font-normal italic text-xs">No non-essential tasks</p> :
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
                            <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children"
                                onChange={() => {
                                    // Reset department when customer changes so Outsourcing isn't kept for internal customers
                                    if (role !== 'supervisor') form.setFieldsValue({ department: undefined });
                                }}
                            >
                                {customers.map(c => (
                                    <Option key={c.id} value={c.name}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.customer_name !== cur.customer_name}>
                            {({ getFieldValue }) => {
                                const selCustomer = customers.find((c: any) => c.name === getFieldValue('customer_name'));
                                const isInternal = selCustomer?.is_internal ?? false;
                                const allDepts = ['Outsourcing', 'IT', 'Sales', 'Marketing', 'Recruitment', 'Human Resources', 'Account'];
                                const allowedDepts = (role === 'admin' || role === 'manager')
                                    ? allDepts
                                    : (accessibleDepartments.length > 0 ? accessibleDepartments : (currentUserDept ? [currentUserDept] : allDepts));
                                const filteredDepts = allowedDepts.filter(d => !(isInternal && d === 'Outsourcing'));
                                const defaultDept = filteredDepts.length === 1 ? filteredDepts[0] : undefined;

                                return (
                                    <Form.Item
                                        name="department"
                                        label="Jabatan (Department)"
                                        className="col-span-2 sm:col-span-1"
                                        rules={[{ required: true, message: 'Please select a department' }]}
                                        initialValue={defaultDept}
                                    >
                                        <Select
                                            placeholder="Select Department"
                                            size="large"
                                            allowClear={filteredDepts.length > 1}
                                            onChange={() => {
                                                form.setFieldsValue({ assignee_id: undefined });
                                            }}
                                        >
                                            {filteredDepts.map(dept => (
                                                <Option key={dept} value={dept}>{dept}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>

                        <Form.Item name="title" label="Task Title" className="col-span-2" rules={[{ required: true, message: 'Please enter a title' }]}>
                            <Input placeholder="Enter task title" size="large" />
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.department !== cur.department}>
                            {({ getFieldValue }) => {
                                const currentDept = getFieldValue('department') || (accessibleDepartments.length === 1 ? accessibleDepartments[0] : currentUserDept);
                                const assignables = getAssignableProfilesForDept(currentDept);
                                return (
                                    <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Assignee is required' }]}>
                                        <Select placeholder="Select Assignee" size="large" showSearch optionFilterProp="children">
                                            {assignables.map(p => (
                                                <Option key={p.id} value={p.id}>{p.full_name} {p.department ? `(${p.department})` : ''}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                );
                            }}
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Form.Item name="start_date" label="Start Date">
                            <DatePicker className="w-full" size="large" showTime disabledDate={(current) => current && current < dayjs().startOf('day')} />
                        </Form.Item>

                        <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Please select a due date' }]}>
                            <DatePicker className="w-full" size="large" showTime disabledDate={(current) => current && current < dayjs().startOf('day')} />   
                        </Form.Item>

                        <Form.Item name="estimated_hours" label="Est. Hours">
                            <InputNumber className="w-full" size="large" min={0} step={0.5} placeholder="e.g. 4.5" />
                        </Form.Item>
                    </div>

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
                width={1600}
                style={{ maxWidth: '97vw', top: 20 }}
            >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:border-r lg:pr-6">
                        <Tabs defaultActiveKey="1" items={[
                            {
                                key: '1',
                                label: 'Details',
                                children: (
                                    <Form form={editForm} layout="vertical" onFinish={handleUpdateTask} disabled={selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager'}>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Form.Item name="customer_name" label="Customer Name" className="col-span-2 sm:col-span-1" rules={[{ required: true, message: 'Customer name is required' }]}>
                                                <Select placeholder="Select Customer" size="large" showSearch optionFilterProp="children" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields}>
                                                    {customers.map(c => (
                                                        <Option key={c.id} value={c.name}>{c.name}</Option>
                                                    ))}
                                                </Select>
                                            </Form.Item>

                                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.customer_name !== cur.customer_name || prev.department !== cur.department}>
                                                 {({ getFieldValue }) => {
                                                     const selCustomer = customers.find((c: any) => c.name === getFieldValue('customer_name'));
                                                     const isInternal = selCustomer?.is_internal ?? false;
                                                     const hasBadCombo = isInternal && getFieldValue('department') === 'Outsourcing';
                                                     const allDepts = ['Outsourcing', 'IT', 'Sales', 'Marketing', 'Recruitment', 'Human Resources', 'Account'];
                                                     const allowedDepts = (role === 'admin' || role === 'manager')
                                                         ? allDepts
                                                         : (accessibleDepartments.length > 0 ? accessibleDepartments : (currentUserDept ? [currentUserDept] : allDepts));
                                                     const filteredDepts = allowedDepts.filter(d => !(isInternal && d === 'Outsourcing'));

                                                     return (
                                                         <Form.Item
                                                             name="department"
                                                             label="Jabatan (Department)"
                                                             className="col-span-2 sm:col-span-1"
                                                             rules={[{ required: true, message: 'Please select a department' }]}
                                                             extra={hasBadCombo ? <span className="text-amber-600 text-xs">⚠️ This task's department may need review</span> : undefined}
                                                         >
                                                             <Select
                                                                 placeholder="Select Department"
                                                                 size="large"
                                                                 disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields}
                                                                 onChange={() => {
                                                                     editForm.setFieldsValue({ assignee_id: undefined });
                                                                 }}
                                                             >
                                                                 {filteredDepts.map(dept => (
                                                                     <Option key={dept} value={dept}>{dept}</Option>
                                                                 ))}
                                                             </Select>
                                                         </Form.Item>
                                                     );
                                                 }}
                                             </Form.Item>

                                            <Form.Item name="title" label="Task Title" className="col-span-2" rules={[{ required: true, message: 'Please enter a title' }]}>
                                                <Input placeholder="Enter task title" size="large" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields} />
                                            </Form.Item>

                                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.department !== cur.department}>
                                                 {({ getFieldValue }) => {
                                                     const currentDept = getFieldValue('department') || selectedTask?.department;
                                                     const assignables = getAssignableProfilesForDept(currentDept);
                                                     return (
                                                         <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Assignee is required' }]}>
                                                             <Select placeholder="Select Assignee" size="large" showSearch optionFilterProp="children" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields}>
                                                                 {assignables.map(p => (
                                                                     <Option key={p.id} value={p.id}>{p.full_name} {p.department ? `(${p.department})` : ''}</Option>
                                                                 ))}
                                                             </Select>
                                                         </Form.Item>
                                                     );
                                                 }}
                                             </Form.Item>

                                            <Form.Item name="priority_type" label="Eisenhower Priority" rules={[{ required: true, message: 'Please select a priority' }]}>
                                                <Select placeholder="Select Priority" size="large" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields}>
                                                    <Option value="DO_FIRST"><span className="text-red-600 font-medium">🔴 DO FIRST (Urgent & Important)</span></Option>
                                                    <Option value="SCHEDULE"><span className="text-blue-600 font-medium">🔵 SCHEDULE (Not Urgent, Important)</span></Option>
                                                    <Option value="DELEGATE"><span className="text-yellow-600 font-medium">🟡 DELEGATE (Urgent, Not Important)</span></Option>
                                                    <Option value="ELIMINATE"><span className="text-gray-500 font-medium">⚫ ELIMINATE (Not Urgent, Not Important)</span></Option>
                                                </Select>
                                            </Form.Item>

                                            <Form.Item name="status" label="Task Status" rules={[{ required: true, message: 'Please select a status' }]}>
                                                <Select placeholder="Select Status" size="large" disabled={selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager'}>
                                                    <Option value="BACKLOG">Backlog</Option>
                                                    <Option value="CLIENT_HOLD">Client Hold</Option>
                                                    <Option value="IN_PROGRESS">In Progress</Option>
                                                    <Option value="REVIEW">Review</Option>
                                                    <Option value="DONE">Done</Option>
                                                </Select>
                                            </Form.Item>
                                        </div>

                                        <Form.Item name="description" label="Description">
                                            <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-y" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields} />
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
                                                                className="mt-1 flex-shrink-0 w-4 h-4 cursor-pointer accent-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                                                                checked={checkItem.is_completed}
                                                                disabled={selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager'}
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

                                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                             <Form.Item name="start_date" label="Start Date">
                                                 <DatePicker className="w-full" size="large" showTime disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields} />
                                             </Form.Item>
                                             <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Due date is required' }]}>
                                                 <DatePicker className="w-full" size="large" showTime disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields} />
                                             </Form.Item>
                                             <Form.Item name="estimated_hours" label="Est. Hours">
                                                 <InputNumber className="w-full" size="large" min={0} step={0.5} placeholder="e.g. 4.5" disabled={(selectedTask?.status === 'DONE' && role !== 'admin' && role !== 'manager') || !canEditTaskFields} />
                                             </Form.Item>
                                         </div>

                                        <Form.Item className="mb-0 mt-6 pt-4 border-t">
                                            <div className="flex items-center justify-between w-full">
                                                <div>
                                                    {(role === 'admin' || role === 'manager' || (role === 'employee' && selectedTask && (selectedTask.status !== 'DONE' || selectedTask.assignee_id === currentUserId))) && selectedTask && (
                                                        <Button danger type="text" onClick={handleDeleteTask} size="large" icon={<DeleteOutlined />} disabled={false}>
                                                            Delete
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2" style={{ marginTop: '20px' }}>
                                                    <Button onClick={() => {
                                                        setIsEditModalOpen(false);
                                                        setSelectedTask(null);
                                                    }} size="large" disabled={false}>Cancel</Button>

                                                    {selectedTask?.status === 'REVIEW' && (
                                                        <Button
                                                            type="primary"
                                                            size="large"
                                                            className="bg-amber-600 hover:bg-amber-700 border-none shadow-md mr-3"
                                                            icon={<AuditOutlined />}
                                                            onClick={() => {
                                                                setReviewingTask(selectedTask);
                                                                setIsReviewResolutionModalOpen(true);
                                                            }}
                                                        >
                                                            Semak Tugasan (Approve / Reject)
                                                        </Button>
                                                    )}

                                                    {selectedTask?.status !== 'DONE' && selectedTask && (selectedTask.assignee_id === currentUserId || role === 'admin' || role === 'manager' || (role === 'supervisor' && selectedTask.department === currentUserDept)) && (
                                                        <Button 
                                                            type="default" 
                                                            size="large" 
                                                            className="border-orange-500 text-orange-600 hover:bg-orange-50 bg-white mr-3"
                                                            onClick={() => setIsEscalateModalOpen(true)}
                                                        >
                                                            🚩 Escalate
                                                        </Button>
                                                    )}

                                                    {(selectedTask?.status !== 'DONE' || role === 'admin' || role === 'manager') && (
                                                        <Button type="primary" htmlType="submit" size="large" className="bg-indigo-600 shadow-md">Update Task</Button>
                                                    )}
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
                    <div className="lg:border-l lg:pl-6 relative">
                        {selectedTask && (
                            <TaskComments
                                taskId={selectedTask.id}
                                currentUserId={currentUserId ?? ''}
                                role={role}
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

            {reviewingTask && (
                <ReviewResolutionModal
                    isOpen={isReviewResolutionModalOpen}
                    onClose={() => {
                        setIsReviewResolutionModalOpen(false);
                        setReviewingTask(null);
                    }}
                    task={reviewingTask}
                    currentUserId={currentUserId || ''}
                    onSuccess={() => {
                        setIsReviewResolutionModalOpen(false);
                        setReviewingTask(null);
                        setIsEditModalOpen(false);
                        fetchTasksAndProfiles();
                    }}
                />
            )}
        </div>
    );
}
