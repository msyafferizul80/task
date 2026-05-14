'use client';

import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/lib/types';
import SortableTaskItem from './SortableTaskItem';
import { useRouter } from 'next/navigation';

const DONE_DISPLAY_LIMIT = 5;

interface KanbanColumnProps {
    status: TaskStatus;
    tasks: Task[];
    role?: string | null;
    isDoneColumn?: boolean;
}

export default function KanbanColumn({ status, tasks, role, isDoneColumn = false }: KanbanColumnProps) {
    const { setNodeRef } = useDroppable({ id: status });
    const router = useRouter();

    // Done column is collapsed by default
    const [isExpanded, setIsExpanded] = useState(!isDoneColumn);

    const getColumnMeta = () => {
        switch (status) {
            case 'BACKLOG':
                return { title: 'Backlog', color: 'text-gray-700', dot: 'bg-gray-400', header: 'bg-gray-100', border: 'border-gray-200' };
            case 'CLIENT_HOLD':
                return { title: 'Client Hold', color: 'text-fuchsia-700', dot: 'bg-fuchsia-500', header: 'bg-fuchsia-50', border: 'border-fuchsia-200' };
            case 'IN_PROGRESS':
                return { title: 'In Progress', color: 'text-blue-700', dot: 'bg-blue-500', header: 'bg-blue-50', border: 'border-blue-200' };
            case 'REVIEW':
                return { title: 'Ready for Review', color: 'text-amber-700', dot: 'bg-amber-500', header: 'bg-amber-50', border: 'border-amber-200' };
            case 'DONE':
                return { title: 'Done', color: 'text-emerald-700', dot: 'bg-emerald-500', header: 'bg-emerald-50', border: 'border-emerald-200' };
            default:
                return { title: status, color: 'text-gray-700', dot: 'bg-gray-400', header: 'bg-gray-100', border: 'border-gray-200' };
        }
    };

    const meta = getColumnMeta();

    // For Done: limit to 5 most recent (already filtered to ≤48h from parent)
    const displayedTasks = isDoneColumn ? tasks.slice(0, DONE_DISPLAY_LIMIT) : tasks;
    const hasMore = isDoneColumn && tasks.length > DONE_DISPLAY_LIMIT;

    return (
        <div className={`flex flex-col rounded-xl border ${meta.border} w-[85vw] min-w-[85vw] sm:w-72 sm:min-w-[288px] snap-start transition-all duration-300`}>

            {/* Column Header */}
            <div
                className={`flex items-center gap-2 px-4 py-3 rounded-t-xl ${meta.header} ${isDoneColumn ? 'cursor-pointer select-none' : ''}`}
                onClick={isDoneColumn ? () => setIsExpanded(v => !v) : undefined}
            >
                <div className={`w-2 h-2 rounded-full ${meta.dot} flex-shrink-0`} />
                <span className={`font-semibold text-sm ${meta.color} flex-1`}>{meta.title}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 border ${meta.border} ${meta.color}`}>
                    {tasks.length}
                </span>
                {isDoneColumn && (
                    <span className={`text-xs ${meta.color} transition-transform duration-300 ml-1 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                        ▼
                    </span>
                )}
            </div>

            {/* Column Body — collapsbile for Done */}
            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div ref={setNodeRef} className={`flex flex-col gap-2 p-3 min-h-[120px] bg-white rounded-b-xl`}>
                    <SortableContext items={displayedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                        {displayedTasks.map(task => (
                            <SortableTaskItem key={task.id} task={task} role={role} isDone={isDoneColumn} />
                        ))}
                    </SortableContext>

                    {tasks.length === 0 && (
                        <div className="text-sm text-gray-400 p-4 text-center italic border-2 border-dashed border-gray-200 rounded-lg flex-1">
                            Drop here
                        </div>
                    )}

                    {/* View All button for Done column */}
                    {hasMore && (
                        <button
                            onClick={() => router.push('/tasks')}
                            className="mt-1 w-full text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg py-2 transition-colors duration-200"
                        >
                            +{tasks.length - DONE_DISPLAY_LIMIT} lagi — Lihat Semua →
                        </button>
                    )}
                </div>
            </div>

            {/* Collapsed hint for Done */}
            {isDoneColumn && !isExpanded && tasks.length > 0 && (
                <div
                    className="px-4 py-2 text-xs text-emerald-600 bg-white rounded-b-xl cursor-pointer hover:bg-emerald-50 transition-colors text-center border-t border-emerald-100"
                    onClick={() => setIsExpanded(true)}
                >
                    Klik untuk lihat {tasks.length} task siap ▼
                </div>
            )}
            {isDoneColumn && !isExpanded && tasks.length === 0 && (
                <div className="px-4 py-2 text-xs text-gray-400 bg-white rounded-b-xl text-center border-t border-gray-100">
                    Tiada task siap dalam 48 jam
                </div>
            )}
        </div>
    );
}
