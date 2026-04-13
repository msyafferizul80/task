import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

Deno.serve(async (req) => {
    if (!botToken || !chatId) {
        return new Response("Missing telegram secrets", { status: 500 });
    }

    const payload = await req.json();
    const { type, record, old_record } = payload;

    if (type === 'UPDATE' && record && old_record) {
        if (old_record.status !== 'DONE' && record.status === 'DONE') {
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )

            let assigneeName = 'Unknown Assignee';
            if (record.assignee_id) {
                const { data } = await supabase
                    .from('lv_profiles')
                    .select('full_name')
                    .eq('id', record.assignee_id)
                    .single();
                if (data) {
                    assigneeName = data.full_name;
                }
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

            const message = `✅ *Task Completed!*\n\n*Department:* ${record.department || 'Outsourcing'}\n*Customer:* ${record.customer_name || '-'}\n*Task:* ${record.title || '-'}\n*PIC:* ${assigneeName}`;

            const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const res = await fetch(tgUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: targetChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });

            if (!res.ok) {
                console.error('Failed to send telegram msg', await res.text());
            }
        }
    }

    return new Response("OK", { status: 200 });
});
