
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
    console.log('Re-linking FKs from', ORPHANED_PROFILE_ID, 'to', ACTIVE_USER_ID)

    const tablesToUpdate = [
        { table: 'ap_submissions', col: 'employee_id' },
        { table: 'lv_applications', col: 'user_id' },
        { table: 'lv_balances', col: 'user_id' },
        { table: 'lv_approval_logs', col: 'approver_id' },
        // Add any other tables that reference profiles if discovered
    ]

    for (const t of tablesToUpdate) {
        console.log(`Updating ${t.table}...`)
        const { error, count } = await supabase
            .from(t.table)
            .update({ [t.col]: ACTIVE_USER_ID })
            .eq(t.col, ORPHANED_PROFILE_ID)
            .select('count', { count: 'exact' })

        if (error) {
            console.error(`Failed to update reference in ${t.table}:`, error.message)
        } else {
            console.log(`Updated references in ${t.table}`)
        }
    }

    // Finally, delete the old profile
    console.log('Deleting old orphaned profile...')
    const { error: deleteError } = await supabase
        .from('lv_profiles')
        .delete()
        .eq('id', ORPHANED_PROFILE_ID)

    if (deleteError) {
        console.error('Failed to delete old profile:', deleteError.message)
    } else {
        console.log('Successfully deleted old orphaned profile.')
    }
}

run()
