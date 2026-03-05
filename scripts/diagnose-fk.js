
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ACTIVE_USER_ID = '64ca01ff-713a-4725-8081-a0c53eb05737'
const ORPHANED_PROFILE_ID = '18140684-00ef-402d-8fbf-5130dfc2860f'

async function run() {
    console.log('--- DIAGNOSTICS ---')

    // 1. Check New Profile
    const { data: newProfile } = await supabase
        .from('lv_profiles')
        .select('id, email')
        .eq('id', ACTIVE_USER_ID)
        .single()

    if (newProfile) console.log('✅ New Profile Exists:', newProfile)
    else console.log('❌ New Profile MISSING!')

    // 2. Check Old Profile
    const { data: oldProfile } = await supabase
        .from('lv_profiles')
        .select('id, email')
        .eq('id', ORPHANED_PROFILE_ID)
        .single()

    if (oldProfile) console.log('OLD Profile Exists (Expected):', oldProfile)
    else console.log('OLD Profile Gone (Unexpected if delete failed)')

    // 3. Check ap_submissions references
    const { count: submissionCount } = await supabase
        .from('ap_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', ORPHANED_PROFILE_ID)

    console.log(`Found ${submissionCount} submissions referencing OLD profile.`)

    // 4. Try Update Again
    if (submissionCount > 0) {
        console.log('Attempting update...')
        const { error, data } = await supabase
            .from('ap_submissions')
            .update({ employee_id: ACTIVE_USER_ID })
            .eq('employee_id', ORPHANED_PROFILE_ID)
            .select()

        if (error) console.error('Update FAILED:', error)
        else console.log('Update SUCCEEDED. Rows affected:', data.length)
    }
}

run()
