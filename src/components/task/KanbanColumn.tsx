'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/lib/types';
import SortableTaskItem from './SortableTaskItem';

interface KanbanColumnProps {
    status: TaskStatus;
    tasks: Task[];
    role?: string | null;
}

export default function KanbanColumn({ status, tasks, role }: KanbanColumnProps) {
    const { setNodeRef } = useDroppable({
        id: status,
    });

    const getColumnTitle = () => {
        switch (status) {
            case 'BACKLOG': return 'Backlog';
            case 'IN_PROGRESS': return 'In Progress';
            case 'REVIEW': return 'Ready for Review';
            case 'DONE': return 'Done';
            default: return status;
        }
    };

    return (
        <div className="flex flex-col bg-gray-100 rounded-lg p-3 w-80 min-w-80 h-full min-h-[500px]">
            <div className="font-semibold mb-3 px-1">{getColumnTitle()} <span className="text-gray-400 text-sm font-normal ml-2">{tasks.length}</span></div>

            <div ref={setNodeRef} className="flex-1 flex flex-col gap-2">
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map(task => (
                        <SortableTaskItem key={task.id} task={task} role={role} />
                    ))}
                </SortableContext>
                {tasks.length === 0 && <div className="text-sm text-gray-400 p-2 text-center italic border-2 border-dashed border-gray-300 rounded">Drop here</div>}
            </div>
        </div>
    );
}
