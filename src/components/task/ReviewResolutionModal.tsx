'use client';

import React, { useState } from 'react';
import { Modal, Button, Input, Form, message, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, AuditOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task } from '@/lib/types';

const { TextArea } = Input;

interface ReviewResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | null;
    currentUserId: string;
    onSuccess: () => void;
}

export default function ReviewResolutionModal({
    isOpen,
    onClose,
    task,
    currentUserId,
    onSuccess
}: ReviewResolutionModalProps) {
    const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
    const [loading, setLoading] = useState(false);
    const [rejectionForm] = Form.useForm();
    const supabase = createClient();

    if (!task) return null;

    const originatorId = task.escalated_from_user_id || task.created_by || null;

    // ─────────────────────────────────────────────────────────────
    // APPROVE -> DONE
    // ─────────────────────────────────────────────────────────────
    const handleApprove = async () => {
        setLoading(true);
        try {
            // Atomic conditional update: only succeeds if task is still in REVIEW status
            const { data, error } = await supabase
                .from('tsk_tasks')
                .update({
                    status: 'DONE',
                    assignee_id: originatorId,
                    is_escalated: false,
                    escalated_to_user_id: null,
                    escalated_to_group_id: null,
                    reviewed_by: currentUserId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', task.id)
                .eq('status', 'REVIEW')
                .select('id, status, reviewed_by');

            if (error) throw error;

            // Concurrency check: if 0 rows returned, another reviewer already acted
            if (!data || data.length === 0) {
                const { data: latestTask } = await supabase
                    .from('tsk_tasks')
                    .select('reviewed_by, reviewer:lv_profiles!tsk_tasks_reviewed_by_fkey(full_name)')
                    .eq('id', task.id)
                    .single();

                const reviewerName = (latestTask?.reviewer as any)?.full_name || 'ahli lain';
                message.warning(`Tugasan ini sudah diselesaikan oleh ${reviewerName}`);
                onSuccess();
                onClose();
                return;
            }

            // Insert audit history
            await supabase.from('tsk_task_history').insert({
                task_id: task.id,
                status_before: 'REVIEW',
                new_status: 'DONE',
                changed_by: currentUserId
            });

            // Insert system approval comment
            await supabase.from('tsk_comments').insert({
                task_id: task.id,
                user_id: currentUserId,
                content: '✅ **Task Approved**: Tugasan telah diluluskan dan diselesaikan.'
            });

            message.success('Tugasan berjaya diluluskan (Done)!');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Approval error:', err.message);
            message.error(`Gagal meluluskan tugasan: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // REJECT -> IN_PROGRESS (with required feedback comment)
    // ─────────────────────────────────────────────────────────────
    const handleReject = async (values: { reason: string }) => {
        setLoading(true);
        try {
            const { reason } = values;

            // Atomic conditional update: only succeeds if task is still in REVIEW status
            const { data, error } = await supabase
                .from('tsk_tasks')
                .update({
                    status: 'IN_PROGRESS',
                    assignee_id: originatorId,
                    is_escalated: false,
                    escalated_to_user_id: null,
                    escalated_to_group_id: null,
                    reviewed_by: currentUserId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', task.id)
                .eq('status', 'REVIEW')
                .select('id, status, reviewed_by');

            if (error) throw error;

            // Concurrency check: if 0 rows returned, another reviewer already acted
            if (!data || data.length === 0) {
                const { data: latestTask } = await supabase
                    .from('tsk_tasks')
                    .select('reviewed_by, reviewer:lv_profiles!tsk_tasks_reviewed_by_fkey(full_name)')
                    .eq('id', task.id)
                    .single();

                const reviewerName = (latestTask?.reviewer as any)?.full_name || 'ahli lain';
                message.warning(`Tugasan ini sudah diselesaikan oleh ${reviewerName}`);
                onSuccess();
                onClose();
                return;
            }

            // Insert audit history
            await supabase.from('tsk_task_history').insert({
                task_id: task.id,
                status_before: 'REVIEW',
                new_status: 'IN_PROGRESS',
                changed_by: currentUserId
            });

            // Insert mandatory rejection feedback comment
            await supabase.from('tsk_comments').insert({
                task_id: task.id,
                user_id: currentUserId,
                content: `❌ **Semakan Ditolak (Perlu Pembetulan)**:\n${reason}`
            });

            message.info('Tugasan ditolak dan dikembalikan ke In Progress dengan maklum balas.');
            rejectionForm.resetFields();
            setActionType(null);
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Rejection error:', err.message);
            message.error(`Gagal menolak tugasan: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={
                <div className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                    <AuditOutlined className="text-amber-600" />
                    <span>Semakan Tugasan: {task.title}</span>
                </div>
            }
            open={isOpen}
            onCancel={() => {
                setActionType(null);
                rejectionForm.resetFields();
                onClose();
            }}
            footer={null}
            destroyOnClose
        >
            <Alert
                message="Tugasan Menunggu Kelulusan / Semakan"
                description={
                    task.escalated_to_group_id
                        ? "Tugasan ini dieskalasikan kepada Kumpulan Semakan anda. Tindakan pertama daripada mana-mana ahli akan menyelesaikan semakan ini untuk semua orang."
                        : "Tugasan ini dihantar untuk semakan individu anda."
                }
                type="warning"
                showIcon
                className="mb-4 mt-2"
            />

            {actionType === null && (
                <div className="flex flex-col gap-3 py-3">
                    <p className="text-slate-600 text-sm">
                        Sila pilih tindakan semakan untuk tugasan ini:
                    </p>
                    <div className="flex gap-3 justify-end mt-4">
                        <Button
                            danger
                            size="large"
                            icon={<CloseCircleOutlined />}
                            onClick={() => setActionType('REJECT')}
                        >
                            Tolak (Perlu Pembetulan)
                        </Button>
                        <Button
                            type="primary"
                            size="large"
                            className="bg-emerald-600 hover:bg-emerald-700 border-none shadow-md"
                            icon={<CheckCircleOutlined />}
                            loading={loading}
                            onClick={handleApprove}
                        >
                            Luluskan (Selesai / Done)
                        </Button>
                    </div>
                </div>
            )}

            {actionType === 'REJECT' && (
                <Form form={rejectionForm} layout="vertical" onFinish={handleReject}>
                    <Form.Item
                        name="reason"
                        label="Sebab Penolakan / Maklum Balas Pembetulan"
                        rules={[{ required: true, message: 'Sila masukkan maklum balas pembetulan.' }]}
                    >
                        <TextArea
                            rows={4}
                            placeholder="Nyatakan perkara yang perlu diperbaiki sebelum tugasan boleh diluluskan..."
                        />
                    </Form.Item>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button onClick={() => setActionType(null)} disabled={loading}>
                            Kembali
                        </Button>
                        <Button type="primary" danger htmlType="submit" loading={loading}>
                            Hantar Penolakan
                        </Button>
                    </div>
                </Form>
            )}
        </Modal>
    );
}
