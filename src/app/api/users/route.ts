import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
    try {
        // Authenticate the requestor
        const supabase = await createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if the requestor has admin role
        const { data: profile, error: profileError } = await supabase
            .from('lv_profiles')
            .select('role, organization_id')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden. Only admins can create users.' }, { status: 403 });
        }

        // Parse the request body
        const { email, password, full_name, role } = await req.json();

        if (!email || !password || !full_name || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Initialize Supabase Admin Client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing Supabase environment variables');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // Create the user in Supabase Auth
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name,
                role
            }
        });

        if (createError) {
            console.error('Error creating user auth:', createError);
            return NextResponse.json({ error: createError.message }, { status: 400 });
        }

        // We assume there might be a trigger creating the profile. 
        // Let's check or wait a small amount of time to avoid race conditions.
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Ensure the profile exists and has the correct role 
        // Admin API can bypass RLS here to update explicit values
        const { error: profileUpdateError } = await supabaseAdmin
            .from('lv_profiles')
            .upsert({
                id: newUser.user.id,
                email: email,
                full_name: full_name,
                role: role,
                status: 'active',
                organization_id: profile.organization_id || null
            }, {
                onConflict: 'id'
            });

        if (profileUpdateError) {
            console.error('Error updating user profile:', profileUpdateError);
            // We successfully created the auth user but failed to update profile correctly
            return NextResponse.json({ error: 'User created in auth, but failed to setup profile. ' + profileUpdateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, user: newUser.user });

    } catch (error: any) {
        console.error('Server error in creating user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const supabase = await createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if requestor is admin
        const { data: profile, error: profileError } = await supabase
            .from('lv_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden. Only admins can delete users.' }, { status: 403 });
        }

        const { id } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
        }

        // Prevent admin from deleting themselves
        if (id === user.id) {
            return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // First attempt to delete from lv_profiles in case cascade isn't setup
        await supabaseAdmin.from('lv_profiles').delete().eq('id', id);

        // Delete from Supabase Auth
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (deleteError) {
            console.error('Error deleting user auth:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Server error in deleting user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
