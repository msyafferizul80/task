'use client';

import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import type { TaskStatus } from '@/lib/types';
import TaskComments from '@/components/task/TaskComments';
import TaskStatusHistory from '@/components/task/TaskStatusHistory';

interface TaskDetailLayoutProps {
    children: ReactNode;
    taskId: string;
    currentStatus: TaskStatus;
    taskCreatedAt: string;
    currentUserId: string;
    role: string | null;
}

export default function TaskDetailLayout({
    children,
    taskId,
    currentStatus,
    taskCreatedAt,
    currentUserId,
    role,
}: TaskDetailLayoutProps) {
    return (
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-3">
                <Tabs
                    defaultActiveKey="details"
                    items={[
                        {
                            key: 'details',
                            label: 'Task Details',
                            children,
                        },
                        {
                            key: 'timeline',
                            label: 'Status Timeline',
                            children: (
                                <TaskStatusHistory
                                    taskId={taskId}
                                    currentStatus={currentStatus}
                                    taskCreatedAt={taskCreatedAt}
                                />
                            ),
                        },
                    ]}
                />
            </div>
            <div className="min-w-0 xl:col-span-2 xl:border-l xl:border-slate-200 xl:pl-6">
                <TaskComments taskId={taskId} currentUserId={currentUserId} role={role} />
            </div>
        </div>
    );
}
