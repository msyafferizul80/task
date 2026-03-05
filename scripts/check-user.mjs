import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function checkUser() {
    // Get the admin user we seeded
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const admin = users.find(u => u.email === 'admin@eleave.com')

    if (!admin) {
        console.log('Admin user not found in Auth')
        return
    }

    console.log('Admin Auth ID:', admin.id)

    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', admin.id).single()

    if (error) {
        console.error('Profile Fetch Error:', error)
    } else {
        console.log('Profile Data:', profile)
    }
}

checkUser()
