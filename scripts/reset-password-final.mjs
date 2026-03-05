
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
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

const userId = '0ca035c1-9a58-46e0-96de-af1204d4f0d3'
const newPassword = 'password123'

async function resetPassword() {
    console.log(`Force resetting password for user ID ${userId} to '${newPassword}'...`)

    // Update password
    const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        {
            password: newPassword,
            email_confirm: true,
            user_metadata: { email_verified: true }
        }
    )

    if (error) {
        console.error('Error updating password:', error)
    } else {
        console.log('Password updated successfully for user:', data.user.email)
    }
}

resetPassword()
