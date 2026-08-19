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
    Inbox,
    UserCheck
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
    const [userProfile, setUserProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null)

    // Fetch bottleneck, client hold tasks and user profile for the current user
    useEffect(() => {
        const fetchCountsAndProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                // 1. Fetch counts
                const { data: tasksData } = await supabase
                    .from('tsk_tasks')
                    .select('id, created_at, status')
                    .eq('assignee_id', user.id)
                    .neq('status', 'DONE')

                if (tasksData) {
                    const now = new Date()
                    const bottleneckCountVal = tasksData.filter(t => differenceInDays(now, new Date(t.created_at)) >= 3).length
                    const clientHoldCountVal = tasksData.filter(t => t.status === 'CLIENT_HOLD').length
                    setBottleneckCount(bottleneckCountVal)
                    setClientHoldCount(clientHoldCountVal)
                }

                // 2. Fetch profile
                const { data: profileData } = await supabase
                    .from('lv_profiles')
                    .select('full_name, avatar_url')
                    .eq('id', user.id)
                    .single()

                if (profileData) {
                    setUserProfile(profileData)
                }
            } catch (e) {
                // silently fail
            }
        }

        fetchCountsAndProfile()
        const channel = supabase
            .channel('sidebar-counts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_tasks' }, fetchCountsAndProfile)
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [])

    type SidebarNavItem = {
        name: string;
        href: string;
        icon: React.ComponentType<any>;
        badge?: number;
        badgeColor?: string;
    };

    // Nav items categorized by groups for Desktop
    const myWorkspaceItems: SidebarNavItem[] = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'My Tasks', href: '/mytasks', icon: CheckSquare, badge: bottleneckCount > 0 ? bottleneckCount : undefined, badgeColor: 'amber' },
        { name: 'Client Hold Tasks', href: '/client-hold-tasks', icon: PauseCircle, badge: clientHoldCount > 0 ? clientHoldCount : undefined, badgeColor: 'fuchsia' },
        { name: 'My Profile', href: '/profile', icon: UserCircle }
    ];

    const projectToolsItems: SidebarNavItem[] = [
        { name: 'Task Listing', href: '/tasks', icon: ListTodo },
        { name: 'Calendar & Timeline', href: '/calendar', icon: Calendar },
        { name: 'Weekly Report', href: '/reports', icon: FileText }
    ];

    const managementItems: SidebarNavItem[] = [];
    if (role === 'admin' || role === 'manager' || role === 'supervisor') {
        managementItems.push({ name: 'Analytics', href: '/analytics', icon: BarChart2 });
    }
    if (role === 'admin' || role === 'manager') {
        managementItems.push({ name: 'Submissions', href: '/submissions', icon: Inbox });
        managementItems.push({ name: 'Customers', href: '/customers', icon: Users });
        managementItems.push({ name: 'Blueprints', href: '/blueprints', icon: Bot });
    }

    if (role === 'admin') {
        managementItems.push({ name: 'Review Groups', href: '/review-groups', icon: UserCheck });
        managementItems.push({ name: 'User Management', href: '/users', icon: UserCircle });
    }

    const navGroups: { title: string; items: SidebarNavItem[] }[] = [
        { title: 'Tugasan Saya', items: myWorkspaceItems },
        { title: 'Projek & Kalendar', items: projectToolsItems }
    ];

    if (managementItems.length > 0) {
        navGroups.push({ title: 'Pengurusan', items: managementItems });
    }

    // Mobile bottom navigation bar - optimized for on-the-go workflow
    const mobileOrderedItems: SidebarNavItem[] = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'My Tasks', href: '/mytasks', icon: CheckSquare, badge: bottleneckCount > 0 ? bottleneckCount : undefined, badgeColor: 'amber' },
        { name: 'Calendar', href: '/calendar', icon: Calendar },
        { name: 'Reports', href: '/reports', icon: FileText },
        // Items below will go into the 'More' menu drawer on mobile
        { name: 'Client Hold Tasks', href: '/client-hold-tasks', icon: PauseCircle, badge: clientHoldCount > 0 ? clientHoldCount : undefined, badgeColor: 'fuchsia' },
        { name: 'Task Listing', href: '/tasks', icon: ListTodo },
        { name: 'My Profile', href: '/profile', icon: UserCircle }
    ];

    if (role === 'admin' || role === 'manager' || role === 'supervisor') {
        mobileOrderedItems.push({ name: 'Analytics', href: '/analytics', icon: BarChart2 });
    }
    if (role === 'admin' || role === 'manager') {
        mobileOrderedItems.push({ name: 'Submissions', href: '/submissions', icon: Inbox });
        mobileOrderedItems.push({ name: 'Customers', href: '/customers', icon: Users });
        mobileOrderedItems.push({ name: 'Blueprints', href: '/blueprints', icon: Bot });
    }

    if (role === 'admin') {
        mobileOrderedItems.push({ name: 'Review Groups', href: '/review-groups', icon: UserCheck });
        mobileOrderedItems.push({ name: 'User Management', href: '/users', icon: UserCircle });
    }

    const visibleMobileItems = mobileOrderedItems.slice(0, 4)
    const overflowMobileItems = mobileOrderedItems.slice(4)
    const hasMore = overflowMobileItems.length > 0

    const handleLogout = async () => {
        setIsLoggingOut(true)
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

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

                {/* Premium User Profile Card */}
                <div className="p-4 border-t border-gray-200 bg-gray-50/50 flex flex-col gap-3">
                    {userProfile ? (
                        <div className="flex items-center gap-3 px-2 py-1">
                            <img
                                src={userProfile.avatar_url || `https://ui-avatars.com/api/?name=${userProfile.full_name}&background=6366f1&color=fff`}
                                className="w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm"
                                alt={userProfile.full_name}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate mb-0 leading-snug">
                                    {userProfile.full_name}
                                </p>
                                <p className="text-xs text-gray-500 capitalize truncate mb-0 mt-0.5 font-medium">
                                    {role || 'User'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-2 py-1 animate-pulse">
                            <div className="w-9 h-9 rounded-full bg-gray-200" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 bg-gray-200 rounded w-3/4" />
                                <div className="h-2 bg-gray-200 rounded w-1/2" />
                            </div>
                        </div>
                    )}
                    
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg border border-red-100 transition-all duration-200 bg-white shadow-sm mt-1 disabled:opacity-50"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>{isLoggingOut ? 'Logging out...' : 'Log Out'}</span>
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

                            <div className="grid grid-cols-1 gap-2 mb-6 max-h-[60vh] overflow-y-auto pr-1">
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
                                            {item.badge !== undefined && (
                                                <span className={`flex items-center justify-center h-5 min-w-[20px] px-2 rounded-full text-white text-[10px] font-bold bg-amber-500 ml-auto`}>
                                                    {item.badge}
                                                </span>
                                            )}
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
