'use client';

import React, { useState, useEffect } from 'react';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { createClient } from '@/utils/supabase/client';
import { Task, TaskStatus } from '@/lib/types';
import KanbanColumn from './KanbanColumn';
import { message } from 'antd';

const STATUSES: TaskStatus[] = ['BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE'];

interface KanbanBoardProps {
    tasks: Task[];
    role: string | null;
}

export default function KanbanBoard({ tasks, role }: KanbanBoardProps) {
    const supabase = createClient();
    const [boardTasks, setBoardTasks] = useState<Task[]>(tasks);

    useEffect(() => {
        setBoardTasks(tasks);
    }, [tasks]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const taskId = active.id as string;
        const overId = over.id as string;

        // Determine the status column we are dropping into.
        const newStatus = STATUSES.includes(overId as TaskStatus)
            ? overId as TaskStatus
            : boardTasks.find(t => t.id === overId)?.status;

        if (!newStatus) return;

        const activeTaskIndex = boardTasks.findIndex(t => t.id === taskId);
        const activeTask = boardTasks[activeTaskIndex];

        if (activeTask.status !== newStatus) {
            // Optimistic upate
            setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

            // Persist to Supabase
            const { error } = await supabase
                .from('tsk_tasks')
                .update({ status: newStatus })
                .eq('id', taskId);

            if (error) {
                message.error('Failed to move task');
                // Revert optimistic update
                setBoardTasks(tasks);
            }
        }
    };

    return (
        <div className="flex gap-4 overflow-x-auto pb-4">
            <DndContext sensors={role === 'admin' ? sensors : []} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                {STATUSES.map(status => (
                    <KanbanColumn
                        key={status}
                        status={status}
                        tasks={boardTasks.filter(t => t.status === status)}
                    />
                ))}
            </DndContext>
        </div>
    );
}
