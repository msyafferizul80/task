
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testSignup() {
    const email = `testuser_${Date.now()}@example.com`
    console.log(`Testing signup for ${email}...`)

    const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: 'password123',
        email_confirm: true
    })

    if (error) {
        console.error('Signup failed:', error)
    } else {
        console.log('Signup successful!', data.user.email)

        // Try login immediately
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: email,
            password: 'password123'
        })

        if (loginError) {
            console.error('Login for new user failed:', loginError)
        } else {
            console.log('Login for new user successful!')
        }
    }
}

testSignup()
