
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
    const { data: profiles, error } = await supabase.from('lv_profiles').select('id, email, full_name, manager_id')
    if (error) {
        console.error('Error fetching profiles:', error)
    } else {
        console.log('All Profiles:', profiles)
    }
}

run()
