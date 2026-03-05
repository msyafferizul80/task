
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ORPHANED_PROFILE_ID = '18140684-00ef-402d-8fbf-5130dfc2860f'

async function run() {
    console.log('Deleting orphaned profile:', ORPHANED_PROFILE_ID)

    const { error } = await supabase
        .from('lv_profiles')
        .delete()
        .eq('id', ORPHANED_PROFILE_ID)

    if (error) {
        console.error('Delete Failed:', error.message)
        // Detailed check if FK violation again
        if (error.code === '23503') {
            console.error('Detailed:', error.details)
        }
    } else {
        console.log('Success: Deleted old profile.')
    }
}

run()
