import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function GET(req: Request) {
    try {
        const supabase = await createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from('lv_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || (profile?.role !== 'admin' && profile?.role !== 'manager')) {
            return NextResponse.json({ error: 'Forbidden. Only admins and managers can access this.' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const wantArchived = searchParams.get('archived') === 'true';

        // First get ALL submissions without filtering
        const { data: allSubmissions, error: allError } = await supabase
            .from('tsk_submissions')
            .select('*')
            .order('created_at', { ascending: false });

        if (allError) throw allError;

        // Filter on the server instead of using Supabase filters to avoid issues
        const filtered = (allSubmissions || []).filter(sub => {
            const subArchived = !!sub.archived; // Convert to boolean
            return wantArchived ? subArchived : !subArchived;
        });

        console.log('Want archived:', wantArchived);
        console.log('Filtered count:', filtered.length);
        console.log('All submissions:', allSubmissions);

        return NextResponse.json(filtered);
    } catch (error: any) {
        console.error('Error fetching submissions:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error?.message || JSON.stringify(error) 
        }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const supabase = await createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from('lv_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || (profile?.role !== 'admin' && profile?.role !== 'manager')) {
            return NextResponse.json({ error: 'Forbidden. Only admins and managers can access this.' }, { status: 403 });
        }

        const { id, archived } = await req.json();

        const { data, error: updateError } = await supabase
            .from('tsk_submissions')
            .update({ archived })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error updating submission:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error?.message || JSON.stringify(error) 
        }, { status: 500 });
    }
}
