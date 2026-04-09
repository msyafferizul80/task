'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';

interface SortableTaskItemProps {
    task: Task;
    role?: string | null;
    isDone?: boolean;
}

export default function SortableTaskItem({ task, role, isDone = false }: SortableTaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, disabled: role !== 'admin' && role !== 'manager' });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const getBorderColor = () => {
        switch (task.priority_type) {
            case 'DO_FIRST': return 'border-l-4 border-red-500';
            case 'SCHEDULE': return 'border-l-4 border-blue-500';
            case 'DELEGATE': return 'border-l-4 border-yellow-500';
            case 'ELIMINATE': return 'border-l-4 border-gray-500';
            default: return '';
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`relative bg-white p-3 rounded-md shadow-sm border transition-shadow
                ${isDone ? 'border-emerald-100 opacity-70' : 'border-gray-200 hover:shadow-md'}
                ${role === 'admin' || role === 'manager' ? 'cursor-grab active:cursor-grabbing' : ''}
                ${getBorderColor()}`}
        >
            {isDone && (
                <span className="absolute top-2 right-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Siap</span>
            )}
            {!isDone && task.is_escalated && (
                <span className="absolute top-2 right-2 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full shadow-sm">🚩 Escalated</span>
            )}
            <div className={`font-medium text-sm mb-1 ${isDone ? 'line-through text-gray-400' : 'text-gray-800'} ${!isDone && task.is_escalated ? 'pr-20' : ''}`}>{task.title}</div>

            <div className="flex flex-col gap-1 mt-2 text-xs mb-2">
                {task.customer_name && (
                    <div className="flex items-center gap-1">
                        <span className="font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200 w-full truncate">
                            👤 {task.customer_name}
                        </span>
                    </div>
                )}
                {task.assignee && (
                    <div className="flex items-center gap-1">
                        <span className="font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 w-full truncate">
                            🛠️ {task.assignee.full_name}
                        </span>
                    </div>
                )}
            </div>

            {task.due_date && (
                <div className="text-xs text-red-500 mt-2">
                    Due: {new Date(task.due_date).toLocaleDateString()}
                </div>
            )}
        </div>
    );
}
