'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Modal, Button, Radio, DatePicker, Space, Typography, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
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
}

const TimerContext = createContext<TimerContextType>({
    activeLog: null,
    loading: true,
    startTimer: async () => {},
    stopTimer: async () => {},
    refreshTimerData: async () => {},
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

    return (
        <TimerContext.Provider value={{ activeLog, loading, startTimer, stopTimer, refreshTimerData }}>
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
        </TimerContext.Provider>
    );
}
