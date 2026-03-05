const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const { data, error } = await supabase.from('tsk_tasks').insert([{
        title: "Test Task",
        description: "Test Desc",
        priority_type: "DO_FIRST",
        customer_name: "Test Customer",
        assignee_id: "c649988e-4623-42e1-8849-c1cb5cc98846", // Some dummy UUID, maybe need real one
        status: "BACKLOG",
    }]).select();

    if (error) {
        console.error("Insert Error:", error);
    } else {
        console.log("Insert Success:", data);
    }
}

testInsert();
