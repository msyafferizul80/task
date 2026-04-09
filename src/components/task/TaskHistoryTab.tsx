'use client';
import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { EscalationLog } from '@/lib/types';
import { Spin, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';

interface TaskHistoryTabProps {
    taskId: string | undefined;
}

export default function TaskHistoryTab({ taskId }: TaskHistoryTabProps) {
    const [logs, setLogs] = useState<EscalationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const fetchLogs = async () => {
        if (!taskId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('tsk_escalation_logs')
            .select(`
                *,
                from_user:lv_profiles!fk_from_user(full_name),
                to_user:lv_profiles!fk_to_user(full_name)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            setLogs(data as any);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, [taskId]);

    if (loading) return <div className="py-8 flex justify-center"><Spin /></div>;

    if (logs.length === 0) {
        return <div className="py-8 text-center text-slate-400 italic">Tiada rekod eskalasi untuk task ini.</div>;
    }

    return (
        <div className="py-4 px-2">
            <Typography.Title level={5} className="mb-6 !text-slate-700">🔄 Escalation History</Typography.Title>
            <Timeline
                items={logs.map((log, idx) => ({
                    color: idx === 0 ? 'orange' : 'gray',
                    children: (
                        <div className="text-sm">
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-semibold text-slate-800">
                                    {log.from_user?.full_name} ➔ <span className="text-orange-600">{log.to_user?.full_name}</span>
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    {dayjs(log.created_at).format('DD MMM YYYY, HH:mm')}
                                </span>
                            </div>
                            <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg text-slate-700 mt-2 shadow-sm">
                                <span className="font-semibold text-xs text-orange-800/60 uppercase tracking-widest block mb-1">Escalation Reason:</span>
                                {log.reason}
                                {log.task_description && (
                                    <div className="mt-3 pt-3 border-t border-orange-200/50">
                                        <span className="font-semibold text-xs text-orange-800/60 uppercase tracking-widest block mb-1">PIC Notes at Handover:</span>
                                        <div className="whitespace-pre-wrap italic text-slate-600">
                                            {log.task_description}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }))}
            />
        </div>
    );
}
