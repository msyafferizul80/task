import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function seedAdmin() {
    const email = 'admin@eleave.com'
    const password = 'password123'
    const name = 'System Admin'

    console.log(`Attempting to create admin user: ${email}`)

    // 1. Create Auth User
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name }
    })

    let userId;

    if (authError) {
        if (authError.message.includes('already been registered')) {
            console.log('User already exists. Fetching ID...');
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const existingUser = users.find(u => u.email === email);
            if (existingUser) {
                userId = existingUser.id;
                console.log('Found existing user ID:', userId);
            } else {
                console.error('Could not find existing user despite error.');
                return;
            }
        } else {
            console.error('Error creating auth user:', authError.message);
            return;
        }
    } else {
        userId = user.id;
        console.log('Auth user created. ID:', userId);
    }

    // 2. Create Organization (if not exists)
    // For the first super admin, we might need a default organization.
    // Let's create one called "HQ".

    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: 'Headquarters (HQ)', state_id: 'W.P. Kuala Lumpur' }) // Default state
        .select()
        .single()

    // If org creation fails (maybe RLS or unique constraint?), try to fetch existing?
    // But wait, RLS relies on user. Admin client bypasses RLS.
    let orgId = org?.id

    if (orgError) {
        console.log('Organization creation note:', orgError.message)
        // Fallback: fetch any org or assume one exists? 
        // Since it's invalid to have profile without org in our strict schema usually.
        const { data: existingOrg } = await supabase.from('organizations').select('id').limit(1).single()
        if (existingOrg) orgId = existingOrg.id
    }

    if (!orgId) {
        // If still no org, create one forcefully again or error out?
        // Just try one more time if it was a constraint issue differently, but assuming it worked or we fetched.
        console.error('Could not obtain an Organization ID. Profile creation might fail.')
    }

    // 3. Create Profile
    // We need to insert into 'profiles'.
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            id: userId,
            full_name: name,
            role: 'super_admin',
            status: 'active',
            organization_id: orgId,
            join_date: new Date().toISOString(),
            custom_al_entitlement: 14
        })

    if (profileError) {
        console.error('Error creating profile:', profileError.message)
    } else {
        console.log('Profile created successfully.')
        console.log('-----------------------------------')
        console.log('Initial Admin Credentials:')
        console.log(`Email: ${email}`)
        console.log(`Password: ${password}`)
        console.log('-----------------------------------')
    }
}

seedAdmin()
