'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type RoleContextType = {
    role: string | null;
    loading: boolean;
};

const RoleContext = createContext<RoleContextType>({ role: null, loading: true });

export const useRole = () => useContext(RoleContext);

export default function RoleProvider({ children }: { children: React.ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data } = await supabase.from('lv_profiles').select('role').eq('id', user.id).single();
                    setRole(data?.role || 'user');
                } else {
                    setRole('user');
                }
            } catch (err) {
                console.error("Failed to fetch role", err);
                setRole('user');
            } finally {
                setLoading(false);
            }
        };

        fetchRole();
    }, []);

    return (
        <RoleContext.Provider value={{ role, loading }}>
            {children}
        </RoleContext.Provider>
    );
}
