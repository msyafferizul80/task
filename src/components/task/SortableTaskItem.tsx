'use client';

import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';

interface SortableTaskItemProps {
    task: Task;
    role?: string | null;
    isDone?: boolean;
    currentUserId?: string | null;
}

import { useRole } from '@/components/layout/RoleProvider';
import { useTimer } from '@/components/task/TimerProvider';

export default function SortableTaskItem({ task, role, isDone = false, currentUserId }: SortableTaskItemProps) {
    const { department: currentUserDept } = useRole();
    const isAdminOrManager = role === 'admin' || role === 'manager';
    const canDrag = isAdminOrManager || (role === 'supervisor' && task.department === currentUserDept) || task.assignee_id === currentUserId;
    
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, disabled: !canDrag });

    const { activeLogs, startTimer, stopTimer } = useTimer();
    const activeLogForTask = activeLogs.find(log => log.task_id === task.id);
    const isCurrentActive = !!activeLogForTask;
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!isCurrentActive || !activeLogForTask) {
            setElapsed(0);
            return;
        }

        const calculateElapsed = () => {
            const start = new Date(activeLogForTask.start_time).getTime();
            const now = new Date().getTime();
            return Math.max(0, Math.round((now - start) / 1000));
        };

        setElapsed(calculateElapsed());

        const interval = setInterval(() => {
            setElapsed(calculateElapsed());
        }, 1000);

        return () => clearInterval(interval);
    }, [isCurrentActive, activeLogForTask]);

    const formatTime = (totalSeconds: number) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleTimerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isCurrentActive) {
            stopTimer(task.id);
        } else {
            startTimer(task.id);
        }
    };

    const handleButtonMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined as any,
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
                ${isDragging ? 'shadow-lg' : ''}
                ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
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

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                <div className={`text-[10px] font-medium ${task.due_date && new Date(task.due_date).getTime() < Date.now() ? 'text-red-500' : 'text-slate-400'}`}>
                    {task.due_date ? `Due: ${new Date(task.due_date).toLocaleDateString()}` : ''}
                </div>
                {!isDone && (
                    <div
                        onClick={handleTimerClick}
                        onMouseDown={handleButtonMouseDown}
                        onTouchStart={(e) => e.stopPropagation()}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-all duration-200 border select-none
                            ${isCurrentActive
                                ? 'bg-rose-50 border-rose-200 text-rose-600 font-mono animate-pulse shadow-sm shadow-rose-100'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm'
                            }`}
                    >
                        {isCurrentActive ? (
                            <>
                                <span className="w-1 h-1 rounded-full bg-rose-500 animate-ping" />
                                <span>⏸️ {formatTime(elapsed)}</span>
                            </>
                        ) : (
                            <>
                                <span>▶️ Mulai</span>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
