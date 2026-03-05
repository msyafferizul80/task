const { createClient } = require('@supabase/supabase-js');

// Credentials from create-admin.mjs
const supabaseUrl = 'https://rnfcyukpihpstoukjakm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZmN5dWtwaWhwc3RvdWtqYWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc1NTMxMCwiZXhwIjoyMDg1MzMxMzEwfQ.4EB8OMUArpDsA-1EwJhiEgzjiNfkbjMrmkVnTqtp9Ho';

console.log('Testing connection to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        const { data, error } = await supabase.from('lv_profiles').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('Error connecting to Supabase:', error.message);
        } else {
            console.log('Successfully connected to Supabase. Profile count:', data);
        }
    } catch (err) {
        console.error('Exception during connection test:', err);
    }
}

testConnection();
