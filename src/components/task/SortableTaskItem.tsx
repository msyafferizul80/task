'use client';

import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';
import { useRole } from '@/components/layout/RoleProvider';
import { useTimer } from '@/components/task/TimerProvider';
import {
  CheckOutlined,
  FlagOutlined,
  UserOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';

interface SortableTaskItemProps {
  task: Task;
  role?: string | null;
  isDone?: boolean;
  currentUserId?: string | null;
}

export default function SortableTaskItem({
  task,
  role,
  isDone = false,
  currentUserId,
}: SortableTaskItemProps) {
  const { department: currentUserDept, accessibleDepartments } = useRole();
  const isAdminOrManager = role === 'admin' || role === 'manager';
  const canDrag =
    isAdminOrManager ||
    (role === 'supervisor' && !!task.department && accessibleDepartments.includes(task.department)) ||
    task.assignee_id === currentUserId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canDrag });

  const { activeLogs, startTimer, stopTimer } = useTimer();
  const activeLogForTask = activeLogs.find((log) => log.task_id === task.id);
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
    zIndex: isDragging ? 1000 : (undefined as any),
  };

  // Eisenhower Priority Left Border mapping
  const getBorderColor = () => {
    switch (task.priority_type) {
      case 'DO_FIRST':
        return 'border-l-[3.5px] border-l-rose-500';
      case 'SCHEDULE':
        return 'border-l-[3.5px] border-l-sky-500';
      case 'DELEGATE':
        return 'border-l-[3.5px] border-l-amber-500';
      case 'ELIMINATE':
        return 'border-l-[3.5px] border-l-slate-400';
      default:
        return 'border-l-[3.5px] border-l-slate-200';
    }
  };

  const isOverdue =
    task.due_date &&
    new Date(task.due_date).getTime() < Date.now() &&
    !isDone;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative bg-white p-3 rounded-xl shadow-2xs border border-slate-200/80 transition-all duration-200
        ${isDone ? 'opacity-70 bg-slate-50/50' : 'hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300'}
        ${isDragging ? 'shadow-lg ring-2 ring-cyan-400' : ''}
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
        ${getBorderColor()}`}
    >
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1 flex-wrap">
          {isDone && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
              <CheckOutlined className="text-[9px]" /> Done
            </span>
          )}
          {!isDone && task.is_escalated && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md shadow-2xs">
              <FlagOutlined className="text-[9px] text-amber-600" /> Escalated
            </span>
          )}
        </div>
        {isOverdue && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md font-mono tabular-nums">
            <ClockCircleOutlined className="text-[9px]" /> Overdue
          </span>
        )}
      </div>

      {/* Task Title */}
      <div
        className={`font-semibold text-xs leading-snug mb-2 ${
          isDone ? 'line-through text-slate-400' : 'text-slate-800'
        }`}
      >
        {task.title}
      </div>

      {/* Meta Info (Customer & Assignee / Group) */}
      <div className="flex flex-col gap-1 text-[11px] mb-2.5">
        {task.customer_name && (
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 truncate">
            <UserOutlined className="text-[10px] text-slate-400 shrink-0" />
            <span className="truncate font-medium">{task.customer_name}</span>
          </div>
        )}
        {task.assignee ? (
          <div className="flex items-center gap-1.5 text-cyan-800 bg-cyan-50/60 px-2 py-1 rounded-md border border-cyan-100/60 truncate">
            <ToolOutlined className="text-[10px] text-cyan-600 shrink-0" />
            <span className="truncate font-medium">{task.assignee.full_name}</span>
          </div>
        ) : task.escalated_to_group_id ? (
          <div className="flex items-center gap-1.5 text-purple-800 bg-purple-50/60 px-2 py-1 rounded-md border border-purple-100/60 truncate">
            <TeamOutlined className="text-[10px] text-purple-600 shrink-0" />
            <span className="truncate font-medium">Kumpulan Semakan</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Footer: Due Date & Timer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div
          className={`text-[11px] font-mono tabular-nums ${
            isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'
          }`}
        >
          {task.due_date ? `Due: ${formatDate(task.due_date)}` : ''}
        </div>
        {!isDone && (
          <div
            onClick={handleTimerClick}
            onMouseDown={handleButtonMouseDown}
            onTouchStart={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 border select-none ${
              isCurrentActive
                ? 'bg-rose-50 border-rose-300 text-rose-600 font-mono tabular-nums animate-pulse shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-700 shadow-2xs'
            }`}
          >
            {isCurrentActive ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <PauseCircleOutlined className="text-xs" />
                <span className="font-mono tabular-nums">{formatTime(elapsed)}</span>
              </>
            ) : (
              <>
                <PlayCircleOutlined className="text-xs" />
                <span>Mula</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

