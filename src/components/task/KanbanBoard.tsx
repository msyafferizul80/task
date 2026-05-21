'use client';

import React, { useEffect, useRef, useState } from 'react';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { createClient } from '@/utils/supabase/client';
import { Profile, Task, TaskStatus } from '@/lib/types';
import KanbanColumn from './KanbanColumn';
import { message } from 'antd';
import EscalateModal from './EscalateModal';

const ACTIVE_STATUSES: TaskStatus[] = ['BACKLOG', 'CLIENT_HOLD', 'IN_PROGRESS', 'REVIEW'];

interface KanbanBoardProps {
    tasks: Task[];
    role: string | null;
    profiles: Profile[];
    currentUserId: string | null;
}

const DONE_HIDDEN_KEY = 'kanban_done_hidden';

export default function KanbanBoard({ tasks, role, profiles, currentUserId }: KanbanBoardProps) {
    const supabase = createClient();
    const isAdminOrManager = role === 'admin' || role === 'manager';
    const [isDragging, setIsDragging] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [boardTasks, setBoardTasks] = useState<Task[]>(tasks);
    const [showDone, setShowDone] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(DONE_HIDDEN_KEY);
            return saved === null ? true : saved !== 'true'; // default: show (not hidden)
        }
        return true;
    });

    useEffect(() => {
        setBoardTasks(tasks);
    }, [tasks]);

    // Persist showDone preference
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(DONE_HIDDEN_KEY, String(!showDone));
        }
    }, [showDone]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    // Auto-hide Done tasks older than 48 hours
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    const now = new Date().getTime();

    const visibleDoneTasks = boardTasks.filter(t => {
        if (t.status !== 'DONE') return false;
        const updatedAt = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        return (now - updatedAt) <= FORTY_EIGHT_HOURS_MS;
    });

    const hiddenDoneCount = boardTasks.filter(t => {
        if (t.status !== 'DONE') return false;
        const updatedAt = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        return (now - updatedAt) > FORTY_EIGHT_HOURS_MS;
    }).length;

    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [reviewTask, setReviewTask] = useState<Task | null>(null);
    const reviewPrevStatusRef = useRef<TaskStatus | null>(null);
    const reviewSucceededRef = useRef(false);

    const closeReviewModal = () => {
        const prevStatus = reviewPrevStatusRef.current;
        const taskId = reviewTask?.id;
        const shouldRollback = !reviewSucceededRef.current && prevStatus && taskId;

        if (shouldRollback) {
            setBoardTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: prevStatus } : t)));
        }

        reviewSucceededRef.current = false;
        reviewPrevStatusRef.current = null;
        setReviewTask(null);
        setIsReviewModalOpen(false);
    };

    const handleReviewSuccess = async () => {
        if (!reviewTask) return;
        reviewSucceededRef.current = true;

        const { data, error } = await supabase
            .from('tsk_tasks')
            .select(`
                *,
                assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
                    id,
                    full_name,
                    avatar_url
                )
            `)
            .eq('id', reviewTask.id)
            .single();

        if (!error && data) {
            setBoardTasks(prev => prev.map(t => (t.id === reviewTask.id ? (data as Task) : t)));
        }

        closeReviewModal();
    };

    const handleDragStart = () => {
        setIsDragging(true);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setIsDragging(false);
        const { active, over } = event;
        if (!over) return;

        const taskId = active.id as string;
        const overId = over.id as string;

        const allStatuses: TaskStatus[] = ['BACKLOG', 'CLIENT_HOLD', 'IN_PROGRESS', 'REVIEW', 'DONE'];
        const newStatus = allStatuses.includes(overId as TaskStatus)
            ? overId as TaskStatus
            : boardTasks.find(t => t.id === overId)?.status;

        if (!newStatus) return;

        const activeTask = boardTasks.find(t => t.id === taskId);
        if (!activeTask || activeTask.status === newStatus) return;

        // Only allow admins/managers or the task's assignee to move the task
        const canMoveTask = isAdminOrManager || activeTask.assignee_id === currentUserId;
        if (!canMoveTask) {
            message.error('You can only move tasks assigned to you');
            return;
        }

        if (newStatus === 'REVIEW') {
            reviewSucceededRef.current = false;
            reviewPrevStatusRef.current = activeTask.status;
            setReviewTask(activeTask); // Don't change status here!
            setIsReviewModalOpen(true);
            setBoardTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: 'REVIEW' } : t)));
            return;
        }

        // Optimistic update
        setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, is_escalated: (t.is_escalated && newStatus !== 'BACKLOG' ? false : t.is_escalated) } : t));

        const updateData: any = { status: newStatus, updated_at: new Date().toISOString() };
        if (activeTask.is_escalated && newStatus !== 'BACKLOG') {
            updateData.is_escalated = false;
        }

        // 1. Fetch last history record for this task to calculate duration
        const { data: lastHistory } = await supabase
            .from('tsk_task_history')
            .select('*')
            .eq('task_id', taskId)
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

        // Insert task history only if status actually changed AND not REVIEW (REVIEW is handled in EscalateModal)
        if (activeTask.status !== newStatus && (newStatus as any) !== 'REVIEW') {
            const { error: historyError } = await supabase
                .from('tsk_task_history')
                .insert({
                    task_id: taskId,
                    status_before: activeTask.status,
                    new_status: newStatus,
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

        // Persist to Supabase
        const { error } = await supabase
            .from('tsk_tasks')
            .update(updateData)
            .eq('id', taskId);

        if (error) {
            message.error(error.message || 'Failed to move task');
            setBoardTasks(tasks);
        }
    };

    const totalDone = boardTasks.filter(t => t.status === 'DONE').length;

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    {hiddenDoneCount > 0 && (
                        <span className="bg-amber-50 border border-amber-200 text-amber-600 px-2 py-1 rounded-full font-medium">
                            ⏱️ {hiddenDoneCount} task siap tersorok automatik (lebih 48 jam)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExpanded(v => !v)}
                        className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200
                            ${isExpanded
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
                            }`}
                    >
                        {isExpanded ? (
                            <><span>📉</span> Collapse</>
                        ) : (
                            <><span>📈</span> Expand</>
                        )}
                    </button>
                    <button
                        onClick={() => setShowDone(v => !v)}
                        className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200
                            ${showDone
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
                            }`}
                    >
                        {showDone ? (
                            <><span>✅</span> Sembunyikan Selesai ({totalDone})</>
                        ) : (
                            <><span>👁️</span> Tunjuk Selesai ({totalDone})</>
                        )}
                    </button>
                </div>
            </div>

            {/* Board */}
            <div className={`flex gap-4 pb-4 snap-x snap-mandatory ${isExpanded ? 'max-h-[800px]' : 'max-h-[500px]'} ${isDragging ? 'overflow-x-hidden' : 'overflow-x-auto'}`}>
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCorners} 
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {ACTIVE_STATUSES.map(status => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            tasks={boardTasks.filter(t => t.status === status)}
                            role={role}
                            isBoardExpanded={isExpanded}
                            currentUserId={currentUserId}
                        />
                    ))}

                    {/* Done Column — only render when showDone is true */}
                    {showDone && (
                        <KanbanColumn
                            key="DONE"
                            status="DONE"
                            tasks={visibleDoneTasks}
                            role={role}
                            isDoneColumn
                            isBoardExpanded={isExpanded}
                            currentUserId={currentUserId}
                        />
                    )}
                </DndContext>
            </div>

            <EscalateModal
                isOpen={isReviewModalOpen}
                onClose={closeReviewModal}
                task={reviewTask}
                profiles={profiles}
                currentUserId={currentUserId}
                currentTaskDescription={reviewTask?.description}
                nextStatus="REVIEW"
                onSuccess={handleReviewSuccess}
            />
        </div>
    );
}
