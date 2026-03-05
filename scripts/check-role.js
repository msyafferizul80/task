
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

const fs = require('fs')

async function checkRole(email) {
    let output = `Checking role for: ${email}\n`

    const { data: profiles, error } = await supabase
        .from('lv_profiles')
        .select('*')
        .eq('email', email)

    if (error) {
        output += `Error fetching profile: ${JSON.stringify(error)}\n`
    } else if (profiles && profiles.length > 0) {
        output += `Found ${profiles.length} Profiles:\n`
        profiles.forEach((p, index) => {
            output += `Profile #${index + 1}:\n`
            output += `- ID: ${p.id}\n`
            output += `- Role: '${p.role}' (Type: ${typeof p.role})\n`
            output += `- Organization ID: ${p.organization_id}\n`
        })
    } else {
        output += `[NOT FOUND IN PROFILE]\n`
    }

    fs.writeFileSync('role_check_result.txt', output)
    console.log('Output written to role_check_result.txt')
}

checkRole('msyafferizul@gmail.com')
    .then(() => {
        process.exit(0)
    })
    .catch(err => {
        console.error('Script failed:', err)
        process.exit(1)
    })
