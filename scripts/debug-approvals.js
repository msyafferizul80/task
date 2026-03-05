
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
    console.log('--- Debugging Approvals ---')

    // 1. Check Profiles for admins/managers
    const { data: profiles, error: profileError } = await supabase
        .from('lv_profiles')
        .select('id, email, full_name, role, organization_id')
        .in('email', ['msyafferizul@gmail.com', 'sheffi80@gmail.com', 'majikanpedia@gmail.com'])

    if (profileError) console.error('Error fetching profiles:', profileError)
    console.log('Profiles:', profiles)

    // 2. Check Pending Applications
    const { data: applications, error: appError } = await supabase
        .from('lv_applications')
        .select('id, status, profile_id, lv_profiles(full_name, manager_id, email)')
        .eq('status', 'pending')

    if (appError) console.error('Error fetching applications:', appError)
    console.log('Pending Applications:', JSON.stringify(applications, null, 2))
}

run()
