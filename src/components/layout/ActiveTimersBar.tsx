'use client';

import React, { useState, useEffect } from 'react';
import { Button } from 'antd';
import { ClockCircleOutlined, DownOutlined, UpOutlined, PauseOutlined } from '@ant-design/icons';
import { useTimer } from '@/components/task/TimerProvider';

function ActiveTimerRow({ log, stopTimer }: { log: any; stopTimer: (taskId: string) => Promise<void> }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const calculateElapsed = () => {
            const start = new Date(log.start_time).getTime();
            const now = new Date().getTime();
            return Math.max(0, Math.round((now - start) / 1000));
        };

        setElapsed(calculateElapsed());

        const interval = setInterval(() => {
            setElapsed(calculateElapsed());
        }, 1000);

        return () => clearInterval(interval);
    }, [log.start_time]);

    const formatTime = (totalSeconds: number) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center justify-between py-2.5 px-4 bg-slate-900/60 border border-indigo-900/40 rounded-xl hover:bg-slate-900/90 transition-all duration-200 shadow-sm">
            <div className="flex flex-col gap-0.5 max-w-[65%]">
                <span className="font-semibold text-sm text-indigo-100 truncate block" title={log.task?.title}>
                    {log.task?.title || 'Tugasan Tanpa Tajuk'}
                </span>
                {log.task?.customer_name && (
                    <span className="text-[11px] text-indigo-300/80 truncate block" title={log.task.customer_name}>
                        🏢 {log.task.customer_name}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
                    {formatTime(elapsed)}
                </div>
                <Button 
                    type="primary" 
                    danger 
                    size="small"
                    shape="round" 
                    icon={<PauseOutlined className="text-xs" />} 
                    onClick={() => stopTimer(log.task_id)}
                    className="flex items-center gap-1 text-[11px] font-bold h-7 px-3 bg-rose-600 hover:bg-rose-500 border-none shadow-sm hover:scale-105 transition-all"
                >
                    Stop
                </Button>
            </div>
        </div>
    );
}

export default function ActiveTimersBar() {
    const { activeLogs, stopTimer } = useTimer();
    const [isExpanded, setIsExpanded] = useState(false);

    if (activeLogs.length === 0) return null;

    return (
        <div className="w-full flex flex-col bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-800/80 shadow-md print:hidden transition-all duration-300 z-50">
            <div className="flex items-center justify-between px-4 py-2 sm:px-6">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <ClockCircleOutlined className="text-indigo-300 text-base flex-shrink-0 animate-pulse" />
                    <p className="text-xs sm:text-sm font-medium text-indigo-100">
                        Anda mempunyai <span className="font-bold text-emerald-400">{activeLogs.length}</span> timer task yang sedang berjalan.
                    </p>
                </div>
                <Button
                    type="text"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-indigo-200 hover:text-white hover:bg-white/10 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 h-8 rounded-lg"
                >
                    {isExpanded ? 'Tutup Senarai' : 'Lihat Senarai'}
                    {isExpanded ? <UpOutlined className="text-[10px]" /> : <DownOutlined className="text-[10px]" />}
                </Button>
            </div>

            {isExpanded && (
                <div className="px-4 pb-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-in slide-in-from-top-2 duration-200">
                    {activeLogs.map((log) => (
                        <ActiveTimerRow key={log.id} log={log} stopTimer={stopTimer} />
                    ))}
                </div>
            )}
        </div>
    );
}
