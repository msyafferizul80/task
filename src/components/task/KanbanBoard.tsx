'use client';

import React, { useState, useEffect } from 'react';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { createClient } from '@/utils/supabase/client';
import { Task, TaskStatus } from '@/lib/types';
import KanbanColumn from './KanbanColumn';
import { message } from 'antd';

const ACTIVE_STATUSES: TaskStatus[] = ['BACKLOG', 'IN_PROGRESS', 'REVIEW'];

interface KanbanBoardProps {
    tasks: Task[];
    role: string | null;
}

const DONE_HIDDEN_KEY = 'kanban_done_hidden';

export default function KanbanBoard({ tasks, role }: KanbanBoardProps) {
    const supabase = createClient();
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

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const taskId = active.id as string;
        const overId = over.id as string;

        const allStatuses: TaskStatus[] = ['BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE'];
        const newStatus = allStatuses.includes(overId as TaskStatus)
            ? overId as TaskStatus
            : boardTasks.find(t => t.id === overId)?.status;

        if (!newStatus) return;

        const activeTask = boardTasks.find(t => t.id === taskId);
        if (!activeTask || activeTask.status === newStatus) return;

        // Optimistic update
        setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

        // Persist to Supabase
        const { error } = await supabase
            .from('tsk_tasks')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', taskId);

        if (error) {
            message.error('Failed to move task');
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

            {/* Board */}
            <div className="flex gap-4 overflow-x-auto pb-4">
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                    {ACTIVE_STATUSES.map(status => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            tasks={boardTasks.filter(t => t.status === status)}
                            role={role}
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
                        />
                    )}
                </DndContext>
            </div>
        </div>
    );
}
