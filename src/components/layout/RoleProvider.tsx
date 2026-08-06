'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type RoleContextType = {
    role: string | null;
    userId: string | null;
    department: string | null;
    loading: boolean;
};

const RoleContext = createContext<RoleContextType>({ role: null, userId: null, department: null, loading: true });

export const useRole = () => useContext(RoleContext);

export default function RoleProvider({ children }: { children: React.ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [department, setDepartment] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setUserId(user.id);
                    const { data } = await supabase.from('lv_profiles').select('role, department').eq('id', user.id).single();
                    setRole((data?.role || 'user').toLowerCase());
                    setDepartment(data?.department || null);
                } else {
                    setRole('user');
                    setUserId(null);
                    setDepartment(null);
                }
            } catch (err) {
                console.error("Failed to fetch role", err);
                setRole('user');
                setUserId(null);
                setDepartment(null);
            } finally {
                setLoading(false);
            }
        };

        fetchRole();
    }, []);

    return (
        <RoleContext.Provider value={{ role, userId, department, loading }}>
            {children}
        </RoleContext.Provider>
    );
}
