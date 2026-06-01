import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

Deno.serve(async (req) => {
    if (!botToken || !chatId) {
        return new Response("Missing telegram secrets", { status: 500 });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date();

    // Evaluate "Today" in UTC+8 (Malaysia time)
    // Since pg_cron fires at 09:30 UTC for 17:30 MYT, "now" is around 9:30 UTC.
    // Add 8 hours to get MYT time, start of day is 00:00.
    const mytNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    mytNow.setUTCHours(0, 0, 0, 0);
    const startOfDayUTC = new Date(mytNow.getTime() - (8 * 60 * 60 * 1000)).toISOString();

    // 1. Total tasks marked DONE today (using status transitions in history)
    const { count: completedCount, error: err1 } = await supabase
        .from('tsk_task_history')
        .select('id', { count: 'exact', head: true })
        .eq('new_status', 'DONE')
        .gte('created_at', startOfDayUTC);

    // 2. Total ONGOING tasks per customer
    const { data: ongoingTasks, error: err2 } = await supabase
        .from('tsk_tasks')
        .select('customer_name')
        .in('status', ['IN_PROGRESS', 'REVIEW', 'CLIENT_HOLD']);

    if (err1 || err2) {
        console.error('Error fetching data', err1, err2);
        return new Response("Error querying db", { status: 500 });
    }

    let ongoingTotal = 0;
    const customerCounts: Record<string, number> = {};

    if (ongoingTasks) {
        ongoingTotal = ongoingTasks.length;
        ongoingTasks.forEach(task => {
            const custName = task.customer_name || '-';
            customerCounts[custName] = (customerCounts[custName] || 0) + 1;
        });
    }

    let customerListStr = '';
    for (const [customer, count] of Object.entries(customerCounts)) {
        customerListStr += `• ${customer}: ${count} Ongoing\n`;
    }
    if (!customerListStr) customerListStr = '• _Tiada_\n';

    const message = `📊 *SUMMARY HARIAN SYAZNA WORLD*\n\n` +
        `✅ Siap Hari Ini: ${completedCount || 0} Task\n` +
        `⏳ Masih Berjalan: ${ongoingTotal} Task\n\n` +
        `*Pecahan ikut Pelanggan:*\n${customerListStr}\n` +
        `🔗 Klik untuk detail: https://workspace.syazna.com/`;

    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        })
    });

    if (!res.ok) {
        console.error('Failed to send telegram msg', await res.text());
    }

    return new Response("OK", { status: 200 });
});
