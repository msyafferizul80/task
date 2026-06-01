'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import {
    Card, Button, Table, Modal, Form, Input, Select,
    InputNumber, Tag, Spin, message, Popconfirm, Switch,
    Tooltip, Typography, Space, Divider, DatePicker, TimePicker
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, EditOutlined, RobotOutlined,
    ThunderboltOutlined, CalendarOutlined, ClockCircleOutlined,
    CheckCircleOutlined, PlayCircleOutlined, PauseCircleOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { useRole } from '@/components/layout/RoleProvider';

const { Title, Text } = Typography;
const { Option } = Select;

const PRIORITY_OPTIONS = [
    { value: 'DO_FIRST', label: '🔴 DO FIRST', color: 'red' },
    { value: 'SCHEDULE', label: '🔵 SCHEDULE', color: 'blue' },
    { value: 'DELEGATE', label: '🟡 DELEGATE', color: 'gold' },
    { value: 'ELIMINATE', label: '⚫ ELIMINATE', color: 'default' },
];

const FREQUENCY_OPTIONS = [
    { value: 'DAILY',     label: '📆 Daily',     desc: 'Setiap hari' },
    { value: 'WEEKLY',    label: '📅 Weekly',    desc: 'Setiap minggu' },
    { value: 'MONTHLY',   label: '📅 Monthly',   desc: 'Setiap bulan' },
    { value: 'QUARTERLY', label: '📆 Quarterly', desc: 'Setiap 3 bulan' },
    { value: 'YEARLY',    label: '📋 Yearly',    desc: 'Setiap tahun' },
];

const DAY_OF_WEEK_OPTIONS = [
    { value: 1, label: 'Isnin (Monday)' },
    { value: 2, label: 'Selasa (Tuesday)' },
    { value: 3, label: 'Rabu (Wednesday)' },
    { value: 4, label: 'Khamis (Thursday)' },
    { value: 5, label: 'Jumaat (Friday)' },
    { value: 6, label: 'Sabtu (Saturday)' },
    { value: 0, label: 'Ahad (Sunday)' },
];

const DAY_OF_WEEK_NAMES = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

export default function BlueprintsPage() {
    const supabase = createClient();
    const { role } = useRole();

    const [blueprints, setBlueprints] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [filterSchedCustomer, setFilterSchedCustomer] = useState<string | undefined>(undefined);

    // Blueprint modal states
    const [bpModalOpen, setBpModalOpen] = useState(false);
    const [editingBlueprint, setEditingBlueprint] = useState<any>(null);
    const [bpForm] = Form.useForm();

    // Blueprint Tasks modal states
    const [tasksModalOpen, setTasksModalOpen] = useState(false);
    const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
    const [blueprintTasks, setBlueprintTasks] = useState<any[]>([]);
    const [taskForm] = Form.useForm();
    const [editingTask, setEditingTask] = useState<any>(null);
    const [taskModalOpen, setTaskModalOpen] = useState(false);

    // Schedule modal states
    const [schedModalOpen, setSchedModalOpen] = useState(false);
    const [schedForm] = Form.useForm();
    const [editingSchedule, setEditingSchedule] = useState<any>(null);

    // Watch frequency to conditionally render trigger_day field
    const schedFrequency = Form.useWatch('frequency', schedForm);

    // Running state
    const [running, setRunning] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [bpRes, custRes, profilesRes, schedRes] = await Promise.all([
                supabase.from('tsk_blueprints').select('id, name, description, created_at').order('created_at', { ascending: false }),
                supabase.from('tsk_customers').select('id, name').eq('status', 'active').order('name'),
                supabase.from('lv_profiles').select('id, full_name, avatar_url').eq('status', 'active').order('full_name'),
                supabase.from('tsk_recurring_schedules').select(`
                    id, frequency, trigger_day, trigger_time, start_date, is_active, last_run_at,
                    run_on_saturday, run_on_sunday,
                    customer:tsk_customers!tsk_recurring_schedules_customer_id_fkey(id, name),
                    blueprint:tsk_blueprints!tsk_recurring_schedules_blueprint_id_fkey(id, name)
                `).order('created_at', { ascending: false }),
            ]);
            if (bpRes.error) throw bpRes.error;
            if (schedRes.error) throw schedRes.error;
            setBlueprints(bpRes.data || []);
            setCustomers(custRes.data || []);
            setProfiles(profilesRes.data || []);
            setSchedules(schedRes.data || []);
        } catch (e: any) {
            message.error('Gagal memuatkan data: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Blueprint CRUD ─────────────────────────────────────────────────────────

    const openCreateBlueprint = () => {
        setEditingBlueprint(null);
        bpForm.resetFields();
        setBpModalOpen(true);
    };

    const openEditBlueprint = (bp: any) => {
        setEditingBlueprint(bp);
        bpForm.setFieldsValue(bp);
        setBpModalOpen(true);
    };

    const handleSaveBlueprint = async (values: any) => {
        try {
            if (editingBlueprint) {
                const { error } = await supabase.from('tsk_blueprints').update(values).eq('id', editingBlueprint.id);
                if (error) throw error;
                message.success('Blueprint dikemaskini!');
            } else {
                const { error } = await supabase.from('tsk_blueprints').insert(values);
                if (error) throw error;
                message.success('Blueprint dijana!');
            }
            setBpModalOpen(false);
            fetchData();
        } catch (e: any) {
            message.error(e.message);
        }
    };

    const handleDeleteBlueprint = async (id: string) => {
        const { error } = await supabase.from('tsk_blueprints').delete().eq('id', id);
        if (error) message.error(error.message);
        else { message.success('Blueprint dipadam.'); fetchData(); }
    };

    // ── Blueprint Tasks ────────────────────────────────────────────────────────

    const openBlueprintTasks = async (bp: any) => {
        setSelectedBlueprint(bp);
        const { data } = await supabase
            .from('tsk_blueprint_tasks')
            .select(`id, title, description, priority_type, assignee_id, relative_due_day, sort_order, department,
                assignee:lv_profiles!tsk_blueprint_tasks_assignee_id_fkey(id, full_name)`)
            .eq('blueprint_id', bp.id)
            .order('sort_order');
        setBlueprintTasks(data || []);
        setTasksModalOpen(true);
    };

    const openAddTask = () => {
        setEditingTask(null);
        taskForm.resetFields();
        taskForm.setFieldsValue({ priority_type: 'SCHEDULE', relative_due_day: 0, sort_order: blueprintTasks.length });
        setTaskModalOpen(true);
    };

    const openEditTask = (task: any) => {
        setEditingTask(task);
        taskForm.setFieldsValue({ ...task, assignee_id: task.assignee_id });
        setTaskModalOpen(true);
    };

    const handleSaveTask = async (values: any) => {
        if (!selectedBlueprint) return;
        try {
            if (editingTask) {
                const { error } = await supabase.from('tsk_blueprint_tasks').update(values).eq('id', editingTask.id);
                if (error) throw error;
                message.success('Task dikemaskini!');
            } else {
                const { error } = await supabase.from('tsk_blueprint_tasks').insert({ ...values, blueprint_id: selectedBlueprint.id });
                if (error) throw error;
                message.success('Task ditambah!');
            }
            setTaskModalOpen(false);
            openBlueprintTasks(selectedBlueprint);
        } catch (e: any) {
            message.error(e.message);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        const { error } = await supabase.from('tsk_blueprint_tasks').delete().eq('id', taskId);
        if (error) message.error(error.message);
        else { message.success('Task dipadam.'); openBlueprintTasks(selectedBlueprint); }
    };

    // ── Schedules ─────────────────────────────────────────────────────────────

    const openEditSchedule = (r: any) => {
        setEditingSchedule(r);
        schedForm.setFieldsValue({
            blueprint_id: r.blueprint?.id,
            customer_id: r.customer?.id,
            frequency: r.frequency,
            trigger_day: r.trigger_day,
            trigger_time: r.trigger_time ? dayjs(r.trigger_time, 'HH:mm') : null,
            start_date: r.start_date ? dayjs(r.start_date) : null,
            run_on_saturday: r.run_on_saturday || false,
            run_on_sunday: r.run_on_sunday || false,
        });
        setSchedModalOpen(true);
    };

    const handleSaveSchedule = async (values: any) => {
        try {
            const { start_date, trigger_time, frequency, trigger_day, run_on_saturday, run_on_sunday, ...rest } = values;
            const payload: any = {
                ...rest,
                frequency,
                start_date: start_date?.format('YYYY-MM-DD'),
                trigger_time: trigger_time ? trigger_time.format('HH:mm') : null,
                // DAILY has no meaningful trigger_day; store 0
                trigger_day: frequency === 'DAILY' ? 0 : trigger_day,
                run_on_saturday: run_on_saturday || false,
                run_on_sunday: run_on_sunday || false,
            };

            if (editingSchedule) {
                const { error } = await supabase.from('tsk_recurring_schedules').update(payload).eq('id', editingSchedule.id);
                if (error) throw error;
                message.success('Schedule dikemaskini!');
            } else {
                const { error } = await supabase.from('tsk_recurring_schedules').insert(payload);
                if (error) throw error;
                message.success('Schedule dicipta! Autopilot akan aktif mengikut frequency.');
            }

            setSchedModalOpen(false);
            setEditingSchedule(null);
            schedForm.resetFields();
            fetchData();
        } catch (e: any) {
            message.error(e.message);
        }
    };

    const toggleSchedule = async (schedId: string, current: boolean) => {
        const { error } = await supabase.from('tsk_recurring_schedules').update({ is_active: !current }).eq('id', schedId);
        if (error) message.error(error.message);
        else { message.success(current ? 'Schedule dipaused.' : 'Schedule diaktifkan!'); fetchData(); }
    };

    const handleDeleteSchedule = async (id: string) => {
        const { error } = await supabase.from('tsk_recurring_schedules').delete().eq('id', id);
        if (error) message.error(error.message);
        else { message.success('Schedule dipadam.'); fetchData(); }
    };

    const filteredSchedules = schedules.filter(s =>
        filterSchedCustomer ? s.customer?.id === filterSchedCustomer : true
    );

    // ── Manual Run (Dry Run / Real) ───────────────────────────────────────────

    const handleManualRun = async (dryRun: boolean) => {
        setRunning(true);
        try {
            const { data, error } = await supabase.functions.invoke('blueprint-autopilot', {
                body: { dry_run: dryRun },
            });
            if (error) throw error;
            const result = data as any;
            if (dryRun) {
                message.info(`[DRY RUN] ${result.total_generated ?? 0} task akan dijana hari ini.`);
            } else {
                if (result.total_generated > 0) {
                    message.success(`✅ ${result.total_generated} task berjaya dijana & Telegram notification dihantar!`);
                    fetchData();
                } else {
                    message.info('Tiada task yang perlu dijana hari ini (trigger day/time belum tiba atau sudah run).');
                }
            }
        } catch (e: any) {
            message.error('Autopilot error: ' + e.message);
        } finally {
            setRunning(false);
        }
    };

    // ── Trigger Display Helper ────────────────────────────────────────────────

    const renderTriggerLabel = (r: any) => {
        const timeStr = r.trigger_time ? ` • ${r.trigger_time} MYT` : '';
        if (r.frequency === 'DAILY') {
            return <span className="text-sm">Setiap hari{timeStr}</span>;
        }
        if (r.frequency === 'WEEKLY') { 
            const dayName = DAY_OF_WEEK_NAMES[r.trigger_day ?? 1] ?? '-';
            return <span className="text-sm">Setiap <strong>{dayName}</strong>{timeStr}</span>;
        }
        const period = r.frequency === 'MONTHLY' ? 'bulan' : r.frequency === 'QUARTERLY' ? 'quarter' : 'tahun';
        return <span className="text-sm">Hari <strong>{r.trigger_day}</strong> setiap {period}{timeStr}</span>;
    };

    // ──────────────────────────────────────────────────────────────────────────

    if (role !== 'admin' && role !== 'manager') {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Text type="secondary">Akses ditolak. Halaman ini hanya untuk Admin dan Manager.</Text>
            </div>
        );
    }

    if (loading) return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Spin size="large" /></div>;

    const bpColumns = [
        {
            title: 'Blueprint', key: 'name',
            render: (r: any) => (
                <div>
                    <div className="font-bold text-indigo-900">{r.name}</div>
                    {r.description && <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>}
                </div>
            ),
        },
        {
            title: 'Sub-tasks', key: 'tasks',
            render: (r: any) => (
                <Button size="small" icon={<CalendarOutlined />} onClick={() => openBlueprintTasks(r)} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                    Edit Tasks
                </Button>
            ),
        },
        {
            title: 'Action', key: 'action', width: 120,
            render: (r: any) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditBlueprint(r)} />
                    <Popconfirm title="Padam blueprint ini?" onConfirm={() => handleDeleteBlueprint(r.id)} okText="Ya" cancelText="Batal">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const schedColumns = [
        {
            title: 'Blueprint → Customer', key: 'info',
            render: (r: any) => (
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-800">{r.blueprint?.name}</span>
                    <ArrowRightOutlined className="text-slate-400" />
                    <span className="text-slate-700">{r.customer?.name}</span>
                </div>
            ),
        },
        {
            title: 'Frequency', dataIndex: 'frequency', key: 'frequency',
            render: (f: string) => {
                const opt = FREQUENCY_OPTIONS.find(o => o.value === f);
                const colorMap: Record<string, string> = {
                    DAILY: 'green', WEEKLY: 'cyan', MONTHLY: 'blue', QUARTERLY: 'purple', YEARLY: 'magenta'
                };
                return <Tag color={colorMap[f] ?? 'blue'}>{opt?.label ?? f}</Tag>;
            },
        },
        {
            title: 'Trigger', key: 'trigger',
            render: renderTriggerLabel,
        },
        {
            title: 'Status', key: 'status',
            render: (r: any) => (
                <Switch
                    checked={r.is_active}
                    onChange={() => toggleSchedule(r.id, r.is_active)}
                    checkedChildren={<CheckCircleOutlined />}
                    unCheckedChildren={<PauseCircleOutlined />}
                    className={r.is_active ? 'bg-emerald-500' : ''}
                />
            ),
        },
        {
            title: 'Last Run', key: 'last_run_at',
            render: (r: any) => r.last_run_at
                ? <span className="text-xs text-slate-500">{new Date(r.last_run_at).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                : <span className="text-xs text-slate-400 italic">Belum pernah run</span>,
        },
        {
            title: 'Action', key: 'action', width: 100,
            render: (r: any) => (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditSchedule(r)} />
                    <Popconfirm title="Padam schedule ini?" onConfirm={() => handleDeleteSchedule(r.id)} okText="Ya" cancelText="Batal">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-6 font-sans">
            {/* Header */}
            <div className="bg-white/80 p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <RobotOutlined className="text-white text-2xl" />
                        </div>
                        <div>
                            <Title level={2} className="!text-indigo-900 !mb-0 !mt-0">Recurring Blueprint</Title>
                            <Text type="secondary">Autopilot Engine — Jana task berkala secara automatik</Text>
                        </div>
                    </div>
                    <Space>
                        <Tooltip title="Semak berapa task yang akan dijana hari ini tanpa generate sebenar">
                            <Button
                                icon={<ClockCircleOutlined />}
                                onClick={() => handleManualRun(true)}
                                loading={running}
                                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                            >
                                Dry Run
                            </Button>
                        </Tooltip>
                        <Tooltip title="Jalankan Autopilot sekarang — jana task & hantar Telegram">
                            <Button
                                type="primary"
                                icon={<ThunderboltOutlined />}
                                onClick={() => handleManualRun(false)}
                                loading={running}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 border-0 shadow-lg"
                            >
                                Run Autopilot Sekarang
                            </Button>
                        </Tooltip>
                    </Space>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                    {[
                        { label: 'Total Blueprints', value: blueprints.length, icon: '📋', color: 'bg-blue-50 text-blue-700' },
                        { label: 'Active Schedules', value: schedules.filter(s => s.is_active).length, icon: '⚡', color: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Paused Schedules', value: schedules.filter(s => !s.is_active).length, icon: '⏸️', color: 'bg-amber-50 text-amber-700' },
                    ].map(stat => (
                        <div key={stat.label} className={`p-4 rounded-xl ${stat.color} border border-opacity-20`}>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <div className="text-sm font-medium mt-0.5">{stat.icon} {stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Blueprints Section */}
            <Card
                bordered={false}
                className="shadow-sm rounded-xl border border-slate-100"
                title={<span className="text-indigo-900 font-bold text-base">📋 Master Blueprints</span>}
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateBlueprint} className="bg-indigo-600 border-indigo-600">
                        New Blueprint
                    </Button>
                }
            >
                <Table
                    dataSource={blueprints}
                    columns={bpColumns}
                    rowKey="id"
                    pagination={false}
                    locale={{ emptyText: 'Tiada blueprint. Cipta blueprint pertama anda!' }}
                />
            </Card>

            {/* Schedules Section */}
            <Card
                bordered={false}
                className="shadow-sm rounded-xl border border-slate-100"
                title={<span className="text-indigo-900 font-bold text-base">⚡ Active Schedules (Blueprint → Customer)</span>}
                extra={
                    <Space wrap>
                        <Select
                            placeholder="Filter by Customer"
                            allowClear
                            style={{ width: 220 }}
                            onChange={setFilterSchedCustomer}
                            value={filterSchedCustomer}
                            showSearch
                            optionFilterProp="children"
                        >
                            {customers.map(c => (
                                <Option key={c.id} value={c.id}>{c.name}</Option>
                            ))}
                        </Select>
                        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setSchedModalOpen(true)} className="bg-emerald-600 border-emerald-600">
                            Apply Blueprint ke Customer
                        </Button>
                    </Space>
                }
            >
                <Table
                    dataSource={filteredSchedules}
                    columns={schedColumns}
                    rowKey="id"
                    pagination={false}
                    locale={{ emptyText: 'Tiada schedule aktif. Apply blueprint kepada customer untuk mula!' }}
                />
            </Card>

            {/* ── Modal: Create/Edit Blueprint ── */}
            <Modal
                title={<div className="font-bold text-lg text-indigo-900">{editingBlueprint ? 'Edit Blueprint' : 'Cipta Blueprint Baru'}</div>}
                open={bpModalOpen}
                onCancel={() => setBpModalOpen(false)}
                footer={null}
                width={500}
            >
                <Form form={bpForm} layout="vertical" onFinish={handleSaveBlueprint} className="mt-4">
                    <Form.Item name="name" label="Nama Blueprint" rules={[{ required: true, message: 'Wajib diisi' }]}>
                        <Input placeholder="cth: Monthly Payroll Cycle" size="large" />
                    </Form.Item>
                    <Form.Item name="description" label="Penerangan">
                        <Input.TextArea rows={3} placeholder="Penerangan ringkas blueprint ini..." />
                    </Form.Item>
                    <div className="flex justify-end gap-2 mt-2">
                        <Button onClick={() => setBpModalOpen(false)}>Batal</Button>
                        <Button type="primary" htmlType="submit" className="bg-indigo-600 border-indigo-600">Simpan</Button>
                    </div>
                </Form>
            </Modal>

            {/* ── Modal: Blueprint Tasks Builder ── */}
            <Modal
                title={
                    <div>
                        <div className="font-bold text-lg text-indigo-900">📋 {selectedBlueprint?.name}</div>
                        <div className="text-sm text-slate-500 font-normal">Blueprint Task Builder</div>
                    </div>
                }
                open={tasksModalOpen}
                onCancel={() => setTasksModalOpen(false)}
                footer={null}
                width={800}
            >
                <div className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                        <Text type="secondary" className="text-sm">
                            Setiap task akan dijana dengan due date = <strong>Trigger Date + Relative Days</strong>
                        </Text>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openAddTask} size="small" className="bg-indigo-600 border-indigo-600">
                            Tambah Sub-task
                        </Button>
                    </div>

                    {blueprintTasks.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic">Belum ada sub-task. Klik "Tambah Sub-task" untuk mula.</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {blueprintTasks.map((task, idx) => (
                                <div key={task.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-800 text-sm">{task.title}</div>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <Tag color={{ DO_FIRST: 'red', SCHEDULE: 'blue', DELEGATE: 'gold', ELIMINATE: 'default' }[task.priority_type as string] || 'default'} className="text-xs">
                                                {task.priority_type}
                                            </Tag>
                                            <span className="text-xs text-slate-500">⏱️ Hari ke-{task.relative_due_day}</span>
                                            {task.department && (
                                                <Tag color="cyan" className="text-xs">{task.department}</Tag>
                                            )}
                                            {task.assignee && (
                                                <span className="text-xs text-slate-600 flex items-center gap-1">
                                                    <img
                                                        src={task.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignee.full_name)}&background=6366f1&color=fff`}
                                                        className="w-4 h-4 rounded-full"
                                                        alt=""
                                                    />
                                                    {task.assignee.full_name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Space>
                                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditTask(task)} />
                                        <Popconfirm title="Padam task ini?" onConfirm={() => handleDeleteTask(task.id)} okText="Ya" cancelText="Batal">
                                            <Button size="small" danger icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    </Space>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── Modal: Add/Edit Blueprint Task ── */}
            <Modal
                title={<div className="font-bold text-indigo-900">{editingTask ? 'Edit Sub-task' : 'Tambah Sub-task'}</div>}
                open={taskModalOpen}
                onCancel={() => setTaskModalOpen(false)}
                footer={null}
                width={520}
            >
                <Form form={taskForm} layout="vertical" onFinish={handleSaveTask} className="mt-4">
                    <Form.Item name="title" label="Tajuk Task" rules={[{ required: true }]}>
                        <Input placeholder="cth: Collect Attendance" size="large" />
                    </Form.Item>
                    <Form.Item name="description" label="Nota/Penerangan">
                        <Input.TextArea rows={2} placeholder="Arahan terperinci untuk PIC..." />
                    </Form.Item>
                    <Form.Item name="department" label="Jabatan (Department)" rules={[{ required: true, message: 'Sila pilih jabatan' }]}>
                        <Select size="large" placeholder="Pilih Jabatan">
                            <Option value="Outsourcing">Outsourcing</Option>
                            <Option value="IT">IT</Option>
                            <Option value="Sales">Sales</Option>
                            <Option value="Marketing">Marketing</Option>
                            <Option value="Recruitment">Recruitment</Option>
                        </Select>
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="priority_type" label="Eisenhower Priority" rules={[{ required: true }]}>
                            <Select size="large">
                                {PRIORITY_OPTIONS.map(p => (
                                    <Option key={p.value} value={p.value}>{p.label}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item name="relative_due_day" label="Due (Hari ke-)" rules={[{ required: true }]}>
                            <InputNumber min={0} max={365} size="large" className="w-full" addonAfter="hari" />
                        </Form.Item>
                    </div>
                    <Form.Item name="assignee_id" label="PIC / Assignee" rules={[{ required: true, message: 'Sila pilih PIC' }]}>
                        <Select size="large" showSearch optionFilterProp="children" placeholder="Pilih PIC untuk task ini">
                            {profiles.map(p => (
                                <Option key={p.id} value={p.id}>{p.full_name}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="sort_order" label="Sort Order">
                        <InputNumber min={0} size="large" className="w-full" />
                    </Form.Item>
                    <div className="flex justify-end gap-2 mt-2">
                        <Button onClick={() => setTaskModalOpen(false)}>Batal</Button>
                        <Button type="primary" htmlType="submit" className="bg-indigo-600 border-indigo-600">Simpan</Button>
                    </div>
                </Form>
            </Modal>

            {/* ── Modal: Apply Blueprint to Customer ── */}
            <Modal
                title={<div className="font-bold text-lg text-emerald-800">{editingSchedule ? '⚡ Edit Schedule' : '⚡ Apply Blueprint ke Customer'}</div>}
                open={schedModalOpen}
                onCancel={() => { setSchedModalOpen(false); setEditingSchedule(null); schedForm.resetFields(); }}
                footer={null}
                width={560}
            >
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700 border border-emerald-100">
                    Sistem akan <strong>auto-generate tasks</strong> ke dalam Task Listing mengikut frequency yang ditetapkan.
                </div>
                <Form form={schedForm} layout="vertical" onFinish={handleSaveSchedule}>
                    <Form.Item name="blueprint_id" label="Blueprint" rules={[{ required: true }]}>
                        <Select size="large" showSearch optionFilterProp="children" placeholder="Pilih blueprint">
                            {blueprints.map(b => (
                                <Option key={b.id} value={b.id}>{b.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
                        <Select size="large" showSearch optionFilterProp="children" placeholder="Pilih customer">
                            {customers.map(c => (
                                <Option key={c.id} value={c.id}>{c.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {/* Frequency + Time — always shown */}
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="frequency" label="Frequency" rules={[{ required: true, message: 'Pilih frequency' }]}>
                            <Select size="large" placeholder="Pilih frequency">
                                {FREQUENCY_OPTIONS.map(f => (
                                    <Option key={f.value} value={f.value}>
                                        <div>{f.label}</div>
                                        <div className="text-xs text-slate-400">{f.desc}</div>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item
                            name="trigger_time"
                            label="Masa Auto-Generate (MYT)"
                            rules={[{ required: true, message: 'Pilih masa' }]}
                        >
                            <TimePicker
                                format="HH:mm"
                                size="large"
                                className="w-full"
                                minuteStep={15}
                                placeholder="cth: 08:00"
                            />
                        </Form.Item>
                    </div>

                    {/* Trigger day — hidden for DAILY, day-of-week for WEEKLY, day-of-month for others */}
                    {schedFrequency && schedFrequency !== 'DAILY' && (
                        <Form.Item
                            name="trigger_day"
                            label={schedFrequency === 'WEEKLY' ? 'Hari dalam Minggu' : 'Trigger (Hari ke-)'}
                            rules={[{ required: true, message: 'Wajib diisi' }]}
                        >
                            {schedFrequency === 'WEEKLY' ? (
                                <Select size="large" placeholder="Pilih hari">
                                    {DAY_OF_WEEK_OPTIONS.map(d => (
                                        <Option key={d.value} value={d.value}>{d.label}</Option>
                                    ))}
                                </Select>
                            ) : (
                                <InputNumber
                                    min={1}
                                    max={28}
                                    size="large"
                                    className="w-full"
                                    addonAfter="hb"
                                    placeholder="cth: 1"
                                />
                            )}
                        </Form.Item>
                    )}

                    <Form.Item name="start_date" label="Tarikh Mula" rules={[{ required: true }]}>
                        <DatePicker size="large" className="w-full" placeholder="Pilih tarikh mula" />
                    </Form.Item>

                    {schedFrequency === 'DAILY' && (
                        <>
                            <Divider>Weekend Schedule</Divider>
                            
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <Form.Item 
                                    name="run_on_saturday" 
                                    label="Jalankan pada Sabtu" 
                                    valuePropName="checked"
                                >
                                    <Switch checkedChildren="Ya" unCheckedChildren="Tidak" />
                                </Form.Item>
                                <Form.Item 
                                    name="run_on_sunday" 
                                    label="Jalankan pada Ahad" 
                                    valuePropName="checked"
                                >
                                    <Switch checkedChildren="Ya" unCheckedChildren="Tidak" />
                                </Form.Item>
                            </div>
                        </>
                    )}

                    <div className="flex justify-end gap-2 mt-2">
                        <Button onClick={() => { setSchedModalOpen(false); setEditingSchedule(null); schedForm.resetFields(); }}>Batal</Button>
                        <Button type="primary" htmlType="submit" className="bg-emerald-600 border-emerald-600">Aktifkan Schedule</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
