'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Input, Tag, Spin } from 'antd';
import {
  SearchOutlined,
  CheckSquareOutlined,
  UserOutlined,
  CalendarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  AppstoreOutlined,
  PauseCircleOutlined,
  SendOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { Task } from '@/lib/types';

interface NavRoute {
  title: string;
  subtitle: string;
  path: string;
  icon: React.ReactNode;
  category: 'Navigation' | 'Management';
}

const NAVIGATION_ROUTES: NavRoute[] = [
  { title: 'Dashboard', subtitle: 'Eisenhower Matrix & Kanban Board', path: '/', icon: <AppstoreOutlined className="text-cyan-500" />, category: 'Navigation' },
  { title: 'My Tasks', subtitle: 'Active tasks & review queue', path: '/mytasks', icon: <CheckSquareOutlined className="text-emerald-500" />, category: 'Navigation' },
  { title: 'Task Listing', subtitle: 'Complete organization task archive', path: '/tasks', icon: <CheckSquareOutlined className="text-indigo-500" />, category: 'Navigation' },
  { title: 'Review Groups', subtitle: 'Manage escalation review groups', path: '/review-groups', icon: <TeamOutlined className="text-purple-500" />, category: 'Management' },
  { title: 'Client Hold Tasks', subtitle: 'Tasks waiting on client action', path: '/client-hold-tasks', icon: <PauseCircleOutlined className="text-amber-500" />, category: 'Navigation' },
  { title: 'Calendar & Timeline', subtitle: 'Due dates and schedule timeline', path: '/calendar', icon: <CalendarOutlined className="text-sky-500" />, category: 'Navigation' },
  { title: 'Analytics', subtitle: 'Productivity metrics & time logs', path: '/analytics', icon: <BarChartOutlined className="text-blue-500" />, category: 'Management' },
  { title: 'Weekly Report', subtitle: 'Work logs and hour summaries', path: '/reports', icon: <FileTextOutlined className="text-rose-500" />, category: 'Management' },
  { title: 'Task Blueprints', subtitle: 'Recurring task blueprint templates', path: '/blueprints', icon: <SettingOutlined className="text-orange-500" />, category: 'Management' },
  { title: 'Customers', subtitle: 'Client companies directory', path: '/customers', icon: <UserOutlined className="text-teal-500" />, category: 'Management' },
  { title: 'Submissions', subtitle: 'Form submission entries', path: '/submissions', icon: <SendOutlined className="text-violet-500" />, category: 'Management' },
  { title: 'User Management', subtitle: 'Staff accounts & role scopes', path: '/users', icon: <TeamOutlined className="text-slate-600" />, category: 'Management' },
  { title: 'My Profile', subtitle: 'Account settings & credentials', path: '/profile', icon: <UserOutlined className="text-slate-500" />, category: 'Navigation' },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<any>(null);

  // Global Keyboard Listener: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleCustomOpen);
    };
  }, []);

  // Fetch tasks on modal open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      const fetchTasks = async () => {
        setLoading(true);
        try {
          const { data } = await supabase
            .from('tsk_tasks')
            .select(`
              id,
              title,
              status,
              priority_type,
              customer_name,
              department,
              due_date,
              assignee:lv_profiles!tsk_tasks_assignee_id_fkey(full_name)
            `)
            .order('updated_at', { ascending: false })
            .limit(100);

          setTasks((data as unknown as Task[]) || []);
        } catch (e) {
          console.error('Error loading tasks for Command Palette:', e);
        } finally {
          setLoading(false);
        }
      };

      fetchTasks();
    }
  }, [isOpen, supabase]);

  // Filter items
  const cleanQuery = query.trim().toLowerCase();

  const filteredRoutes = cleanQuery
    ? NAVIGATION_ROUTES.filter(
        (r) =>
          r.title.toLowerCase().includes(cleanQuery) ||
          r.subtitle.toLowerCase().includes(cleanQuery) ||
          r.path.toLowerCase().includes(cleanQuery)
      )
    : NAVIGATION_ROUTES;

  const filteredTasks = cleanQuery
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(cleanQuery) ||
          (t.customer_name && t.customer_name.toLowerCase().includes(cleanQuery)) ||
          (t.assignee && t.assignee.full_name.toLowerCase().includes(cleanQuery))
      ).slice(0, 8)
    : tasks.slice(0, 5);

  const totalItems = filteredRoutes.length + filteredTasks.length;

  const handleSelect = useCallback(
    (index: number) => {
      if (index < filteredRoutes.length) {
        const route = filteredRoutes[index];
        router.push(route.path);
        setIsOpen(false);
      } else {
        const taskIndex = index - filteredRoutes.length;
        const task = filteredTasks[taskIndex];
        if (task) {
          router.push(`/tasks?search=${encodeURIComponent(task.title)}`);
          setIsOpen(false);
        }
      }
    },
    [filteredRoutes, filteredTasks, router]
  );

  // Arrow Key Navigation
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (totalItems || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (totalItems || 1)) % (totalItems || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (totalItems > 0) {
        handleSelect(selectedIndex);
      }
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'DO_FIRST': return 'error';
      case 'SCHEDULE': return 'blue';
      case 'DELEGATE': return 'warning';
      case 'ELIMINATE': return 'default';
      default: return 'default';
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={() => setIsOpen(false)}
      footer={null}
      closable={false}
      centered
      width={640}
      styles={{
        body: {
          padding: 0,
        },
        mask: {
          backdropFilter: 'blur(6px)',
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
        },
      }}
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <SearchOutlined className="text-slate-400 text-lg mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search tasks, customers, assignees, or quick navigation..."
            className="flex-1 bg-transparent text-slate-800 text-[15px] outline-none placeholder:text-slate-400 font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-4 max-h-[500px]">
          {loading && tasks.length === 0 ? (
            <div className="flex justify-center items-center py-10 text-slate-400">
              <Spin size="small" />
              <span className="ml-2 text-xs">Loading search...</span>
            </div>
          ) : totalItems === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm italic">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Navigation Routes */}
              {filteredRoutes.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1.5">
                    Navigation & Pages
                  </div>
                  <div className="space-y-0.5">
                    {filteredRoutes.map((route, idx) => {
                      const isSelected = selectedIndex === idx;
                      return (
                        <div
                          key={route.path}
                          onClick={() => handleSelect(idx)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-cyan-50 text-cyan-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base flex items-center justify-center w-5 h-5">
                              {route.icon}
                            </span>
                            <div>
                              <div className="text-xs font-semibold">{route.title}</div>
                              <div className="text-[11px] text-slate-400 font-normal">
                                {route.subtitle}
                              </div>
                            </div>
                          </div>
                          <RightOutlined className="text-[10px] text-slate-300" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tasks List */}
              {filteredTasks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1.5">
                    Recent Tasks
                  </div>
                  <div className="space-y-0.5">
                    {filteredTasks.map((task, idx) => {
                      const itemIndex = filteredRoutes.length + idx;
                      const isSelected = selectedIndex === itemIndex;
                      return (
                        <div
                          key={task.id}
                          onClick={() => handleSelect(itemIndex)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-cyan-50 text-cyan-900'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="text-xs font-semibold truncate text-slate-800">
                              {task.title}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              {task.customer_name && (
                                <span className="truncate max-w-[150px]">
                                  {task.customer_name}
                                </span>
                              )}
                              {task.assignee?.full_name && (
                                <span>· {task.assignee.full_name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {task.priority_type && (
                              <Tag
                                color={getPriorityColor(task.priority_type)}
                                className="text-[10px] m-0"
                              >
                                {task.priority_type.replace('_', ' ')}
                              </Tag>
                            )}
                            <Tag className="text-[10px] font-mono m-0">
                              {task.status}
                            </Tag>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Shortcut Helper */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">
                ↑
              </kbd>{' '}
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">
                ↓
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">
                ↵
              </kbd>{' '}
              Select
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">Syazna-OS Command</span>
        </div>
      </div>
    </Modal>
  );
}
