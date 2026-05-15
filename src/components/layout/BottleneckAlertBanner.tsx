'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, List, Modal, Typography } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { differenceInDays } from 'date-fns';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import { Task } from '@/lib/types';

export default function BottleneckAlertBanner() {
    const SHOW_BANNER = true; // Set to true to enable
    const ALLOW_DISMISS = false; // Set to true to show close button
    
    const MINUTES  = 30;                        // set the popup interval in minutes here
    const HOUR_MS = MINUTES  * 60 * 1000;
    const POPUP_LAST_SHOWN_KEY = 'bottleneck-popup-last-shown-at';

    const [count, setCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [bottleneckTasks, setBottleneckTasks] = useState<Task[]>([]);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const supabase = createClient();
    const timeoutRef = useRef<number | null>(null);
    const tasksRef = useRef<Task[]>([]);

    const clearTimer = () => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const getLastShownAt = () => {
        if (typeof window === 'undefined') return 0;
        const raw = window.localStorage.getItem(POPUP_LAST_SHOWN_KEY);
        const n = raw ? Number(raw) : 0;
        return Number.isFinite(n) ? n : 0;
    };

    const setLastShownAt = (value: number) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(POPUP_LAST_SHOWN_KEY, String(value));
    };

    const schedulePopup = () => {
        clearTimer();

        const tasks = tasksRef.current;
        if (tasks.length === 0) {
            setIsPopupOpen(false);
            return;
        }

        const lastShownAt = getLastShownAt();
        const elapsed = Date.now() - lastShownAt;

        if (elapsed >= HOUR_MS) {
            setIsPopupOpen(true);
            setLastShownAt(Date.now());
            timeoutRef.current = window.setTimeout(schedulePopup, HOUR_MS);
            return;
        }

        timeoutRef.current = window.setTimeout(schedulePopup, HOUR_MS - elapsed);
    };

    useEffect(() => {
        const wasDismissed = sessionStorage.getItem('bottleneck-banner-dismissed') === 'true';
        setDismissed(wasDismissed);

        const fetchBottleneckTasks = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data } = await supabase
                    .from('tsk_tasks')
                    .select('id, title, description, created_at, status, due_date, customer_name')
                    .eq('assignee_id', user.id)
                    .not('status', 'in', '("DONE","CLIENT_HOLD")');

                if (!data) return;
                const now = new Date();
                const tasks = (data as Task[]).filter(t => differenceInDays(now, new Date(t.created_at)) >= 3);  // >= 3); 
                tasksRef.current = tasks;
                setBottleneckTasks(tasks);
                setCount(tasks.length);
                schedulePopup();
            } catch { /* silently fail */ }
        };

        fetchBottleneckTasks();

        const channel = supabase
            .channel('banner-bottleneck')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchBottleneckTasks)
            .subscribe();

        return () => {
            clearTimer();
            supabase.removeChannel(channel);
        };
    }, []);

    const handleDismiss = () => {
        sessionStorage.setItem('bottleneck-banner-dismissed', 'true');
        setDismissed(true);
    };

    const shouldShowBanner = SHOW_BANNER && !dismissed && count > 0;

    const tasksForDisplay = useMemo(() => {
        return [...bottleneckTasks].sort((a, b) => {
            if (!a.due_date && !b.due_date) {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
    }, [bottleneckTasks]);

    return (
        <>
            {shouldShowBanner && (
                <div className="relative flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 print:hidden animate-in slide-in-from-top-2 duration-300">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                    </span>

                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />

                    <p className="text-sm font-semibold text-amber-800 flex-1">
                        You have{' '}
                        {/* Awak ada{' '} */}
                        <span className="font-black text-amber-900 underline decoration-dotted">
                            {count} task bottleneck
                        </span>{' '}
                        that are not done for more than 3 days.
                        {/* yang belum siap lebih dari 3 hari. */}
                    </p>

                    <Link
                        href="/mytasks"
                        className="flex-shrink-0 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors px-3 py-1.5 rounded-lg shadow-sm"
                    >
                        Go to My Tasks →
                        {/* Lihat Sekarang → */}
                    </Link>

                    {ALLOW_DISMISS && (
                        <button
                            onClick={handleDismiss}
                            className="flex-shrink-0 p-1 rounded-full text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
                            aria-label="Tutup notifikasi"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            )}

            <Modal
                title="Task Bottleneck Reminder"
                open={SHOW_BANNER && isPopupOpen}
                onCancel={() => setIsPopupOpen(false)}
                footer={[
                    <Link key="mytasks" href="/mytasks">
                        <Button type="primary">Go to My Tasks</Button>
                    </Link>,
                    <Button key="close" onClick={() => setIsPopupOpen(false)}>Close</Button>,
                ]}
                width={720}
            >
                <Typography.Paragraph>
                    You have {count} task(s) assigned to you that are not done for more than 3 days. This reminder repeats hourly until the task is finished.
                </Typography.Paragraph>

                <List
                    dataSource={tasksForDisplay}
                    bordered
                    locale={{ emptyText: 'No bottleneck tasks found.' }}
                    renderItem={(t) => {
                        const ageDays = differenceInDays(new Date(), new Date(t.created_at));
                        const dueDays = t.due_date ? differenceInDays(new Date(t.due_date), new Date()) : null;
                        return (
                            <List.Item>
                                <div className="w-full">
                                    <div className="flex items-start justify-between gap-3">
                                        <Typography.Text strong>{t.title}</Typography.Text>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">
                                                Bottleneck: {ageDays}d
                                            </span>
                                            {dueDays !== null && (
                                                <span className={`text-xs font-semibold ${dueDays <= 3 ? 'text-rose-600' : 'text-slate-600'} whitespace-nowrap`}>
                                                    Due Date in: {dueDays}d
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {t.customer_name && (
                                        <Typography.Text type="secondary" className="text-sm">
                                            {t.customer_name}
                                        </Typography.Text>
                                    )}
                                    {t.description && (
                                        <div className="mt-1">
                                            <Typography.Text className="text-sm">{t.description}</Typography.Text>
                                        </div>
                                    )}
                                </div>
                            </List.Item>
                        );
                    }}
                />
            </Modal>
        </>
    );
}
