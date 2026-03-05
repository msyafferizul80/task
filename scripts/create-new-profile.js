
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
    console.log('Creating new profile for active user:', ACTIVE_USER_ID)

    // 1. Fetch old profile data to copy
    const { data: oldProfile, error: fetchError } = await supabase
        .from('lv_profiles')
        .select('*')
        .eq('id', ORPHANED_PROFILE_ID)
        .single()

    if (fetchError) {
        console.error('Failed to fetch old profile:', fetchError)
        return
    }

    // 1b. Rename old profile employee_id to avoid collision
    if (oldProfile.employee_id) {
        const { error: renameError } = await supabase
            .from('lv_profiles')
            .update({ employee_id: `OLD_${oldProfile.employee_id}` })
            .eq('id', ORPHANED_PROFILE_ID)

        if (renameError) {
            console.log('Failed to rename employee_id (might be null or not unique):', renameError.message)
            // Continue anyway as employee_id might be null
        } else {
            console.log('Renamed old profile employee_id.')
        }
    }

    // 2. Create new profile object
    const newProfile = { ...oldProfile }
    newProfile.id = ACTIVE_USER_ID
    newProfile.email = 'msyafferizul@gmail.com' // Restore original email
    delete newProfile.updated_at

    // 3. Insert
    const { data, error } = await supabase
        .from('lv_profiles')
        .insert(newProfile)
        .select()

    if (error) {
        console.error('Insert Error:', error)
    } else {
        console.log('Success:', data)
    }
}

run()
