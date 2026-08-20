'use client';

import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/lib/types';
import SortableTaskItem from './SortableTaskItem';
import { useRouter } from 'next/navigation';
import {
  InboxOutlined,
  PauseCircleOutlined,
  SyncOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DownOutlined,
  RightOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';

const DONE_DISPLAY_LIMIT = 5;

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  role?: string | null;
  isDoneColumn?: boolean;
  isBoardExpanded?: boolean;
  currentUserId?: string | null;
}

export default function KanbanColumn({
  status,
  tasks,
  role,
  isDoneColumn = false,
  isBoardExpanded = false,
  currentUserId,
}: KanbanColumnProps) {
  const isAdminOrManager = role === 'admin' || role === 'manager';
  const { setNodeRef } = useDroppable({ id: status });
  const router = useRouter();

  const [columnExpanded, setColumnExpanded] = useState(!isDoneColumn);

  const getColumnMeta = () => {
    switch (status) {
      case 'BACKLOG':
        return {
          title: 'Backlog',
          color: 'text-slate-700',
          dot: 'bg-slate-400',
          header: 'bg-slate-100/90',
          border: 'border-slate-200/80',
          emptyText: 'No tasks in backlog',
          emptyIcon: <InboxOutlined className="text-slate-400 text-base" />,
        };
      case 'CLIENT_HOLD':
        return {
          title: 'Client Hold',
          color: 'text-fuchsia-800',
          dot: 'bg-fuchsia-500',
          header: 'bg-fuchsia-50/80',
          border: 'border-fuchsia-200/80',
          emptyText: 'No tasks on client hold',
          emptyIcon: <PauseCircleOutlined className="text-fuchsia-400 text-base" />,
        };
      case 'IN_PROGRESS':
        return {
          title: 'In Progress',
          color: 'text-sky-800',
          dot: 'bg-sky-500',
          header: 'bg-sky-50/80',
          border: 'border-sky-200/80',
          emptyText: 'No active tasks in progress',
          emptyIcon: <SyncOutlined className="text-sky-400 text-base" />,
        };
      case 'REVIEW':
        return {
          title: 'Review',
          color: 'text-amber-800',
          dot: 'bg-amber-500',
          header: 'bg-amber-50/80',
          border: 'border-amber-200/80',
          emptyText: 'No tasks waiting for review',
          emptyIcon: <AuditOutlined className="text-amber-400 text-base" />,
        };
      case 'DONE':
        return {
          title: 'Done',
          color: 'text-emerald-800',
          dot: 'bg-emerald-500',
          header: 'bg-emerald-50/80',
          border: 'border-emerald-200/80',
          emptyText: 'No completed tasks in the last 48 hours',
          emptyIcon: <CheckCircleOutlined className="text-emerald-400 text-base" />,
        };
      default:
        return {
          title: status,
          color: 'text-slate-700',
          dot: 'bg-slate-400',
          header: 'bg-slate-100',
          border: 'border-slate-200',
          emptyText: 'No tasks',
          emptyIcon: <InboxOutlined className="text-slate-400 text-base" />,
        };
    }
  };

  const meta = getColumnMeta();
  const displayedTasks = isDoneColumn ? tasks.slice(0, DONE_DISPLAY_LIMIT) : tasks;
  const hasMore = isDoneColumn && tasks.length > DONE_DISPLAY_LIMIT;

  return (
    <div
      className={`flex flex-col rounded-2xl border ${meta.border} w-[85vw] min-w-[85vw] sm:w-72 sm:min-w-[288px] snap-start transition-all duration-200 bg-slate-50/30`}
    >
      {/* Column Header */}
      <div
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-2xl ${meta.header} ${
          isDoneColumn ? 'cursor-pointer select-none' : ''
        }`}
        onClick={isDoneColumn ? () => setColumnExpanded((v) => !v) : undefined}
      >
        <div className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
        <span className={`font-semibold text-xs ${meta.color} flex-1 truncate`}>
          {meta.title}
        </span>
        <span
          className={`text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-white/90 border ${meta.border} ${meta.color}`}
        >
          {tasks.length}
        </span>
        {isDoneColumn && (
          <span className={`text-[10px] ${meta.color} transition-transform duration-200 ml-0.5`}>
            {columnExpanded ? <DownOutlined /> : <RightOutlined />}
          </span>
        )}
      </div>

      {/* Column Body */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          columnExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-2.5 p-2.5 min-h-[120px] ${
            isBoardExpanded ? 'max-h-[700px]' : 'max-h-[400px]'
          } overflow-y-auto bg-slate-100/40 rounded-b-2xl`}
        >
          {isAdminOrManager ? (
            <SortableContext
              items={displayedTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayedTasks.map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  role={role}
                  isDone={isDoneColumn}
                  currentUserId={currentUserId}
                />
              ))}
            </SortableContext>
          ) : (
            <>
              {displayedTasks.map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  role={role}
                  isDone={isDoneColumn}
                  currentUserId={currentUserId}
                />
              ))}
            </>
          )}

          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center border-2 border-dashed border-slate-200/80 rounded-xl bg-white/40">
              {meta.emptyIcon}
              <span className="text-xs text-slate-400 font-medium">
                {meta.emptyText}
              </span>
            </div>
          )}

          {hasMore && (
            <button
              onClick={() => router.push('/tasks')}
              className="mt-1 w-full text-xs font-semibold text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-xl py-2 transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-mono tabular-nums"
            >
              +{tasks.length - DONE_DISPLAY_LIMIT} more — View All <ArrowRightOutlined className="text-[10px]" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsed summary for Done */}
      {isDoneColumn && !columnExpanded && tasks.length > 0 && (
        <div
          className="px-4 py-2 text-xs text-emerald-700 bg-white/90 rounded-b-2xl cursor-pointer hover:bg-emerald-50 transition-colors text-center border-t border-emerald-100 font-medium"
          onClick={() => setColumnExpanded(true)}
        >
          Click to view <span className="font-mono tabular-nums font-bold">{tasks.length}</span> completed tasks ▼
        </div>
      )}
      {isDoneColumn && !columnExpanded && tasks.length === 0 && (
        <div className="px-4 py-2 text-xs text-slate-400 bg-white/90 rounded-b-2xl text-center border-t border-slate-100">
          No completed tasks in the last 48 hours
        </div>
      )}
    </div>
  );
}

