
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupStorage() {
    console.log('Checking storage buckets...')
    const { data: buckets, error } = await supabase.storage.listBuckets()

    if (error) {
        console.error('Error listing buckets:', error)
        return
    }

    const bucketName = 'leave_attachments'
    const bucket = buckets.find(b => b.name === bucketName)

    if (bucket) {
        console.log(`Bucket '${bucketName}' already exists.`)
        // Ensure it is public or we need signed URLs. Code uses getPublicUrl, so it should be public.
        const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/*', 'application/pdf']
        })
        if (updateError) console.error('Error updating bucket:', updateError)
        else console.log(`Bucket '${bucketName}' updated to be public.`)
    } else {
        console.log(`Creating bucket '${bucketName}'...`)
        const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/*', 'application/pdf']
        })
        if (createError) console.error('Error creating bucket:', createError)
        else console.log(`Bucket '${bucketName}' created successfully.`)
    }
}

setupStorage()
