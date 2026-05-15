import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUSINESS_DAYS_THRESHOLD = 4;

function isWeekend(date: Date): boolean {
    const day = date.getUTCDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

function addBusinessDays(startDate: Date, days: number): Date {
    let currentDate = new Date(startDate);
    let daysAdded = 0;

    while (daysAdded < days) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        if (!isWeekend(currentDate)) {
            daysAdded++;
        }
    }

    return currentDate;
}

function calculateBusinessDaysBetween(startDate: Date, endDate: Date): number {
    let businessDays = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        if (!isWeekend(currentDate)) {
            businessDays++;
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    return businessDays;
}

Deno.serve(async (req) => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // 1. Get all outsourcing tasks with due dates
    const { data: tasks, error: fetchError } = await supabase
        .from('tsk_tasks')
        .select('id, title, due_date, priority_type')
        .eq('department', 'Outsourcing')
        .not('status', 'in', '("DONE","CLIENT_HOLD")')
        .not('due_date', 'is', null);

    if (fetchError) {
        console.error('Error fetching tasks:', fetchError);
        return new Response(JSON.stringify({ error: fetchError }), { status: 500 });
    }

    if (!tasks || tasks.length === 0) {
        return new Response(JSON.stringify({ message: 'No outsourcing tasks found' }), { status: 200 });
    }

    // 2. Filter tasks that are less than 4 business days away
    const tasksToUpdate = tasks.filter(task => {
        if (!task.due_date) return false;
        const dueDate = new Date(task.due_date);
        const dueDateUTC = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));

        const businessDaysLeft = calculateBusinessDaysBetween(today, dueDateUTC);
        return businessDaysLeft < BUSINESS_DAYS_THRESHOLD;
    });

    if (tasksToUpdate.length === 0) {
        return new Response(JSON.stringify({ message: 'No tasks need urgent marking' }), { status: 200 });
    }

    // 3. Update tasks to DO_FIRST priority
    const taskIds = tasksToUpdate.map(t => t.id);
    const { error: updateError } = await supabase
        .from('tsk_tasks')
        .update({ priority_type: 'DO_FIRST' })
        .in('id', taskIds);

    if (updateError) {
        console.error('Error updating tasks:', updateError);
        return new Response(JSON.stringify({ error: updateError }), { status: 500 });
    }

    console.log(`Successfully marked ${tasksToUpdate.length} outsourcing tasks as urgent (DO_FIRST)`);
    return new Response(JSON.stringify({ 
        message: `Successfully marked ${tasksToUpdate.length} tasks as urgent`,
        tasks: tasksToUpdate.map(t => ({ id: t.id, title: t.title, due_date: t.due_date }))
    }), { status: 200 });
});
