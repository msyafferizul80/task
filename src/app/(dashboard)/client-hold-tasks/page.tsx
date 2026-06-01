'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Select, Input, Table, Tag, Typography, Spin, message, Modal, Form, Button, Tooltip, DatePicker } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import { SearchOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, ExclamationCircleOutlined, EditOutlined, DeleteOutlined, ExclamationCircleFilled, PauseCircleOutlined } from '@ant-design/icons';
import EscalateModal from '@/components/task/EscalateModal';
import TaskStatusHistory from '@/components/task/TaskStatusHistory';
import TaskComments from '@/components/task/TaskComments';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const NUMBER_OF_DATE_FOR_DUE_DATE_WARNING = 3;
const THREE_DAYS_MS = NUMBER_OF_DATE_FOR_DUE_DATE_WARNING * 24 * 60 * 60 * 1000;

export default function ClientHoldTasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    const [filterCustomer, setFilterCustomer] = useState<string>('');
    const [filterPIC, setFilterPIC] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [editForm] = Form.useForm();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [pendingUpdateValues, setPendingUpdateValues] = useState<any>(null);

    const supabase = createClient();
    const { role } = useRole();

    const fetchData = useCallback(async () => {
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
                creator:lv_profiles!tsk_tasks_created_by_fkey (
                    id,
                    full_name
                )
            `).order('created_at', { ascending: false }).eq('status', 'CLIENT_HOLD');

            // Always only fetch their tasks regardless of role
            // if (userId) {
            // Only fetch their own tasks if not admin/manager
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
        fetchData();

        const subscription = supabase
            .channel('client-hold-tasks-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchData]);

    const doUpdateTask = async (values: any) => {
        if (!selectedTask) return;
        try {
            const isPrivileged = role === 'admin' || role === 'manager';
            const { title, description, priority_type, start_date, due_date, customer_name, department, assignee_id, status } = values;

            // Check if status is set to DONE
            let totalTimeMessage = '';
            if (status === 'DONE') {
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

            const nextTitle =
                typeof title === 'string'
                    ? (title.trim() === '' ? selectedTask.title : title)
                    : selectedTask.title;

            const nextDescription =
                typeof description === 'string'
                    ? (description === '' && selectedTask.description ? selectedTask.description : description)
                    : selectedTask.description;

            // Insert task history if status changed
            if (status !== selectedTask.status) {
                // 1. Fetch last history record for this task to calculate duration
                const { data: lastHistory } = await supabase
                    .from('tsk_task_history')
                    .select('*')
                    .eq('task_id', selectedTask.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const now = new Date();
                let statusBeforeEnteredAt = null;
                let durationSeconds = null;
                let durationMinutes = null;
                let durationHours = null;

                if (lastHistory && lastHistory.length > 0) {
                    statusBeforeEnteredAt = lastHistory[0].created_at;
                    const enteredAtDate = new Date(statusBeforeEnteredAt);
                    const diffMs = Math.max(0, now.getTime() - enteredAtDate.getTime());
                    durationSeconds = Math.floor(diffMs / 1000);
                    durationMinutes = durationSeconds / 60;
                    durationHours = durationMinutes / 60;
                }

                // 2. Insert task history record
                const { error: historyError } = await supabase
                    .from('tsk_task_history')
                    .insert({
                        task_id: selectedTask.id,
                        status_before: selectedTask.status,
                        new_status: status,
                        changed_by: currentUserId,
                        status_before_entered_at: statusBeforeEnteredAt,
                        duration_seconds: durationSeconds,
                        duration_minutes: durationMinutes,
                        duration_hours: durationHours
                    });

                if (historyError) {
                    console.error('Error inserting task history:', historyError);
                }
            }

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

            setTasks(prev =>
                prev.map(t => {
                    if (t.id !== selectedTask.id) return t;
                    return {
                        ...t,
                        ...(updatePayload as any),
                        description: nextDescription,
                        updated_at: new Date().toISOString(),
                    };
                })
            );

            if (status === 'DONE' && totalTimeMessage) {
                message.success(`Task updated to Done! Total time spent: ${totalTimeMessage}`, 8);
            } else {
                message.success('Task updated successfully!');
            }
            setIsEditModalOpen(false);
            setSelectedTask(null);
            editForm.resetFields();
        } catch (error: any) {
            console.error('Error updating task:', error.message);
            message.error('Failed to update task');
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

    // Synchronize form fields whenever selectedTask changes or the modal opens.
    // This ensures the form reflects the latest data even if the same task is edited repeatedly.
    useEffect(() => {
        if (isEditModalOpen && selectedTask) {
            editForm.setFieldsValue({
                ...selectedTask,
                description: selectedTask.description ?? '',
                start_date: selectedTask.start_date ? dayjs(selectedTask.start_date) : null,
                due_date: selectedTask.due_date ? dayjs(selectedTask.due_date) : null,
            });
        }
    }, [selectedTask, isEditModalOpen, editForm]);

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
            case 'CLIENT_HOLD': return <Tag icon={<PauseCircleOutlined />} color="magenta">Client Hold</Tag>;
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

    const getTaskIndicators = (task: Task) => {
        if (task.status === 'DONE') {
            return { isBottleneck: false, isDueSoon: false };
        }

        const now = Date.now();
        const createdAt = task.created_at ? new Date(task.created_at).getTime() : null;
        const dueAt = task.due_date ? new Date(task.due_date).getTime() : null;

        const isBottleneck = createdAt !== null ? (now - createdAt) > THREE_DAYS_MS : false;
        const isDueSoon = dueAt !== null ? (dueAt - now) <= THREE_DAYS_MS : false;

        return { isBottleneck, isDueSoon };
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchText.toLowerCase()) ||
            (t.description && t.description.toLowerCase().includes(searchText.toLowerCase()));
        const matchesCustomer = filterCustomer ? t.customer_name === filterCustomer : true;
        const matchesPIC = filterPIC ? t.assignee_id === filterPIC : true;

        return matchesSearch && matchesCustomer && matchesPIC;
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
                <div className="font-semibold text-fuchsia-900">
                    {text}
                    <div className="mt-1">{getPriorityColor(record.priority_type)}</div>
                </div>
            )
        },
        {
            title: 'Nota / Description',
            dataIndex: 'description',
            key: 'description',
            width: '45%',
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
            width: 1,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (status: string) => getStatusTag(status)
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: 1,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (date: string | null) => {
                const dateText = date ? new Date(date).toLocaleDateString() : '-';
                const isDueSoon = date ? (new Date(date).getTime() - Date.now()) <= THREE_DAYS_MS : false;
                const duePillClass = isDueSoon ? 'text-rose-500 bg-rose-50 border-rose-100' : 'text-slate-800 bg-white border-slate-200';

                return (
                    <div
                        className={`text-[11px] font-semibold flex items-center gap-1 w-fit px-2 py-0.5 rounded-md border whitespace-nowrap tabular-nums ${duePillClass}`}
                        aria-label={`Due date: ${dateText}`}
                    >
                        ⏱️ Due: {dateText}
                    </div>
                );
            }
        },
        {
            title: 'Action',
            key: 'action',
            width: 1,
            onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (_: any, record: Task) => (
                <Button
                    type="text"
                    icon={<EditOutlined />}
                    className="text-fuchsia-600 hover:text-fuchsia-800 hover:bg-fuchsia-50"
                    onClick={() => {
                        const latest = tasks.find(t => t.id === record.id) || record;
                        setSelectedTask(latest);
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
                <Title level={2} className="!text-fuchsia-900 !mb-2 mt-0">Client Hold Tasks</Title>
                <Text type="secondary" className="text-base">Lihat dan urus tugasan anda yang berada pada status Client Hold.</Text>
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
                    <div className="sm:col-span-2 flex items-center gap-3">
                        <div className="flex-1">
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
                        {(role === 'admin' || role === 'manager') && (
                            <Button
                                onClick={() => {
                                    setSearchText('');
                                    setFilterCustomer('');
                                    setFilterPIC(currentUserId || '');
                                }}
                                size="large"
                            >
                                Reset Filter
                            </Button>
                        )}
                    </div>
                </div>

                {/* Mobile Card View — hidden on md+ */}
                <div className="md:hidden flex flex-col gap-3 mb-4">
                    {sortedTasks.length === 0 ? (
                        <div className="text-center text-gray-400 py-10 italic">Tiada tugasan dijumpai.</div>
                    ) : sortedTasks.map(task => {
                        const { isBottleneck, isDueSoon } = getTaskIndicators(task);
                        let cardClass = 'bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col gap-2';
                        if (isDueSoon) {
                            cardClass = 'bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-xl p-4 shadow-sm flex flex-col gap-2';
                        } else if (isBottleneck) {
                            cardClass = 'bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200 rounded-xl p-4 shadow-sm flex flex-col gap-2';
                        }
                        return (
                        <div
                            key={task.id}
                            className={cardClass}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="font-semibold text-fuchsia-900 flex-1 text-sm">{task.title}</div>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    className="text-fuchsia-500 shrink-0"
                                    onClick={() => {
                                        const latest = tasks.find(t => t.id === task.id) || task;
                                        setSelectedTask(latest);
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
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                    <img
                                        src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${task.assignee.full_name}&background=6366f1&color=fff`}
                                        className="w-5 h-5 rounded-full"
                                        alt={task.assignee.full_name}
                                    />
                                    {task.assignee.full_name}
                                </div>
                            )}
                            {task.due_date && (
                                <div className="flex flex-col gap-1">
                                    {(() => {
                                        const { isDueSoon } = getTaskIndicators(task);
                                        const dateText = new Date(task.due_date as string).toLocaleDateString();
                                        const duePillClass = isDueSoon ? 'text-rose-500 bg-rose-50 border-rose-100' : 'text-slate-800 bg-white border-slate-200';
                                        return (
                                            <div
                                                className={`text-[11px] font-semibold flex items-center gap-1 w-fit px-2 py-0.5 rounded-md border whitespace-nowrap tabular-nums ${duePillClass}`}
                                                aria-label={`Due date: ${dateText}`}
                                            >
                                                ⏱️ Due: {dateText}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                            {task.description && (
                                <div className="text-xs text-gray-500 line-clamp-2">{task.description}</div>
                            )}
                        </div>
                    );
                    })}
                
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
                title={<div className="font-bold text-lg mb-4 text-fuchsia-900 border-b pb-2">Edit Task Details</div>}
                open={isEditModalOpen}
                destroyOnHidden
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
                        <Form
                            key={selectedTask?.id || 'no-task'}
                            form={editForm}
                            layout="vertical"
                            initialValues={{
                                ...selectedTask,
                                description: selectedTask?.description ?? '',
                            }}
                            onFinish={handleUpdateTask}
                        >
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
                                    <Input placeholder="Enter task title" size="large" />
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
                                <Input.TextArea rows={4} placeholder="Detailed task requirements..." className="resize-y" />
                            </Form.Item>

                            {selectedTask?.created_at && (
                                <div className="mb-4 text-sm text-gray-500">
                                    <strong>Create Date:</strong> {new Date(selectedTask.created_at).toLocaleString()} (
                                    {(selectedTask.created_by && selectedTask.created_by === currentUserId) || selectedTask.creator?.id === currentUserId
                                        ? 'You'
                                        : (selectedTask.creator?.full_name || 'Auto-generated')}
                                    )
                                </div>
                            )}

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
                                    <div style={{ marginTop: '20px' }}>
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

                                        <Button type="primary" htmlType="submit" size="large" className="bg-fuchsia-600 shadow-md">Update Task</Button>
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
                    }}
                />
            )}
        </div>
    );
}
