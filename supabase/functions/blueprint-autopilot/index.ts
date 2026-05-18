import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? ""; // fallback default group

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Telegram Helper ──────────────────────────────────────────────────────────
// Hantar ke chat_id tertentu
async function sendTelegramToChat(message: string, chatId: string) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("Telegram send error:", e);
  }
}

// ─── Frequency Check ─────────────────────────────────────────────────────────
function shouldRunThisPeriod(
  frequency: string,
  triggerDay: number,
  triggerTime: string | null,
  startDate: Date,
  lastRunAt: Date | null,
  today: Date
): boolean {
  if (today < startDate) return false;

  // If trigger_time is set, only run after that time (MYT)
  if (triggerTime) {
    const [triggerHour, triggerMin] = triggerTime.split(":").map(Number);
    const nowHour = today.getHours();
    const nowMin = today.getMinutes();
    if (nowHour < triggerHour || (nowHour === triggerHour && nowMin < triggerMin)) {
      return false; // Not reached trigger time yet
    }
  }

  if (frequency === "DAILY") {
    if (!lastRunAt) return true;
    const todayDate = today.toISOString().split("T")[0];
    // lastRunAt stored in UTC, convert to MYT for comparison
    const lastRunMYT = new Date(new Date(lastRunAt).getTime() + 8 * 60 * 60 * 1000);
    const lastRunDate = lastRunMYT.toISOString().split("T")[0];
    return lastRunDate !== todayDate;
  }

  if (frequency === "WEEKLY") {
    // triggerDay: 0=Sunday, 1=Monday, ..., 6=Saturday (JS getDay() convention)
    const todayDayOfWeek = today.getDay();
    if (todayDayOfWeek !== triggerDay) return false;
    if (!lastRunAt) return true;
    const daysSinceLastRun = (today.getTime() - new Date(lastRunAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastRun >= 6;
  }

  // MONTHLY, QUARTERLY, YEARLY — trigger on specific day of month
  const todayDay = today.getDate();
  if (todayDay !== triggerDay) return false;

  if (!lastRunAt) return true; // Never run before

  const lastRun = new Date(lastRunAt);

  if (frequency === "MONTHLY") {
    return (
      lastRun.getFullYear() !== today.getFullYear() ||
      lastRun.getMonth() !== today.getMonth()
    );
  }

  if (frequency === "QUARTERLY") {
    const quarter = (d: Date) => Math.floor(d.getMonth() / 3);
    return (
      lastRun.getFullYear() !== today.getFullYear() ||
      quarter(lastRun) !== quarter(today)
    );
  }

  if (frequency === "YEARLY") {
    return lastRun.getFullYear() !== today.getFullYear();
  }

  return false;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS PREFLIGHT
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Allow manual POST trigger with optional { dry_run: true }
  let dryRun = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch (_) {}
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Use MYT (UTC+8) — Malaysia does not observe DST
  const nowUTC = new Date();
  const today = new Date(nowUTC.getTime() + 8 * 60 * 60 * 1000);
  const todayISO = today.toISOString().split("T")[0];

  try {
    // 0. Load department → telegram_group_id mapping
    const { data: deptSettings } = await supabase
      .from("tsk_department_settings")
      .select("department_name, telegram_group_id");

    const deptGroupMap: Record<string, string> = {};
    for (const row of (deptSettings ?? [])) {
      if (row.department_name && row.telegram_group_id) {
        deptGroupMap[row.department_name] = row.telegram_group_id;
      }
    }
    console.log("Department group map:", JSON.stringify(deptGroupMap));

    // 1. Get all active schedules with their blueprint tasks
    const { data: schedules, error: schedErr } = await supabase
      .from("tsk_recurring_schedules")
      .select(`
        id,
        frequency,
        trigger_day,
        trigger_time,
        start_date,
        last_run_at,
        run_on_saturday,
        run_on_sunday,
        customer:tsk_customers!tsk_recurring_schedules_customer_id_fkey (id, name),
        blueprint:tsk_blueprints!tsk_recurring_schedules_blueprint_id_fkey (
          id,
          name,
          tsk_blueprint_tasks (
            id,
            title,
            description,
            priority_type,
            assignee_id,
            relative_due_day,
            sort_order,
            department
          )
        )
      `)
      .eq("is_active", true);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No active schedules.", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    let totalGenerated = 0;

    for (const schedule of schedules) {
      const startDate = new Date(schedule.start_date);
      const lastRunAt = schedule.last_run_at ? new Date(schedule.last_run_at) : null;

      if (!shouldRunThisPeriod(schedule.frequency, schedule.trigger_day, schedule.trigger_time ?? null, startDate, lastRunAt, today)) {
        results.push({ schedule_id: schedule.id, status: "skipped", reason: "Not trigger day/time or already ran this period" });
        continue;
      }

      // Check if today is Saturday/Sunday and if we should run
      const todayDayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
      if (todayDayOfWeek === 6 && !schedule.run_on_saturday) { // Saturday
        results.push({ schedule_id: schedule.id, status: "skipped", reason: "Saturday, and run_on_saturday is false" });
        continue;
      }
      if (todayDayOfWeek === 0 && !schedule.run_on_sunday) { // Sunday
        results.push({ schedule_id: schedule.id, status: "skipped", reason: "Sunday, and run_on_sunday is false" });
        continue;
      }

      const blueprintTasks = (schedule.blueprint as any)?.tsk_blueprint_tasks ?? [];
      const customerName = (schedule.customer as any)?.name ?? "Unknown Customer";
      const blueprintName = (schedule.blueprint as any)?.name ?? "Blueprint";

      if (blueprintTasks.length === 0) {
        results.push({ schedule_id: schedule.id, status: "skipped", reason: "No blueprint tasks defined" });
        continue;
      }

      // Sort tasks by sort_order
      blueprintTasks.sort((a: any, b: any) => a.sort_order - b.sort_order);

      const triggerYear = today.getUTCFullYear();
      const triggerMonth = today.getUTCMonth();
      const triggerDay = (schedule.frequency === 'DAILY' || schedule.frequency === 'WEEKLY')
        ? today.getUTCDate()
        : schedule.trigger_day;

      const triggerDate = new Date(Date.UTC(triggerYear, triggerMonth, triggerDay, 10, 0, 0));

      const tasksToInsert = blueprintTasks.map((bt: any) => {
        const dueDate = new Date(triggerDate);
        dueDate.setDate(dueDate.getDate() + bt.relative_due_day);
        return {
          title: bt.title,
          description: bt.description ?? null,
          priority_type: bt.priority_type ?? "SCHEDULE",
          assignee_id: bt.assignee_id ?? null,
          department: bt.department ?? null,
          customer_name: customerName,
          status: "BACKLOG",
          due_date: dueDate.toISOString(),
          is_recurring: true,
          blueprint_schedule_id: schedule.id,
        };
      });

      if (!dryRun) {
        const { error: insertErr } = await supabase.from("tsk_tasks").insert(tasksToInsert);
        if (insertErr) {
          results.push({ schedule_id: schedule.id, status: "error", error: insertErr.message });
          continue;
        }

        // Update last_run_at
        await supabase
          .from("tsk_recurring_schedules")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", schedule.id);
      }

      totalGenerated += tasksToInsert.length;
      results.push({ schedule_id: schedule.id, status: dryRun ? "dry_run" : "generated", tasks_count: tasksToInsert.length });

      // ─── Determine department for Telegram routing ────────────────────────────
      // Ambil department dari task pertama dalam blueprint (semua tasks satu blueprint = satu dept)
      const firstTaskDept: string | null = blueprintTasks[0]?.department ?? null;
      const targetChatId = firstTaskDept
        ? (deptGroupMap[firstTaskDept] ?? TELEGRAM_CHAT_ID)
        : TELEGRAM_CHAT_ID;

      console.log(`Blueprint "${blueprintName}" → dept: ${firstTaskDept} → chat_id: ${targetChatId}`);

      // ─── Build & Send Telegram message ────────────────────────────────────────
      if (!dryRun) {
        const freqLabel = schedule.frequency === 'DAILY' ? 'Harian' : schedule.frequency === 'WEEKLY' ? 'Mingguan' : schedule.frequency;
        const taskTitles = tasksToInsert.map((t: any) => `  • ${t.title}`).join("\n");
        const message =
          `🤖 <b>AUTOPILOT ALERT</b>\n` +
          `📋 Blueprint: <b>${blueprintName}</b>\n` +
          `🏢 Customer: <b>${customerName}</b>\n` +
          `🔁 Frequency: <b>${freqLabel}</b>\n` +
          `📅 Tarikh Trigger: <b>${todayISO}</b>\n` +
          `Tasks dijana (${tasksToInsert.length}):\n${taskTitles}\n` +
          `\nSila semak <b>Task Listing</b> dan mulakan kerja sekarang!`;

        await sendTelegramToChat(message, targetChatId);
      }
    }

    return new Response(
      JSON.stringify({
        date: todayISO,
        dry_run: dryRun,
        total_generated: totalGenerated,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Autopilot error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
