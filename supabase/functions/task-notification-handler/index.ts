import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

Deno.serve(async (req) => {
    if (!botToken || !chatId) {
        return new Response("Missing telegram secrets", { status: 500 });
    }

    const payload = await req.json();
    const { type, record, old_record, table } = payload;

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── 1. Task DONE Notification ─────────────────────────────────────────────
    if (type === 'UPDATE' && record && old_record && table === 'tsk_tasks') {
        if (old_record.status !== 'DONE' && record.status === 'DONE') {

            let assigneeName = 'Unknown Assignee';
            if (record.assignee_id) {
                const { data } = await supabase
                    .from('lv_profiles')
                    .select('full_name')
                    .eq('id', record.assignee_id)
                    .single();
                if (data) assigneeName = data.full_name;
            }

            // Department-based Telegram Routing
            let targetChatId = chatId;
            if (record.department) {
                const { data: deptData } = await supabase
                    .from('tsk_department_settings')
                    .select('telegram_group_id')
                    .eq('department_name', record.department)
                    .single();
                if (deptData?.telegram_group_id) {
                    targetChatId = deptData.telegram_group_id;
                }
            }

            // Fetch total time logged
            let totalTimeStr = '-';
            const { data: logs } = await supabase
                .from('tsk_time_logs')
                .select('duration')
                .eq('task_id', record.id)
                .eq('status', 'COMPLETED');

            const totalSeconds = (logs || []).reduce((acc: number, log: any) => acc + (log.duration || 0), 0);
            if (totalSeconds > 0) {
                const hrs = Math.floor(totalSeconds / 3600);
                const mins = Math.floor((totalSeconds % 3600) / 60);
                const secs = totalSeconds % 60;
                const parts = [];
                if (hrs > 0) parts.push(`${hrs} ${hrs === 1 ? 'Hour' : 'Hours'}`);
                if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'Minute' : 'Minutes'}`);
                if (secs > 0 || parts.length === 0) parts.push(`${secs} ${secs === 1 ? 'Second' : 'Seconds'}`);
                totalTimeStr = parts.join(', ');
            }

            const message = `✅ *Task Completed!*\n\n*Department:* ${record.department || 'Outsourcing'}\n*Customer:* ${record.customer_name || '-'}\n*Task:* ${record.title || '-'}\n*PIC:* ${assigneeName}\n*Time Spent:* ${totalTimeStr}`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'Markdown' })
            });
        }
    }

    // ── 2. New Comment Notification ───────────────────────────────────────────
    if (type === 'INSERT' && record && table === 'tsk_comments') {

        // Fetch task details (title, customer, department, assignee_id)
        const { data: task } = await supabase
            .from('tsk_tasks')
            .select('id, title, customer_name, department, assignee_id')
            .eq('id', record.task_id)
            .single();

        if (!task) return new Response("OK", { status: 200 });

        // Fetch commenter name
        let commenterName = 'Seseorang';
        if (record.user_id) {
            const { data: commenter } = await supabase
                .from('lv_profiles')
                .select('full_name')
                .eq('id', record.user_id)
                .single();
            if (commenter) commenterName = commenter.full_name;
        }

        // Skip notification if commenter is the same as assignee (commenting on own task)
        if (task.assignee_id && record.user_id === task.assignee_id) {
            return new Response("OK", { status: 200 });
        }

        // Department-based Telegram Routing
        let targetChatId = chatId;
        if (task.department) {
            const { data: deptData } = await supabase
                .from('tsk_department_settings')
                .select('telegram_group_id')
                .eq('department_name', task.department)
                .single();
            if (deptData?.telegram_group_id) {
                targetChatId = deptData.telegram_group_id;
            }
        }

        // Truncate comment content to 200 chars for preview
        const contentPreview = record.content?.length > 200
            ? record.content.substring(0, 200) + '...'
            : (record.content || '');

        const message = `💬 *Komen Baru pada Task*\n\n*Task:* ${task.title || '-'}\n*Customer:* ${task.customer_name || '-'}\n*Dari:* ${commenterName}\n\n_"${contentPreview}"_`;

        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'Markdown' })
        });

        if (!res.ok) {
            console.error('Failed to send comment telegram msg', await res.text());
        }
    }

    return new Response("OK", { status: 200 });
});
