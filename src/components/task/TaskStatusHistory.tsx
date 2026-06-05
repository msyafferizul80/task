'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TaskHistory, TaskStatus } from '@/lib/types';
import { Spin, Timeline, Typography, Table, Button, Tooltip } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useTimer } from '@/components/task/TimerProvider';
import dayjs from 'dayjs';

interface TaskStatusHistoryProps {
    taskId: string | undefined;
    currentStatus: TaskStatus;
    taskCreatedAt: string;
}

const { Title, Text } = Typography;

export default function TaskStatusHistory({ taskId, currentStatus, taskCreatedAt }: TaskStatusHistoryProps) {
    const [history, setHistory] = useState<TaskHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    // Timer context integration
    const { activeLogs, startTimer, stopTimer } = useTimer();
    const activeLogForTask = activeLogs.find(log => log.task_id === taskId);
    const isCurrentActive = !!activeLogForTask;
    const [elapsed, setElapsed] = useState(0);

    // Live ticking elapsed time for active log
    useEffect(() => {
        if (!isCurrentActive || !activeLogForTask) {
            setElapsed(0);
            return;
        }

        const calculateElapsed = () => {
            const start = new Date(activeLogForTask.start_time).getTime();
            const now = new Date().getTime();
            return Math.max(0, Math.round((now - start) / 1000));
        };

        setElapsed(calculateElapsed());

        const interval = setInterval(() => {
            setElapsed(calculateElapsed());
        }, 1000);

        return () => clearInterval(interval);
    }, [isCurrentActive, activeLogForTask]);

    const formatTime = (totalSeconds: number) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const fetchHistory = async () => {
        if (!taskId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('tsk_task_history')
            .select(`
                *,
                changed_by_user:lv_profiles!tsk_task_history_changed_by_fkey(full_name, avatar_url)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });
        
        if (!error && data) {
            setHistory(data as any);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchHistory();
    }, [taskId, currentStatus]);

    const getStatusColor = (status: TaskStatus) => {
        switch (status) {
            case 'DONE': return 'green';
            case 'IN_PROGRESS': return 'blue';
            case 'REVIEW': return 'orange';
            case 'BACKLOG': return 'gray';
            case 'CLIENT_HOLD': return 'magenta';
            default: return 'gray';
        }
    };

    const formatDuration = (seconds: number) => {
        if (seconds <= 0) return '-';
        const days = Math.floor(seconds / (24 * 3600));
        const remainingSecondsAfterDays = seconds % (24 * 3600);
        const hours = Math.floor(remainingSecondsAfterDays / 3600);
        const minutes = Math.floor((remainingSecondsAfterDays % 3600) / 60);
        const secs = remainingSecondsAfterDays % 60;
        
        const parts = [];
        if (days > 0) {
            parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
        }
        if (hours > 0) {
            parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
        } 
        if (minutes > 0) {
            parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
        }
        if (secs > 0 || parts.length === 0) {
            parts.push(`${secs} ${secs === 1 ? 'Second' : 'Seconds'}`);
        }
        
        if (parts.length === 1) {
            return parts[0];
        } else if (parts.length === 2) {
            return `${parts[0]}, ${parts[1]}`;
        } else {
            return parts.slice(0, -1).join(', ') + ', ' + parts[parts.length - 1];
        }
    };

    const calculateDurationFromDates = (startDate: string, endDate: string): number => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const durationMs = end.getTime() - start.getTime();
        const durationSecs = Math.floor(durationMs / 1000);
        return durationSecs > 0 ? durationSecs : 0;
    };

    const isTaskDone = currentStatus === 'DONE';

    const calculateTimeSummary = () => {
        const statusTimes: Record<TaskStatus, number> = {
            BACKLOG: 0,
            CLIENT_HOLD: 0,
            IN_PROGRESS: 0,
            REVIEW: 0,
            DONE: 0
        };

        history.forEach((h) => {
            if (h.status_before && h.status_before_entered_at) {
                const duration = calculateDurationFromDates(h.status_before_entered_at, h.created_at);
                statusTimes[h.status_before] += duration;
            }
        });

        if (!isTaskDone) {
            const lastStatus = currentStatus;
            const lastStatusEnteredAt = history.length > 0 && history[history.length - 1].created_at
                ? history[history.length - 1].created_at
                : taskCreatedAt;
            const now = new Date();
            const currentDuration = calculateDurationFromDates(lastStatusEnteredAt, now.toISOString());
            statusTimes[lastStatus] += currentDuration;
        }

        const summary = Object.entries(statusTimes)
            .filter(([status, seconds]) => seconds > 0 && status !== 'DONE')
            .map(([status, seconds]) => ({
                status: status as TaskStatus,
                totalSeconds: seconds,
                formatted: formatDuration(seconds)
            }));

        return summary;
    };

    const calculateActiveTimeTotal = () => {
        const statusTimes: Record<TaskStatus, number> = {
            BACKLOG: 0,
            CLIENT_HOLD: 0,
            IN_PROGRESS: 0,
            REVIEW: 0,
            DONE: 0
        };

        history.forEach((h) => {
            if (h.status_before && h.status_before_entered_at) {
                const duration = calculateDurationFromDates(h.status_before_entered_at, h.created_at);
                statusTimes[h.status_before] += duration;
            }
        });

        if (!isTaskDone) {
            const lastStatus = currentStatus;
            const lastStatusEnteredAt = history.length > 0 && history[history.length - 1].created_at
                ? history[history.length - 1].created_at
                : taskCreatedAt;
            const now = new Date();
            const currentDuration = calculateDurationFromDates(lastStatusEnteredAt, now.toISOString());
            statusTimes[lastStatus] += currentDuration;
        }

        const totalActiveSeconds = statusTimes.IN_PROGRESS + statusTimes.REVIEW;
        return {
            totalSeconds: totalActiveSeconds,
            formatted: formatDuration(totalActiveSeconds)
        };
    };

    const timeSummary = calculateTimeSummary();
    const activeTimeTotal = calculateActiveTimeTotal();

    const timelineItems = history.map((item) => {
        let durationSeconds = 0;
        if (item.status_before && item.status_before_entered_at) {
            durationSeconds = calculateDurationFromDates(item.status_before_entered_at, item.created_at);
        }

        return {
            color: getStatusColor(item.new_status),
            children: (
                <div className="text-sm">
                    <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-slate-800">
                            {item.status_before ? (
                                <span className="text-slate-500">{item.status_before}</span>
                            ) : (
                                <span className="text-slate-400">New Task</span>
                            )}
                            <span className="mx-2 text-slate-300">➔</span>
                            <span className={`text-${getStatusColor(item.new_status)}-600 font-bold`}>
                                {item.new_status}
                            </span>
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                            {dayjs(item.created_at).format('DD MMM YYYY, HH:mm')}
                        </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg text-slate-600 mt-2">
                        {item.changed_by_user?.full_name && (
                            <div className="flex items-center gap-2">
                                <img
                                    src={item.changed_by_user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.changed_by_user.full_name)}&background=6366f1&color=fff`}
                                    className="w-5 h-5 rounded-full"
                                    alt={item.changed_by_user.full_name}
                                />
                                <span className="text-xs">Changed by: {item.changed_by_user.full_name}</span>
                            </div>
                        )}
                        {item.status_before && durationSeconds > 0 && (
                            <div className="mt-1 text-xs text-slate-500">
                                Time in {item.status_before}: {formatDuration(durationSeconds)}
                            </div>
                        )}
                    </div>
                </div>
            )
        };
    });

    const summaryColumns = [
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: TaskStatus) => (
                <span className={`font-semibold text-${getStatusColor(status)}-600`}>
                    {status}
                </span>
            )
        },
        {
            title: 'Total Time Spent',
            dataIndex: 'formatted',
            key: 'formatted',
            render: (text: string) => <Text strong className="text-slate-700">{text}</Text>
        }
    ];

    const getStatusColorClasses = (status: TaskStatus) => {
        switch (status) {
            case 'DONE': return 'bg-green-50 border-green-200 text-green-800';
            case 'IN_PROGRESS': return 'bg-blue-50 border-blue-200 text-blue-800';
            case 'REVIEW': return 'bg-orange-50 border-orange-200 text-orange-800';
            case 'BACKLOG': return 'bg-gray-50 border-gray-200 text-gray-800';
            case 'CLIENT_HOLD': return 'bg-pink-50 border-pink-200 text-pink-800';
            default: return 'bg-gray-50 border-gray-200 text-gray-800';
        }
    };

    const getStatusTextColor = (status: TaskStatus) => {
        switch (status) {
            case 'DONE': return 'text-green-700';
            case 'IN_PROGRESS': return 'text-blue-700';
            case 'REVIEW': return 'text-orange-700';
            case 'BACKLOG': return 'text-gray-700';
            case 'CLIENT_HOLD': return 'text-pink-700';
            default: return 'text-gray-700';
        }
    };

    const renderTimerControls = () => {
        if (!taskId) return null;
        if (currentStatus === 'DONE') return null;

        return (
            <div className={`mb-4 p-4 rounded-xl border flex items-center justify-between transition-all ${
                isCurrentActive 
                    ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100 shadow-sm' 
                    : 'bg-slate-50 border-slate-200'
            }`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isCurrentActive ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-200 text-slate-500'}`}>
                        <ClockCircleOutlined className="text-lg" />
                    </div>
                    <div>
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            {isCurrentActive ? 'Active Tracker' : 'Task Timer'}
                        </Text>
                        <Text className={`font-mono text-base ${isCurrentActive ? 'text-indigo-600 font-bold' : 'text-slate-600 font-medium'}`}>
                            {isCurrentActive ? formatTime(elapsed) : '00:00:00'}
                        </Text>
                    </div>
                </div>

                <div>
                    {isCurrentActive ? (
                        <Button
                            type="primary"
                            danger
                            icon={<PauseCircleOutlined />}
                            onClick={() => stopTimer(taskId)}
                            className="bg-rose-600 hover:bg-rose-700 shadow-sm flex items-center gap-1.5 h-10 rounded-lg px-4 font-semibold"
                        >
                            Stop Timer
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            onClick={() => startTimer(taskId)}
                            className="bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 h-10 rounded-lg px-4 font-semibold"
                        >
                            Start Timer
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    if (loading) return <div className="py-8 flex justify-center"><Spin /></div>;

    const effectiveStatus = isTaskDone ? 'DONE' : currentStatus;
    const colorClasses = getStatusColorClasses(effectiveStatus);
    const textColorClass = getStatusTextColor(effectiveStatus);

    return (
        <div className="py-4 px-2 flex flex-col" style={{ maxHeight: '770px' }}>
            <div className="mb-2">
                <Title level={5} className="!text-slate-700">📊 Task Status Timeline</Title>
            </div>
            
            {renderTimerControls()}

            <div className="flex-1 overflow-y-auto">
                {history.length === 0 ? (
                    <div className="py-4 text-center text-slate-400 italic">No record found for this task.</div>
                ) : (
                    <Timeline items={timelineItems} />
                )}
            </div>
            <div className="border-t border-slate-200 pt-3 mt-3 flex-shrink-0">
                {activeTimeTotal.totalSeconds > 0 && (
                    <div className={`mb-3 p-2 ${colorClasses} border rounded-lg`}>
                        <div className="font-bold mb-1">
                            ⏱️ {isTaskDone ? 'Total Worked On Time' : 'Total Active Time'} (IN_PROGRESS + REVIEW)
                        </div>
                        <div className={`text-lg font-bold ${textColorClass}`}>
                            {activeTimeTotal.formatted}
                        </div>
                    </div>
                )}

                <Title level={5} className="!text-slate-600 !mb-2">⏱️ Time Spent in Each Status</Title>
                {timeSummary.length > 0 ? (
                    <Table
                        columns={summaryColumns}
                        dataSource={timeSummary}
                        rowKey="status"
                        pagination={false}
                        size="small"
                        className="border border-slate-100 rounded-lg overflow-hidden"
                    />
                ) : (
                    <div className="text-center text-slate-400 italic py-3">No time data available.</div>
                )}
            </div>
        </div>
    );
}
