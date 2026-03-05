import { createClient } from '@supabase/supabase-js'

// Load environment variables
const supabaseUrl = 'https://rnfcyukpihpstoukjakm.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZmN5dWtwaWhwc3RvdWtqYWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc1NTMxMCwiZXhwIjoyMDg1MzMxMzEwfQ.4EB8OMUArpDsA-1EwJhiEgzjiNfkbjMrmkVnTqtp9Ho'

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function createAdminUser() {
    try {
        console.log('🔧 Creating admin user...')

        // Create user using Admin API
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: 'sheffi80@gmail.com',
            password: 'password123',
            email_confirm: true,
            user_metadata: {
                full_name: 'Admin User'
            }
        })

        if (authError) {
            console.error('❌ Error creating user:', authError.message)
            return
        }

        console.log('✅ User created in auth.users:', authData.user.id)

        // Get the organization ID
        const { data: orgData, error: orgError } = await supabase
            .from('lv_organizations')
            .select('id, name')
            .limit(1)
            .single()

        if (orgError) {
            console.error('❌ Error fetching organization:', orgError.message)
            return
        }

        console.log('📋 Organization found:', orgData.name)

        // Update the profile to be admin
        const { data: profileData, error: profileError } = await supabase
            .from('lv_profiles')
            .update({
                full_name: 'Admin User',
                role: 'admin',
                organization_id: orgData.id,
                join_date: new Date().toISOString().split('T')[0],
                custom_al_entitlement: 12,
                status: 'active'
            })
            .eq('id', authData.user.id)
            .select()

        if (profileError) {
            console.error('❌ Error updating profile:', profileError.message)
            return
        }

        console.log('✅ Profile updated to admin role')
        console.log('\n🎉 Admin user created successfully!')
        console.log('📧 Email: sheffi80@gmail.com')
        console.log('🔑 Password: password123')
        console.log('👤 Role: admin')
        console.log('🏢 Organization:', orgData.name)

    } catch (error) {
        console.error('❌ Unexpected error:', error.message)
    }
}

createAdminUser()
