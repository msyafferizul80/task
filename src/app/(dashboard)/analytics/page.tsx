'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, Table, Tag, Typography, Spin, Badge, Tooltip, Modal, Button, Select, Input } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import {
    AlertTriangle,
    Clock,
    Users,
    BarChart2,
    TrendingUp,
    CheckSquare,
    RefreshCw,
    ExternalLink,
    Calendar,
    Hourglass
} from 'lucide-react';
import { differenceInDays, formatDistanceToNow, subWeeks, subMonths } from 'date-fns';
import Link from 'next/link';

const { Title, Text } = Typography;

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
    BACKLOG: 'Backlog',
    CLIENT_HOLD: 'Client Hold',
    IN_PROGRESS: 'In Progress',
    REVIEW: 'Review',
    DONE: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
    BACKLOG: '#6b7280',
    CLIENT_HOLD: '#d946ef',
    IN_PROGRESS: '#3b82f6',
    REVIEW: '#f59e0b',
    DONE: '#10b981',
};

const PRIORITY_COLORS: Record<string, string> = {
    DO_FIRST: '#ef4444',
    SCHEDULE: '#3b82f6',
    DELEGATE: '#f59e0b',
    ELIMINATE: '#9ca3af',
};

const PIE_PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
    '#f97316', '#84cc16',
];

// ─── Custom Bar Chart ────────────────────────────────────────────────────────

function WorkloadBarChart({
    data,
    onBarClick,
    isAdmin,
}: {
    data: { pic: string; count: number }[];
    onBarClick?: (pic: string) => void;
    isAdmin: boolean;
}) {
    const max = Math.max(...data.map((d) => d.count), 1);

    return (
        <div className="flex items-end gap-2 h-[240px] px-2 pt-4">
            {data.map(({ pic, count }) => {
                const heightPct = (count / max) * 100;
                return (
                    <div
                        key={pic}
                        className={`flex flex-col items-center flex-1 min-w-0 ${isAdmin ? 'cursor-pointer group' : ''}`}
                        onClick={() => isAdmin && onBarClick?.(pic)}
                        title={isAdmin ? `Klik untuk lihat task ${pic}` : undefined}
                    >
                        {/* Count label */}
                        <span className="text-xs font-bold text-slate-600 mb-1">{count}</span>

                        {/* Bar */}
                        <div className="w-full flex items-end" style={{ height: '180px' }}>
                            <div
                                className={`w-full rounded-t-lg transition-all duration-200 ${
                                    isAdmin
                                        ? 'bg-indigo-500 group-hover:bg-indigo-400 group-hover:shadow-lg group-hover:-translate-y-0.5'
                                        : 'bg-indigo-500'
                                }`}
                                style={{ height: `${Math.max(heightPct, 3)}%` }}
                            />
                        </div>

                        {/* PIC name */}
                        <span
                            className="text-xs text-slate-500 mt-2 text-center leading-tight w-full px-1 truncate"
                            style={{ maxWidth: '80px' }}
                            title={pic}
                        >
                            {pic}
                        </span>

                        {isAdmin && (
                            <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                                ↗
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Total Task Bar Chart — Horizontal (with time filter) ───────────────────

type TimePeriod = 'week' | 'month' | 'custom';

function TotalTaskBarChart({
    data,
    onBarClick,
    isAdmin,
    period,
    onPeriodChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
}: {
    data: { pic: string; count: number }[];
    onBarClick?: (pic: string) => void;
    isAdmin: boolean;
    period: TimePeriod;
    onPeriodChange: (p: TimePeriod) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (v: string) => void;
    onCustomEndChange: (v: string) => void;
}) {
    const max = Math.max(...data.map((d) => d.count), 1);

    return (
        <div className="flex flex-col gap-4">
            {/* Filter Row */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {(['week', 'month'] as TimePeriod[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => onPeriodChange(p)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                period === p
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {p === 'week' ? '7 Hari' : '30 Hari'}
                        </button>
                    ))}
                    <button
                        onClick={() => onPeriodChange('custom')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            period === 'custom'
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Calendar className="w-3 h-3" />
                        Custom
                    </button>
                </div>

                {period === 'custom' && (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => onCustomStartChange(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <span className="text-xs text-slate-400 font-medium">hingga</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => onCustomEndChange(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                    </div>
                )}

                <span className="text-xs text-slate-400 ml-auto">
                    {data.length} PIC · jumlah {data.reduce((s, d) => s + d.count, 0)} task
                </span>
            </div>

            {/* Horizontal Bar Chart */}
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-slate-400 text-sm">
                    Tiada data untuk tempoh ini.
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {data.map(({ pic, count }, idx) => {
                        const widthPct = (count / max) * 100;
                        const colors = [
                            'from-emerald-500 to-emerald-400',
                            'from-teal-500 to-teal-400',
                            'from-cyan-500 to-cyan-400',
                            'from-green-500 to-green-400',
                        ];
                        const gradient = colors[idx % colors.length];
                        return (
                            <div
                                key={pic}
                                className={`flex items-center gap-3 group ${
                                    isAdmin ? 'cursor-pointer' : ''
                                }`}
                                onClick={() => isAdmin && onBarClick?.(pic)}
                            >
                                {/* Rank badge */}
                                <span className="w-5 text-xs font-bold text-slate-300 text-right flex-shrink-0">
                                    {idx + 1}
                                </span>

                                {/* PIC Name — full, no truncate */}
                                <span className="text-sm font-semibold text-slate-700 w-32 flex-shrink-0 group-hover:text-emerald-600 transition-colors">
                                    {pic}
                                </span>

                                {/* Bar */}
                                <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${gradient} rounded-lg transition-all duration-500 flex items-center justify-end pr-2 ${
                                            isAdmin ? 'group-hover:brightness-110' : ''
                                        }`}
                                        style={{ width: `${Math.max(widthPct, 4)}%` }}
                                    >
                                        {widthPct > 15 && (
                                            <span className="text-xs font-bold text-white">
                                                {count}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Count label (outside bar when bar is too short) */}
                                <span className="text-xs font-bold text-slate-600 w-8 text-left flex-shrink-0">
                                    {widthPct <= 15 ? count : ''}
                                </span>

                                {isAdmin && (
                                    <span className="text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                        ↗
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Custom Customer Distribution List ──────────────────────────────────────

function CustomerDistributionList({
    data,
    total,
    onSegmentClick,
    isAdmin,
}: {
    data: { customer: string; value: number }[];
    total: number;
    onSegmentClick?: (customer: string) => void;
    isAdmin: boolean;
}) {
    return (
        <div className="flex flex-col gap-2 py-2 max-h-[260px] overflow-y-auto pr-1">
            {data.map(({ customer, value }, idx) => {
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                const color = PIE_PALETTE[idx % PIE_PALETTE.length];
                return (
                    <div
                        key={customer}
                        className={`flex flex-col gap-1 p-2.5 rounded-xl border transition-all ${
                            isAdmin
                                ? 'cursor-pointer hover:shadow-sm hover:border-indigo-200 hover:bg-indigo-50/40 border-transparent'
                                : 'border-transparent'
                        }`}
                        onClick={() => isAdmin && onSegmentClick?.(customer)}
                        title={isAdmin ? `Klik untuk lihat task ${customer}` : undefined}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ background: color }}
                                />
                                <span className="text-sm font-medium text-slate-700 truncate">
                                    {customer}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-xs font-bold" style={{ color }}>
                                    {pct}%
                                </span>
                                <span className="text-xs text-slate-400 min-w-[3ch] text-right">
                                    {value}
                                </span>
                                {isAdmin && (
                                    <span className="text-xs text-indigo-300 font-medium">↗</span>
                                )}
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: color }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Drill-down Modal ────────────────────────────────────────────────────────

function DrillDownModal({
    open,
    title,
    tasks,
    onClose,
}: {
    open: boolean;
    title: string;
    tasks: Task[];
    onClose: () => void;
}) {
    const now = new Date();

    const modalColumns = [
        {
            title: 'Task Title',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => (
                <span className="font-semibold text-slate-800 text-sm">{text}</span>
            ),
        },
        {
            title: 'Customer',
            dataIndex: 'customer_name',
            key: 'customer_name',
            render: (text: string) => (
                <span className="text-sm text-slate-600">{text || '—'}</span>
            ),
        },
        {
            title: 'PIC',
            key: 'assignee',
            render: (_: any, record: Task) => {
                const assignee = record.assignee as any;
                if (!assignee) return <span className="text-gray-400 text-sm">—</span>;
                return (
                    <div className="flex items-center gap-2">
                        <img
                            src={assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.full_name)}&background=6366f1&color=fff`}
                            className="w-6 h-6 rounded-full flex-shrink-0"
                            alt={assignee.full_name}
                        />
                        <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{assignee.full_name}</span>
                    </div>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag
                    style={{
                        background: STATUS_COLORS[status] + '18',
                        color: STATUS_COLORS[status],
                        border: `1px solid ${STATUS_COLORS[status]}40`,
                        borderRadius: 6,
                        fontWeight: 600,
                        fontSize: 11,
                    }}
                >
                    {STATUS_LABELS[status]}
                </Tag>
            ),
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            render: (date: string | null) => {
                if (!date) return <span className="text-gray-400 text-sm">—</span>;
                const d = new Date(date);
                const overdue = d < now;
                return (
                    <span className={`text-sm font-semibold ${overdue ? 'text-red-500' : 'text-slate-600'}`}>
                        {d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {overdue && (
                            <span className="ml-1 text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">
                                overdue
                            </span>
                        )}
                    </span>
                );
            },
        },
        {
            title: 'Action',
            key: 'action',
            width: 130,
            render: () => (
                <Link href="/tasks" onClick={onClose}>
                    <Button
                        size="small"
                        type="primary"
                        icon={<ExternalLink className="w-3 h-3 inline" />}
                        className="bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-xs"
                    >
                        &nbsp;Buka Task
                    </Button>
                </Link>
            ),
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={1000}
            title={
                <div className="flex items-center gap-3 py-1">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <BarChart2 className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <div className="font-bold text-slate-800 text-base">{title}</div>
                        <div className="text-xs text-slate-400 font-normal">
                            {tasks.length} task dijumpai
                        </div>
                    </div>
                </div>
            }
        >
            <Table
                columns={modalColumns}
                dataSource={tasks}
                rowKey="id"
                size="small"
                pagination={tasks.length > 10 ? { pageSize: 10, size: 'small' } : false}
                className="mt-2"
                locale={{ emptyText: 'Tiada task.' }}
                rowClassName={(record) => {
                    const d = record.due_date ? new Date(record.due_date) : null;
                    return d && d < now ? 'bg-red-50/40' : '';
                }}
            />
        </Modal>
    );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
    title,
    value,
    subtitle,
    icon: Icon,
    color,
    bg,
    onClick,
    clickable,
}: {
    title: string;
    value: number | string;
    subtitle?: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    onClick?: () => void;
    clickable?: boolean;
}) {
    return (
        <div
            className={`rounded-2xl p-5 shadow-sm border border-white/60 flex items-start gap-4 ${bg} transition-all duration-200 ${clickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] select-none' : ''}`}
            onClick={onClick}
        >
            <div className={`rounded-xl p-3 ${color}`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-slate-800 leading-none">{value}</p>
                    {clickable && (
                        <span className="text-xs text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full">
                            Klik ↗
                        </span>
                    )}
                </div>
                {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            </div>
        </div>
    );
}

// ─── Time Log Progress Chart (Horizontal progress listing) ────────────────

function TimeBarChart({
    data,
    total,
}: {
    data: { name: string; duration: number }[];
    total: number;
}) {
    const max = Math.max(...data.map((d) => d.duration), 1);
    const formatDuration = (seconds: number) => {
        const hrs = (seconds / 3600).toFixed(1);
        return `${hrs}h`;
    };

    return (
        <div className="flex flex-col gap-3 py-2 max-h-[260px] overflow-y-auto pr-1">
            {data.map(({ name, duration }, idx) => {
                const pct = max > 0 ? Math.round((duration / max) * 100) : 0;
                const totalPct = total > 0 ? Math.round((duration / total) * 100) : 0;
                const color = PIE_PALETTE[idx % PIE_PALETTE.length];
                return (
                    <div key={name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <span className="truncate max-w-[200px]" title={name}>{name}</span>
                            <div className="flex items-center gap-2">
                                <span className="font-bold" style={{ color }}>{formatDuration(duration)}</span>
                                <span className="text-[10px] text-slate-400 font-medium">({totalPct}%)</span>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: color }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [timeLogs, setTimeLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [currentUserDepartment, setCurrentUserDepartment] = useState<string | null>(null);
    const [filterDepartment, setFilterDepartment] = useState<string>('All');
    
    // Tab switching state
    const [activeTab, setActiveTab] = useState<string>('overview');

    // Time Log Filters
    const [filterTimerUser, setFilterTimerUser] = useState<string>('All');
    const [filterTimerCustomer, setFilterTimerCustomer] = useState<string>('All');
    const [timerSearchText, setTimerSearchText] = useState<string>('');

    // Total task by PIC chart filters
    const [totalPicPeriod, setTotalPicPeriod] = useState<TimePeriod>('month');
    const today = new Date();
    const [totalPicCustomStart, setTotalPicCustomStart] = useState(
        new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    );
    const [totalPicCustomEnd, setTotalPicCustomEnd] = useState(
        today.toISOString().slice(0, 10)
    );

    const [drillOpen, setDrillOpen] = useState(false);
    const [drillTitle, setDrillTitle] = useState('');
    const [drillTasks, setDrillTasks] = useState<Task[]>([]);

    const supabase = createClient();
    const { role } = useRole();
    const hasFullAccess = role === 'admin' || role === 'manager';

    const fetchData = useCallback(async () => {
        try {
            const [tasksRes, profilesRes, authRes, logsRes] = await Promise.all([
                supabase.from('tsk_tasks').select(`
                    *,
                    assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
                        id,
                        full_name,
                        avatar_url
                    )
                `).order('created_at', { ascending: false }),
                supabase.from('lv_profiles').select('id, full_name, avatar_url, department').eq('status', 'active').order('full_name'),
                supabase.auth.getUser(),
                supabase.from('tsk_time_logs').select('*').eq('status', 'COMPLETED').order('start_time', { ascending: false })
            ]);

            if (tasksRes.error) throw tasksRes.error;
            if (profilesRes.error) throw profilesRes.error;
            if (logsRes.error) throw logsRes.error;

            setTasks((tasksRes.data as Task[]) || []);
            setProfiles(profilesRes.data || []);
            setTimeLogs(logsRes.data || []);
            
            const userId = authRes.data?.user?.id;
            let myDept: string | null = null;
            if (userId) {
                const me = profilesRes.data?.find(p => p.id === userId);
                if (me?.department) {
                    myDept = me.department;
                    setCurrentUserDepartment(me.department);
                }
            }
            
            setLastRefreshed(new Date());
        } catch (err: any) {
            console.error('Analytics fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const channelTasks = supabase
            .channel('analytics-tasks-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchData)
            .subscribe();

        const channelLogs = supabase
            .channel('analytics-logs-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_time_logs' }, fetchData)
            .subscribe();

        return () => {
            supabase.removeChannel(channelTasks);
            supabase.removeChannel(channelLogs);
        };
    }, [fetchData]);

    const openDrill = useCallback((title: string, filtered: Task[]) => {
        setDrillTitle(title);
        setDrillTasks(filtered);
        setDrillOpen(true);
    }, []);

    // ── Derived Data ─────────────────────────────────────────────────────────

    const now = new Date();

    // ─── Time Tracking Analytics Derivations ───
    const joinedLogs = useMemo(() => {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const profileMap = new Map(profiles.map(p => [p.id, p]));
        return timeLogs.map(log => ({
            ...log,
            task: taskMap.get(log.task_id),
            user: profileMap.get(log.user_id)
        })).filter(log => log.task);
    }, [timeLogs, tasks, profiles]);

    const filteredLogs = useMemo(() => {
        return joinedLogs.filter(log => {
            if (filterDepartment !== 'All' && log.task?.department !== filterDepartment) return false;
            if (filterTimerUser !== 'All' && log.user_id !== filterTimerUser) return false;
            if (filterTimerCustomer !== 'All' && log.task?.customer_name !== filterTimerCustomer) return false;
            if (timerSearchText) {
                const search = timerSearchText.toLowerCase();
                const taskTitle = log.task?.title?.toLowerCase() || '';
                const userName = log.user?.full_name?.toLowerCase() || '';
                if (!taskTitle.includes(search) && !userName.includes(search)) return false;
            }
            return true;
        });
    }, [joinedLogs, filterDepartment, filterTimerUser, filterTimerCustomer, timerSearchText]);

    const totalSecondsTracked = useMemo(() => {
        return filteredLogs.reduce((acc, log) => acc + (log.duration || 0), 0);
    }, [filteredLogs]);

    const totalHoursTrackedStr = useMemo(() => {
        const hrs = (totalSecondsTracked / 3600).toFixed(1);
        return `${hrs} hrs`;
    }, [totalSecondsTracked]);

    const timerClientDurations = useMemo(() => {
        const durMap: Record<string, number> = {};
        filteredLogs.forEach(log => {
            const client = log.task?.customer_name || 'No Customer';
            durMap[client] = (durMap[client] || 0) + (log.duration || 0);
        });
        return Object.entries(durMap)
            .map(([name, duration]) => ({ name, duration }))
            .sort((a, b) => b.duration - a.duration);
    }, [filteredLogs]);

    const topClientName = useMemo(() => {
        return timerClientDurations[0]?.name || 'None';
    }, [timerClientDurations]);

    const timerEmployeeDurations = useMemo(() => {
        const durMap: Record<string, number> = {};
        filteredLogs.forEach(log => {
            const name = log.user?.full_name || 'Unknown';
            durMap[name] = (durMap[name] || 0) + (log.duration || 0);
        });
        return Object.entries(durMap)
            .map(([name, duration]) => ({ name, duration }))
            .sort((a, b) => b.duration - a.duration);
    }, [filteredLogs]);

    const topPicName = useMemo(() => {
        return timerEmployeeDurations[0]?.name || 'None';
    }, [timerEmployeeDurations]);

    const averageSessionStr = useMemo(() => {
        if (filteredLogs.length === 0) return '0 mins';
        const avgSecs = totalSecondsTracked / filteredLogs.length;
        const mins = Math.round(avgSecs / 60);
        if (mins >= 60) {
            const hrs = (mins / 60).toFixed(1);
            return `${hrs} hrs`;
        }
        return `${mins} mins`;
    }, [filteredLogs, totalSecondsTracked]);

    const topTasksByTime = useMemo(() => {
        const taskDurMap = new Map<string, { title: string; customer: string; assignee: string; duration: number }>();
        filteredLogs.forEach(log => {
            const taskId = log.task_id;
            const existing = taskDurMap.get(taskId);
            const duration = log.duration || 0;
            if (existing) {
                existing.duration += duration;
            } else {
                taskDurMap.set(taskId, {
                    title: log.task?.title || 'Unknown Task',
                    customer: log.task?.customer_name || '—',
                    assignee: log.user?.full_name || 'Unknown',
                    duration
                });
            }
        });
        return Array.from(taskDurMap.values())
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10);
    }, [filteredLogs]);

    const uniqueCustomerNames = useMemo(() => {
        const names = new Set(tasks.map(t => t.customer_name).filter(Boolean));
        return Array.from(names).sort();
    }, [tasks]);
    
    // Auto-set the initial filter strictly if not admin
    useEffect(() => {
        if (!hasFullAccess && currentUserDepartment) {
            setFilterDepartment(currentUserDepartment);
        }
    }, [hasFullAccess, currentUserDepartment]);

    const baseTasks = useMemo(() => {
        if (filterDepartment === 'All') return tasks;
        return tasks.filter(t => t.department === filterDepartment);
    }, [tasks, filterDepartment]);

    const activeTasks = useMemo(() => baseTasks.filter(t => t.status !== 'DONE'), [baseTasks]);
    const overdueTasks = useMemo(() => activeTasks.filter(t => t.due_date && new Date(t.due_date) < now), [activeTasks]);
    const bottleneckTasks = useMemo(() =>
        activeTasks.filter(t => differenceInDays(now, new Date(t.created_at)) >= 3),
        [activeTasks]);

    const uniqueCustomers = useMemo(() =>
        new Set(baseTasks.map(t => t.customer_name).filter(Boolean)).size,
        [baseTasks]);

    const workloadData = useMemo(() => {
        const counts: Record<string, number> = {};
        activeTasks.forEach(t => {
            const name = (t.assignee as any)?.full_name || 'Unassigned';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([pic, count]) => ({ pic, count }))
            .sort((a, b) => b.count - a.count);
    }, [activeTasks]);

    // ── Total Task By PIC (time-filtered) ────────────────────────────────────
    const totalTaskByPicData = useMemo(() => {
        let startDate: Date;
        let endDate: Date = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (totalPicPeriod === 'week') {
            startDate = subWeeks(endDate, 1);
        } else if (totalPicPeriod === 'month') {
            startDate = subMonths(endDate, 1);
        } else {
            startDate = totalPicCustomStart ? new Date(totalPicCustomStart) : subMonths(endDate, 1);
            endDate = totalPicCustomEnd ? new Date(totalPicCustomEnd + 'T23:59:59') : endDate;
        }

        const counts: Record<string, number> = {};
        baseTasks.forEach(t => {
            const created = new Date(t.created_at);
            if (created >= startDate && created <= endDate) {
                const name = (t.assignee as any)?.full_name || 'Unassigned';
                counts[name] = (counts[name] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([pic, count]) => ({ pic, count }))
            .sort((a, b) => b.count - a.count);
    }, [baseTasks, totalPicPeriod, totalPicCustomStart, totalPicCustomEnd]);

    const customerData = useMemo(() => {
        const counts: Record<string, number> = {};
        baseTasks.forEach(t => {
            const name = t.customer_name || 'No Customer';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([customer, value]) => ({ customer, value }))
            .sort((a, b) => b.value - a.value);
    }, [baseTasks]);

    const overdueByStatus = useMemo(() => {
        const counts: Record<string, number> = { BACKLOG: 0, CLIENT_HOLD: 0, IN_PROGRESS: 0, REVIEW: 0 };
        overdueTasks.forEach(t => {
            if (counts[t.status] !== undefined) counts[t.status]++;
        });
        return counts;
    }, [overdueTasks]);

    const customerDetailedData = useMemo(() => {
        const stats: Record<string, { total: number; completed: number; pending: number; overdue: number; firstTaskDate: Date; tasksPerDay: number }> = {};
        
        baseTasks.forEach(t => {
            const name = t.customer_name || 'No Customer';
            const createdAt = new Date(t.created_at);
            
            if (!stats[name]) {
                stats[name] = { total: 0, completed: 0, pending: 0, overdue: 0, firstTaskDate: createdAt, tasksPerDay: 0 };
            }

            stats[name].total += 1;
            
            if (t.status === 'DONE') {
                stats[name].completed += 1;
            } else {
                stats[name].pending += 1;
                if (t.due_date && new Date(t.due_date) < now) {
                    stats[name].overdue += 1;
                }
            }

            if (createdAt < stats[name].firstTaskDate) {
                stats[name].firstTaskDate = createdAt;
            }
        });

        // Calculate tasks per day
        Object.keys(stats).forEach(name => {
            const daysSinceFirst = Math.max(1, differenceInDays(now, stats[name].firstTaskDate));
            stats[name].tasksPerDay = Number((stats[name].total / daysSinceFirst).toFixed(2));
        });

        return Object.entries(stats)
            .map(([customer, data]) => ({ customer, ...data }))
            .sort((a, b) => b.total - a.total);
    }, [tasks, now]);

    // ── Bottleneck Table Columns ──────────────────────────────────────────────

    const bottleneckColumns = [
        {
            title: 'Task',
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: Task) => (
                <div>
                    <div className="font-semibold text-slate-800 text-sm">{text}</div>
                    {record.priority_type && (
                        <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                            style={{
                                background: PRIORITY_COLORS[record.priority_type] + '20',
                                color: PRIORITY_COLORS[record.priority_type],
                            }}
                        >
                            {record.priority_type.replace('_', ' ')}
                        </span>
                    )}
                </div>
            ),
        },
        {
            title: 'PIC',
            key: 'assignee',
            render: (_: any, record: Task) => {
                const assignee = record.assignee as any;
                return assignee ? (
                    <div className="flex items-center gap-2">
                        <img
                            src={assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.full_name)}&background=6366f1&color=fff`}
                            className="w-6 h-6 rounded-full"
                            alt={assignee.full_name}
                        />
                        <span className="text-sm">{assignee.full_name}</span>
                    </div>
                ) : <span className="text-gray-400 text-sm">—</span>;
            },
        },
        {
            title: 'Customer',
            dataIndex: 'customer_name',
            key: 'customer_name',
            render: (text: string) => <span className="text-sm text-slate-600">{text || '—'}</span>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag
                    style={{
                        background: STATUS_COLORS[status] + '18',
                        color: STATUS_COLORS[status],
                        border: `1px solid ${STATUS_COLORS[status]}40`,
                        borderRadius: 6,
                        fontWeight: 600,
                        fontSize: 11,
                    }}
                >
                    {STATUS_LABELS[status]}
                </Tag>
            ),
        },
        {
            title: 'Age',
            key: 'age',
            sorter: (a: Task, b: Task) =>
                differenceInDays(now, new Date(a.created_at)) - differenceInDays(now, new Date(b.created_at)),
            defaultSortOrder: 'descend' as const,
            render: (_: any, record: Task) => {
                const days = differenceInDays(now, new Date(record.created_at));
                const color = days >= 7 ? '#ef4444' : days >= 5 ? '#f59e0b' : '#6366f1';
                return (
                    <Tooltip title={`Created ${formatDistanceToNow(new Date(record.created_at))} ago`}>
                        <span className="font-bold text-sm" style={{ color }}>{days}d</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            render: (date: string | null) => {
                if (!date) return <span className="text-gray-400 text-sm">—</span>;
                const d = new Date(date);
                const overdue = d < now;
                return (
                    <span className={`text-sm font-medium ${overdue ? 'text-red-500' : 'text-slate-600'}`}>
                        {d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {overdue && <span className="ml-1 text-xs text-red-400">(overdue)</span>}
                    </span>
                );
            },
        },
    ];

    // ── Chart click handlers ──────────────────────────────────────────────────

    const handleBarClick = useCallback((pic: string) => {
        const filtered = activeTasks.filter(
            t => ((t.assignee as any)?.full_name || 'Unassigned') === pic
        );
        openDrill(`Workload: ${pic} — ${filtered.length} task aktif`, filtered);
    }, [activeTasks, openDrill]);

    const handleTotalPicBarClick = useCallback((pic: string) => {
        let startDate: Date;
        let endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (totalPicPeriod === 'week') {
            startDate = subWeeks(endDate, 1);
        } else if (totalPicPeriod === 'month') {
            startDate = subMonths(endDate, 1);
        } else {
            startDate = totalPicCustomStart ? new Date(totalPicCustomStart) : subMonths(endDate, 1);
            endDate = totalPicCustomEnd ? new Date(totalPicCustomEnd + 'T23:59:59') : endDate;
        }

        const filtered = tasks.filter(t => {
            const created = new Date(t.created_at);
            return ((t.assignee as any)?.full_name || 'Unassigned') === pic
                && created >= startDate && created <= endDate;
        });
        const periodLabel = totalPicPeriod === 'week' ? '7 Hari' : totalPicPeriod === 'month' ? '30 Hari' : 'Tempoh Custom';
        openDrill(`Total Task: ${pic} (${periodLabel}) — ${filtered.length} task`, filtered);
    }, [tasks, totalPicPeriod, totalPicCustomStart, totalPicCustomEnd, openDrill]);

    const handleCustomerClick = useCallback((customer: string) => {
        const filtered = tasks.filter(
            t => (t.customer_name || 'No Customer') === customer
        );
        openDrill(`Customer: ${customer} — ${filtered.length} task`, filtered);
    }, [tasks, openDrill]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] gap-4">
                <Spin size="large" />
                <p className="text-slate-400 text-sm">Memuatkan data analitik...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 font-sans pb-8">

            <DrillDownModal
                open={drillOpen}
                title={drillTitle}
                tasks={drillTasks}
                onClose={() => setDrillOpen(false)}
            />

            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-indigo-700 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart2 className="w-6 h-6" />
                            <Title level={2} className="!text-white !m-0">Management Analytics</Title>
                        </div>
                        <Text className="!text-indigo-200 text-sm">
                            Boss View — gambaran keseluruhan prestasi pasukan secara real-time
                        </Text>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 text-indigo-200 text-xs">
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Live · {lastRefreshed.toLocaleTimeString('ms-MY')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-indigo-200 uppercase font-semibold">Jabatan:</span>
                            <Select
                                value={filterDepartment}
                                onChange={setFilterDepartment}
                                size="small"
                                disabled={!hasFullAccess}
                                className="w-[140px] text-slate-800"
                                options={[
                                    { value: 'All', label: 'Seluruh Organisasi' },
                                    { value: 'Outsourcing', label: 'Outsourcing' },
                                    { value: 'IT', label: 'IT' },
                                    { value: 'Sales', label: 'Sales' },
                                    { value: 'Marketing', label: 'Marketing' },
                                    { value: 'Recruitment', label: 'Recruitment' },
                                ]}
                            />
                        </div>
                        {hasFullAccess && (
                            <div className="flex items-center gap-1.5 bg-white/15 text-white text-xs px-2.5 py-1 mt-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />
                                Drill-down aktif
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Tabs Navigation ── */}
            <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200/60 flex gap-2 w-fit">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'overview'
                            ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/30'
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <BarChart2 className="w-4 h-4" />
                    Task Overview
                </button>
                <button
                    onClick={() => setActiveTab('timers')}
                    className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'timers'
                            ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/30'
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Clock className="w-4 h-4" />
                    Time Tracking Reports
                </button>
            </div>

            {activeTab === 'overview' ? (
                <>
                    {/* ── KPI Cards ── */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                        <KpiCard
                            title="Active Tasks"
                            value={activeTasks.length}
                            subtitle={`daripada ${tasks.length} keseluruhan task`}
                            icon={CheckSquare}
                            color="bg-indigo-600"
                            bg="bg-indigo-50"
                            clickable={hasFullAccess}
                            onClick={() => hasFullAccess && openDrill(`Semua Task Aktif (${activeTasks.length})`, activeTasks)}
                        />
                        <KpiCard
                            title="Overdue Tasks"
                            value={overdueTasks.length}
                            subtitle="melepasi due date"
                            icon={AlertTriangle}
                            color="bg-red-500"
                            bg="bg-red-50"
                            clickable={hasFullAccess && overdueTasks.length > 0}
                            onClick={() => hasFullAccess && openDrill(`⚠️ Task Overdue (${overdueTasks.length})`, overdueTasks)}
                        />
                        <KpiCard
                            title="Bottleneck Tasks"
                            value={bottleneckTasks.length}
                            subtitle="belum siap > 3 hari"
                            icon={Clock}
                            color="bg-amber-500"
                            bg="bg-amber-50"
                            clickable={hasFullAccess && bottleneckTasks.length > 0}
                            onClick={() => hasFullAccess && openDrill(`🕐 Bottleneck Tasks (${bottleneckTasks.length})`, bottleneckTasks)}
                        />
                        <KpiCard
                            title="Klien Aktif"
                            value={uniqueCustomers}
                            subtitle="organisasi pelanggan"
                            icon={Users}
                            color="bg-emerald-600"
                            bg="bg-emerald-50"
                        />
                    </div>

                    {/* ── Charts Row — Workload + Customer Distribution ── */}
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                        {/* Workload Bar Chart — Task Aktif */}
                        <Card
                            className="xl:col-span-3 rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                                    <span className="font-bold text-slate-700">Workload Chart — Task Aktif per PIC</span>
                                    {hasFullAccess && (
                                        <span className="text-xs font-normal text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full ml-1">
                                            Klik bar untuk drill-down ↗
                                        </span>
                                    )}
                                </div>
                            }
                        >
                            {workloadData.length === 0 ? (
                                <div className="flex items-center justify-center h-[240px] text-slate-400">
                                    Tiada data task aktif.
                                </div>
                            ) : (
                                <WorkloadBarChart
                                    data={workloadData}
                                    onBarClick={handleBarClick}
                                    isAdmin={hasFullAccess}
                                />
                            )}
                        </Card>

                        {/* Customer Distribution */}
                        <Card
                            className="xl:col-span-2 rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <Users className="w-4 h-4 text-violet-600" />
                                    <span className="font-bold text-slate-700">Customer Distribution</span>
                                    {hasFullAccess && (
                                        <span className="text-xs font-normal text-violet-400 bg-violet-50 px-2 py-0.5 rounded-full ml-1">
                                            Klik untuk drill-down ↗
                                        </span>
                                    )}
                                </div>
                            }
                        >
                            {customerData.length === 0 ? (
                                <div className="flex items-center justify-center h-[260px] text-slate-400">
                                    Tiada data.
                                </div>
                            ) : (
                                <CustomerDistributionList
                                    data={customerData}
                                    total={tasks.length}
                                    onSegmentClick={handleCustomerClick}
                                    isAdmin={hasFullAccess}
                                />
                            )}
                        </Card>
                    </div>

                    {/* ── Total Task per PIC — Full Width Horizontal Chart ── */}
                    <Card
                        className="rounded-2xl shadow-sm border border-slate-100"
                        variant="borderless"
                        title={
                            <div className="flex items-center gap-2 py-1">
                                <BarChart2 className="w-4 h-4 text-emerald-600" />
                                <span className="font-bold text-slate-700">Total Task per PIC</span>
                                <span className="text-xs font-normal text-slate-400 ml-1">— jumlah task diterima mengikut tempoh masa</span>
                                {hasFullAccess && (
                                    <span className="text-xs font-normal text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full ml-auto">
                                        Klik bar untuk drill-down ↗
                                    </span>
                                )}
                            </div>
                        }
                    >
                        <TotalTaskBarChart
                            data={totalTaskByPicData}
                            onBarClick={handleTotalPicBarClick}
                            isAdmin={hasFullAccess}
                            period={totalPicPeriod}
                            onPeriodChange={setTotalPicPeriod}
                            customStart={totalPicCustomStart}
                            customEnd={totalPicCustomEnd}
                            onCustomStartChange={setTotalPicCustomStart}
                            onCustomEndChange={setTotalPicCustomEnd}
                        />
                    </Card>

                    {/* ── Overdue Summary + Bottleneck Table ── */}
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                        {/* Overdue Summary */}
                        <Card
                            className="xl:col-span-1 rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    <span className="font-bold text-slate-700">Overdue Summary</span>
                                </div>
                            }
                        >
                            <div className="flex flex-col gap-3">
                                {overdueTasks.length === 0 ? (
                                    <div className="text-center text-emerald-500 font-semibold py-8">
                                        🎉 Tiada task overdue!
                                    </div>
                                ) : (
                                    <>
                                        <div
                                            className={`bg-red-50 border border-red-100 rounded-xl p-4 text-center transition-all ${hasFullAccess ? 'cursor-pointer hover:bg-red-100' : ''}`}
                                            onClick={() => hasFullAccess && openDrill(`⚠️ Task Overdue (${overdueTasks.length})`, overdueTasks)}
                                        >
                                            <p className="text-4xl font-black text-red-500">{overdueTasks.length}</p>
                                            <p className="text-xs text-red-400 font-semibold mt-1">JUMLAH OVERDUE</p>
                                            {hasFullAccess && <p className="text-xs text-red-300 mt-0.5">Klik untuk lihat senarai ↗</p>}
                                        </div>

                                        {Object.entries(overdueByStatus).filter(([, v]) => v > 0).map(([status, count]) => (
                                            <div
                                                key={status}
                                                className={`flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 transition-all ${hasFullAccess ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                                                onClick={() => {
                                                    if (!hasFullAccess) return;
                                                    const filtered = overdueTasks.filter(t => t.status === status);
                                                    openDrill(`Overdue — ${STATUS_LABELS[status]} (${filtered.length})`, filtered);
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                                                    <span className="text-sm font-medium text-slate-600">{STATUS_LABELS[status]}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Badge count={count} style={{ backgroundColor: STATUS_COLORS[status] }} />
                                                    {hasFullAccess && <span className="text-xs text-slate-300 ml-1">↗</span>}
                                                </div>
                                            </div>
                                        ))}

                                        <div className="mt-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Task Terlibat</p>
                                                <span className="text-[10px] font-bold text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">
                                                    {overdueTasks.length} task
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                                                {overdueTasks.map(t => {
                                                    const daysLate = t.due_date ? differenceInDays(now, new Date(t.due_date)) : 0;
                                                    return (
                                                        <div 
                                                            key={t.id} 
                                                            className="group flex flex-col gap-1.5 p-2.5 bg-white border border-red-100 rounded-xl hover:border-red-300 hover:shadow-md transition-all cursor-pointer"
                                                            onClick={() => openDrill(`Detail Task: ${t.title}`, [t])}
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                                                                <span className="text-[12px] leading-snug font-bold text-slate-700 break-words line-clamp-2">
                                                                    {t.title}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-red-50">
                                                                <div className="flex items-center gap-1.5">
                                                                    <img
                                                                        src={(t.assignee as any)?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent((t.assignee as any)?.full_name || 'U')}&background=f1f5f9&color=64748b`}
                                                                        className="w-4 h-4 rounded-full border border-slate-100"
                                                                        alt="PIC"
                                                                    />
                                                                    <span className="text-[10px] text-slate-500 font-medium truncate max-w-[80px]">
                                                                        {(t.assignee as any)?.full_name || 'Unassigned'}
                                                                    </span>
                                                                </div>
                                                                {t.due_date && (
                                                                    <span className="text-[10px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md">
                                                                        {daysLate}d late
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Card>

                        {/* Bottleneck Table */}
                        <Card
                            className="xl:col-span-3 rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    <span className="font-bold text-slate-700">Bottleneck Detection</span>
                                    <span className="text-xs font-normal text-slate-400 ml-1">
                                        — task belum siap melebihi 3 hari
                                    </span>
                                </div>
                            }
                            extra={
                                bottleneckTasks.length > 0 && (
                                    <Badge count={bottleneckTasks.length} style={{ backgroundColor: '#f59e0b' }} />
                                )
                            }
                        >
                            <Table
                                columns={bottleneckColumns}
                                dataSource={bottleneckTasks}
                                rowKey="id"
                                pagination={{ pageSize: 8, size: 'small' }}
                                size="small"
                                locale={{ emptyText: '✅ Tiada bottleneck — semua task dalam tempoh!' }}
                                rowClassName={(record) => {
                                    const days = differenceInDays(now, new Date(record.created_at));
                                    return days >= 7 ? 'bg-red-50/50' : days >= 5 ? 'bg-amber-50/50' : '';
                                }}
                            />
                        </Card>
                    </div>

                    {/* ── Customer Detailed Analytics Table ── */}
                    <Card
                        className="rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 mt-2"
                        variant="borderless"
                        title={
                            <div className="flex items-center gap-2 py-2">
                                <Users className="w-5 h-5 text-indigo-600" />
                                <span className="font-extrabold text-slate-800 text-lg">Customer Analytics (Maklumat Terperinci)</span>
                                <span className="text-xs font-normal text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full ml-2">
                                    {customerDetailedData.length} Pelanggan
                                </span>
                            </div>
                        }
                    >
                        <Table
                            dataSource={customerDetailedData}
                            rowKey="customer"
                            pagination={{ pageSize: 10 }}
                            scroll={{ x: 800 }}
                            columns={[
                                {
                                    title: 'Customer Name',
                                    dataIndex: 'customer',
                                    key: 'customer',
                                    sorter: (a: any, b: any) => a.customer.localeCompare(b.customer),
                                    render: (text: string) => <span className="font-bold text-slate-700">{text}</span>
                                },
                                {
                                    title: <Tooltip title="Jumlah keseluruhan task dari mula hingga kini">Total Tasks</Tooltip>,
                                    dataIndex: 'total',
                                    key: 'total',
                                    sorter: (a: any, b: any) => a.total - b.total,
                                    defaultSortOrder: 'descend',
                                    render: (val: number) => <span className="font-bold text-lg text-slate-800">{val}</span>
                                },
                                {
                                    title: <Tooltip title="Task yang sedang dijalankan / diusahakan">Pending Active</Tooltip>,
                                    dataIndex: 'pending',
                                    key: 'pending',
                                    sorter: (a: any, b: any) => a.pending - b.pending,
                                    render: (val: number, record: any) => (
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md w-fit">{val} task</span>
                                            {record.overdue > 0 && <span className="text-[10px] text-red-500 font-bold bg-red-50 border border-red-100 px-1 py-0.5 rounded w-fit">⚠️ {record.overdue} OVERDUE</span>}
                                        </div>
                                    )
                                },
                                {
                                    title: <Tooltip title="Task yang telah siap (DONE)">Completed (DONE)</Tooltip>,
                                    dataIndex: 'completed',
                                    key: 'completed',
                                    sorter: (a: any, b: any) => a.completed - b.completed,
                                    render: (val: number, record: any) => {
                                        const percent = Math.round((val / record.total) * 100) || 0;
                                        return (
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{val} task</span>
                                                <span className="text-[10px] text-slate-400 font-bold">({percent}%)</span>
                                            </div>
                                        );
                                    }
                                },
                                {
                                    title: <Tooltip title="Purata task baru yang masuk sehari secara sejarah">Frequency (Task/Hari)</Tooltip>,
                                    dataIndex: 'tasksPerDay',
                                    key: 'tasksPerDay',
                                    sorter: (a: any, b: any) => a.tasksPerDay - b.tasksPerDay,
                                    render: (val: number) => {
                                        const isHigh = val > 2;
                                        return (
                                            <span className={`font-bold ${isHigh ? 'text-rose-500' : 'text-slate-600'}`}>
                                                {val} {isHigh && '🔥'}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    title: 'Action',
                                    key: 'action',
                                    render: (_: any, record: any) => (
                                        <Button
                                            type="text"
                                            size="small"
                                            className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all font-semibold text-xs"
                                            onClick={() => {
                                                const filtered = tasks.filter(t => (t.customer_name || 'No Customer') === record.customer);
                                                openDrill(`Detailed View: ${record.customer} (${filtered.length} task)`, filtered);
                                            }}
                                        >
                                            Semak Task
                                        </Button>
                                    )
                                }
                            ]}
                        />
                    </Card>
                </>
            ) : (
                <>
                    {/* ── Time Tracking KPI Cards ── */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                        <KpiCard
                            title="Total Hours Tracked"
                            value={totalHoursTrackedStr}
                            subtitle={`daripada ${filteredLogs.length} sesi masa`}
                            icon={Hourglass}
                            color="bg-indigo-600"
                            bg="bg-indigo-50"
                        />
                        <KpiCard
                            title="Top Customer (by Hours)"
                            value={topClientName}
                            subtitle="klien menggunakan masa tertinggi"
                            icon={Users}
                            color="bg-emerald-600"
                            bg="bg-emerald-50"
                        />
                        <KpiCard
                            title="Top PIC (by Hours)"
                            value={topPicName}
                            subtitle="pekerja paling banyak log jam"
                            icon={BarChart2}
                            color="bg-violet-600"
                            bg="bg-violet-50"
                        />
                        <KpiCard
                            title="Avg Session Duration"
                            value={averageSessionStr}
                            subtitle="purata masa per sesi"
                            icon={Clock}
                            color="bg-amber-600"
                            bg="bg-amber-50"
                        />
                    </div>

                    {/* ── Time Tracking Filters ── */}
                    <Card className="rounded-2xl shadow-sm border border-slate-100" variant="borderless">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Filter Pekerja (PIC)</span>
                                <Select
                                    value={filterTimerUser}
                                    onChange={setFilterTimerUser}
                                    className="w-[200px]"
                                    options={[
                                        { value: 'All', label: 'Semua PIC' },
                                        ...profiles.map(p => ({ value: p.id, label: p.full_name }))
                                    ]}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Filter Pelanggan (Customer)</span>
                                <Select
                                    value={filterTimerCustomer}
                                    onChange={setFilterTimerCustomer}
                                    className="w-[220px]"
                                    options={[
                                        { value: 'All', label: 'Semua Customer' },
                                        ...uniqueCustomerNames.map(c => ({ value: c, label: c }))
                                    ]}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 md:ml-auto w-full md:w-auto">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Cari Tugasan / PIC</span>
                                <Input
                                    placeholder="Cari kata kunci..."
                                    value={timerSearchText}
                                    onChange={e => setTimerSearchText(e.target.value)}
                                    className="w-full md:w-[260px] rounded-lg"
                                    allowClear
                                />
                            </div>
                        </div>
                    </Card>

                    {/* ── Time Allocation Charts Grid ── */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {/* PIC Work Hours Chart */}
                        <Card
                            className="rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <BarChart2 className="w-4 h-4 text-indigo-600" />
                                    <span className="font-bold text-slate-700">Analisis Jam Kerja Pekerja (PIC)</span>
                                </div>
                            }
                        >
                            {timerEmployeeDurations.length === 0 ? (
                                <div className="flex items-center justify-center h-[200px] text-slate-400">
                                    Tiada data timer dikesan.
                                </div>
                            ) : (
                                <TimeBarChart
                                    data={timerEmployeeDurations}
                                    total={totalSecondsTracked}
                                />
                            )}
                        </Card>

                        {/* Customer Resource Allocation */}
                        <Card
                            className="rounded-2xl shadow-sm border border-slate-100"
                            variant="borderless"
                            title={
                                <div className="flex items-center gap-2 py-1">
                                    <Users className="w-4 h-4 text-violet-600" />
                                    <span className="font-bold text-slate-700">Agihan Masa Mengikut Pelanggan (Customer)</span>
                                </div>
                            }
                        >
                            {timerClientDurations.length === 0 ? (
                                <div className="flex items-center justify-center h-[200px] text-slate-400">
                                    Tiada data timer dikesan.
                                </div>
                            ) : (
                                <TimeBarChart
                                    data={timerClientDurations}
                                    total={totalSecondsTracked}
                                />
                            )}
                        </Card>
                    </div>

                    {/* ── Longest Tasks Analysis ── */}
                    <Card
                        className="rounded-2xl shadow-sm border border-slate-100"
                        variant="borderless"
                        title={
                            <div className="flex items-center gap-2 py-1">
                                <Clock className="w-4 h-4 text-rose-500" />
                                <span className="font-bold text-slate-700">Tugasan Paling Banyak Memakan Masa (Top 10 Longest Tasks)</span>
                            </div>
                        }
                    >
                        <Table
                            dataSource={topTasksByTime}
                            rowKey="title"
                            pagination={false}
                            size="small"
                            locale={{ emptyText: 'Tiada tugasan dikesan mengikut penapis semasa.' }}
                            columns={[
                                {
                                    title: 'Nama Tugasan (Task Title)',
                                    dataIndex: 'title',
                                    key: 'title',
                                    render: (text: string) => <span className="font-bold text-slate-700 text-sm">{text}</span>
                                },
                                {
                                    title: 'Pelanggan',
                                    dataIndex: 'customer',
                                    key: 'customer',
                                    render: (text: string) => <span className="text-slate-500 text-sm">{text}</span>
                                },
                                {
                                    title: 'PIC Utama',
                                    dataIndex: 'assignee',
                                    key: 'assignee',
                                    render: (text: string) => <span className="text-slate-600 text-sm font-medium">{text}</span>
                                },
                                {
                                    title: 'Jumlah Masa Kerja',
                                    dataIndex: 'duration',
                                    key: 'duration',
                                    sorter: (a: any, b: any) => a.duration - b.duration,
                                    render: (val: number) => {
                                        const hrs = (val / 3600).toFixed(1);
                                        return <span className="font-black text-sm text-rose-500 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-md">{hrs} hrs</span>;
                                    }
                                }
                            ]}
                        />
                    </Card>

                    {/* ── Detailed Time Logs Table ── */}
                    <Card
                        className="rounded-2xl shadow-sm border border-slate-100"
                        variant="borderless"
                        title={
                            <div className="flex items-center gap-2 py-1">
                                <Hourglass className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-slate-700">Rekod Log Masa Terperinci (Detailed Work Session Logs)</span>
                            </div>
                        }
                    >
                        <Table
                            dataSource={filteredLogs}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            size="middle"
                            locale={{ emptyText: 'Tiada rekod log masa dikesan.' }}
                            columns={[
                                {
                                    title: 'Pekerja (PIC)',
                                    key: 'user',
                                    render: (_: any, record: any) => {
                                        const user = record.user;
                                        if (!user) return <span className="text-slate-400 text-xs">—</span>;
                                        return (
                                            <div className="flex items-center gap-2">
                                                <img
                                                    src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=6366f1&color=fff`}
                                                    className="w-5 h-5 rounded-full"
                                                    alt=""
                                                />
                                                <span className="text-xs font-semibold text-slate-700">{user.full_name}</span>
                                            </div>
                                        );
                                    }
                                },
                                {
                                    title: 'Task Title',
                                    key: 'task',
                                    render: (_: any, record: any) => (
                                        <span className="text-slate-800 text-xs font-medium">{record.task?.title || '—'}</span>
                                    )
                                },
                                {
                                    title: 'Customer',
                                    key: 'customer',
                                    render: (_: any, record: any) => (
                                        <span className="text-slate-500 text-xs">{record.task?.customer_name || '—'}</span>
                                    )
                                },
                                {
                                    title: 'Mula Bekerja',
                                    dataIndex: 'start_time',
                                    key: 'start_time',
                                    render: (val: string) => (
                                        <span className="text-slate-500 text-[11px]">
                                            {new Date(val).toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )
                                },
                                {
                                    title: 'Tamat Bekerja',
                                    dataIndex: 'end_time',
                                    key: 'end_time',
                                    render: (val: string) => (
                                        <span className="text-slate-500 text-[11px]">
                                            {val ? new Date(val).toLocaleString('ms-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    )
                                },
                                {
                                    title: 'Tempoh Kerja',
                                    dataIndex: 'duration',
                                    key: 'duration',
                                    render: (val: number) => {
                                        const hrs = Math.floor(val / 3600);
                                        const mins = Math.floor((val % 3600) / 60);
                                        const secs = val % 60;
                                        
                                        if (hrs > 0) return <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{hrs}h {mins}m</span>;
                                        if (mins > 0) return <span className="font-mono font-bold text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded">{mins}m</span>;
                                        return <span className="font-mono font-medium text-xs text-slate-400">{secs}s</span>;
                                    }
                                }
                            ]}
                        />
                    </Card>
                </>
            )}
        </div>
    );
}

