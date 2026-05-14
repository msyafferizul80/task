'use client';

import React, { useState } from 'react';
import { Modal, Form, Select, Input, Button, message, Switch, Tooltip } from 'antd';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile, TaskStatus } from '@/lib/types';

const { Option } = Select;
const { TextArea } = Input;

interface EscalateModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | null;
    profiles: Profile[];
    currentUserId: string | null;
    currentTaskDescription?: string | null;
    nextStatus?: TaskStatus;
    onSuccess: () => void;
}

export default function EscalateModal({ isOpen, onClose, task, profiles, currentUserId, currentTaskDescription, nextStatus = 'BACKLOG', onSuccess }: EscalateModalProps) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [escalateEnabled, setEscalateEnabled] = useState(true);
    const supabase = createClient();

    const handleAutoDraft = async () => {
        if (!task) return;
        setGeneratingAI(true);
        try {
            const res = await fetch('/api/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title: task.title, 
                    description: currentTaskDescription,
                    reason: form.getFieldValue('reason') || 'Sila lihat description untuk butiran lanjut.'
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.escalation_summary) {
                    form.setFieldsValue({ reason: data.escalation_summary });
                    message.success('🤖 AI Draft Generated');
                }
            }
        } catch (e) {
            message.error('Failed to generate draft parameter.');
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleDoNothing = async () => {
        if (!task) return;
        
        setLoading(true);
        try {
            // Just update status to REVIEW without escalating
            const { error: taskError } = await supabase
                .from('tsk_tasks')
                .update({ 
                    status: nextStatus, 
                    updated_at: new Date().toISOString(),
                    description: currentTaskDescription
                })
                .eq('id', task.id);

            if (taskError) throw taskError;

            message.success('Task status updated to Review!');
            form.resetFields();
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Error updating status:', error.message);
            message.error('Failed to update task status: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEscalate = async (values: any) => {
        if (!task || !currentUserId) return;
        
        setLoading(true);
        try {
            const { to_user_id, reason } = values;

            // 1. Update task
            const { error: taskError } = await supabase
                .from('tsk_tasks')
                .update({ 
                    assignee_id: to_user_id,
                    is_escalated: true,
                    status: nextStatus, 
                    updated_at: new Date().toISOString(),
                    description: currentTaskDescription
                })
                .eq('id', task.id);

            if (taskError) throw taskError;

            // 2. Insert log
            const fromUserId = task.assignee_id || currentUserId;
            
            const { error: logError } = await supabase
                .from('tsk_escalation_logs')
                .insert([{
                    task_id: task.id,
                    from_user_id: fromUserId,
                    to_user_id: to_user_id,
                    reason: reason,
                    task_description: currentTaskDescription
                }]);

            if (logError) throw logError;

            // 3. Send Telegram notification
            const currentPic = profiles.find(p => p.id === fromUserId);
            const newPic = profiles.find(p => p.id === to_user_id);
            const msg = `🚩 <b>TASK ESCALATION ALERT</b>\n\n<b>Customer:</b> ${task.customer_name || '-'}\n<b>Task:</b> ${task.title}\n<b>Transferred By:</b> ${currentPic?.full_name || 'System'}\n<b>Transferred To:</b> ${newPic?.full_name || 'Unknown'}\n<b>Reason:</b>\n"${reason}"\n\n🔗 Open System: https://workspace.syazna.com/`;

            try {
                await fetch('/api/telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });
            } catch (tgErr) {
                console.error("Telegram error:", tgErr);
                message.warning("Task escalated but failed to send Telegram notification");
            }

            message.success('Task escalated successfully!');
            form.resetFields();
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Escalation error:', error.message);
            message.error('Failed to escalate task: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={<div className="font-bold text-lg mb-2 text-orange-600 flex items-center gap-2">{nextStatus === 'REVIEW' ? '🧾 Submit for Review' : '🚩 Escalate Task'}</div>}
            open={isOpen}
            onCancel={() => {
                form.resetFields();
                setEscalateEnabled(true);
                onClose();
            }}
            footer={null}
            destroyOnHidden
        >
            {nextStatus === 'REVIEW' ? (
                <div className="mb-6 text-sm text-slate-500 bg-orange-50 p-3 rounded-lg border border-orange-100">
                    Hantar task <strong>{task?.title}</strong> kepada reviewer. Status akan menjadi <strong>Review</strong> selepas dihantar.
                </div>
            ) : (
                <div className="mb-6 text-sm text-slate-500 bg-orange-50 p-3 rounded-lg border border-orange-100">
                    Pindahkan tanggungjawab task <strong>{task?.title}</strong> kepada PIC baru. Notifikasi akan dihantar ke dalam group Telegram.
                </div>
            )}

            {nextStatus === 'REVIEW' && (
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Tooltip title="When ON: Escalate the task to another staff. When OFF: Just mark as Review without escalating.">
                            <span className="text-sm text-slate-700 cursor-help flex items-center gap-1">
                                Escalate task
                                <span className="text-slate-400 text-xs font-bold bg-slate-100 rounded-full w-4 h-4 flex items-center justify-center cursor-help">?</span>
                            </span>
                        </Tooltip>
                        <Tooltip title={escalateEnabled ? "Escalate to another staff" : "Just mark as Review"}>
                            <Switch 
                                checked={escalateEnabled} 
                                onChange={setEscalateEnabled} 
                            />
                        </Tooltip>
                    </div>
                </div>
            )}

            {(nextStatus !== 'REVIEW' || escalateEnabled) && (
                <Form layout="vertical" form={form} onFinish={handleEscalate}>
                    <Form.Item 
                        name="to_user_id" 
                        label="New PIC / Assignee" 
                        rules={[{ required: true, message: 'Please select a new PIC' }]}
                    >
                        <Select placeholder="Select next person in charge" size="large" showSearch optionFilterProp="children">
                            {profiles.filter(p => p.id !== currentUserId).map(p => (
                                <Option key={p.id} value={p.id}>{p.full_name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item 
                        name="reason" 
                        label={
                            <div className="flex items-center justify-between w-full">
                                <span>Reason for Escalation</span>
                                <Button type="text" size="small" onClick={handleAutoDraft} loading={generatingAI} className="text-indigo-600 font-medium bg-indigo-50 hover:bg-indigo-100 rounded-md py-0 px-2" style={{ marginLeft: 'auto' }}>
                                    ✨ AI Auto Draft
                                </Button>
                            </div>
                        }
                        rules={[{ required: true, message: 'Please provide a reason' }]}
                    >
                        <TextArea rows={4} placeholder="Contoh: Calculation siap, perlu review oleh manager..." />
                    </Form.Item>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button onClick={onClose} disabled={loading} size="large">Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={loading} className="bg-orange-500 hover:bg-orange-600 border-none shadow-md" size="large">
                            Confirm Escalate
                        </Button>
                    </div>
                </Form>
            )}

            {nextStatus === 'REVIEW' && !escalateEnabled && (
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <Button onClick={onClose} disabled={loading} size="large">Cancel</Button>
                    <Button type="primary" onClick={handleDoNothing} loading={loading} className="bg-indigo-600 hover:bg-indigo-700 border-none shadow-md" size="large">
                        Mark as Review
                    </Button>
                </div>
            )}
        </Modal>
    );
}
