'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, Table, Tag, Typography, Spin, Badge, Tooltip, Modal, Button, Select, Input, message, DatePicker, Segmented, Collapse, InputNumber } from 'antd';
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
    Hourglass,
    FileSpreadsheet
} from 'lucide-react';
import { differenceInDays, formatDistanceToNow, subWeeks, subMonths } from 'date-fns';
import Link from 'next/link';
import dayjs from 'dayjs';

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
    // Determine dynamic premium accents based on classes passed
    let accentBorder = 'border-l-indigo-500';
    let iconGradient = 'bg-gradient-to-tr from-indigo-500 to-indigo-600 shadow-indigo-200/50';
    let hoverShadow = 'hover:shadow-[0_12px_30px_rgba(99,102,241,0.08)]';
    
    if (color.includes('red') || color.includes('rose')) {
        accentBorder = 'border-l-rose-500';
        iconGradient = 'bg-gradient-to-tr from-rose-500 to-red-600 shadow-rose-200/50';
        hoverShadow = 'hover:shadow-[0_12px_30px_rgba(244,63,94,0.08)]';
    } else if (color.includes('amber') || color.includes('yellow')) {
        accentBorder = 'border-l-amber-500';
        iconGradient = 'bg-gradient-to-tr from-amber-500 to-orange-600 shadow-amber-200/50';
        hoverShadow = 'hover:shadow-[0_12px_30px_rgba(245,158,11,0.08)]';
    } else if (color.includes('emerald') || color.includes('green')) {
        accentBorder = 'border-l-emerald-500';
        iconGradient = 'bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-emerald-200/50';
        hoverShadow = 'hover:shadow-[0_12px_30px_rgba(16,185,129,0.08)]';
    } else if (color.includes('sky') || color.includes('blue')) {
        accentBorder = 'border-l-sky-500';
        iconGradient = 'bg-gradient-to-tr from-sky-500 to-blue-600 shadow-sky-200/50';
        hoverShadow = 'hover:shadow-[0_12px_30px_rgba(14,165,233,0.08)]';
    } else if (color.includes('violet') || color.includes('purple')) {
        accentBorder = 'border-l-violet-500';
        iconGradient = 'bg-gradient-to-tr from-violet-500 to-fuchsia-600 shadow-violet-200/50';
        hoverShadow = 'hover:shadow-[0_12px_30px_rgba(139,92,246,0.08)]';
    }

    const isLongText = typeof value === 'string' && value.length > 12;
    const valueSizeClass = isLongText 
        ? (value.length > 22 ? 'text-sm font-extrabold leading-tight' : 'text-lg font-extrabold leading-tight') 
        : 'text-2xl font-black leading-none';

    return (
        <div
            onClick={onClick}
            className={`relative overflow-hidden rounded-2xl bg-white p-5 border-l-4 ${accentBorder} border-y border-r border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all duration-300 ${
                clickable 
                    ? `cursor-pointer hover:-translate-y-1 hover:border-slate-200/80 ${hoverShadow} select-none` 
                    : ''
            }`}
        >
            {/* Background subtle blur glow */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-slate-50 opacity-40 blur-xl pointer-events-none" />

            <div className={`rounded-xl p-3 text-white shadow-lg ${iconGradient} shrink-0`}>
                <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider leading-snug">{title}</p>
                    {clickable && (
                        <span className="text-[9px] text-indigo-600 font-extrabold bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ml-2">
                            Drill ↗
                        </span>
                    )}
                </div>
                <div className="flex items-baseline gap-2">
                    <Tooltip title={isLongText ? value : undefined}>
                        <p className={`font-black text-slate-800 break-words line-clamp-2 ${valueSizeClass}`}>
                            {value}
                        </p>
                    </Tooltip>
                </div>
                {subtitle && (
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-normal">
                        {subtitle}
                    </p>
                )}
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
    const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
    const [filterDepartment, setFilterDepartment] = useState<string>('All');
    const [isExporting, setIsExporting] = useState(false);
    
    // Tab switching state
    const [activeTab, setActiveTab] = useState<string>('overview');

    // Time Log Filters
    const [filterTimerUser, setFilterTimerUser] = useState<string>('All');
    const [filterTimerCustomer, setFilterTimerCustomer] = useState<string>('All');
    const [timerSearchText, setTimerSearchText] = useState<string>('');
    const [timerDateRange, setTimerDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);

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

    // Task Duration Monitor States
    const [durationViewMode, setDurationViewMode] = useState<'instance' | 'type'>('instance');
    const [durationSearchInput, setDurationSearchInput] = useState<string>('');
    const [durationSearch, setDurationSearch] = useState<string>('');
    const [durationPICs, setDurationPICs] = useState<string[]>([]);
    const [durationCustomers, setDurationCustomers] = useState<string[]>([]);
    
    // Pagination state
    const [durationPagination, setDurationPagination] = useState({
        current: 1,
        pageSize: 25,
        total: 0
    });
    
    // Sorting state (default: actual_hours descending)
    const [durationSorter, setDurationSorter] = useState<{
        field: string;
        order: 'ascend' | 'descend' | null;
    }>({
        field: 'actual_hours',
        order: 'descend'
    });

    // Configuration thresholds for Data Quality Warning
    const [durationThresholdSeconds, setDurationThresholdSeconds] = useState<number>(30);
    const [durationThresholdPercent, setDurationThresholdPercent] = useState<number>(20);

    // Table data and loading states
    const [durationTableData, setDurationTableData] = useState<any[]>([]);
    const [durationTableLoading, setDurationTableLoading] = useState<boolean>(false);

    // Row expansion states (for detailed session logs drill-down)
    const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
    const [expandedLogs, setExpandedLogs] = useState<Record<string, any[]>>({});
    const [expandedLoading, setExpandedLoading] = useState<Record<string, boolean>>({});
    const [isDurationExporting, setIsDurationExporting] = useState<boolean>(false);

    const supabase = createClient();
    const { role } = useRole();
    const hasFullAccess = role === 'admin' || role === 'manager';
    const canDrillDown = hasFullAccess || role === 'supervisor';

    const fetchData = useCallback(async () => {
        try {
            // Helper to fetch all tasks in batches of 1000 to bypass default API limits
            const fetchAllTasks = async () => {
                let allTasks: Task[] = [];
                let from = 0;
                const limit = 1000;
                while (true) {
                    const { data, error } = await supabase
                        .from('tsk_tasks')
                        .select(`
                            *,
                            assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
                                id,
                                full_name,
                                avatar_url
                            )
                        `)
                        .order('created_at', { ascending: false })
                        .range(from, from + limit - 1);
                    if (error) throw error;
                    if (!data || data.length === 0) break;
                    allTasks = allTasks.concat(data as Task[]);
                    if (data.length < limit) break;
                    from += limit;
                }
                return allTasks;
            };

            // Helper to fetch all completed time logs in batches of 1000
            const fetchAllLogs = async () => {
                let allLogs: any[] = [];
                let from = 0;
                const limit = 1000;
                while (true) {
                    const { data, error } = await supabase
                        .from('tsk_time_logs')
                        .select('*')
                        .eq('status', 'COMPLETED')
                        .order('start_time', { ascending: false })
                        .range(from, from + limit - 1);
                    if (error) throw error;
                    if (!data || data.length === 0) break;
                    allLogs = allLogs.concat(data);
                    if (data.length < limit) break;
                    from += limit;
                }
                return allLogs;
            };

            const [tasksData, profilesRes, authRes, logsData] = await Promise.all([
                fetchAllTasks(),
                supabase.from('lv_profiles').select('id, full_name, avatar_url, department').eq('status', 'active').order('full_name'),
                supabase.auth.getUser(),
                fetchAllLogs()
            ]);

            if (profilesRes.error) throw profilesRes.error;

            setTasks(tasksData);
            setProfiles(profilesRes.data || []);
            setTimeLogs(logsData);
            
            const userId = authRes.data?.user?.id;
            let myDept: string | null = null;
            if (userId) {
                const me = profilesRes.data?.find(p => p.id === userId);
                if (me) {
                    setCurrentUserProfile(me);
                    if (me.department) {
                        myDept = me.department;
                        setCurrentUserDepartment(me.department);
                    }
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

    // Debounce search input for Task Duration Monitor
    useEffect(() => {
        const handler = setTimeout(() => {
            setDurationSearch(durationSearchInput);
            setDurationPagination(prev => ({ ...prev, current: 1 }));
        }, 300);
        return () => clearTimeout(handler);
    }, [durationSearchInput]);

    // Fetch Task Durations from Supabase RPC
    const fetchDurationData = useCallback(async () => {
        setDurationTableLoading(true);
        try {
            const offset = (durationPagination.current - 1) * durationPagination.pageSize;
            
            let sortCol = 'actual_hours';
            if (durationSorter.field === 'task_title') sortCol = 'task_title';
            else if (durationSorter.field === 'customer') sortCol = 'customer';
            else if (durationSorter.field === 'pic_name') sortCol = 'pic_name';
            else if (durationSorter.field === 'session_count') sortCol = 'session_count';
            else if (durationSorter.field === 'estimated_hours') sortCol = 'estimated_hours';
            else if (durationSorter.field === 'variance') sortCol = 'variance';
            else if (durationSorter.field === 'customer_count') sortCol = 'customer_count';
            else if (durationSorter.field === 'pic_count') sortCol = 'pic_count';

            const isDesc = durationSorter.order === 'descend';
            const startDate = timerDateRange[0] ? timerDateRange[0].startOf('day').toISOString() : null;
            const endDate = timerDateRange[1] ? timerDateRange[1].endOf('day').toISOString() : null;

            const { data, error } = await supabase.rpc('get_task_durations', {
                p_view_mode: durationViewMode,
                p_search: durationSearch,
                p_pics: durationPICs,
                p_customers: durationCustomers,
                p_dept: filterDepartment,
                p_sort_column: sortCol,
                p_sort_desc: isDesc,
                p_limit: durationPagination.pageSize,
                p_offset: offset,
                p_start_date: startDate,
                p_end_date: endDate
            });

            if (error) throw error;

            const result = data || [];
            setDurationTableData(result);
            
            const total = result.length > 0 ? Number(result[0].total_records) : 0;
            setDurationPagination(prev => ({ ...prev, total }));
        } catch (err: any) {
            console.error('Fetch duration data error:', err.message);
            message.error('Gagal mengambil data durasi tugasan');
        } finally {
            setDurationTableLoading(false);
        }
    }, [
        durationViewMode,
        durationSearch,
        durationPICs,
        durationCustomers,
        filterDepartment,
        durationSorter,
        durationPagination.current,
        durationPagination.pageSize,
        timerDateRange
    ]);

    useEffect(() => {
        if (activeTab === 'duration-monitor') {
            fetchDurationData();
        }
    }, [fetchDurationData, activeTab]);

    // Scoped PIC and Customer filters based on active department and roles
    const filteredProfilesForDuration = useMemo(() => {
        if (role === 'supervisor') {
            return profiles.filter(p => p.department === currentUserDepartment);
        }
        if (!hasFullAccess) {
            return profiles.filter(p => p.id === currentUserProfile?.id);
        }
        if (filterDepartment === 'All') return profiles;
        return profiles.filter(p => p.department === filterDepartment);
    }, [profiles, filterDepartment, hasFullAccess, currentUserProfile, role, currentUserDepartment]);

    const filteredCustomersForDuration = useMemo(() => {
        const deptTasks = filterDepartment === 'All' ? tasks : tasks.filter(t => t.department === filterDepartment);
        const names = new Set(deptTasks.map(t => t.customer_name).filter(Boolean));
        return Array.from(names).sort();
    }, [tasks, filterDepartment]);

    // Dynamic row expansion session logs fetcher
    const fetchSessionLogsForTask = useCallback(async (taskId: string) => {
        setExpandedLoading(prev => ({ ...prev, [taskId]: true }));
        try {
            const { data, error } = await supabase
                .from('tsk_time_logs')
                .select('*, user:lv_profiles(full_name, avatar_url), task:tsk_tasks(title, customer_name)')
                .eq('task_id', taskId)
                .eq('status', 'COMPLETED')
                .order('start_time', { ascending: false });
            if (error) throw error;
            setExpandedLogs(prev => ({ ...prev, [taskId]: data || [] }));
        } catch (err: any) {
            console.error('Fetch session logs error:', err.message);
            message.error('Gagal mengambil maklumat log sesi kerja');
        } finally {
            setExpandedLoading(prev => ({ ...prev, [taskId]: false }));
        }
    }, []);

    // Handle Table Pagination/Sorting changes for Task Duration Monitor
    const handleDurationTableChange = (
        pagination: any,
        filters: any,
        sorter: any
    ) => {
        setDurationPagination(prev => ({
            ...prev,
            current: pagination.current || 1,
            pageSize: pagination.pageSize || 25
        }));
        
        setDurationSorter({
            field: sorter.field || 'actual_hours',
            order: sorter.order || 'descend'
        });
    };

    // Render expanded sub-table showing work sessions detail
    const renderExpandedLogsTable = (record: any) => {
        const logs = expandedLogs[record.task_id] || [];
        const isLoading = expandedLoading[record.task_id];

        return (
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 shadow-inner">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    Perincian Sesi Kerja (Work Sessions Detail)
                </p>
                <Table
                    dataSource={logs}
                    loading={isLoading}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: 'Tiada sesi kerja dikesan.' }}
                    columns={[
                        {
                            title: 'Pekerja (PIC)',
                            key: 'user',
                            render: (_, log) => (
                                <div className="flex items-center gap-2">
                                    <img
                                        src={log.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(log.user?.full_name || 'U')}&background=6366f1&color=fff`}
                                        className="w-5 h-5 rounded-full border border-slate-100"
                                        alt=""
                                    />
                                    <span className="text-xs font-semibold text-slate-700">{log.user?.full_name || '—'}</span>
                                </div>
                            )
                        },
                        {
                            title: 'Mula Bekerja',
                            dataIndex: 'start_time',
                            key: 'start_time',
                            render: (val) => <span className="text-slate-500 text-xs">{val ? new Date(val).toLocaleString('ms-MY') : '—'}</span>
                        },
                        {
                            title: 'Tamat Bekerja',
                            dataIndex: 'end_time',
                            key: 'end_time',
                            render: (val) => <span className="text-slate-500 text-xs">{val ? new Date(val).toLocaleString('ms-MY') : '—'}</span>
                        },
                        {
                            title: 'Tempoh Sesi',
                            dataIndex: 'duration',
                            key: 'duration',
                            render: (val: number) => {
                                const hrs = Math.floor(val / 3600);
                                const mins = Math.floor((val % 3600) / 60);
                                const secs = val % 60;
                                if (hrs > 0) return <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{hrs}h {mins}m</span>;
                                if (mins > 0) return <span className="font-mono font-bold text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded">{mins}m</span>;
                                return <span className="font-mono text-slate-400 text-xs">{secs}s</span>;
                            }
                        }
                    ]}
                />
            </div>
        );
    };

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
            if (timerDateRange[0] && timerDateRange[1]) {
                const logDate = dayjs(log.start_time);
                const start = timerDateRange[0].startOf('day');
                const end = timerDateRange[1].endOf('day');
                if (logDate.isBefore(start) || logDate.isAfter(end)) return false;
            }
            return true;
        });
    }, [joinedLogs, filterDepartment, filterTimerUser, filterTimerCustomer, timerSearchText, timerDateRange]);

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

    // ─── Estimated vs Actual Derivations ───
    const filteredTasksForEstimation = useMemo(() => {
        return baseTasks.filter(t => {
            if (filterTimerUser !== 'All' && t.assignee_id !== filterTimerUser) return false;
            if (filterTimerCustomer !== 'All' && t.customer_name !== filterTimerCustomer) return false;
            if (timerSearchText) {
                const search = timerSearchText.toLowerCase();
                const title = t.title?.toLowerCase() || '';
                const assigneeName = (t.assignee as any)?.full_name?.toLowerCase() || '';
                if (!title.includes(search) && !assigneeName.includes(search)) return false;
            }
            if (timerDateRange[0] && timerDateRange[1]) {
                const start = timerDateRange[0].startOf('day');
                const end = timerDateRange[1].endOf('day');
                const hasLogInRange = timeLogs.some(log => {
                    if (log.task_id !== t.id || log.status !== 'COMPLETED') return false;
                    const logDate = dayjs(log.start_time);
                    return !logDate.isBefore(start) && !logDate.isAfter(end);
                });
                if (!hasLogInRange) return false;
            }
            return true;
        });
    }, [baseTasks, filterTimerUser, filterTimerCustomer, timerSearchText, timerDateRange, timeLogs]);

    const totalEstimatedHours = useMemo(() => {
        return filteredTasksForEstimation.reduce((acc, t) => acc + Number(t.estimated_hours || 0), 0);
    }, [filteredTasksForEstimation]);

    const totalActualHoursForEstTasks = useMemo(() => {
        const taskIds = new Set(filteredTasksForEstimation.map(t => t.id));
        const seconds = timeLogs
            .filter(log => {
                if (!taskIds.has(log.task_id) || log.status !== 'COMPLETED') return false;
                if (timerDateRange[0] && timerDateRange[1]) {
                    const logDate = dayjs(log.start_time);
                    const start = timerDateRange[0].startOf('day');
                    const end = timerDateRange[1].endOf('day');
                    if (logDate.isBefore(start) || logDate.isAfter(end)) return false;
                }
                return true;
            })
            .reduce((acc, log) => acc + (log.duration || 0), 0);
        return seconds / 3600;
    }, [filteredTasksForEstimation, timeLogs, timerDateRange]);

    const estimatedVsActualData = useMemo(() => {
        const taskDurationMap: Record<string, number> = {};
        timeLogs.forEach(log => {
            if (log.status === 'COMPLETED') {
                if (timerDateRange[0] && timerDateRange[1]) {
                    const logDate = dayjs(log.start_time);
                    const start = timerDateRange[0].startOf('day');
                    const end = timerDateRange[1].endOf('day');
                    if (logDate.isBefore(start) || logDate.isAfter(end)) return;
                }
                taskDurationMap[log.task_id] = (taskDurationMap[log.task_id] || 0) + (log.duration || 0);
            }
        });

        return filteredTasksForEstimation.map(t => {
            const actualSeconds = taskDurationMap[t.id] || 0;
            const actualHours = actualSeconds / 3600;
            const estimatedHours = t.estimated_hours ? Number(t.estimated_hours) : null;
            
            let variance = null;
            let status = 'No Estimate';
            if (estimatedHours !== null) {
                variance = estimatedHours - actualHours;
                if (actualHours <= estimatedHours) {
                    status = 'Within Estimate';
                } else {
                    status = 'Exceeded';
                }
            }

            return {
                key: t.id,
                title: t.title,
                customer_name: t.customer_name || '—',
                assignee_name: (t.assignee as any)?.full_name || 'Unassigned',
                assignee_avatar: (t.assignee as any)?.avatar_url,
                estimatedHours,
                actualHours,
                variance,
                status
            };
        }).sort((a, b) => {
            if (a.status === 'Exceeded' && b.status !== 'Exceeded') return -1;
            if (a.status !== 'Exceeded' && b.status === 'Exceeded') return 1;
            if (a.estimatedHours !== null && b.estimatedHours === null) return -1;
            if (a.estimatedHours === null && b.estimatedHours !== null) return 1;
            return b.actualHours - a.actualHours;
        });
    }, [filteredTasksForEstimation, timeLogs, timerDateRange]);

    const estimationAccuracyStr = useMemo(() => {
        const tasksWithEstimates = estimatedVsActualData.filter(d => d.estimatedHours !== null);
        if (tasksWithEstimates.length === 0) return '—';
        const withinEstimateCount = tasksWithEstimates.filter(d => d.status === 'Within Estimate').length;
        const pct = Math.round((withinEstimateCount / tasksWithEstimates.length) * 100);
        return `${pct}% (${withinEstimateCount}/${tasksWithEstimates.length})`;
    }, [estimatedVsActualData]);

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

    const exportAllToExcel = useCallback(async () => {
        if (filteredLogs.length === 0) {
            message.warning("Tiada data untuk dieksport mengikut penapis semasa");
            return;
        }

        setIsExporting(true);
        try {
            // Lazy load xlsx
            const XLSX = await import('xlsx');

            // 1. Log Sesi Kerja
            const detailedLogsSheetData = filteredLogs.map((log) => {
                const totalSecs = log.duration || 0;
                const hrs = Math.floor(totalSecs / 3600);
                const mins = Math.floor((totalSecs % 3600) / 60);
                const secs = totalSecs % 60;
                
                // Formatted hh:mm:ss
                const pad = (num: number) => String(num).padStart(2, '0');
                const timeString = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
                
                // Decimal hours
                const decimalHours = Number((totalSecs / 3600).toFixed(2));

                return {
                    'Pekerja (PIC)': log.user?.full_name || '—',
                    'Tugasan (Task Title)': log.task?.title || '—',
                    'Pelanggan (Customer)': log.task?.customer_name || '—',
                    'Mula Bekerja': log.start_time ? new Date(log.start_time).toLocaleString('ms-MY') : '—',
                    'Tamat Bekerja': log.end_time ? new Date(log.end_time).toLocaleString('ms-MY') : '—',
                    'Durasi (hh:mm:ss)': timeString,
                    'Durasi (Jam Perpuluhan)': decimalHours
                };
            });

            // 2. Anggaran vs Sebenar
            const estVsActSheetData = estimatedVsActualData.map((t) => {
                const estHours = t.estimatedHours !== null ? Number(t.estimatedHours.toFixed(1)) : null;
                const actHours = Number(t.actualHours.toFixed(2));
                
                // Variance = Estimated - Actual
                // Positive = Under budget (saved hours)
                // Negative = Over budget (exceeded hours)
                const varHours = t.variance !== null ? Number(t.variance.toFixed(2)) : null;

                return {
                    'Nama Tugasan (Task Title)': t.title,
                    'Pelanggan': t.customer_name,
                    'PIC Utama': t.assignee_name,
                    'Estimated Hours': estHours !== null ? estHours : '—',
                    'Actual Hours': actHours,
                    'Variance (Estimated - Actual)': varHours !== null ? varHours : '—',
                    'Status': t.status === 'Within Estimate' ? 'On Track' : t.status === 'Exceeded' ? 'Exceeded' : 'No Estimate'
                };
            });

            // 3. Rumusan PIC
            const picSummarySheetData = timerEmployeeDurations.map((d) => ({
                'Nama Pekerja (PIC)': d.name,
                'Jumlah Masa (Jam)': Number((d.duration / 3600).toFixed(2))
            }));

            // 4. Rumusan Pelanggan
            const customerSummarySheetData = timerClientDurations.map((d) => ({
                'Nama Pelanggan (Customer)': d.name,
                'Jumlah Masa (Jam)': Number((d.duration / 3600).toFixed(2))
            }));

            // 5. Info Eksport
            const generatedAt = new Date();
            const picFilterLabel = filterTimerUser === 'All' 
                ? 'Semua PIC' 
                : (profiles.find(p => p.id === filterTimerUser)?.full_name || filterTimerUser);
            
            const dateRangeLabel = timerDateRange[0] && timerDateRange[1]
                ? `${timerDateRange[0].format('YYYY-MM-DD')} hingga ${timerDateRange[1].format('YYYY-MM-DD')}`
                : 'Semua (Lalai)';

            const infoExportData = [
                { 'Parameter Eksport': 'Tarikh & Masa Penjanaan', 'Nilai': generatedAt.toLocaleString('ms-MY') },
                { 'Parameter Eksport': 'Dijana Oleh', 'Nilai': currentUserProfile?.full_name || 'Pengguna Aktif' },
                { 'Parameter Eksport': 'Filter Jabatan', 'Nilai': filterDepartment === 'All' ? 'Semua Jabatan' : filterDepartment },
                { 'Parameter Eksport': 'Filter Pekerja (PIC)', 'Nilai': picFilterLabel },
                { 'Parameter Eksport': 'Filter Pelanggan', 'Nilai': filterTimerCustomer === 'All' ? 'Semua Customer' : filterTimerCustomer },
                { 'Parameter Eksport': 'Kata Kunci Carian', 'Nilai': timerSearchText || '—' },
                { 'Parameter Eksport': 'Filter Julat Tarikh', 'Nilai': dateRangeLabel }
            ];

            // Create workbook and append sheets
            const wb = XLSX.utils.book_new();

            const wsDetailed = XLSX.utils.json_to_sheet(detailedLogsSheetData);
            const wsEstVsAct = XLSX.utils.json_to_sheet(estVsActSheetData);
            const wsPicSummary = XLSX.utils.json_to_sheet(picSummarySheetData);
            const wsCustomerSummary = XLSX.utils.json_to_sheet(customerSummarySheetData);
            const wsInfo = XLSX.utils.json_to_sheet(infoExportData);

            XLSX.utils.book_append_sheet(wb, wsDetailed, "Log Sesi Kerja");
            XLSX.utils.book_append_sheet(wb, wsEstVsAct, "Anggaran vs Sebenar");
            XLSX.utils.book_append_sheet(wb, wsPicSummary, "Rumusan PIC");
            XLSX.utils.book_append_sheet(wb, wsCustomerSummary, "Rumusan Pelanggan");
            XLSX.utils.book_append_sheet(wb, wsInfo, "Info Eksport");

            // Construct dynamic filename
            const dateStr = generatedAt.toISOString().slice(0, 10); // YYYY-MM-DD
            const timeStr = generatedAt.toTimeString().slice(0, 5).replace(':', ''); // HHMM
            
            let filterName = 'All';
            const isPicActive = filterTimerUser !== 'All';
            const isCustomerActive = filterTimerCustomer !== 'All';
            const isSearchActive = !!timerSearchText;
            const isDateActive = !!(timerDateRange[0] && timerDateRange[1]);

            if (isPicActive && !isCustomerActive && !isSearchActive && !isDateActive) {
                const rawName = profiles.find(p => p.id === filterTimerUser)?.full_name || 'Worker';
                filterName = rawName.replace(/[^a-zA-Z0-9]/g, '_');
            } else if (!isPicActive && isCustomerActive && !isSearchActive && !isDateActive) {
                filterName = filterTimerCustomer.replace(/[^a-zA-Z0-9]/g, '_');
            } else if (isPicActive || isCustomerActive || isSearchActive || isDateActive) {
                filterName = 'Filtered';
            }

            const filename = `Time_Tracking_Report_${dateStr}_${timeStr}_${filterName}.xlsx`;
            XLSX.writeFile(wb, filename);
            message.success(`Berjaya memuat turun fail ${filename}`);
        } catch (err: any) {
            console.error('Export Excel error:', err);
            message.error(`Gagal memuat turun Excel: ${err.message || err}`);
        } finally {
            setIsExporting(false);
        }
    }, [
        filteredLogs,
        estimatedVsActualData,
        timerEmployeeDurations,
        timerClientDurations,
        filterDepartment,
        filterTimerUser,
        filterTimerCustomer,
        timerSearchText,
        timerDateRange,
        profiles,
        currentUserProfile
    ]);

    // Export Task Durations to Excel using SheetJS
    const exportDurationToExcel = useCallback(async () => {
        setIsDurationExporting(true);
        try {
            const XLSX = await import('xlsx');

            const startDate = timerDateRange[0] ? timerDateRange[0].startOf('day').toISOString() : null;
            const endDate = timerDateRange[1] ? timerDateRange[1].endOf('day').toISOString() : null;

            let sortCol = 'actual_hours';
            if (durationSorter.field === 'task_title') sortCol = 'task_title';
            else if (durationSorter.field === 'customer') sortCol = 'customer';
            else if (durationSorter.field === 'pic_name') sortCol = 'pic_name';
            else if (durationSorter.field === 'session_count') sortCol = 'session_count';
            else if (durationSorter.field === 'estimated_hours') sortCol = 'estimated_hours';
            else if (durationSorter.field === 'variance') sortCol = 'variance';
            else if (durationSorter.field === 'customer_count') sortCol = 'customer_count';
            else if (durationSorter.field === 'pic_count') sortCol = 'pic_count';

            const isDesc = durationSorter.order === 'descend';

            const { data, error } = await supabase.rpc('get_task_durations', {
                p_view_mode: durationViewMode,
                p_search: durationSearch,
                p_pics: durationPICs,
                p_customers: durationCustomers,
                p_dept: filterDepartment,
                p_sort_column: sortCol,
                p_sort_desc: isDesc,
                p_limit: 100000,
                p_offset: 0,
                p_start_date: startDate,
                p_end_date: endDate
            });

            if (error) throw error;

            const rawData = data || [];
            if (rawData.length === 0) {
                message.warning('Tiada data untuk dieksport');
                return;
            }

            let sheetData = [];
            if (durationViewMode === 'instance') {
                sheetData = rawData.map((row: any) => {
                    const durationsArr = (row.durations as number[]) || [];
                    const totalSess = durationsArr.length;
                    const shortSess = durationsArr.filter(d => d < durationThresholdSeconds).length;
                    const warningPct = totalSess > 0 ? (shortSess / totalSess) * 100 : 0;
                    const hasWarning = warningPct > durationThresholdPercent;
                    const warningLabel = hasWarning ? `AMARAN: ${shortSess} drpd ${totalSess} sesi bawah ${durationThresholdSeconds}s` : 'OK';

                    return {
                        'Tajuk Tugasan (Task Title)': row.task_title,
                        'Pelanggan (Customer)': row.customer,
                        'Pekerja (PIC)': row.pic_name,
                        'Bilangan Sesi': Number(row.session_count),
                        'Masa Sebenar (Actual Hours)': Number(Number(row.actual_hours).toFixed(2)),
                        'Masa Anggaran (Estimated Hours)': row.estimated_hours !== null ? Number(Number(row.estimated_hours).toFixed(1)) : '—',
                        'Varians (Estimated - Actual)': row.variance !== null ? Number(Number(row.variance).toFixed(2)) : '—',
                        'Kualiti Data (Data Quality)': warningLabel
                    };
                });
            } else {
                sheetData = rawData.map((row: any) => {
                    const durationsArr = (row.durations as number[]) || [];
                    const totalSess = durationsArr.length;
                    const shortSess = durationsArr.filter(d => d < durationThresholdSeconds).length;
                    const warningPct = totalSess > 0 ? (shortSess / totalSess) * 100 : 0;
                    const hasWarning = warningPct > durationThresholdPercent;
                    const warningLabel = hasWarning ? `AMARAN: ${shortSess} drpd ${totalSess} sesi bawah ${durationThresholdSeconds}s` : 'OK';

                    return {
                        'Tajuk Tugasan (Task Title)': row.task_title,
                        'Bilangan Pelanggan Terlibat': Number(row.customer_count),
                        'Bilangan PIC Terlibat': Number(row.pic_count),
                        'Bilangan Sesi': Number(row.session_count),
                        'Masa Sebenar (Actual Hours)': Number(Number(row.actual_hours).toFixed(2)),
                        'Masa Anggaran (Estimated Hours)': row.estimated_hours !== null ? Number(Number(row.estimated_hours).toFixed(1)) : '—',
                        'Varians (Estimated - Actual)': row.variance !== null ? Number(Number(row.variance).toFixed(2)) : '—',
                        'Kualiti Data (Data Quality)': warningLabel
                    };
                });
            }

            const ws = XLSX.utils.json_to_sheet(sheetData);

            const generatedAt = new Date();
            const dateRangeLabel = timerDateRange[0] && timerDateRange[1]
                ? `${timerDateRange[0].format('YYYY-MM-DD')} hingga ${timerDateRange[1].format('YYYY-MM-DD')}`
                : 'Semua (Lalai)';

            const infoExportData = [
                { 'Parameter Eksport': 'Tarikh & Masa Penjanaan', 'Nilai': generatedAt.toLocaleString('ms-MY') },
                { 'Parameter Eksport': 'Dijana Oleh', 'Nilai': currentUserProfile?.full_name || 'Pengguna Aktif' },
                { 'Parameter Eksport': 'Mod Paparan (View Mode)', 'Nilai': durationViewMode === 'instance' ? 'Per Instance (Tugasan Terperinci)' : 'Per Task Type (Agregasi Tajuk)' },
                { 'Parameter Eksport': 'Filter Jabatan', 'Nilai': filterDepartment === 'All' ? 'Semua Jabatan' : filterDepartment },
                { 'Parameter Eksport': 'Filter Pekerja (PIC)', 'Nilai': durationPICs.length > 0 ? durationPICs.join(', ') : 'Semua PIC' },
                { 'Parameter Eksport': 'Filter Pelanggan', 'Nilai': durationCustomers.length > 0 ? durationCustomers.join(', ') : 'Semua Customer' },
                { 'Parameter Eksport': 'Kata Kunci Carian', 'Nilai': durationSearch || '—' },
                { 'Parameter Eksport': 'Filter Julat Tarikh', 'Nilai': dateRangeLabel },
                { 'Parameter Eksport': 'Tetapan Sesi Pendek (Threshold)', 'Nilai': `${durationThresholdSeconds} saat` },
                { 'Parameter Eksport': 'Tetapan Had Amaran (Percent)', 'Nilai': `${durationThresholdPercent}%` }
            ];
            const wsInfo = XLSX.utils.json_to_sheet(infoExportData);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Laporan Durasi");
            XLSX.utils.book_append_sheet(wb, wsInfo, "Info Eksport");

            const dateStr = generatedAt.toISOString().slice(0, 10);
            const timeStr = generatedAt.toTimeString().slice(0, 5).replace(':', '');
            
            let filterName = 'All';
            const isPicActive = durationPICs.length > 0;
            const isCustomerActive = durationCustomers.length > 0;
            const isSearchActive = !!durationSearch;
            const isDateActive = !!(timerDateRange[0] && timerDateRange[1]);

            if (isPicActive && !isCustomerActive && !isSearchActive && !isDateActive && durationPICs.length === 1) {
                filterName = durationPICs[0].replace(/[^a-zA-Z0-9]/g, '_');
            } else if (!isPicActive && isCustomerActive && !isSearchActive && !isDateActive && durationCustomers.length === 1) {
                filterName = durationCustomers[0].replace(/[^a-zA-Z0-9]/g, '_');
            } else if (isPicActive || isCustomerActive || isSearchActive || isDateActive) {
                filterName = 'Filtered';
            }

            const filename = `Task_Duration_Report_${durationViewMode}_${dateStr}_${timeStr}_${filterName}.xlsx`;
            XLSX.writeFile(wb, filename);
            message.success(`Berjaya memuat turun fail ${filename}`);
        } catch (err: any) {
            console.error('Export error:', err.message);
            message.error('Gagal mengeksport data ke Excel');
        } finally {
            setIsDurationExporting(false);
        }
    }, [
        durationViewMode,
        durationSearch,
        durationPICs,
        durationCustomers,
        filterDepartment,
        durationSorter,
        timerDateRange,
        currentUserProfile,
        durationThresholdSeconds,
        durationThresholdPercent
    ]);

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
            <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-violet-950 rounded-2xl p-6 text-white shadow-[0_10px_30px_-10px_rgba(79,70,229,0.3)] border border-indigo-500/20">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart2 className="w-6 h-6 text-indigo-400" />
                            <Title level={2} className="!text-white !m-0 font-extrabold tracking-tight">Management Analytics</Title>
                        </div>
                        <Text className="!text-indigo-200/80 text-sm font-medium">
                            Boss View — gambaran keseluruhan prestasi pasukan secara real-time
                        </Text>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 text-indigo-200/60 text-xs">
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Live · {lastRefreshed.toLocaleTimeString('ms-MY')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-indigo-200 uppercase font-bold tracking-wider">Jabatan:</span>
                            <Select
                                value={filterDepartment}
                                onChange={setFilterDepartment}
                                size="middle"
                                disabled={!hasFullAccess}
                                className="w-[185px]"
                                popupClassName="rounded-xl shadow-lg border border-slate-100"
                                options={[
                                    { value: 'All', label: 'Seluruh Organisasi' },
                                    { value: 'Outsourcing', label: 'Outsourcing' },
                                    { value: 'IT', label: 'IT' },
                                    { value: 'Sales', label: 'Sales' },
                                    { value: 'Marketing', label: 'Marketing' },
                                    { value: 'Recruitment', label: 'Recruitment' },
                                    { value: 'Management', label: 'Management' },
                                    { value: 'Account', label: 'Account' },
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
                <button
                    onClick={() => setActiveTab('duration-monitor')}
                    className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'duration-monitor'
                            ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/30'
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Hourglass className="w-4 h-4" />
                    Task Duration Monitor
                </button>
            </div>

            {activeTab === 'overview' && (
                <>
                    {/* ── KPI Cards ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        <KpiCard
                            title="Active Tasks"
                            value={activeTasks.length}
                            subtitle={`daripada ${tasks.length} keseluruhan task`}
                            icon={CheckSquare}
                            color="bg-indigo-600"
                            bg="bg-indigo-50"
                            clickable={canDrillDown}
                            onClick={() => canDrillDown && openDrill(`Semua Task Aktif (${activeTasks.length})`, activeTasks)}
                        />
                        <KpiCard
                            title="Overdue Tasks"
                            value={overdueTasks.length}
                            subtitle="melepasi due date"
                            icon={AlertTriangle}
                            color="bg-red-500"
                            bg="bg-red-50"
                            clickable={canDrillDown && overdueTasks.length > 0}
                            onClick={() => canDrillDown && openDrill(`⚠️ Task Overdue (${overdueTasks.length})`, overdueTasks)}
                        />
                        <KpiCard
                            title="Bottleneck Tasks"
                            value={bottleneckTasks.length}
                            subtitle="belum siap > 3 hari"
                            icon={Clock}
                            color="bg-amber-500"
                            bg="bg-amber-50"
                            clickable={canDrillDown && bottleneckTasks.length > 0}
                            onClick={() => canDrillDown && openDrill(`🕐 Bottleneck Tasks (${bottleneckTasks.length})`, bottleneckTasks)}
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
                                    isAdmin={canDrillDown}
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
                                    isAdmin={canDrillDown}
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
                            isAdmin={canDrillDown}
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
                                            className={`bg-red-50 border border-red-100 rounded-xl p-4 text-center transition-all ${canDrillDown ? 'cursor-pointer hover:bg-red-100' : ''}`}
                                            onClick={() => canDrillDown && openDrill(`⚠️ Task Overdue (${overdueTasks.length})`, overdueTasks)}
                                        >
                                            <p className="text-4xl font-black text-red-500">{overdueTasks.length}</p>
                                            <p className="text-xs text-red-400 font-semibold mt-1">JUMLAH OVERDUE</p>
                                            {canDrillDown && <p className="text-xs text-red-300 mt-0.5">Klik untuk lihat senarai ↗</p>}
                                        </div>

                                        {Object.entries(overdueByStatus).filter(([, v]) => v > 0).map(([status, count]) => (
                                            <div
                                                key={status}
                                                className={`flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 transition-all ${canDrillDown ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                                                onClick={() => {
                                                    if (!canDrillDown) return;
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
                                                    {canDrillDown && <span className="text-xs text-slate-300 ml-1">↗</span>}
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
            )}

            {activeTab === 'timers' && (
                <>
                    {/* ── Time Tracking KPI Cards ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <KpiCard
                            title="Total Hours Tracked"
                            value={totalHoursTrackedStr}
                            subtitle={`daripada ${filteredLogs.length} sesi`}
                            icon={Hourglass}
                            color="bg-indigo-600"
                            bg="bg-indigo-50"
                        />
                        <KpiCard
                            title="Total Est. Hours"
                            value={totalEstimatedHours.toFixed(1) + ' hrs'}
                            subtitle="anggaran keseluruhan"
                            icon={Clock}
                            color="bg-sky-600"
                            bg="bg-sky-50"
                        />
                        <KpiCard
                            title="Estimation Accuracy"
                            value={estimationAccuracyStr}
                            subtitle="menempati anggaran"
                            icon={TrendingUp}
                            color="bg-rose-500"
                            bg="bg-rose-50"
                        />
                        <KpiCard
                            title="Top Customer (Hours)"
                            value={topClientName}
                            subtitle="penggunaan masa tertinggi"
                            icon={Users}
                            color="bg-emerald-600"
                            bg="bg-emerald-50"
                        />
                        <KpiCard
                            title="Top PIC (Hours)"
                            value={topPicName}
                            subtitle="paling banyak log jam"
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

                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Filter Tarikh (Date Range)</span>
                                <DatePicker.RangePicker
                                    value={timerDateRange}
                                    onChange={(dates) => {
                                        if (!dates) {
                                            setTimerDateRange([null, null]);
                                        } else {
                                            setTimerDateRange([dates[0], dates[1]]);
                                        }
                                    }}
                                    className="w-[260px] rounded-lg"
                                    placeholder={['Mula', 'Tamat']}
                                    allowClear
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

                            <div className="flex flex-col gap-1.5 pt-[18px]">
                                <Button
                                    type="primary"
                                    disabled={isExporting}
                                    loading={isExporting}
                                    icon={<FileSpreadsheet className="w-4 h-4" />}
                                    className="bg-emerald-600 border-emerald-600 hover:bg-emerald-700 font-semibold rounded-lg h-9 shadow-sm"
                                    onClick={exportAllToExcel}
                                >
                                    {isExporting ? 'Mengeksport...' : 'Muat Turun Excel'}
                                </Button>
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

                    {/* ── Estimated vs Actual Comparison ── */}
                    <Card
                        className="rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-100 mt-2"
                        variant="borderless"
                        title={
                            <div className="flex items-center gap-2 py-2">
                                <Clock className="w-5 h-5 text-indigo-600" />
                                <span className="font-extrabold text-slate-800 text-lg">Anggaran vs Masa Sebenar (Estimated vs Actual)</span>
                                <span className="text-xs font-normal text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full ml-2">
                                    {estimatedVsActualData.length} Tugasan
                                </span>
                            </div>
                        }
                    >
                        <Table
                            dataSource={estimatedVsActualData}
                            rowKey="key"
                            pagination={{ pageSize: 10 }}
                            columns={[
                                {
                                    title: 'Nama Tugasan (Task Title)',
                                    dataIndex: 'title',
                                    key: 'title',
                                    render: (text: string) => <span className="font-bold text-slate-700 text-sm">{text}</span>
                                },
                                {
                                    title: 'Pelanggan',
                                    dataIndex: 'customer_name',
                                    key: 'customer_name',
                                    render: (text: string) => <span className="text-slate-500 text-xs">{text}</span>
                                },
                                {
                                    title: 'PIC / Assignee',
                                    key: 'assignee',
                                    render: (_: any, record: any) => (
                                        <div className="flex items-center gap-2">
                                            <img
                                                src={record.assignee_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(record.assignee_name)}&background=6366f1&color=fff`}
                                                className="w-5 h-5 rounded-full"
                                                alt=""
                                            />
                                            <span className="text-xs font-semibold text-slate-700">{record.assignee_name}</span>
                                        </div>
                                    )
                                },
                                {
                                    title: 'Estimated Hours',
                                    dataIndex: 'estimatedHours',
                                    key: 'estimatedHours',
                                    render: (val: number | null) => val !== null ? <span className="font-semibold text-slate-700">{val.toFixed(1)} hrs</span> : <span className="text-slate-400 italic">—</span>
                                },
                                {
                                    title: 'Actual Hours',
                                    dataIndex: 'actualHours',
                                    key: 'actualHours',
                                    render: (val: number) => <span className="font-semibold text-slate-700">{val.toFixed(2)} hrs</span>
                                },
                                {
                                    title: 'Variance',
                                    dataIndex: 'variance',
                                    key: 'variance',
                                    render: (val: number | null) => {
                                        if (val === null) return <span className="text-slate-400 italic">—</span>;
                                        const isPositive = val >= 0;
                                        const colorClass = isPositive ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';
                                        const prefix = isPositive ? '+' : '';
                                        return (
                                            <span className={`font-bold font-mono text-xs border px-2 py-0.5 rounded-md ${colorClass}`}>
                                                {prefix}{val.toFixed(2)} hrs
                                            </span>
                                        );
                                    }
                                },
                                {
                                    title: 'Status',
                                    dataIndex: 'status',
                                    key: 'status',
                                    render: (status: string) => {
                                        if (status === 'Exceeded') {
                                            return <Tag color="error" className="rounded-full font-bold">⚠️ Exceeded</Tag>;
                                        } else if (status === 'Within Estimate') {
                                            return <Tag color="success" className="rounded-full font-bold">✓ On Track</Tag>;
                                        }
                                        return <Tag color="default" className="rounded-full font-semibold">No Estimate</Tag>;
                                    }
                                }
                            ]}
                        />
                    </Card>

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

            {activeTab === 'duration-monitor' && (
                <>
                    {/* Collapsible Settings Panel */}
                    <Collapse 
                        ghost 
                        className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden mb-6"
                        expandIconPosition="end"
                    >
                        <Collapse.Panel 
                            header={
                                <div className="flex items-center gap-2 py-1">
                                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                                    <span className="font-bold text-slate-700">Tetapan Data Quality (Data Quality Settings)</span>
                                </div>
                            } 
                            key="settings"
                        >
                            <div className="p-1 flex flex-wrap gap-6 items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 font-semibold">Had Sesi Singkat:</span>
                                    <InputNumber
                                        min={5}
                                        max={3600}
                                        value={durationThresholdSeconds}
                                        onChange={(val) => setDurationThresholdSeconds(val || 30)}
                                        addonAfter="saat"
                                        size="middle"
                                        className="w-[140px]"
                                    />
                                    <Tooltip title="Sesi kerja dengan durasi kurang daripada had ini akan dianggap sebagai ralat ketukan (accidental click).">
                                        <span className="text-xs text-slate-400 cursor-help bg-slate-50 hover:bg-slate-100 border px-2 py-1 rounded-md">?</span>
                                    </Tooltip>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 font-semibold">Had Peratusan Amaran:</span>
                                    <InputNumber
                                        min={1}
                                        max={100}
                                        value={durationThresholdPercent}
                                        onChange={(val) => setDurationThresholdPercent(val || 20)}
                                        addonAfter="%"
                                        size="middle"
                                        className="w-[130px]"
                                    />
                                    <Tooltip title="Amaran kualiti data akan dipaparkan jika peratusan sesi pendek melepasi had peratusan ini.">
                                        <span className="text-xs text-slate-400 cursor-help bg-slate-50 hover:bg-slate-100 border px-2 py-1 rounded-md">?</span>
                                    </Tooltip>
                                </div>
                            </div>
                        </Collapse.Panel>
                    </Collapse>

                    {/* Filter Card */}
                    <Card
                        className="rounded-2xl shadow-sm border border-slate-100 mb-6"
                        variant="borderless"
                    >
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                                    {/* Search Input */}
                                    <Input
                                        placeholder="Cari tajuk tugasan..."
                                        value={durationSearchInput}
                                        onChange={(e) => setDurationSearchInput(e.target.value)}
                                        className="w-full sm:w-[260px] rounded-xl"
                                        allowClear
                                        size="middle"
                                    />
                                    
                                    {/* PIC multi-select */}
                                    <Select
                                        mode="multiple"
                                        placeholder="Pilih Pekerja (PIC)"
                                        value={durationPICs}
                                        onChange={(val) => {
                                            setDurationPICs(val);
                                            setDurationPagination(prev => ({ ...prev, current: 1 }));
                                        }}
                                        maxTagCount="responsive"
                                        className="w-full sm:w-[220px]"
                                        allowClear
                                        disabled={!canDrillDown}
                                        options={filteredProfilesForDuration.map(p => ({
                                            value: p.full_name,
                                            label: p.full_name
                                        }))}
                                    />

                                    {/* Customer multi-select */}
                                    <Select
                                        mode="multiple"
                                        placeholder="Pilih Pelanggan"
                                        value={durationCustomers}
                                        onChange={(val) => {
                                            setDurationCustomers(val);
                                            setDurationPagination(prev => ({ ...prev, current: 1 }));
                                        }}
                                        maxTagCount="responsive"
                                        className="w-full sm:w-[220px]"
                                        allowClear
                                        options={filteredCustomersForDuration.map(name => ({
                                            value: name,
                                            label: name
                                        }))}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        type="primary"
                                        icon={<FileSpreadsheet className="w-4 h-4" />}
                                        onClick={exportDurationToExcel}
                                        loading={isDurationExporting}
                                        className="bg-indigo-600 hover:bg-indigo-700 border-none rounded-xl font-bold flex items-center gap-1.5 h-10"
                                    >
                                        Eksport ke Excel
                                    </Button>
                                </div>
                            </div>

                            {/* Info Helper for filter behaviors in Per Task Type mode */}
                            {durationViewMode === 'type' && (
                                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <span>
                                        <strong>Nota:</strong> Penapis Pekerja (PIC) & Pelanggan di atas bertindak ke atas sesi kerja asal sebelum proses agregasi dijalankan. Baris yang dipaparkan adalah mengikut Tajuk Tugasan sahaja.
                                    </span>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* View Switcher and Main Table Card */}
                    <Card
                        className="rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
                        variant="borderless"
                        title={
                            <div className="flex items-center justify-between flex-wrap gap-4 py-2">
                                <div className="flex items-center gap-2">
                                    <Hourglass className="w-5 h-5 text-indigo-600" />
                                    <span className="font-extrabold text-slate-800 text-lg">Prestasi Jam Tugasan</span>
                                </div>
                                <Segmented
                                    value={durationViewMode}
                                    onChange={(val) => {
                                        setDurationViewMode(val as any);
                                        setDurationSorter({ field: 'actual_hours', order: 'descend' });
                                        setDurationPagination(prev => ({ ...prev, current: 1 }));
                                    }}
                                    options={[
                                        { label: 'Per Instance (Tugasan)', value: 'instance' },
                                        { label: 'Per Task Type (Tajuk)', value: 'type' }
                                    ]}
                                    className="bg-slate-100 p-0.5 rounded-lg border border-slate-200/40"
                                />
                            </div>
                        }
                    >
                        <Table
                            dataSource={durationTableData}
                            loading={durationTableLoading}
                            rowKey={(record) => durationViewMode === 'instance' ? record.task_id : record.task_title}
                            pagination={{
                                ...durationPagination,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '25', '50', '100'],
                                className: "my-4"
                            }}
                            onChange={handleDurationTableChange}
                            size="middle"
                            locale={{ emptyText: 'Tiada rekod prestasi tugasan dikesan.' }}
                            expandable={durationViewMode === 'instance' ? {
                                expandedRowRender: renderExpandedLogsTable,
                                expandedRowKeys,
                                onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as any),
                                onExpand: (expanded, record) => {
                                    if (expanded && !expandedLogs[record.task_id]) {
                                        fetchSessionLogsForTask(record.task_id);
                                    }
                                }
                            } : undefined}
                            columns={[
                                {
                                    title: 'Tajuk Tugasan (Task Title)',
                                    dataIndex: 'task_title',
                                    key: 'task_title',
                                    sorter: true,
                                    sortOrder: durationSorter.field === 'task_title' ? durationSorter.order : null,
                                    render: (text: string, record: any) => {
                                        // Compute data quality warning flag client-side
                                        const durationsArr = (record.durations as number[]) || [];
                                        const totalSess = durationsArr.length;
                                        const shortSess = durationsArr.filter(d => d < durationThresholdSeconds).length;
                                        const warningPct = totalSess > 0 ? (shortSess / totalSess) * 100 : 0;
                                        const hasWarning = warningPct >= durationThresholdPercent;

                                        return (
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-700 text-sm max-w-[340px] break-words leading-snug">
                                                    {text}
                                                </span>
                                                {hasWarning && (
                                                    <Tooltip title={`Kualiti Data Rendah: ${shortSess} daripada ${totalSess} sesi adalah lebih singkat daripada ${durationThresholdSeconds} saat (${warningPct.toFixed(0)}%)`}>
                                                        <AlertTriangle className="w-4 h-4 text-rose-500 cursor-help flex-shrink-0 animate-pulse" />
                                                    </Tooltip>
                                                )}
                                            </div>
                                        );
                                    }
                                },
                                ...(durationViewMode === 'instance' ? [
                                    {
                                        title: 'Pelanggan',
                                        dataIndex: 'customer',
                                        key: 'customer',
                                        sorter: true,
                                        sortOrder: durationSorter.field === 'customer' ? durationSorter.order : null,
                                        render: (text: string) => <span className="text-slate-500 text-xs font-semibold">{text}</span>
                                    },
                                    {
                                        title: 'PIC / Assignee',
                                        dataIndex: 'pic_name',
                                        key: 'pic_name',
                                        sorter: true,
                                        sortOrder: durationSorter.field === 'pic_name' ? durationSorter.order : null,
                                        render: (text: string) => (
                                            <div className="flex items-center gap-2">
                                                <img
                                                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(text)}&background=6366f1&color=fff`}
                                                    className="w-5 h-5 rounded-full border border-slate-100"
                                                    alt=""
                                                />
                                                <span className="text-xs font-bold text-slate-700">{text}</span>
                                            </div>
                                        )
                                    }
                                ] : [
                                    {
                                        title: 'Bil. Pelanggan',
                                        dataIndex: 'customer_count',
                                        key: 'customer_count',
                                        sorter: true,
                                        sortOrder: durationSorter.field === 'customer_count' ? durationSorter.order : null,
                                        render: (val: number) => <span className="font-semibold text-slate-700">{val} pelanggan</span>
                                    },
                                    {
                                        title: 'Bil. Pekerja (PIC)',
                                        dataIndex: 'pic_count',
                                        key: 'pic_count',
                                        sorter: true,
                                        sortOrder: durationSorter.field === 'pic_count' ? durationSorter.order : null,
                                        render: (val: number) => <span className="font-semibold text-slate-700">{val} PIC</span>
                                    }
                                ]),
                                {
                                    title: 'Sesi Selesai',
                                    dataIndex: 'session_count',
                                    key: 'session_count',
                                    sorter: true,
                                    sortOrder: durationSorter.field === 'session_count' ? durationSorter.order : null,
                                    render: (val: number) => <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 border border-slate-100 rounded">{val} sesi</span>
                                },
                                {
                                    title: 'Masa Sebenar',
                                    dataIndex: 'actual_hours',
                                    key: 'actual_hours',
                                    sorter: true,
                                    sortOrder: durationSorter.field === 'actual_hours' ? durationSorter.order : null,
                                    render: (val: number) => <span className="font-extrabold text-slate-700 text-sm">{val.toFixed(2)} hrs</span>
                                },
                                {
                                    title: 'Anggaran Masa',
                                    dataIndex: 'estimated_hours',
                                    key: 'estimated_hours',
                                    sorter: true,
                                    sortOrder: durationSorter.field === 'estimated_hours' ? durationSorter.order : null,
                                    render: (val: number | null) => val !== null ? <span className="font-semibold text-slate-600">{val.toFixed(1)} hrs</span> : <span className="text-slate-400 italic">—</span>
                                },
                                {
                                    title: 'Varians',
                                    dataIndex: 'variance',
                                    key: 'variance',
                                    sorter: true,
                                    sortOrder: durationSorter.field === 'variance' ? durationSorter.order : null,
                                    render: (val: number | null) => {
                                        if (val === null) return <span className="text-slate-400 italic">—</span>;
                                        const isPositive = val >= 0;
                                        const colorClass = isPositive ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';
                                        const prefix = isPositive ? '+' : '';
                                        return (
                                            <span className={`font-bold font-mono text-xs border px-2 py-0.5 rounded-md ${colorClass}`}>
                                                {prefix}{val.toFixed(2)} hrs
                                            </span>
                                        );
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

