'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, Button, message, Switch, Tooltip, Radio } from 'antd';
import { UserOutlined, TeamOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task, Profile, TaskStatus, ReviewGroup } from '@/lib/types';

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

export default function EscalateModal({
    isOpen,
    onClose,
    task,
    profiles,
    currentUserId,
    currentTaskDescription,
    nextStatus = 'BACKLOG',
    onSuccess
}: EscalateModalProps) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [escalateEnabled, setEscalateEnabled] = useState(true);
    const [targetType, setTargetType] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL');
    const [reviewGroups, setReviewGroups] = useState<ReviewGroup[]>([]);
    const [userDepartments, setUserDepartments] = useState<{ user_id: string; department: string }[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        if (isOpen) {
            const fetchGroupsAndDepts = async () => {
                setLoadingGroups(true);
                try {
                    const [groupsRes, deptsRes] = await Promise.all([
                        supabase.from('tsk_review_groups').select('*').order('name'),
                        supabase.from('user_departments').select('user_id, department')
                    ]);
                    if (!groupsRes.error && groupsRes.data) {
                        setReviewGroups(groupsRes.data as ReviewGroup[]);
                    }
                    if (!deptsRes.error && deptsRes.data) {
                        setUserDepartments(deptsRes.data);
                    }
                } catch (e) {
                    console.error('Error loading review groups & departments:', e);
                } finally {
                    setLoadingGroups(false);
                }
            };
            fetchGroupsAndDepts();
        }
    }, [isOpen, supabase]);

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
            // Calculate duration from last history entry
            const { data: lastHistory } = await supabase
                .from('tsk_task_history')
                .select('*')
                .eq('task_id', task.id)
                .order('created_at', { ascending: false })
                .limit(1);

            const now = new Date();
            let statusBeforeEnteredAt = null;
            let durationSeconds = null;
            let durationMinutes = null;
            let durationHours = null;

            if (lastHistory && lastHistory.length > 0) {
                statusBeforeEnteredAt = lastHistory[0].created_at;
                const enteredAtDate = new Date(statusBeforeEnteredAt);
                const diffMs = Math.max(0, now.getTime() - enteredAtDate.getTime());
                durationSeconds = Math.floor(diffMs / 1000);
                durationMinutes = durationSeconds / 60;
                durationHours = durationMinutes / 60;
            }

            if (task.status !== nextStatus) {
                const { error: historyError } = await supabase
                    .from('tsk_task_history')
                    .insert({
                        task_id: task.id,
                        status_before: task.status,
                        new_status: nextStatus,
                        changed_by: currentUserId,
                        status_before_entered_at: statusBeforeEnteredAt,
                        duration_seconds: durationSeconds,
                        duration_minutes: durationMinutes,
                        duration_hours: durationHours
                    });

                if (historyError) {
                    console.error('Error inserting task history:', historyError);
                }
            }

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
            const { to_user_id, to_group_id, reason } = values;
            const fromUserId = task.assignee_id || currentUserId;

            // 1. Calculate duration from last history entry
            const { data: lastHistory } = await supabase
                .from('tsk_task_history')
                .select('*')
                .eq('task_id', task.id)
                .order('created_at', { ascending: false })
                .limit(1);

            const now = new Date();
            let statusBeforeEnteredAt = null;
            let durationSeconds = null;
            let durationMinutes = null;
            let durationHours = null;

            if (lastHistory && lastHistory.length > 0) {
                statusBeforeEnteredAt = lastHistory[0].created_at;
                const enteredAtDate = new Date(statusBeforeEnteredAt);
                const diffMs = Math.max(0, now.getTime() - enteredAtDate.getTime());
                durationSeconds = Math.floor(diffMs / 1000);
                durationMinutes = durationSeconds / 60;
                durationHours = durationMinutes / 60;
            }

            if (task.status !== nextStatus) {
                const { error: historyError } = await supabase
                    .from('tsk_task_history')
                    .insert({
                        task_id: task.id,
                        status_before: task.status,
                        new_status: nextStatus,
                        changed_by: currentUserId,
                        status_before_entered_at: statusBeforeEnteredAt,
                        duration_seconds: durationSeconds,
                        duration_minutes: durationMinutes,
                        duration_hours: durationHours
                    });

                if (historyError) {
                    console.error('Error inserting task history:', historyError);
                }
            }

            // 2. Update task with mutually exclusive escalation target
            const isGroup = targetType === 'GROUP';
            const updatePayload: any = {
                status: nextStatus,
                is_escalated: true,
                escalated_from_user_id: fromUserId,
                escalated_to_user_id: isGroup ? null : to_user_id,
                escalated_to_group_id: isGroup ? to_group_id : null,
                assignee_id: isGroup ? null : to_user_id,
                updated_at: new Date().toISOString(),
                description: currentTaskDescription
            };

            const { error: taskError } = await supabase
                .from('tsk_tasks')
                .update(updatePayload)
                .eq('id', task.id);

            if (taskError) throw taskError;

            // 3. Insert escalation log
            const logPayload: any = {
                task_id: task.id,
                from_user_id: fromUserId,
                to_user_id: isGroup ? null : to_user_id,
                to_group_id: isGroup ? to_group_id : null,
                reason: reason,
                task_description: currentTaskDescription
            };

            const { error: logError } = await supabase
                .from('tsk_escalation_logs')
                .insert([logPayload]);

            if (logError) throw logError;

            // 4. Send Telegram notification
            const currentPic = profiles.find(p => p.id === fromUserId);
            let targetDisplayName = 'Unknown';

            if (isGroup) {
                const grp = reviewGroups.find(g => g.id === to_group_id);
                targetDisplayName = grp ? `👥 Kumpulan Semakan: ${grp.name}` : 'Review Group';
            } else {
                const newPic = profiles.find(p => p.id === to_user_id);
                targetDisplayName = newPic?.full_name || 'Individual PIC';
            }

            const msg = `🚩 <b>TASK ESCALATION ALERT</b>\n\n<b>Customer:</b> ${task.customer_name || '-'}\n<b>Task:</b> ${task.title}\n<b>Transferred By:</b> ${currentPic?.full_name || 'System'}\n<b>Transferred To:</b> ${targetDisplayName}\n<b>Reason:</b>\n"${reason}"\n\n🔗 Open System: https://workspace.syazna.com/`;

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

            message.success('Tugasan berjaya dieskalasikan!');
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
            title={
                <div className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">
                    <SendOutlined className="text-cyan-600" />
                    {nextStatus === 'REVIEW' ? 'Submit for Review' : 'Escalate Task'}
                </div>
            }
            open={isOpen}
            onCancel={() => {
                form.resetFields();
                setEscalateEnabled(true);
                setTargetType('INDIVIDUAL');
                onClose();
            }}
            footer={null}
            destroyOnClose
        >
            {nextStatus === 'REVIEW' ? (
                <div className="mb-6 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    Submit task <strong>{task?.title}</strong> to a reviewer or Review Group. Status will become <strong>Review</strong> once submitted.
                </div>
            ) : (
                <div className="mb-6 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    Transfer responsibility of task <strong>{task?.title}</strong> to a new PIC or Review Group.
                </div>
            )}

            {nextStatus === 'REVIEW' && (
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Tooltip title="When ON: Escalate the task to another staff member or Review Group. When OFF: Just mark as Review without escalating.">
                            <span className="text-xs text-slate-700 cursor-help flex items-center gap-1 font-medium">
                                Escalate task
                                <span className="text-slate-400 text-[10px] font-bold bg-slate-100 rounded-full w-3.5 h-3.5 flex items-center justify-center cursor-help">?</span>
                            </span>
                        </Tooltip>
                        <Tooltip title={escalateEnabled ? "Escalate to staff or Review Group" : "Mark as Review only"}>
                            <Switch
                                checked={escalateEnabled}
                                onChange={setEscalateEnabled}
                            />
                        </Tooltip>
                    </div>
                </div>
            )}

            <Form layout="vertical" form={form} onFinish={escalateEnabled ? handleEscalate : handleDoNothing}>
                {escalateEnabled ? (
                    <>
                        <Form.Item label="Escalation Target Type" className="mb-4">
                            <Radio.Group
                                value={targetType}
                                onChange={e => {
                                    setTargetType(e.target.value);
                                    form.setFieldsValue({ to_user_id: undefined, to_group_id: undefined });
                                }}
                                className="w-full grid grid-cols-2 gap-2"
                            >
                                <Radio.Button value="INDIVIDUAL" className="text-center flex items-center justify-center gap-1 h-10 rounded-lg">
                                    <UserOutlined /> Individual PIC
                                </Radio.Button>
                                <Radio.Button value="GROUP" className="text-center flex items-center justify-center gap-1 h-10 rounded-lg">
                                    <TeamOutlined /> Review Group
                                </Radio.Button>
                            </Radio.Group>
                        </Form.Item>

                        {targetType === 'INDIVIDUAL' ? (
                            <Form.Item
                                name="to_user_id"
                                label="New PIC / Individual Reviewer"
                                rules={[{ required: true, message: 'Please select a reviewer' }]}
                            >
                                <Select
                                    placeholder="Select next person in charge"
                                    size="large"
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {profiles.filter(p => {
                                        if (p.id === currentUserId) return false;
                                        if (!task?.department) return true;
                                        if (p.role === 'admin' || p.role === 'manager') return true;
                                        if (p.department === task.department) return true;
                                        return userDepartments.some(ud => ud.user_id === p.id && ud.department === task.department);
                                    }).map(p => {
                                        const isLoaned = task?.department && p.department !== task.department && userDepartments.some(ud => ud.user_id === p.id && ud.department === task.department);
                                        return (
                                            <Option key={p.id} value={p.id}>
                                                {p.full_name} {p.department ? `(${p.department}${isLoaned ? ` · Loaned to ${task.department}` : ''})` : ''}
                                            </Option>
                                        );
                                    })}
                                </Select>
                            </Form.Item>
                        ) : (
                            <Form.Item
                                name="to_group_id"
                                label="Review Group Target"
                                rules={[{ required: true, message: 'Please select a Review Group' }]}
                                tooltip="Any member in this group can approve or reject this task."
                            >
                                <Select
                                    placeholder="Select Review Group"
                                    size="large"
                                    loading={loadingGroups}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {reviewGroups.map(g => (
                                        <Option key={g.id} value={g.id}>
                                            {g.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        )}

                        <Form.Item
                            name="reason"
                            label={
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-xs font-semibold text-slate-700">Reason for Escalation</span>
                                    <Button
                                        type="text"
                                        size="small"
                                        onClick={handleAutoDraft}
                                        loading={generatingAI}
                                        className="text-cyan-700 font-medium bg-cyan-50 hover:bg-cyan-100 rounded-md py-0 px-2 text-xs"
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        <ThunderboltOutlined /> Generate Summary Draft
                                    </Button>
                                </div>
                            }
                            rules={[{ required: true, message: 'Please provide a reason for escalation' }]}
                        >
                            <TextArea rows={4} placeholder="Example: Calculations completed, ready for manager or Review Group verification..." className="rounded-xl" />
                        </Form.Item>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                            <Button onClick={onClose} disabled={loading} size="large">
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                className="bg-orange-500 hover:bg-orange-600 border-none shadow-md"
                                size="large"
                            >
                                Confirm Escalate
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button onClick={onClose} disabled={loading} size="large">
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 border-none shadow-md"
                            size="large"
                        >
                            Mark as Review
                        </Button>
                    </div>
                )}
            </Form>
        </Modal>
    );
}
