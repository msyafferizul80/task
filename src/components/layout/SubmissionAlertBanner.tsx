'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, List, Modal, Typography } from 'antd';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { Inbox, X } from 'lucide-react';
import { useRole } from '@/components/layout/RoleProvider';

interface Submission {
    id: number;
    reference_number: string;
    title: string;
    description: string | null;
    priority: 'Low' | 'Medium' | 'High';
    status: string;
    created_at: string;
}

export default function SubmissionAlertBanner() {
    const SHOW_BANNER = true; // Set to true to enable
    const ALLOW_DISMISS = false; // Set to true to show close button

    const [count, setCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const supabase = createClient();
    const submissionsRef = useRef<Submission[]>([]);
    const { role } = useRole();

    const handleDismiss = () => {
        sessionStorage.setItem('submission-banner-dismissed', 'true');
        setDismissed(true);
    };

    useEffect(() => {
        const wasDismissed = sessionStorage.getItem('submission-banner-dismissed') === 'true';
        setDismissed(wasDismissed);

        const fetchSubmissions = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Fetch unarchived submissions
                const { data } = await supabase
                    .from('tsk_submissions')
                    .select('id, reference_number, title, description, priority, status, created_at')
                    .eq('archived', false)
                    .order('created_at', { ascending: false });

                if (!data) return;
                submissionsRef.current = data as Submission[];
                setSubmissions(data as Submission[]);
                setCount(data.length);
            } catch { /* silently fail */ }
        };

        fetchSubmissions();

        const channel = supabase
            .channel('banner-submissions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_submissions' }, fetchSubmissions)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const shouldShowBanner = SHOW_BANNER && !dismissed && count > 0 && (role === 'admin' || role === 'manager');

    const submissionsForDisplay = useMemo(() => {
        return [...submissions];
    }, [submissions]);

    return (
        <>
            {shouldShowBanner && (
                <div className="relative flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-200 print:hidden animate-in slide-in-from-top-2 duration-300">
                    <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
                    </span>

                    <Inbox className="h-4 w-4 text-indigo-600 flex-shrink-0" />

                    <p className="text-sm font-semibold text-indigo-800 flex-1">
                        You have{' '}
                        <span className="font-black text-indigo-900 underline decoration-dotted">
                            {count} unarchived submission{count > 1 ? 's' : ''}
                        </span>.
                    </p>

                    <Link
                        href="/submissions"
                        className="flex-shrink-0 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors px-3 py-1.5 rounded-lg shadow-sm"
                    >
                        Go to Submissions →
                    </Link>

                    {ALLOW_DISMISS && (
                        <button
                            onClick={handleDismiss}
                            className="flex-shrink-0 p-1 rounded-full text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
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
