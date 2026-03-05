
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function testLogin() {
    console.log('Testing login for syafferizul@gmail.com...')

    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'syafferizul@gmail.com',
        password: 'password123'
    })

    if (error) {
        console.error('Login failed:', error)
    } else {
        console.log('Login successful!', data.user.email)
        console.log('Session ID:', data.session.access_token.substring(0, 20) + '...')
    }
}

testLogin()
