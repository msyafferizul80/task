import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { fetchAllPages } from '@/lib/fetch-all-pages';

function isMissingArchivedColumn(error: unknown): boolean {
    return error !== null
        && typeof error === 'object'
        && 'code' in error
        && error.code === '42703'
        && 'message' in error
        && typeof error.message === 'string'
        && error.message.includes('archived');
}

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

        let query = supabase
            .from('tsk_submissions')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id', { ascending: true });

        query = wantArchived
            ? query.eq('archived', true)
            : query.or('archived.eq.false,archived.is.null');

        let submissions;
        try {
            submissions = await fetchAllPages(query);
        } catch (error) {
            if (!isMissingArchivedColumn(error)) throw error;
            if (wantArchived) return NextResponse.json([]);

            const legacyQuery = supabase
                .from('tsk_submissions')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true });
            submissions = await fetchAllPages(legacyQuery);
        }
        return NextResponse.json(submissions);
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
