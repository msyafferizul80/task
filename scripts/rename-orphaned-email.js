
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
    console.log('Renaming email for orphaned profile:', ORPHANED_PROFILE_ID)

    const { data, error } = await supabase
        .from('lv_profiles')
        .update({ email: 'orphaned_msyafferizul@gmail.com' })
        .eq('id', ORPHANED_PROFILE_ID)
        .select()

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Success:', data)
    }
}

run()
