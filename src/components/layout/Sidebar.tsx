'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    UserCircle,
    LogOut,
    CheckSquare,
    ListTodo,
    FileText,
    BarChart2,
    Menu,
    X,
    Bot,
    PauseCircle,
    Calendar,
    Inbox
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRole } from '@/components/layout/RoleProvider'
import { motion, AnimatePresence } from 'framer-motion'
import { differenceInDays } from 'date-fns'

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const { role } = useRole()

    const [bottleneckCount, setBottleneckCount] = useState(0)
    const [clientHoldCount, setClientHoldCount] = useState(0)
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    // Fetch bottleneck and client hold tasks for the current user
    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data } = await supabase
                    .from('tsk_tasks')
                    .select('id, created_at, status')
                    .eq('assignee_id', user.id)
                    .neq('status', 'DONE')

                if (!data) return
                const now = new Date()
                const bottleneckCountVal = data.filter(t => differenceInDays(now, new Date(t.created_at)) >= 3).length
                const clientHoldCountVal = data.filter(t => t.status === 'CLIENT_HOLD').length
                setBottleneckCount(bottleneckCountVal)
                setClientHoldCount(clientHoldCountVal)
            } catch (e) {
                // silently fail
            }
        }

        fetchCounts()
        const channel = supabase
            .channel('sidebar-counts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchCounts)
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [])

    // Nav items with optional badge
    const navItems: { name: string; href: string; icon: React.ElementType; badge?: number; badgeColor?: string }[] = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'My Tasks', href: '/mytasks', icon: CheckSquare, badge: bottleneckCount > 0 ? bottleneckCount : undefined, badgeColor: 'amber' },
        { name: 'Client Hold Tasks', href: '/client-hold-tasks', icon: PauseCircle, badge: clientHoldCount > 0 ? clientHoldCount : undefined, badgeColor: 'fuchsia' },
        { name: 'Task Listing', href: '/tasks', icon: ListTodo },
        { name: 'Calendar & Timeline', href: '/calendar', icon: Calendar },
        { name: 'Weekly Report', href: '/reports', icon: FileText },
        { name: 'My Profile', href: '/profile', icon: UserCircle }
    ];

    if (role === 'admin' || role === 'manager') {
        //navItems.push({ name: 'Submissions', href: '/submissions', icon: Inbox });
        navItems.push({ name: 'Analytics', href: '/analytics', icon: BarChart2 });
        navItems.push({ name: 'Customers', href: '/customers', icon: Users });
        navItems.push({ name: 'Blueprints', href: '/blueprints', icon: Bot });
    }

    if (role === 'admin') {
        navItems.push({ name: 'User Management', href: '/users', icon: UserCircle });
    }

    const navGroups = [
        {
            title: 'Menu',
            items: navItems
        }
    ]

    const handleLogout = async () => {
        setIsLoggingOut(true)
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    // Mobile layout logic
    const MAX_VISIBLE_MOBILE = 4
    const visibleMobileItems = navItems.slice(0, MAX_VISIBLE_MOBILE)
    const overflowMobileItems = navItems.slice(MAX_VISIBLE_MOBILE)
    const hasMore = overflowMobileItems.length > 0

    return (
        <>
            {/* ─── Desktop Sidebar ─── */}
            <aside className="hidden md:flex flex-col w-64 h-screen bg-white border-r border-gray-200 shadow-sm sticky top-0 left-0 print:hidden">
                <div className="h-20 flex items-center justify-center border-b border-gray-100 p-4">
                    <img src="/logo.png" alt="Syazna World Logo" className="max-h-12 w-auto object-contain" />
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
                    {navGroups.map((group) => (
                        <div key={group.title}>
                            <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                {group.title}
                            </h3>
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${isActive
                                                ? "bg-indigo-50 text-indigo-700"
                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                                }`}
                                        >
                                            <Icon className={`h-5 w-5 ${isActive ? "text-indigo-600" : "text-gray-400"}`} />
                                            <span className="flex-1">{item.name}</span>
                                            {item.badge !== undefined && (
                                                <span className={`flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-white text-[10px] font-bold animate-pulse ${item.badgeColor === 'fuchsia' ? 'bg-fuchsia-500' : 'bg-amber-500'}`}>
                                                    {item.badge}
                                                </span>
                                            )}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <LogOut className="h-5 w-5" />
                        <span>Log Out</span>
                    </button>
                </div>
            </aside>

            {/* ─── Mobile Bottom Navigation Bar ─── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] print:hidden">
                <div className="flex items-stretch h-16">
                    {visibleMobileItems.map((item) => {
                        const isActive = pathname === item.href
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                                    isActive
                                        ? 'text-indigo-600'
                                        : 'text-gray-400 active:text-indigo-500'
                                }`}
                            >
                                <div className={`relative p-1.5 rounded-xl transition-colors ${isActive ? 'bg-indigo-50' : ''}`}>
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                                    {item.badge !== undefined && (
                                        <span className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-white text-[9px] font-bold ${item.badgeColor === 'fuchsia' ? 'bg-fuchsia-500' : 'bg-amber-500'}`}>
                                            {item.badge > 9 ? '9+' : item.badge}
                                        </span>
                                    )}
                                </div>
                                <span>{item.name}</span>
                            </Link>
                        )
                    })}

                    {hasMore ? (
                        <button
                            onClick={() => setIsMoreMenuOpen(true)}
                            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-400 active:text-indigo-500 transition-colors"
                        >
                            <div className="p-1.5 rounded-xl">
                                <Menu className="h-5 w-5" />
                            </div>
                            <span>More</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-red-400 active:text-red-600 transition-colors disabled:opacity-50"
                        >
                            <div className="p-1.5 rounded-xl">
                                <LogOut className="h-5 w-5" />
                            </div>
                            <span>{isLoggingOut ? '...' : 'Log Out'}</span>
                        </button>
                    )}
                </div>
            </nav>

            {/* ─── Mobile More Menu Drawer ─── */}
            <AnimatePresence>
                {isMoreMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMoreMenuOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] md:hidden"
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[70] p-6 shadow-2xl md:hidden"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-gray-900">More Menu</h2>
                                <button
                                    onClick={() => setIsMoreMenuOpen(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X className="h-6 w-6 text-gray-500" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2 mb-6">
                                {overflowMobileItems.map((item) => {
                                    const isActive = pathname === item.href
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsMoreMenuOpen(false)}
                                            className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                                                isActive
                                                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                                    : 'text-gray-600 active:bg-gray-50'
                                            }`}
                                        >
                                            <div className={`p-2 rounded-xl ${isActive ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                                <Icon className={`h-6 w-6 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} />
                                            </div>
                                            <span className="text-base font-semibold">{item.name}</span>
                                        </Link>
                                    )
                                })}
                            </div>

                            <button
                                onClick={() => {
                                    setIsMoreMenuOpen(false)
                                    handleLogout()
                                }}
                                disabled={isLoggingOut}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-600 active:bg-red-50 transition-all font-semibold disabled:opacity-50"
                            >
                                <div className="p-2 rounded-xl bg-red-50">
                                    <LogOut className="h-6 w-6" />
                                </div>
                                <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
