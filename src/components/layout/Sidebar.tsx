'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    UserCircle,
    LogOut,
    CheckSquare,
    ListTodo,
    FileText
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRole } from '@/components/layout/RoleProvider'

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const { role } = useRole()

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Task Listing', href: '/tasks', icon: ListTodo },
        { name: 'Weekly Report', href: '/reports', icon: FileText }
    ];

    if (role === 'admin') {
        navItems.push({ name: 'Customers', href: '/customers', icon: Users });
        navItems.push({ name: 'User Management', href: '/users', icon: UserCircle });
    }

    const navGroups = [
        {
            title: 'Menu',
            items: navItems
        }
    ]

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
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
                                        {item.name}
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
    )
}
