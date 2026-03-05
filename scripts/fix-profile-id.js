
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const ACTIVE_USER_ID = '64ca01ff-713a-4725-8081-a0c53eb05737'
const ORPHANED_PROFILE_ID = '18140684-00ef-402d-8fbf-5130dfc2860f'

async function fixProfileLink() {
    console.log(`Attempting to link Profile ${ORPHANED_PROFILE_ID} to Auth User ${ACTIVE_USER_ID}`)

    // 0. Delete any conflicting empty profile for active user
    const { error: deleteError } = await supabase
        .from('lv_profiles')
        .delete()
        .eq('id', ACTIVE_USER_ID)

    if (deleteError) console.log('Note on delete (might be empty):', deleteError.message)

    // List of tables to update. Order matters if there are dependencies, but usually just update the FK.
    // Based on errors and knowledge: ap_submissions, lv_applications, lv_balances
    // We can't easily change the PK of profiles if it cascades restrictively.
    // STRATEGY: Create NEW profile with correct ID, COPY data, UPDATE references, DELETE old profile.

    // 1. Fetch Old Profile
    const { data: oldProfile, error: fetchError } = await supabase
        .from('lv_profiles')
        .select('*')
        .eq('id', ORPHANED_PROFILE_ID)
        .single()

    if (!oldProfile) {
        console.error('Old profile not found!')
        return
    }

    // 1b. Update Old Profile Email to avoid unique constraint violation during insert
    const { error: updateEmailError } = await supabase
        .from('lv_profiles')
        .update({ email: `TEMP_${Date.now()}_${oldProfile.email}` })
        .eq('id', ORPHANED_PROFILE_ID)

    if (updateEmailError) {
        console.error('Failed to clear email from old profile:', updateEmailError)
        return
    }
    console.log('Cleared email from old profile to avoid conflict.')

    // 2. Insert NEW Profile with ACTIVE_USER_ID
    const newProfile = { ...oldProfile, id: ACTIVE_USER_ID }
    delete newProfile.updated_at // Let DB handle

    const { error: insertError } = await supabase
        .from('lv_profiles')
        .insert(newProfile)

    if (insertError) {
        console.error('Failed to insert new profile:', insertError)
        return
    }
    console.log('Created new profile for Active User.')

    // 3. Update References in other tables
    const tablesToUpdate = [
        { table: 'ap_submissions', col: 'employee_id' },
        { table: 'lv_applications', col: 'user_id' },
        { table: 'lv_balances', col: 'user_id' },
        { table: 'lv_approval_logs', col: 'approver_id' },
        // Add any other tables that reference profiles
    ]

    for (const t of tablesToUpdate) {
        const { error: updateRefError } = await supabase
            .from(t.table)
            .update({ [t.col]: ACTIVE_USER_ID })
            .eq(t.col, ORPHANED_PROFILE_ID)

        if (updateRefError) {
            console.error(`Failed to update reference in ${t.table}:`, updateRefError)
        } else {
            console.log(`Updated references in ${t.table}`)
        }
    }

    // 4. Delete Old Profile
    const { error: finalDeleteError } = await supabase
        .from('lv_profiles')
        .delete()
        .eq('id', ORPHANED_PROFILE_ID)

    if (finalDeleteError) {
        console.error('Failed to delete old profile:', finalDeleteError)
    } else {
        console.log('Successfully deleted old orphaned profile.')
    }
}

fixProfileLink()
    .then(() => process.exit(0))
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
