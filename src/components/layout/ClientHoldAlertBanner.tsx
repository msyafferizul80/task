'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, List, Modal, Typography } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { differenceInDays } from 'date-fns';
import Link from 'next/link';
import { PauseCircle, X } from 'lucide-react';
import { Task } from '@/lib/types';

export default function ClientHoldAlertBanner() {
    const SHOW_BANNER = true; 
    const ALLOW_DISMISS = false; 
    
    const [count, setCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [clientHoldTasks, setClientHoldTasks] = useState<Task[]>([]);
    const supabase = createClient();
    const tasksRef = useRef<Task[]>([]);

    const handleDismiss = () => {
        sessionStorage.setItem('client-hold-banner-dismissed', 'true');
        setDismissed(true);
    };

    useEffect(() => {
        const wasDismissed = sessionStorage.getItem('client-hold-banner-dismissed') === 'true';
        setDismissed(wasDismissed);

        const fetchClientHoldTasks = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data } = await supabase
                    .from('tsk_tasks')
                    .select('id, title, description, created_at, status, due_date, customer_name')
                    .eq('assignee_id', user.id)
                    .eq('status', 'CLIENT_HOLD');

                if (!data) return;
                tasksRef.current = data as Task[];
                setClientHoldTasks(data as Task[]);
                setCount(data.length);
            } catch { /* silently fail */ }
        };

        fetchClientHoldTasks();

        const channel = supabase
            .channel('banner-client-hold')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchClientHoldTasks)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const shouldShowBanner = SHOW_BANNER && !dismissed && count > 0;

    const tasksForDisplay = useMemo(() => {
        return [...clientHoldTasks].sort((a, b) => {
            if (!a.due_date && !b.due_date) {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
    }, [clientHoldTasks]);

    return (
        <>
            {shouldShowBanner && (
                <div className="relative flex items-center gap-3 px-4 py-3 bg-fuchsia-50 border-b border-fuchsia-200 print:hidden animate-in slide-in-from-top-2 duration-300">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500" />
                    </span>

                    <PauseCircle className="h-4 w-4 text-fuchsia-600 flex-shrink-0" />

                    <p className="text-sm font-semibold text-fuchsia-800 flex-1">
                        {`You have `}
                        <span className="font-black text-fuchsia-900 underline decoration-dotted">
                            {count} task on Client Hold. 
                        </span>
                        {`     `}
                    </p>

                    <Link
                        href="/client-hold-tasks"
                        className="flex-shrink-0 text-xs font-bold text-white bg-fuchsia-500 hover:bg-fuchsia-600 transition-colors px-3 py-1.5 rounded-lg shadow-sm"
                    >
                        Go to Client Hold Tasks →
                    </Link>

                    {ALLOW_DISMISS && (
                        <button
                            onClick={handleDismiss}
                            className="flex-shrink-0 p-1 rounded-full text-fuchsia-500 hover:text-fuchsia-700 hover:bg-fuchsia-100 transition-colors"
                            aria-label="Tutup notifikasi"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
