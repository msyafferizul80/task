const { createClient } = require('@supabase/supabase-js');

// Credentials from c:/syazna-os/syazna-os/.env.local
const supabaseUrl = 'https://rnfcyukpihpstoukjakm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZmN5dWtwaWhwc3RvdWtqYWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NTUzMTAsImV4cCI6MjA4NTMzMTMxMH0.zJe9kd_wXZ8rR2AM2tYvDYoEexUoMRMgJhKlx9_VG5A';

console.log('Testing connection to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        // anon key can read public tables usually, if RLS allows. 
        // Trying to read profiles might fail if RLS is strict, but connection should succeed.
        // If connection fails, we get fetch error.
        const { data, error } = await supabase.from('lv_profiles').select('count', { count: 'exact', head: true });

        if (error) {
            console.error('Error connecting to Supabase (or RLS):', error.message);
            if (error.code) console.error('Error code:', error.code);
        } else {
            console.log('Successfully connected to Supabase using ANON key. Profile count:', data); // data is likely null/empty for head:true
        }
    } catch (err) {
        console.error('Exception during connection test:', err);
    }
}

testConnection();
