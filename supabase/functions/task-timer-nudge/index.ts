import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? ""; // default fallback

// Configurable limit of tasks shown under a single PIC before truncating with overflow note
const MAX_TASKS_PER_PIC = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramToChat(message: string, chatId: string) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      }),
    });
    if (!res.ok) {
      console.error(`Telegram send error status ${res.status}:`, await res.text());
    }
  } catch (e) {
    console.error("Telegram network error:", e);
  }
}

Deno.serve(async (req: Request) => {
  // CORS PREFLIGHT
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const checkpoint = url.searchParams.get("checkpoint") ?? "Semak";

  console.log(`Running timer nudge check for checkpoint: ${checkpoint}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Fetch all IN_PROGRESS tasks with assignees
    const { data: tasks, error: tasksErr } = await supabase
      .from("tsk_tasks")
      .select(`
        id,
        title,
        department,
        assignee_id,
        assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
          id,
          full_name
        )
      `)
      .eq("status", "IN_PROGRESS")
      .not("assignee_id", "is", null);

    if (tasksErr) throw tasksErr;

    // 2. Fetch active running timers
    const { data: runningTimers, error: timersErr } = await supabase
      .from("tsk_time_logs")
      .select("task_id")
      .eq("status", "RUNNING");

    if (timersErr) throw timersErr;
    const runningTaskIds = new Set(runningTimers?.map(t => t.task_id) ?? []);

    // 3. Filter tasks that are IN_PROGRESS but have no active running timer on that specific task
    const untrackedTasks = (tasks ?? []).filter(task => !runningTaskIds.has(task.id));

    console.log(`Found ${untrackedTasks.length} untracked IN_PROGRESS tasks.`);

    if (untrackedTasks.length === 0) {
      return new Response(JSON.stringify({ message: "No untracked tasks found. No messages sent.", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch department settings for Telegram group routing
    const { data: deptSettings, error: deptErr } = await supabase
      .from("tsk_department_settings")
      .select("department_name, telegram_group_id");

    if (deptErr) throw deptErr;

    const deptGroupMap: Record<string, string> = {};
    for (const row of (deptSettings ?? [])) {
      if (row.department_name && row.telegram_group_id) {
        deptGroupMap[row.department_name] = row.telegram_group_id;
      }
    }

    // 5. Group untracked tasks by department, and within each department by assignee
    const departmentsData: Record<string, Record<string, string[]>> = {};

    untrackedTasks.forEach(task => {
      const dept = task.department || "Unassigned";
      const pic = task.assignee?.full_name || "Unassigned";
      const title = task.title;

      if (!departmentsData[dept]) {
        departmentsData[dept] = {};
      }
      if (!departmentsData[dept][pic]) {
        departmentsData[dept][pic] = [];
      }
      departmentsData[dept][pic].push(title);
    });

    const deliveries: any[] = [];

    // 6. Deliver digests per department
    for (const [dept, picGroup] of Object.entries(departmentsData)) {
      const targetChatId = deptGroupMap[dept] ?? TELEGRAM_CHAT_ID;
      if (!targetChatId) {
        console.warn(`No telegram chat ID mapped for department: ${dept}`);
        continue;
      }

      const totalPics = Object.keys(picGroup).length;
      const totalTasks = Object.values(picGroup).reduce((acc, list) => acc + list.length, 0);

      // Header summary line
      let message = `🔔 <b>Semak ${checkpoint}</b> — ${totalPics} PIC, ${totalTasks} tugasan tanpa timer aktif:\n\n`;

      // Grouped by PIC with bullet per task & overflow cap
      const picEntries = Object.entries(picGroup);
      picEntries.forEach(([pic, taskTitles], index) => {
        const picTaskCount = taskTitles.length;
        message += `👤 <b>${escapeHtml(pic)}</b> (${picTaskCount} tugasan)\n`;

        const visibleTasks = taskTitles.slice(0, MAX_TASKS_PER_PIC);
        visibleTasks.forEach(title => {
          message += `  • ${escapeHtml(title)}\n`;
        });

        if (taskTitles.length > MAX_TASKS_PER_PIC) {
          const remaining = taskTitles.length - MAX_TASKS_PER_PIC;
          message += `  <i>...dan ${remaining} tugasan lain</i>\n`;
        }

        // Add blank line between PICs (except after the last one)
        if (index < picEntries.length - 1) {
          message += `\n`;
        }
      });

      console.log(`Sending digest to ${dept} (${targetChatId}):\n${message}`);
      await sendTelegramToChat(message, targetChatId);
      deliveries.push({ department: dept, chat_id: targetChatId, pic_count: totalPics, task_count: totalTasks });
    }

    return new Response(JSON.stringify({ message: "Timer nudge digests processed.", deliveries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Nudge daemon error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
