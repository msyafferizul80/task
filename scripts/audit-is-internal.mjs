import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rnfcyukpihpstoukjakm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZmN5dWtwaWhwc3RvdWtqYWttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc1NTMxMCwiZXhwIjoyMDg1MzMxMzEwfQ.4EB8OMUArpDsA-1EwJhiEgzjiNfkbjMrmkVnTqtp9Ho';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("Fetching customers...");
  const { data: customers, error: custErr } = await supabase
    .from('tsk_customers')
    .select('id, name, is_internal');

  if (custErr) {
    console.error("Customer error:", custErr);
    return;
  }

  const custMap = {};
  for (const c of customers) {
    custMap[c.name.trim().toLowerCase()] = c.is_internal ?? false;
  }
  console.log(`Loaded ${customers.length} customers.`);

  console.log("Fetching all tasks with pagination...");
  let allTasks = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: tasks, error: tasksErr } = await supabase
      .from('tsk_tasks')
      .select('id, title, department, customer_name, is_internal')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (tasksErr) {
      console.error("Tasks error:", tasksErr);
      return;
    }
    allTasks = allTasks.concat(tasks || []);
    if (!tasks || tasks.length < pageSize) break;
    page++;
  }

  console.log(`Total tasks found: ${allTasks.length}`);

  let mismatched = [];
  let nullOrUndefined = [];

  for (const t of allTasks) {
    const custNameKey = (t.customer_name || '').trim().toLowerCase();
    const expectedIsInternal = custMap[custNameKey] ?? false;

    if (t.is_internal === null || t.is_internal === undefined) {
      nullOrUndefined.push(t);
    }

    if (Boolean(t.is_internal) !== Boolean(expectedIsInternal)) {
      mismatched.push({
        id: t.id,
        title: t.title,
        customer_name: t.customer_name,
        current_is_internal: t.is_internal,
        expected_is_internal: expectedIsInternal
      });
    }
  }

  console.log(`\nAudit Results:`);
  console.log(`- Tasks with null/undefined is_internal: ${nullOrUndefined.length}`);
  console.log(`- Tasks with mismatched is_internal vs customer table: ${mismatched.length}`);

  if (mismatched.length > 0) {
    console.log(`\nMismatched rows count: ${mismatched.length}`);
    console.log(`Sample (up to 10):`, JSON.stringify(mismatched.slice(0, 10), null, 2));
  } else {
    console.log(`\nALL tasks (${allTasks.length} total) have accurate is_internal values matching tsk_customers!`);
  }
}

runAudit();
