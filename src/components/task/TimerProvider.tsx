'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Modal, Button, Radio, DatePicker, Space, Typography, message, Input, InputNumber } from 'antd';
import { ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { TimeLog } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;

interface TimerContextType {
    activeLog: TimeLog | null;
    loading: boolean;
    startTimer: (taskId: string) => Promise<void>;
    stopTimer: (taskId: string, customEndTime?: Date) => Promise<void>;
    refreshTimerData: () => Promise<void>;
    handleStatusChange: (taskId: string, newStatus: string, onProceed: () => Promise<void>) => Promise<void>;
}

const TimerContext = createContext<TimerContextType>({
    activeLog: null,
    loading: true,
    startTimer: async () => {},
    stopTimer: async () => {},
    refreshTimerData: async () => {},
    handleStatusChange: async () => {},
});

export const useTimer = () => useContext(TimerContext);

export default function TimerProvider({ children }: { children: React.ReactNode }) {
    const supabase = createClient();
    const { userId } = useRole();

    const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
    const [loading, setLoading] = useState(true);

    // Forgotten Timer Modal States
    const [showForgottenModal, setShowForgottenModal] = useState(false);
    const [forgottenLog, setForgottenLog] = useState<TimeLog | null>(null);
    const [resolutionOption, setResolutionOption] = useState<'save_standard' | 'save_custom' | 'discard' | 'keep'>('save_standard');
    const [customEndTime, setCustomEndTime] = useState<dayjs.Dayjs | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [ignoredForgottenLogIds, setIgnoredForgottenLogIds] = useState<string[]>([]);

    // Manual Log Modal States (Enforcing time logs before DONE)
    const [showManualLogModal, setShowManualLogModal] = useState(false);
    const [manualDuration, setManualDuration] = useState<number | null>(1.0);
    const [manualReason, setManualReason] = useState<string>('');
    const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
    const [pendingOnProceed, setPendingOnProceed] = useState<(() => Promise<void>) | null>(null);
    const [isSubmittingManualLog, setIsSubmittingManualLog] = useState(false);

    // Fetch active log
    const refreshTimerData = useCallback(async () => {
        if (!userId) {
            setActiveLog(null);
            setLoading(false);
            return;
        }

        try {
            // Fetch active timer for current user
            const { data: activeData, error: activeErr } = await supabase
                .from('tsk_time_logs')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'RUNNING')
                .maybeSingle();

            if (activeErr) throw activeErr;
            setActiveLog(activeData as TimeLog || null);
        } catch (err: any) {
            console.error('Error fetching active timer:', err.message);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Check for forgotten timers
    useEffect(() => {
        if (activeLog && !ignoredForgottenLogIds.includes(activeLog.id)) {
            const startTime = new Date(activeLog.start_time);
            const now = new Date();
            const isDifferentDay = startTime.toDateString() !== now.toDateString();
            const isOver12Hours = (now.getTime() - startTime.getTime()) > (12 * 60 * 60 * 1000);

            if (isDifferentDay || isOver12Hours) {
                setForgottenLog(activeLog);
                setResolutionOption('save_standard');
                // Set default custom stop time to start_time + 8 hours, capped at now
                const standardEnd = dayjs(startTime).add(8, 'hour');
                setCustomEndTime(standardEnd.isAfter(dayjs()) ? dayjs() : standardEnd);
                setShowForgottenModal(true);
            }
        }
    }, [activeLog, ignoredForgottenLogIds]);

    // Subscribe to realtime database changes on tsk_time_logs
    useEffect(() => {
        if (!userId) return;

        refreshTimerData();

        const channel = supabase
            .channel('realtime-time-logs')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tsk_time_logs'
            }, () => {
                refreshTimerData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, refreshTimerData]);

    const startTimer = async (taskId: string) => {
        if (!userId) {
            message.error('You must be logged in to log time.');
            return;
        }

        try {
            // 1. If there's an active timer running, stop it first
            if (activeLog) {
                if (activeLog.task_id === taskId) {
                    // Already running on this task
                    return;
                }
                const nowStr = new Date().toISOString();
                const duration = Math.max(0, Math.round((new Date(nowStr).getTime() - new Date(activeLog.start_time).getTime()) / 1000));
                
                const { error: stopErr } = await supabase
                    .from('tsk_time_logs')
                    .update({
                        end_time: nowStr,
                        duration,
                        status: 'COMPLETED'
                    })
                    .eq('id', activeLog.id);

                if (stopErr) throw stopErr;
            }

            // 2. Start the new timer
            const { error: startErr } = await supabase
                .from('tsk_time_logs')
                .insert({
                    task_id: taskId,
                    user_id: userId,
                    status: 'RUNNING'
                });

            if (startErr) throw startErr;
            message.success('Timer started for task.');
            await refreshTimerData();
        } catch (err: any) {
            console.error('Error starting timer:', err.message);
            message.error('Failed to start timer');
        }
    };

    const stopTimer = async (taskId: string, customEndTimeVal?: Date) => {
        if (!activeLog || activeLog.task_id !== taskId) return;

        try {
            const stopTime = customEndTimeVal || new Date();
            const duration = Math.max(0, Math.round((stopTime.getTime() - new Date(activeLog.start_time).getTime()) / 1000));

            const { error } = await supabase
                .from('tsk_time_logs')
                .update({
                    end_time: stopTime.toISOString(),
                    duration,
                    status: 'COMPLETED'
                })
                .eq('id', activeLog.id);

            if (error) throw error;
            message.success('Timer stopped. Time log saved.');
            await refreshTimerData();
        } catch (err: any) {
            console.error('Error stopping timer:', err.message);
            message.error('Failed to stop timer');
        }
    };

    const handleResolveForgottenTimer = async () => {
        if (!forgottenLog) return;
        setIsResolving(true);

        try {
            const startTime = new Date(forgottenLog.start_time);
            
            if (resolutionOption === 'keep') {
                setIgnoredForgottenLogIds(prev => [...prev, forgottenLog.id]);
                setShowForgottenModal(false);
                setForgottenLog(null);
                message.info('Timer kept running.');
            } else if (resolutionOption === 'discard') {
                const { error } = await supabase
                    .from('tsk_time_logs')
                    .delete()
                    .eq('id', forgottenLog.id);

                if (error) throw error;
                setShowForgottenModal(false);
                setForgottenLog(null);
                message.success('Forgotten session discarded.');
                await refreshTimerData();
            } else {
                let stopTime = new Date();
                if (resolutionOption === 'save_standard') {
                    stopTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000);
                    if (stopTime > new Date()) stopTime = new Date();
                } else if (resolutionOption === 'save_custom' && customEndTime) {
                    stopTime = customEndTime.toDate();
                }

                if (stopTime <= startTime) {
                    message.error('End time must be after the start time.');
                    setIsResolving(false);
                    return;
                }

                const duration = Math.round((stopTime.getTime() - startTime.getTime()) / 1000);

                const { error } = await supabase
                    .from('tsk_time_logs')
                    .update({
                        end_time: stopTime.toISOString(),
                        duration,
                        status: 'COMPLETED'
                    })
                    .eq('id', forgottenLog.id);

                if (error) throw error;
                setShowForgottenModal(false);
                setForgottenLog(null);
                message.success('Forgotten session completed and saved.');
                await refreshTimerData();
            }
        } catch (err: any) {
            console.error('Error resolving forgotten timer:', err.message);
            message.error('Failed to resolve timer');
        } finally {
            setIsResolving(false);
        }
    };

    const handleSubmitManualLog = async () => {
        if (!userId || !pendingTaskId || !pendingOnProceed) return;
        if (!manualDuration || manualDuration <= 0) {
            message.error('Sila masukkan tempoh masa yang sah.');
            return;
        }
        if (!manualReason || manualReason.trim().length < 5) {
            message.error('Sila isi sebab dengan sekurang-kurangnya 5 aksara.');
            return;
        }

        setIsSubmittingManualLog(true);

        try {
            // Save manual log into database
            const durationSeconds = Math.round(manualDuration * 3600);
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - durationSeconds * 1000);

            const { error: insertErr } = await supabase
                .from('tsk_time_logs')
                .insert({
                    task_id: pendingTaskId,
                    user_id: userId,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    duration: durationSeconds,
                    status: 'COMPLETED',
                    is_manual: true,
                    note: manualReason.trim()
                });

            if (insertErr) throw insertErr;

            message.success('Log masa manual berjaya disimpan.');
            
            // Proceed with the task status update to DONE
            await pendingOnProceed();

            // Reset states
            setShowManualLogModal(false);
            setPendingTaskId(null);
            setPendingOnProceed(null);
            await refreshTimerData();
        } catch (err: any) {
            console.error('Error saving manual log:', err.message);
            message.error('Gagal menyimpan log masa manual.');
        } finally {
            setIsSubmittingManualLog(false);
        }
    };

    const handleStartTimerFromModal = async () => {
        if (!pendingTaskId) return;
        await startTimer(pendingTaskId);
        setShowManualLogModal(false);
        setPendingTaskId(null);
        setPendingOnProceed(null);
    };

    const handleStatusChange = async (taskId: string, newStatus: string, onProceed: () => Promise<void>) => {
        if (!userId) {
            await onProceed();
            return;
        }

        try {
            if (newStatus === 'IN_PROGRESS') {
                // Auto-start timer on status changed to IN_PROGRESS
                if (!activeLog || activeLog.task_id !== taskId) {
                    await startTimer(taskId);
                }
                await onProceed();
            } else if (newStatus === 'DONE') {
                const hasActiveLogOnThisTask = activeLog && activeLog.task_id === taskId;

                // Stop the active timer if it's on this task
                if (hasActiveLogOnThisTask) {
                    await stopTimer(taskId);
                }

                // Check if there are completed logs (including manual ones) for this task by this user
                const { count, error: countErr } = await supabase
                    .from('tsk_time_logs')
                    .select('id', { count: 'exact', head: true })
                    .eq('task_id', taskId)
                    .eq('user_id', userId)
                    .eq('status', 'COMPLETED');

                if (countErr) throw countErr;

                // Also check if we just stopped an active log on this task
                const hasAnyLoggedTime = (count && count > 0) || hasActiveLogOnThisTask;

                if (hasAnyLoggedTime) {
                    await onProceed();
                } else {
                    setPendingTaskId(taskId);
                    setPendingOnProceed(() => onProceed);
                    setManualDuration(1.0);
                    setManualReason('');
                    setShowManualLogModal(true);
                }
            } else {
                await onProceed();
            }
        } catch (err: any) {
            console.error('Error handling status change:', err.message);
            await onProceed(); // Fallback so status can still be updated
        }
    };

    return (
        <TimerContext.Provider value={{ activeLog, loading, startTimer, stopTimer, refreshTimerData, handleStatusChange }}>
            {children}

            {/* Forgotten Timer Modal */}
            <Modal
                title={
                    <div className="flex items-center gap-2 text-amber-600 font-semibold text-lg border-b pb-2">
                        <ExclamationCircleOutlined className="text-xl" />
                        <span>Sesi Timer Tergantung Dikesan</span>
                    </div>
                }
                open={showForgottenModal}
                closable={false}
                maskClosable={false}
                footer={[
                    <Button 
                        key="submit" 
                        type="primary" 
                        loading={isResolving}
                        onClick={handleResolveForgottenTimer}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 rounded-lg font-medium"
                    >
                        Selesaikan Sesi
                    </Button>
                ]}
                width={500}
                centered
            >
                <div className="py-4 flex flex-col gap-4 font-sans">
                    <Paragraph className="text-slate-600">
                        Anda mempunyai timer yang masih berjalan sejak{' '}
                        <Text strong className="text-slate-900">
                            {forgottenLog ? new Date(forgottenLog.start_time).toLocaleString() : ''}
                        </Text>
                        . Sila pilih tindakan untuk menyelesaikan sesi ini:
                    </Paragraph>

                    <Radio.Group 
                        value={resolutionOption} 
                        onChange={(e) => setResolutionOption(e.target.value)}
                        className="flex flex-col gap-3 w-full"
                    >
                        <Radio value="save_standard" className="border border-slate-100 p-3 rounded-xl hover:bg-slate-50 transition-colors w-full flex items-start">
                            <div className="ml-2">
                                <Text strong className="block text-slate-800">Simpan 8 Jam Bekerja (Standard)</Text>
                                <Text type="secondary" className="text-xs">Tetapkan tamat selepas 8 jam dari waktu mula.</Text>
                            </div>
                        </Radio>
                        
                        <Radio value="save_custom" className="border border-slate-100 p-3 rounded-xl hover:bg-slate-50 transition-colors w-full flex items-start">
                            <div className="ml-2 w-full">
                                <Text strong className="block text-slate-800">Simpan dengan Waktu Kustom</Text>
                                <Text type="secondary" className="text-xs block mb-2">Pilih waktu tamat tugasan secara manual.</Text>
                                {resolutionOption === 'save_custom' && (
                                    <DatePicker
                                        showTime
                                        format="DD/MM/YYYY HH:mm"
                                        value={customEndTime}
                                        onChange={(val) => setCustomEndTime(val)}
                                        className="w-full h-10 mt-1"
                                        placeholder="Pilih Tarikh & Masa Tamat"
                                        disabledDate={(current) => current && current.isAfter(dayjs())}
                                    />
                                )}
                            </div>
                        </Radio>

                        <Radio value="discard" className="border border-slate-100 p-3 rounded-xl hover:bg-slate-50 transition-colors w-full flex items-start">
                            <div className="ml-2">
                                <Text strong className="block text-rose-600">Padam Sesi (Discard)</Text>
                                <Text type="secondary" className="text-xs">Padam rekod masa ini, tiada jam akan dikira.</Text>
                            </div>
                        </Radio>

                        <Radio value="keep" className="border border-slate-100 p-3 rounded-xl hover:bg-slate-50 transition-colors w-full flex items-start">
                            <div className="ml-2">
                                <Text strong className="block text-slate-800">Biarkan Berjalan</Text>
                                <Text type="secondary" className="text-xs">Teruskan timer dan abaikan amaran ini buat masa sekarang.</Text>
                            </div>
                        </Radio>
                    </Radio.Group>
                </div>
            </Modal>

            {/* Manual Log Enforcer Modal */}
            <Modal
                title={
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg border-b pb-2">
                        <ClockCircleOutlined className="text-xl" />
                        <span>Sila Rekod Jam Kerja Tugasan</span>
                    </div>
                }
                open={showManualLogModal}
                closable={false}
                maskClosable={false}
                footer={[
                    <Button 
                        key="cancel" 
                        onClick={() => {
                            setShowManualLogModal(false);
                            setPendingTaskId(null);
                            setPendingOnProceed(null);
                        }}
                        disabled={isSubmittingManualLog}
                        className="rounded-lg font-medium"
                    >
                        Batal
                    </Button>,
                    <Button 
                        key="start" 
                        onClick={handleStartTimerFromModal}
                        disabled={isSubmittingManualLog}
                        className="rounded-lg font-medium border-indigo-300 text-indigo-600 hover:text-indigo-700 hover:border-indigo-400"
                    >
                        Mula Timer Sekarang
                    </Button>,
                    <Button 
                        key="submit" 
                        type="primary" 
                        loading={isSubmittingManualLog}
                        onClick={handleSubmitManualLog}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 rounded-lg font-medium"
                    >
                        Simpan Log & Selesaikan Task
                    </Button>
                ]}
                width={500}
                centered
            >
                <div className="py-4 flex flex-col gap-4 font-sans">
                    <Paragraph className="text-slate-600">
                        Tugasan ini tidak mempunyai sebarang rekod jam kerja. Sila masukkan tempoh masa dan sebab secara manual untuk menandakannya sebagai selesai:
                    </Paragraph>

                    <div className="flex flex-col gap-1">
                        <Text strong className="text-xs text-slate-500 uppercase tracking-wider mb-1">Tempoh Masa Bekerja (Jam)</Text>
                        <InputNumber
                            min={0.1}
                            max={24}
                            step={0.5}
                            value={manualDuration}
                            onChange={(val) => setManualDuration(val)}
                            className="w-full h-10 flex items-center rounded-lg"
                            placeholder="Contoh: 1.5"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <Text strong className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sebab Merekod Secara Manual</Text>
                        <Input.TextArea
                            rows={3}
                            value={manualReason}
                            onChange={(e) => setManualReason(e.target.value)}
                            className="rounded-lg"
                            placeholder="Sila nyatakan sebab log manual (contoh: Lupa mulakan timer, tugasan luar site, tugasan lama sebelum sistem timer diperkenalkan)"
                            minLength={5}
                        />
                        <Text type="secondary" className="text-[11px]">Minimum 5 aksara diperlukan.</Text>
                    </div>
                </div>
            </Modal>
        </TimerContext.Provider>
    );
}
