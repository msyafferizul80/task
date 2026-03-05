import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const testUsers = [
    'majikanpedia@gmail.com',
    'msyafferizul@gmail.com',
    'admin@eleave.com',
    'marketing.empirekerjaya@gmail.com'
]

console.log('Testing login for all users with password: password123\n')

for (const email of testUsers) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: 'password123'
        })

        if (error) {
            console.log(`❌ ${email}: ${error.message}`)
        } else {
            console.log(`✅ ${email}: Login successful!`)
        }
    } catch (err) {
        console.log(`❌ ${email}: ${err.message}`)
    }
}
