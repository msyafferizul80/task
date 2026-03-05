'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';

interface SortableTaskItemProps {
    task: Task;
}

export default function SortableTaskItem({ task }: SortableTaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id });

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
            className={`bg-white p-3 rounded-md shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${getBorderColor()}`}
        >
            <div className="font-medium text-sm mb-1">{task.title}</div>

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
