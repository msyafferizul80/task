
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_EMAIL = 'msyafferizul@gmail.com'

async function run() {
    console.log('Checking hierarchy for:', ADMIN_EMAIL)

    // 1. Get Admin Profile
    const { data: admin } = await supabase.from('lv_profiles').select('id, full_name').eq('email', ADMIN_EMAIL).single()

    if (!admin) {
        console.error('Admin profile not found')
        return
    }
    console.log('Admin ID:', admin.id, 'Name:', admin.full_name)

    // 2. Count Reportees
    const { count, data: reportees } = await supabase
        .from('lv_profiles')
        .select('id, full_name, email', { count: 'exact' })
        .eq('manager_id', admin.id)

    console.log(`Found ${count} employees reporting to ${admin.full_name}:`)
    if (reportees && reportees.length > 0) {
        reportees.forEach(r => console.log(`- ${r.full_name} (${r.email})`))
    } else {
        console.log('No one reports to this admin. Email notifications for approvals won\'t trigger for him.')
    }
}

run()
