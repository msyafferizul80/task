'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Card, Select, Button, DatePicker, message, Spin, Table, Tag, Input, Typography, Divider } from 'antd';
import { PrinterOutlined, CopyOutlined, SendOutlined, PlaySquareOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task } from '@/lib/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// Extended Task type for local edit
interface ReportTask extends Task {
    reportNota?: string;
}

export default function WeeklyReportPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<{ full_name: string; department: string } | null>(null);

    // Filters
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);

    // Data
    const [reportTasks, setReportTasks] = useState<ReportTask[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [sendingTelegram, setSendingTelegram] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const supabase = createClient();

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch customers
                const { data: customerData, error: customerError } = await supabase.from('tsk_customers').select('id, name').eq('status', 'active').order('name');
                if (customerError && customerError.code !== '42P01') throw customerError;
                setCustomers(customerData || []);

                // Fetch current logged-in user profile
                const { data: authData } = await supabase.auth.getUser();
                if (authData?.user) {
                    const { data: profile } = await supabase
                        .from('lv_profiles')
                        .select('full_name, department')
                        .eq('id', authData.user.id)
                        .single();
                    if (profile) {
                        setCurrentUser({
                            full_name: profile.full_name || '',
                            department: profile.department || 'Syazna World HR Operations',
                        });
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const handleGeneratePreview = async () => {
        if (!selectedCustomer) {
            return message.warning('Sila pilih Customer untuk jana report.');
        }

        setIsGenerating(true);
        try {
            let query = supabase.from('tsk_tasks').select(`
                *,
                assignee:lv_profiles!tsk_tasks_assignee_id_fkey ( id, full_name )
            `)
            .eq('customer_name', selectedCustomer)
            .eq('is_internal', false)
            .order('created_at', { ascending: false });

            if (dateRange[0] && dateRange[1]) {
                // Approximate filtering, assuming creating or due inside the range 
                // Or we can just filter all in client for simplicity if data is small
            }

            const { data, error } = await query;
            if (error) throw error;

            let tasks = (data as Task[] || []);

            // Client side date filtering to be safe on timezone
            if (dateRange[0] && dateRange[1]) {
                const start = dateRange[0].startOf('day');
                const end = dateRange[1].endOf('day');
                const taskIds = tasks.map(t => t.id);

                let historyLogs: any[] = [];
                let timeLogs: any[] = [];

                if (taskIds.length > 0) {
                    const [historyRes, timeRes] = await Promise.all([
                        supabase
                            .from('tsk_task_history')
                            .select('task_id, new_status, created_at')
                            .in('task_id', taskIds)
                            .gte('created_at', start.toISOString())
                            .lte('created_at', end.toISOString()),
                        supabase
                            .from('tsk_time_logs')
                            .select('task_id')
                            .in('task_id', taskIds)
                            .gte('start_time', start.toISOString())
                            .lte('start_time', end.toISOString())
                    ]);
                    historyLogs = historyRes.data || [];
                    timeLogs = timeRes.data || [];
                }

                const historyTaskIds = new Set(historyLogs.map(h => h.task_id));
                const timeLogTaskIds = new Set(timeLogs.map(t => t.task_id));
                const completedTaskIds = new Set(
                    historyLogs
                        .filter(h => h.new_status === 'DONE')
                        .map(h => h.task_id)
                );

                tasks = tasks.filter(t => {
                    const createdDate = dayjs(t.created_at);
                    const dueDate = t.due_date ? dayjs(t.due_date) : null;

                    const isCreatedInRange = !createdDate.isBefore(start) && !createdDate.isAfter(end);
                    const isDueInRange = dueDate && !dueDate.isBefore(start) && !dueDate.isAfter(end);

                    if (t.status === 'DONE') {
                        // For completed tasks: include if completed in range (via history), or created in range
                        const isCompletedInRange = completedTaskIds.has(t.id);
                        return isCreatedInRange || isCompletedInRange;
                    } else {
                        // For ongoing tasks: include if created/due in range, or has history/time log activity in range,
                        // or if it is currently actively in progress (IN_PROGRESS, REVIEW, CLIENT_HOLD)
                        const hasActivity = historyTaskIds.has(t.id) || timeLogTaskIds.has(t.id);
                        const isCurrentlyActive = t.status === 'IN_PROGRESS' || t.status === 'REVIEW' || t.status === 'CLIENT_HOLD';
                        
                        return isCreatedInRange || isDueInRange || hasActivity || isCurrentlyActive;
                    }
                });
            }

            const rTasks = tasks.map(t => ({
                ...t,
                reportNota: t.description || ''
            }));

            setReportTasks(rTasks);
            setPreviewMode(true);
        } catch (err: any) {
            console.error(err);
            message.error('Gagal menjana preview.');
        } finally {
            setIsGenerating(false);
        }
    };


    // Calculate Summaries
    const completedTasks = reportTasks.filter(t => t.status === 'DONE');
    const ongoingTasks = reportTasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'REVIEW' || t.status === 'CLIENT_HOLD' || t.status === 'BACKLOG');
    const totalHandled = reportTasks.length;

    // Calculate PIC Performance
    const picPerformance = reportTasks.reduce((acc, task) => {
        const picName = task.assignee?.full_name || 'Unassigned';
        if (!acc[picName]) acc[picName] = { total: 0, done: 0 };
        acc[picName].total += 1;
        if (task.status === 'DONE') acc[picName].done += 1;
        return acc;
    }, {} as Record<string, { total: number, done: number }>);

    // Calculate Customer Summary specific for this report data
    const customerSummary = reportTasks.reduce((acc, task) => {
        const cName = task.customer_name || 'No Customer';
        if (!acc[cName]) {
            acc[cName] = { total: 0, completed: 0, pending: 0, overdue: 0 };
        }
        acc[cName].total += 1;
        
        if (task.status === 'DONE') {
            acc[cName].completed += 1;
        } else {
            acc[cName].pending += 1;
            if (task.due_date && dayjs(task.due_date).isBefore(dayjs())) {
                acc[cName].overdue += 1;
            }
        }
        return acc;
    }, {} as Record<string, { total: number, completed: number, pending: number, overdue: number }>);
    
    // Convert to array and sort descending by total tasks
    const customerSummaryArray = Object.entries(customerSummary)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.total - a.total);


    const handleCopyWhatsApp = () => {
        if (!selectedCustomer) return;
        const startDate = dateRange[0] ? dateRange[0].format('DD/MM/YYYY') : 'N/A';
        const endDate = dateRange[1] ? dateRange[1].format('DD/MM/YYYY') : 'N/A';

        let text = `*Weekly HR Services Progress Report*\n`;
        text += `🏢 *Customer:* ${selectedCustomer}\n`;
        text += `📅 *Period:* ${startDate} - ${endDate}\n\n`;

        text += `*Executive Summary:*\n`;
        text += `Total Tasks Handled: ${totalHandled}\n`;
        text += `Tasks Completed: ${completedTasks.length}\n`;
        text += `Ongoing Tasks: ${ongoingTasks.length}\n\n`;

        if (completedTasks.length > 0) {
            text += `✅ *Section A: Completed Tasks*\n`;
            completedTasks.forEach((t, i) => {
                text += `${i + 1}. ${t.title}\n   Nota: ${t.reportNota || '-'}\n   PIC: ${t.assignee?.full_name || '-'}\n`;
            });
            text += `\n`;
        }

        if (ongoingTasks.length > 0) {
            text += `🔄 *Section B: Ongoing & Upcoming Tasks*\n`;
            ongoingTasks.forEach((t, i) => {
                text += `${i + 1}. ${t.title} [${t.status}]\n   Target Due: ${t.due_date ? dayjs(t.due_date).format('DD/MM/YYYY') : '-'}\n   PIC: ${t.assignee?.full_name || '-'}\n`;
            });
        }

        navigator.clipboard.writeText(text).then(() => {
            message.success('Report copied to clipboard untuk WhatsApp!');
        }).catch(() => {
            message.error('Gagal copy ke clipboard.');
        });
    };

    const handleSendTelegram = async () => {
        setSendingTelegram(true);
        try {
            const startDate = dateRange[0] ? dateRange[0].format('DD/MM/YYYY') : 'N/A';
            const endDate = dateRange[1] ? dateRange[1].format('DD/MM/YYYY') : 'N/A';

            const msg = `📊 <b>Weekly Report Generated!</b>\n\n<b>Customer:</b> ${selectedCustomer}\n<b>Period:</b> ${startDate} - ${endDate}\n\n<b>Summary:</b>\n✅ Completed: ${completedTasks.length}\n🔄 Ongoing: ${ongoingTasks.length}\n📋 Total: ${totalHandled}\n\n<i>Generated via Syazna-OS</i>`;

            const res = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Error');

            message.success('Telegram Notification sent to Boss!');
        } catch (err: any) {
            console.error(err);
            message.warning(`Telegram API err: ${err.message}. Pastikan TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID ada dalam .env.local`, 8);
        } finally {
            setSendingTelegram(false);
        }
    };

    const handlePrint = () => {
        const originalTitle = document.title;
        const start = dateRange[0] ? dateRange[0].format('DD-MM-YYYY') : '';
        const end = dateRange[1] ? dateRange[1].format('DD-MM-YYYY') : '';
        const periodStr = start && end ? `${start}_${end}` : '';
        const safeCustomerName = selectedCustomer ? selectedCustomer.replace(/[\\/:*?"<>|]/g, '') : 'Report';
        
        document.title = periodStr ? `${safeCustomerName}_${periodStr}` : safeCustomerName;
        
        window.print();
        
        setTimeout(() => {
            document.title = originalTitle;
        }, 1000);
    };

    if (loading) return <div className="flex justify-center items-center h-[calc(100vh-100px)]"><Spin size="large" /></div>;

    const startDateStr = dateRange[0] ? dateRange[0].format('DD/MM/YYYY') : '-';
    const endDateStr = dateRange[1] ? dateRange[1].format('DD/MM/YYYY') : '-';

    return (
        <div className="flex flex-col gap-6 font-sans">
            {/* Control Panel (Hidden on Print) */}
            <div className="bg-white/80 p-6 rounded-2xl shadow-sm border border-slate-100 print:hidden">
                <Title level={2} className="!text-indigo-900 !mb-2 mt-0">Weekly Reports</Title>
                <Text type="secondary" className="text-base mb-6 block">Jana dan print laporan mingguan untuk pelanggan.</Text>

                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="w-full sm:w-64">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Pilih Customer</label>
                        <Select
                            placeholder="Semua Customer"
                            value={selectedCustomer || undefined}
                            onChange={val => { setSelectedCustomer(val); setPreviewMode(false); }}
                            showSearch
                            size="large"
                            className="w-full"
                        >
                            {customers.map(c => (
                                <Option key={c.id} value={c.name}>{c.name}</Option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-full sm:flex-1 sm:min-w-[280px]">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Julat Tarikh (Reporting Period)</label>
                        {isMobile ? (
                            <div className="flex gap-2">
                                <DatePicker
                                    size="large"
                                    className="flex-1"
                                    placeholder="Start date"
                                    value={dateRange[0]}
                                    placement="bottomLeft"
                                    onChange={(date) => {
                                        setDateRange([date, dateRange[1]]);
                                        setPreviewMode(false);
                                    }}
                                />
                                <DatePicker
                                    size="large"
                                    className="flex-1"
                                    placeholder="End date"
                                    value={dateRange[1]}
                                    placement="bottomLeft"
                                    disabledDate={(current) =>
                                        dateRange[0] ? current.isBefore(dateRange[0], 'day') : false
                                    }
                                    onChange={(date) => {
                                        setDateRange([dateRange[0], date]);
                                        setPreviewMode(false);
                                    }}
                                />
                            </div>
                        ) : (
                            <RangePicker
                                size="large"
                                className="w-full"
                                onChange={(dates) => { setDateRange(dates as any); setPreviewMode(false); }}
                            />
                        )}
                    </div>
                    <div className="w-full sm:w-auto">
                        <Button
                            type="primary"
                            size="large"
                            icon={<PlaySquareOutlined />}
                            onClick={handleGeneratePreview}
                            loading={isGenerating}
                            className="bg-indigo-600 shadow-md w-full sm:w-auto"
                        >
                            Jana Preview
                        </Button>
                    </div>
                </div>

                {previewMode && (
                    <div className="mt-4 flex flex-wrap gap-3 justify-end border-t pt-4">
                        <Button size="large" icon={<CopyOutlined />} onClick={handleCopyWhatsApp} className="border-green-600 text-green-600 hover:bg-green-50 flex-1 sm:flex-none">
                            Copy for WhatsApp
                        </Button>
                        <Button size="large" icon={<SendOutlined />} onClick={handleSendTelegram} loading={sendingTelegram} className="border-blue-500 text-blue-500 hover:bg-blue-50 flex-1 sm:flex-none">
                            Notify Boss (Telegram)
                        </Button>
                        <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={handlePrint} className="bg-slate-800 w-full sm:w-auto">
                            Print / Save PDF
                        </Button>
                    </div>
                )}
            </div>

            {/* Report Layout (Visible on Print) */}
            {previewMode && (
                <div className="print-container bg-white p-10 print:p-0 rounded-2xl shadow-md border border-slate-200 print:shadow-none print:border-none mx-auto max-w-[210mm] w-full min-h-[297mm]">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8 print:border-black">
                        <div className="flex items-center gap-4">
                            <img
                                src="/logo.png"
                                alt="Syazna World Logo"
                                className="h-16 w-auto object-contain print:h-14"
                            />
                            <div className="hidden">
                                <h1 className="text-3xl font-black text-slate-900 m-0 tracking-tight uppercase">SYAZNA WORLD</h1>
                                <p className="text-slate-500 font-medium tracking-widest text-sm mt-1 uppercase">Professional HR Services</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-indigo-700 m-0 print:text-black">Weekly Progress Report</h2>
                            <div className="mt-2 text-sm text-slate-600">
                                <p className="mb-0"><span className="font-semibold text-slate-800">Customer:</span> {selectedCustomer}</p>
                                <p className="mb-0"><span className="font-semibold text-slate-800">Period:</span> {startDateStr} - {endDateStr}</p>
                            </div>
                        </div>
                    </div>

                    {/* Executive Summary */}
                    <h3 className="text-lg font-bold text-slate-800 mb-4 bg-slate-50 p-2 border-l-4 border-indigo-600 print:border-black">Executive Summary</h3>
                    <div className="grid grid-cols-3 gap-6 mb-10">
                        <div className="bg-white border rounded-xl p-5 text-center shadow-sm">
                            <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Total Tasks Handled</p>
                            <span className="text-4xl font-black text-slate-800">{totalHandled}</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center print:border-black">
                            <p className="text-emerald-700 font-bold text-xs uppercase tracking-wider mb-2">Tasks Completed</p>
                            <span className="text-4xl font-black text-emerald-600">{completedTasks.length}</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-center print:border-black">
                            <p className="text-amber-700 font-bold text-xs uppercase tracking-wider mb-2">Ongoing Tasks</p>
                            <span className="text-4xl font-black text-amber-600">{ongoingTasks.length}</span>
                        </div>
                    </div>

                    {/* PIC Performance Overview */}
                    <div className="mb-8">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">PIC Performance Overview</h4>
                        <div className="flex flex-wrap gap-4">
                            {Object.entries(picPerformance).map(([name, stats]) => (
                                <div key={name} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-3">
                                    <span className="font-semibold text-slate-700">{name}</span>
                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                        {stats.done} / {stats.total} Done
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Customer Task Summary */}
                    <div className="mb-10 page-break-avoid">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 bg-slate-50 p-2 border-l-4 border-indigo-600 print:border-black">Customer Task Summary</h3>
                        {customerSummaryArray.length === 0 ? (
                            <p className="text-slate-500 italic">Tiada data pelanggan untuk laporan ini.</p>
                        ) : (
                            <table className="w-full text-left border-collapse border border-slate-200 print:border-black">
                                <thead>
                                    <tr className="bg-slate-100 border-y border-slate-300 print:border-black">
                                        <th className="py-2.5 px-4 font-bold text-sm text-slate-700 border-r border-slate-200 print:border-black w-2/5">Customer Name</th>
                                        <th className="py-2.5 px-4 font-bold text-sm text-slate-700 border-r border-slate-200 print:border-black text-center">Total Tasks</th>
                                        <th className="py-2.5 px-4 font-bold text-sm text-slate-700 border-r border-slate-200 print:border-black text-center">Pending Active</th>
                                        <th className="py-2.5 px-4 font-bold text-sm text-slate-700 text-center">Completed (DONE)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerSummaryArray.map((c, idx) => {
                                        const percent = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                                        return (
                                            <tr key={c.name} className="border-b border-slate-200 hover:bg-slate-50 align-middle print:border-black">
                                                <td className="py-2 px-4 font-semibold text-slate-800 border-r border-slate-200 print:border-black">{c.name}</td>
                                                <td className="py-2 px-4 text-center font-bold text-slate-800 border-r border-slate-200 print:border-black text-lg">{c.total}</td>
                                                <td className="py-2 px-4 text-center border-r border-slate-200 print:border-black">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className="font-semibold text-indigo-600 print:text-black">{c.pending} task</span>
                                                        {c.overdue > 0 && (
                                                            <span className="text-[10px] text-red-500 font-bold mt-0.5 print:text-black">⚠️ {c.overdue} OVERDUE</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2 px-4 text-center print:border-black">
                                                    <span className="font-semibold text-emerald-600 print:text-black">{c.completed} task</span>
                                                    <span className="text-[10px] text-slate-400 font-bold ml-1 print:text-black">({percent}%)</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Section A: Completed Tasks */}
                    <div className="mb-10 page-break-avoid">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 bg-emerald-50 p-2 border-l-4 border-emerald-500 print:border-black">Section A: Completed Tasks (The Wins)</h3>
                        {completedTasks.length === 0 ? (
                            <p className="text-slate-500 italic">No tasks marked as done during this period.</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 border-y border-slate-300">
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700 w-1/4">Task Title</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700 w-2/4">Description (Nota)</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700">Completed Date</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700">PIC (Assignee)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {completedTasks.map((t, idx) => (
                                        <tr key={t.id} className="border-b border-slate-200 hover:bg-slate-50 align-top">
                                            <td className="py-4 px-4 font-semibold text-slate-800">{t.title}</td>
                                            <td className="py-4 px-4 text-slate-600 text-sm whitespace-pre-wrap">
                                                {/* Edit mode visible on screen, raw text visible on print */}
                                                <div className="text-slate-600 italic">
                                                    {t.reportNota || '-'}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-slate-700 text-sm">
                                                {t.updated_at
                                                    ? dayjs(t.updated_at).format('DD/MM/YYYY')
                                                    : '-'}
                                            </td>
                                            <td className="py-4 px-4 text-slate-700 font-medium text-sm">{t.assignee?.full_name || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Section B: Ongoing & Upcoming */}
                    <div className="mb-10 page-break-avoid">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 bg-amber-50 p-2 border-l-4 border-amber-500 print:border-black">Section B: Ongoing & Upcoming Tasks (The Plan)</h3>
                        {ongoingTasks.length === 0 ? (
                            <p className="text-slate-500 italic">No ongoing tasks found.</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 border-y border-slate-300">
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700 w-1/4">Task Title</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700 w-2/5">Description (Nota)</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700">Status</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700">Target Due Date</th>
                                        <th className="py-3 px-4 font-bold text-sm text-slate-700">PIC (Assignee)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ongoingTasks.map((t, idx) => (
                                        <tr key={t.id} className="border-b border-slate-200 hover:bg-slate-50 align-top">
                                            <td className="py-4 px-4 font-semibold text-slate-800">
                                                {t.title}
                                            </td>
                                            <td className="py-4 px-4 text-slate-600 text-sm whitespace-pre-wrap">
                                                {/* Edit mode visible on screen, raw text visible on print */}
                                                <div className="text-slate-600 italic">
                                                    {t.reportNota || '-'}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-slate-700">
                                                <span className={`px-2 py-1 rounded-md text-xs font-bold print:border print:border-black ${
                                                    t.status === 'REVIEW'
                                                        ? 'bg-orange-100 text-orange-700'
                                                        : t.status === 'CLIENT_HOLD'
                                                            ? 'bg-fuchsia-100 text-fuchsia-700'
                                                            : t.status === 'BACKLOG'
                                                                ? 'bg-gray-100 text-gray-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-slate-700 text-sm">{t.due_date ? dayjs(t.due_date).format('DD/MM/YYYY') : 'TBA'}</td>
                                            <td className="py-4 px-4 text-slate-700 font-medium text-sm">{t.assignee?.full_name || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-16 pt-6 border-t border-slate-200 print:border-black flex justify-between items-center text-sm text-slate-500 page-break-avoid">
                        <div>
                            <p className="font-bold text-slate-700 print:text-black mb-1">Prepared By:</p>
                            <p className="print:text-black">{currentUser?.full_name || '-'}</p>
                            <p className="print:text-black">{currentUser?.department || 'Syazna World HR Operations'}</p>
                        </div>
                        <div className="text-right">
                            <p className="mb-1 italic print:text-black">Generated via Syazna-OS Task Management</p>
                            <p className="print:text-black">Date Generated: {dayjs().format('DD/MM/YYYY HH:mm')}</p>
                            {/* Browser will usually append page numbering on the bottom corner natively when printing */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
