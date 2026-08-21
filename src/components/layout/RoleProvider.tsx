'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type RoleContextType = {
    role: string | null;
    userId: string | null;
    department: string | null;
    borrowedDepartments: string[];
    accessibleDepartments: string[];
    hasDepartmentAccess: (dept?: string | null) => boolean;
    loading: boolean;
};

const RoleContext = createContext<RoleContextType>({
    role: null,
    userId: null,
    department: null,
    borrowedDepartments: [],
    accessibleDepartments: [],
    hasDepartmentAccess: () => false,
    loading: true
});

export const useRole = () => useContext(RoleContext);

export default function RoleProvider({ children }: { children: React.ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [department, setDepartment] = useState<string | null>(null);
    const [borrowedDepartments, setBorrowedDepartments] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setUserId(user.id);
                    const [profileRes, deptGrantsRes] = await Promise.all([
                        supabase.from('lv_profiles').select('role, department').eq('id', user.id).single(),
                        supabase.from('user_departments').select('department').eq('user_id', user.id)
                    ]);

                    const userRole = (profileRes.data?.role || 'user').toLowerCase();
                    const homeDept = profileRes.data?.department || null;
                    const borrowed = (deptGrantsRes.data || [])
                        .map((d: any) => d.department)
                        .filter(Boolean);

                    setRole(userRole);
                    setDepartment(homeDept);
                    setBorrowedDepartments(borrowed);
                } else {
                    setRole('user');
                    setUserId(null);
                    setDepartment(null);
                    setBorrowedDepartments([]);
                }
            } catch (err) {
                console.error("Failed to fetch role", err);
                setRole('user');
                setUserId(null);
                setDepartment(null);
                setBorrowedDepartments([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRole();
    }, []);

    const accessibleDepartments = React.useMemo(() => {
        const set = new Set<string>();
        if (department) set.add(department);
        borrowedDepartments.forEach(d => set.add(d));
        return Array.from(set);
    }, [department, borrowedDepartments]);

    const hasDepartmentAccess = React.useCallback((dept?: string | null) => {
        if (!dept) return false;
        if (role === 'admin' || role === 'manager') return true;
        return accessibleDepartments.includes(dept);
    }, [role, accessibleDepartments]);

    return (
        <RoleContext.Provider value={{
            role,
            userId,
            department,
            borrowedDepartments,
            accessibleDepartments,
            hasDepartmentAccess,
            loading
        }}>
            {children}
        </RoleContext.Provider>
    );
}
