'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { differenceInDays } from 'date-fns';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

export default function BottleneckAlertBanner() {
    const [count, setCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        // Check session dismissal
        const wasDismissed = sessionStorage.getItem('bottleneck-banner-dismissed') === 'true';
        if (wasDismissed) { setDismissed(true); return; }

        const fetchCount = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data } = await supabase
                    .from('tsk_tasks')
                    .select('id, created_at, status')
                    .eq('assignee_id', user.id)
                    .neq('status', 'DONE');

                if (!data) return;
                const now = new Date();
                const n = data.filter(t => differenceInDays(now, new Date(t.created_at)) >= 3).length;
                setCount(n);
            } catch { /* silently fail */ }
        };

        fetchCount();

        const channel = supabase
            .channel('banner-bottleneck')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchCount)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const handleDismiss = () => {
        sessionStorage.setItem('bottleneck-banner-dismissed', 'true');
        setDismissed(true);
    };

    if (dismissed || count === 0) return null;

    return (
        <div className="relative flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 print:hidden animate-in slide-in-from-top-2 duration-300">
            {/* Pulsing dot */}
            <span className="relative flex h-3 w-3 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>

            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />

            <p className="text-sm font-semibold text-amber-800 flex-1">
                ⚠️ Awak ada{' '}
                <span className="font-black text-amber-900 underline decoration-dotted">
                    {count} task bottleneck
                </span>{' '}
                yang belum siap lebih dari 3 hari.
            </p>

            <Link
                href="/mytasks"
                className="flex-shrink-0 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors px-3 py-1.5 rounded-lg shadow-sm"
            >
                Lihat Sekarang →
            </Link>

            <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 rounded-full text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
                aria-label="Tutup notifikasi"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
