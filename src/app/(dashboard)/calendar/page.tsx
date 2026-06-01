'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Select, Input, Tag, Typography, Spin, message, Modal, Form, Button, DatePicker, Tooltip, Calendar, Avatar, Tabs } from 'antd';
import { SearchOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, ExclamationCircleOutlined, EditOutlined, DeleteOutlined, ExclamationCircleFilled, PauseCircleOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import EscalateModal from '@/components/task/EscalateModal';
import TaskStatusHistory from '@/components/task/TaskStatusHistory';
import TaskComments from '@/components/task/TaskComments';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function CalendarTimelinePage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchText, setSearchText] = useState('');
    const [filterCustomer, setFilterCustomer] = useState('');
    const [filterPIC, setFilterPIC] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');

    // Selected task for Modal
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm] = Form.useForm();
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [pendingUpdateValues, setPendingUpdateValues] = useState<any>(null);

    // Timeline Scale and Navigation
    const [currentDate, setCurrentDate] = useState(dayjs());
    const [ganttScale, setGanttScale] = useState<'monthly' | 'weekly'>('monthly');
    const [ganttGroupBy, setGanttGroupBy] = useState<'assignee' | 'flat'>('assignee');

    const supabase = createClient();
    const { role } = useRole();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
                    full_name
                )
            `).order('created_at', { ascending: false });

            // If normal user, filter tasks assigned to them
            if (role !== 'admin' && role !== 'manager' && userId) {
                query = query.eq('assignee_id', userId);
            }

            const [tasksRes, profilesRes, customersRes] = await Promise.all([
                query,
                supabase.from('lv_profiles').select('id, full_name, avatar_url').eq('status', 'active').order('full_name'),
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
            message.error('Failed to fetch calendar data');
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        fetchData();

        const subscription = supabase
            .channel('calendar-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchData]);

    // Handle Edit Modal Open
    const handleEditTask = (task: Task) => {
        setSelectedTask(task);
        editForm.setFieldsValue({
            ...task,
            start_date: task.start_date ? dayjs(task.start_date) : null,
            due_date: task.due_date ? dayjs(task.due_date) : null,
        });
        setIsEditModalOpen(true);
    };

    const doUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        try {
            const isPrivileged = role === 'admin' || role === 'manager';
            const { title, description, priority_type, start_date, due_date, customer_name, department, assignee_id, status } = values;

            let totalTimeMessage = '';
            if (status === 'DONE') {
                try {
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
                    console.error('Error handling timer:', timerErr);
                }
            }

            const nextTitle = typeof title === 'string' && title.trim() !== '' ? title : selectedTask.title;
            const nextDescription = typeof description === 'string' ? description : selectedTask.description;

            const updatePayload = isPrivileged
                ? {
                    title: nextTitle,
                    description: nextDescription,
                    priority_type,
                    customer_name,
                    assignee_id,
                    start_date: start_date?.toISOString() || null,
                    due_date: due_date?.toISOString() || null,
                    status,
                }
                : {
                    title: nextTitle,
                    description: nextDescription,
                    status,
                };

            const { error } = await supabase.from('tsk_tasks').update(updatePayload).eq('id', selectedTask.id);
            if (error) throw error;

            if (status === 'DONE' && totalTimeMessage) {
                message.success(`Task updated to Done! Total time spent: ${totalTimeMessage}`, 8);
            } else {
                message.success('Task updated successfully!');
            }

            setIsEditModalOpen(false);
            setSelectedTask(null);
            editForm.resetFields();
            fetchData();
        } catch (error: any) {
            console.error('Error updating task:', error.message);
            message.error('Failed to update task');
        }
    };

    const handleUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        if (values.status === 'REVIEW' && selectedTask.status !== 'REVIEW') {
            setPendingUpdateValues(values);
            setIsEscalateModalOpen(true);
            return;
        }
        await doUpdateTask(values);
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
                    fetchData();
                } catch (error: any) {
                    console.error('Error deleting task:', error.message);
                    message.error('Failed to delete task');
                }
            }
        });
    };

    // Filter Logic
    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchText.toLowerCase()) ||
            (t.description && t.description.toLowerCase().includes(searchText.toLowerCase()));
        const matchesCustomer = filterCustomer ? t.customer_name === filterCustomer : true;
        const matchesPIC = filterPIC ? t.assignee_id === filterPIC : true;
        const matchesStatus = filterStatus ? t.status === filterStatus : true;
        const matchesPriority = filterPriority ? t.priority_type === filterPriority : true;
        return matchesSearch && matchesCustomer && matchesPIC && matchesStatus && matchesPriority;
    });

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'DONE': return <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>;
            case 'IN_PROGRESS': return <Tag icon={<SyncOutlined spin />} color="processing">In Progress</Tag>;
            case 'REVIEW': return <Tag icon={<ExclamationCircleOutlined />} color="warning">Review</Tag>;
            case 'BACKLOG': return <Tag icon={<ClockCircleOutlined />} color="default">Backlog</Tag>;
            case 'CLIENT_HOLD': return <Tag icon={<PauseCircleOutlined />} color="magenta">Client Hold</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    const getPriorityColor = (priority: string | null) => {
        switch (priority) {
            case 'DO_FIRST': return 'red';
            case 'SCHEDULE': return 'blue';
            case 'DELEGATE': return 'orange';
            case 'ELIMINATE': return 'default';
            default: return 'default';
        }
    };

    const getStatusColorClass = (status: string) => {
        switch (status) {
            case 'DONE': return 'from-emerald-500 to-teal-600 text-white';
            case 'IN_PROGRESS': return 'from-indigo-500 to-violet-600 text-white';
            case 'REVIEW': return 'from-amber-500 to-orange-600 text-white';
            case 'BACKLOG': return 'from-slate-400 to-slate-500 text-white';
            case 'CLIENT_HOLD': return 'from-pink-500 to-rose-600 text-white';
            default: return 'from-gray-400 to-gray-500 text-white';
        }
    };

    // Calendar Render Cell
    const dateCellRender = (value: dayjs.Dayjs) => {
        const formattedDate = value.format('YYYY-MM-DD');
        const dayTasks = filteredTasks.filter(t => t.due_date && dayjs(t.due_date).format('YYYY-MM-DD') === formattedDate);

        return (
            <div className="flex flex-col gap-1 overflow-y-auto max-h-[85px] scrollbar-thin">
                {dayTasks.map(task => (
                    <div
                        key={task.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEditTask(task);
                        }}
                        className="text-[10px] truncate px-1.5 py-0.5 rounded border font-semibold cursor-pointer hover:scale-102 transition-transform shadow-sm bg-white border-slate-200"
                        style={{ borderLeftWidth: '3px', borderLeftColor: getPriorityColor(task.priority_type) === 'red' ? '#ef4444' : getPriorityColor(task.priority_type) === 'blue' ? '#3b82f6' : getPriorityColor(task.priority_type) === 'orange' ? '#f59e0b' : '#94a3b8' }}
                    >
                        <span className="opacity-75 font-bold mr-1">
                            {task.status === 'DONE' ? '✓' : '•'}
                        </span>
                        {task.title}
                    </div>
                ))}
            </div>
        );
    };

    // Gantt Timeline calculation helpers
    const getDaysInMonth = () => currentDate.daysInMonth();
    const getDaysArray = () => {
        const totalDays = getDaysInMonth();
        const startOfMonth = currentDate.startOf('month');
        return Array.from({ length: totalDays }, (_, i) => startOfMonth.add(i, 'day'));
    };

    const getWeeksArray = () => {
        const startOfMonth = currentDate.startOf('month');
        const endOfMonth = currentDate.endOf('month');
        let current = startOfMonth.startOf('week');
        const weeks = [];
        while (current.isBefore(endOfMonth) || current.isSame(endOfMonth, 'day')) {
            weeks.push(current);
            current = current.add(1, 'week');
        }
        return weeks;
    };

    // Render Timeline Gantt
    const renderGanttTimeline = () => {
        const days = getDaysArray();
        const weeks = getWeeksArray();
        const daysInMonth = getDaysInMonth();

        // 1. Group tasks by assignee or flat list
        let rows: { title: string; avatarUrl?: string; tasks: Task[] }[] = [];

        if (ganttGroupBy === 'assignee') {
            const grouped: Record<string, Task[]> = {};
            // Group matching tasks
            filteredTasks.forEach(task => {
                const key = task.assignee_id || 'unassigned';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(task);
            });

            // Populate rows
            profiles.forEach(p => {
                if (grouped[p.id] && grouped[p.id].length > 0) {
                    rows.push({
                        title: p.full_name,
                        avatarUrl: p.avatar_url,
                        tasks: grouped[p.id]
                    });
                }
            });

            // Unassigned group
            if (grouped['unassigned'] && grouped['unassigned'].length > 0) {
                rows.push({
                    title: 'Unassigned Tasks',
                    tasks: grouped['unassigned']
                });
            }
        } else {
            // Flat list - each task is its own row or all tasks together
            rows = [{ title: 'All Tasks', tasks: filteredTasks }];
        }

        const startOfMonth = currentDate.startOf('month');
        const endOfMonth = currentDate.endOf('month');

        return (
            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col">
                {/* Gantt Timeline Header Controls */}
                <div className="flex flex-wrap items-center justify-between p-4 bg-slate-50 border-b gap-4">
                    <div className="flex items-center gap-2">
                        <Button icon={<LeftOutlined />} onClick={() => setCurrentDate(prev => prev.subtract(1, 'month'))} />
                        <Title level={4} className="!mb-0 !text-slate-800 tracking-tight font-bold w-48 text-center">
                            {currentDate.format('MMMM YYYY')}
                        </Title>
                        <Button icon={<RightOutlined />} onClick={() => setCurrentDate(prev => prev.add(1, 'month'))} />
                        <Button onClick={() => setCurrentDate(dayjs())} type="text" className="text-indigo-600 font-semibold hover:bg-indigo-50">Today</Button>
                    </div>

                    <div className="flex gap-2">
                        <Select value={ganttGroupBy} onChange={setGanttGroupBy} size="middle" className="w-40">
                            <Option value="assignee">Group by Assignee</Option>
                            <Option value="flat">Single Timeline</Option>
                        </Select>
                    </div>
                </div>

                {/* Timeline Grid */}
                <div className="overflow-x-auto w-full">
                    <div className="min-w-[800px] flex flex-col">
                        {/* Timeline Header Row (Days of the Month) */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            {/* Left Col space */}
                            <div className="w-64 flex-shrink-0 p-3 border-r border-slate-100 font-bold text-slate-500 uppercase tracking-widest text-[11px] flex items-center">
                                Task Title & Assignee
                            </div>
                            {/* Days columns */}
                            <div
                                className="flex-1 grid gap-0 text-center"
                                style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(35px, 1fr))` }}
                            >
                                {days.map((day) => {
                                    const isToday = day.isSame(dayjs(), 'day');
                                    const isWeekend = day.day() === 0 || day.day() === 6;
                                    return (
                                        <div
                                            key={day.format('DD')}
                                            className={`p-2 border-r border-slate-100 flex flex-col items-center justify-center min-h-[50px] ${isToday ? 'bg-indigo-50 text-indigo-700 font-bold' : ''} ${isWeekend ? 'bg-slate-100/30' : ''}`}
                                        >
                                            <span className="text-[10px] opacity-75">{day.format('dd')}</span>
                                            <span className={`text-[13px] inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-700'}`}>
                                                {day.format('D')}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Timeline Rows */}
                        {rows.length === 0 ? (
                            <div className="text-center text-slate-400 py-12 italic">Tiada tugasan ditemui untuk tempoh ini.</div>
                        ) : (
                            rows.map((row, rIdx) => (
                                <div key={rIdx} className="flex flex-col border-b border-slate-100 last:border-0 hover:bg-slate-50/20">
                                    {/* Group Header Title (Assignee or Section) */}
                                    {ganttGroupBy === 'assignee' && (
                                        <div className="flex bg-slate-50/30 border-b border-slate-100/60 py-2.5 px-3 items-center gap-2">
                                            <Avatar
                                                src={row.avatarUrl || `https://ui-avatars.com/api/?name=${row.title}&background=6366f1&color=fff`}
                                                size="small"
                                                className="shadow-sm"
                                            />
                                            <span className="font-bold text-slate-700 text-xs tracking-wide uppercase">{row.title}</span>
                                            <Tag className="rounded-full font-bold ml-1">{row.tasks.length} tasks</Tag>
                                        </div>
                                    )}

                                    {/* Task Bars inside group */}
                                    {row.tasks.map((task) => {
                                        // Calculate task duration and position relative to current month
                                        const startDate = task.start_date ? dayjs(task.start_date) : dayjs(task.created_at);
                                        const dueDate = task.due_date ? dayjs(task.due_date) : dayjs(task.created_at).add(1, 'day');

                                        // Fallback boundary
                                        let startCol = 1;
                                        let spanCols = 1;
                                        let isVisibleInMonth = true;

                                        if (dueDate.isBefore(startOfMonth) || startDate.isAfter(endOfMonth)) {
                                            isVisibleInMonth = false;
                                        } else {
                                            const adjustedStart = startDate.isBefore(startOfMonth) ? startOfMonth : startDate;
                                            const adjustedEnd = dueDate.isAfter(endOfMonth) ? endOfMonth : dueDate;

                                            startCol = adjustedStart.date();
                                            // duration in days
                                            spanCols = Math.max(1, adjustedEnd.diff(adjustedStart, 'day') + 1);
                                        }

                                        if (!isVisibleInMonth) return null;

                                        return (
                                            <div key={task.id} className="flex min-h-[50px] items-center">
                                                {/* Left Column (Task Title) */}
                                                <div className="w-64 flex-shrink-0 p-3 pr-4 border-r border-slate-100 truncate flex flex-col justify-center">
                                                    <span
                                                        onClick={() => handleEditTask(task)}
                                                        className="font-semibold text-slate-800 text-xs hover:text-indigo-600 cursor-pointer truncate hover:underline"
                                                    >
                                                        {task.title}
                                                    </span>
                                                    {task.customer_name && (
                                                        <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">🏢 {task.customer_name}</span>
                                                    )}
                                                </div>

                                                {/* Right Column Grid containing the Bar */}
                                                <div
                                                    className="flex-1 grid gap-0 h-full relative"
                                                    style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(35px, 1fr))` }}
                                                >
                                                    {/* Backdrop columns */}
                                                    {days.map(day => (
                                                        <div key={day.format('DD')} className="border-r border-slate-100/50 h-full last:border-0 pointer-events-none" />
                                                    ))}

                                                    {/* Gantt Bar */}
                                                    <div
                                                        onClick={() => handleEditTask(task)}
                                                        className={`absolute top-1.5 bottom-1.5 rounded-full bg-gradient-to-r ${getStatusColorClass(task.status)} flex items-center px-4 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all select-none shadow-sm z-10 text-xs font-semibold truncate border border-black/10`}
                                                        style={{
                                                            gridColumnStart: startCol,
                                                            gridColumnEnd: startCol + spanCols,
                                                            left: '2px',
                                                            right: '2px'
                                                        }}
                                                    >
                                                        <span className="truncate pr-1">{task.title}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Spin size="large" /></div>;

    return (
        <div className="flex flex-col gap-6 font-sans">
            <div className="bg-white/80 p-6 rounded-2xl shadow-sm border border-slate-100">
                <Title level={2} className="!text-indigo-900 !mb-2 mt-0">Calendar & Project Timeline</Title>
                <Text type="secondary" className="text-base">Pantau deadlines tugasan secara menyeluruh melalui Kalendar atau Gantt Chart.</Text>
            </div>

            {/* Filter Bar */}
            <Card bordered={false} className="shadow-sm rounded-xl border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl">
                    <div className="sm:col-span-2 md:col-span-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search Title</label>
                        <Input
                            placeholder="Cari..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            size="large"
                            allowClear
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Customer</label>
                        <Select
                            placeholder="Semua"
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
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">PIC / Assignee</label>
                        <Select
                            placeholder="Semua"
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
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
                        <Select
                            placeholder="Semua"
                            value={filterStatus || undefined}
                            onChange={val => setFilterStatus(val || '')}
                            allowClear
                            size="large"
                            className="w-full"
                        >
                            <Option value="BACKLOG">Backlog</Option>
                            <Option value="CLIENT_HOLD">Client Hold</Option>
                            <Option value="IN_PROGRESS">In Progress</Option>
                            <Option value="REVIEW">Review</Option>
                            <Option value="DONE">Done</Option>
                        </Select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Priority</label>
                        <Select
                            placeholder="Semua"
                            value={filterPriority || undefined}
                            onChange={val => setFilterPriority(val || '')}
                            allowClear
                            size="large"
                            className="w-full"
                        >
                            <Option value="DO_FIRST">Do First</Option>
                            <Option value="SCHEDULE">Schedule</Option>
                            <Option value="DELEGATE">Delegate</Option>
                            <Option value="ELIMINATE">Eliminate</Option>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Switchable views */}
            <Tabs
                type="card"
                className="custom-tabs font-semibold text-slate-600"
                items={[
                    {
                        key: 'calendar',
                        label: '📅 Calendar View',
                        children: (
                            <Card bordered={false} className="shadow-sm rounded-xl p-3 bg-white border border-slate-100">
                                <Calendar
                                    cellRender={dateCellRender}
                                    className="custom-calendar-component"
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'gantt',
                        label: '📊 Gantt Timeline',
                        children: renderGanttTimeline()
                    }
                ]}
            />

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
                                    <Select placeholder="Select Department" size="large" disabled={role !== 'admin' && role !== 'manager'}>
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
                                        <Option value="DO_FIRST"><span className="text-red-600 font-medium">🔴 DO FIRST</span></Option>
                                        <Option value="SCHEDULE"><span className="text-blue-600 font-medium">🔵 SCHEDULE</span></Option>
                                        <Option value="DELEGATE"><span className="text-yellow-600 font-medium">🟡 DELEGATE</span></Option>
                                        <Option value="ELIMINATE"><span className="text-gray-500 font-medium">⚫ ELIMINATE</span></Option>
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                <Form.Item name="start_date" label="Start Date">
                                    <DatePicker className="w-full" size="large" showTime disabled={role !== 'admin' && role !== 'manager'} />
                                </Form.Item>
                                <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Due date is required' }]}>
                                    <DatePicker className="w-full" size="large" showTime disabled={role !== 'admin' && role !== 'manager'} />
                                </Form.Item>
                            </div>

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
                                    <div className="flex items-center gap-2" style={{ marginTop: '20px' }}>
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

            {selectedTask && (
                <EscalateModal
                    isOpen={isEscalateModalOpen}
                    onClose={() => {
                        setIsEscalateModalOpen(false);
                        setPendingUpdateValues(null);
                    }}
                    task={selectedTask}
                    profiles={profiles}
                    currentUserId={currentUserId || ''}
                    currentTaskDescription={pendingUpdateValues?.description || selectedTask.description || ''}
                    nextStatus={pendingUpdateValues?.status === 'REVIEW' ? 'REVIEW' : 'BACKLOG'}
                    onSuccess={async () => {
                        setIsEscalateModalOpen(false);
                        setIsEditModalOpen(false);
                        setSelectedTask(null);
                        setPendingUpdateValues(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}
