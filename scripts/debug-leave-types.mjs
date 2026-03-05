
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debug() {
    // 1. Get the likely user (based on previous logs, id ends in ...7d724 ?)
    // actually let's just search for the specific email if we know it, or just list all profiles.

    console.log('--- Profiles ---')
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, role, organization_id')
    console.log(profiles)

    if (profiles.length > 0) {
        const user = profiles[0] // Assuming first user is our test user
        console.log(`\nChecking for Org ID: ${user.organization_id}`)

        const { data: leaveTypes, error } = await supabase.from('leave_types').select('*').eq('organization_id', user.organization_id)
        if (error) console.error(error)
        console.log('--- Leave Types ---')
        console.log(leaveTypes)
    }
}

debug()
