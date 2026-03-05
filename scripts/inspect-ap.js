
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function inspect() {
    const { data, error } = await supabase
        .from('ap_submissions')
        .select('*')
        .limit(1)

    if (error) console.error(error)
    else console.log('Sample row:', data)
}

inspect()
