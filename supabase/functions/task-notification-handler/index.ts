import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveTaskTelegramGroupAsync } from "../_shared/routing.ts";

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

function escapeHtml(text: string): string {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(token: string, targetChatId: string, message: string) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'HTML' })
        });
        if (!res.ok) {
            console.error('Failed to send telegram msg', await res.text());
        }
    } catch (err) {
        console.error('Error sending telegram message:', err);
    }
}

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

    // ── 1. New Task Created (INSERT on tsk_tasks) ───────────────────────────
    if (type === 'INSERT' && record && table === 'tsk_tasks') {
        let assigneeName = 'Unknown Assignee';
        if (record.assignee_id) {
            const { data } = await supabase
                .from('lv_profiles')
                .select('full_name')
                .eq('id', record.assignee_id)
                .single();
            if (data) assigneeName = data.full_name;
        }

        const targetChatId = await resolveTaskTelegramGroupAsync(record, supabase, chatId);

        const safeDept = escapeHtml(record.department || 'Outsourcing');
        const safeCust = escapeHtml(record.customer_name || '-');
        const safeTitle = escapeHtml(record.title || '-');
        const safePIC = escapeHtml(assigneeName);
        const safePriority = escapeHtml(record.priority_type || '-');

        const message = `🆕 <b>Task Baru Dicipta!</b>\n\n<b>Department:</b> ${safeDept}\n<b>Customer:</b> ${safeCust}\n<b>Task:</b> ${safeTitle}\n<b>PIC:</b> ${safePIC}\n<b>Priority:</b> ${safePriority}`;

        await sendTelegramMessage(botToken, targetChatId, message);
    }

    // ── 2. Task Updated (UPDATE on tsk_tasks) ───────────────────────────────
    if (type === 'UPDATE' && record && old_record && table === 'tsk_tasks') {
        let assigneeName = 'Unknown Assignee';
        if (record.assignee_id) {
            const { data } = await supabase
                .from('lv_profiles')
                .select('full_name')
                .eq('id', record.assignee_id)
                .single();
            if (data) assigneeName = data.full_name;
        }

        const targetChatId = await resolveTaskTelegramGroupAsync(record, supabase, chatId);

        const safeDept = escapeHtml(record.department || 'Outsourcing');
        const safeCust = escapeHtml(record.customer_name || '-');
        const safeTitle = escapeHtml(record.title || '-');
        const safePIC = escapeHtml(assigneeName);

        // Case A: Status changed to DONE
        if (old_record.status !== 'DONE' && record.status === 'DONE') {
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
            const safeTime = escapeHtml(totalTimeStr);
            const message = `✅ <b>Task Completed!</b>\n\n<b>Department:</b> ${safeDept}\n<b>Customer:</b> ${safeCust}\n<b>Task:</b> ${safeTitle}\n<b>PIC:</b> ${safePIC}\n<b>Time Spent:</b> ${safeTime}`;

            await sendTelegramMessage(botToken, targetChatId, message);
        }
        // Case B: Status changed (but not to DONE)
        else if (old_record.status !== record.status) {
            const message = `🔄 <b>Status Task Dikemaskini</b>\n\n<b>Task:</b> ${safeTitle}\n<b>Customer:</b> ${safeCust}\n<b>Status:</b> ${escapeHtml(old_record.status)} ➡️ <b>${escapeHtml(record.status)}</b>\n<b>PIC:</b> ${safePIC}`;
            await sendTelegramMessage(botToken, targetChatId, message);
        }
        // Case C: Assignee changed
        else if (old_record.assignee_id !== record.assignee_id) {
            let oldAssigneeName = 'Unknown Assignee';
            if (old_record.assignee_id) {
                const { data } = await supabase
                    .from('lv_profiles')
                    .select('full_name')
                    .eq('id', old_record.assignee_id)
                    .single();
                if (data) oldAssigneeName = data.full_name;
            }
            const message = `👤 <b>PIC Task Ditukar</b>\n\n<b>Task:</b> ${safeTitle}\n<b>Customer:</b> ${safeCust}\n<b>PIC Baru:</b> <b>${safePIC}</b>\n<b>PIC Lama:</b> ${escapeHtml(oldAssigneeName)}`;
            await sendTelegramMessage(botToken, targetChatId, message);
        }
    }

    // ── 3. New Comment Notification (INSERT on tsk_comments) ────────────────
    if (type === 'INSERT' && record && table === 'tsk_comments') {
        const { data: task } = await supabase
            .from('tsk_tasks')
            .select('id, title, customer_name, department, assignee_id, is_internal')
            .eq('id', record.task_id)
            .single();

        if (!task) return new Response("OK", { status: 200 });

        let commenterName = 'Seseorang';
        if (record.user_id) {
            const { data: commenter } = await supabase
                .from('lv_profiles')
                .select('full_name')
                .eq('id', record.user_id)
                .single();
            if (commenter) commenterName = commenter.full_name;
        }

        const targetChatId = await resolveTaskTelegramGroupAsync(task, supabase, chatId);

        const contentPreview = record.content?.length > 200
            ? record.content.substring(0, 200) + '...'
            : (record.content || '');

        const safeTitle = escapeHtml(task.title || '-');
        const safeCust = escapeHtml(task.customer_name || '-');
        const safeCommenter = escapeHtml(commenterName);
        const safeContent = escapeHtml(contentPreview);

        const message = `💬 <b>Komen Baru pada Task</b>\n\n<b>Task:</b> ${safeTitle}\n<b>Customer:</b> ${safeCust}\n<b>Dari:</b> ${safeCommenter}\n\n<i>"${safeContent}"</i>`;

        await sendTelegramMessage(botToken, targetChatId, message);
    }

    return new Response("OK", { status: 200 });
});
