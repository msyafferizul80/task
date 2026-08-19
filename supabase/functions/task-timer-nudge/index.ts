import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveTaskTelegramGroup, getDepartmentGroupMap } from "../_shared/routing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? ""; // default fallback

// Configurable limit of tasks shown under a single entity before truncating with overflow note
const MAX_TASKS_PER_ENTRY = 5;

// Review pending threshold in milliseconds (24 hours)
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

interface UntrackedPicEntry {
  pic: string;
  tasks: string[];
}

interface PendingReviewEntry {
  type: "group" | "individual";
  group_name?: string;
  pic?: string;
  tasks: string[];
}

export function buildCombinedDigestMessage({
  checkpoint,
  untracked,
  pending_review,
}: {
  checkpoint: string;
  untracked: UntrackedPicEntry[];
  pending_review: PendingReviewEntry[];
}): string {
  const hasUntracked = untracked && untracked.length > 0;
  const hasPendingReview = pending_review && pending_review.length > 0;

  if (!hasUntracked && !hasPendingReview) {
    return "";
  }

  const sections: string[] = [];

  // Section 1: Untracked timer tasks
  if (hasUntracked) {
    const totalPics = untracked.length;
    const totalTasks = untracked.reduce((acc, item) => acc + item.tasks.length, 0);
    let section1 = `🔔 <b>Semak ${checkpoint}</b> — ${totalPics} PIC, ${totalTasks} tugasan tanpa timer aktif:\n\n`;

    const entries = untracked.map((item) => {
      let block = `👤 <b>${escapeHtml(item.pic)}</b> (${item.tasks.length} tugasan)\n`;
      const visible = item.tasks.slice(0, MAX_TASKS_PER_ENTRY);
      visible.forEach((t) => {
        block += `  • ${escapeHtml(t)}\n`;
      });
      if (item.tasks.length > MAX_TASKS_PER_ENTRY) {
        const remaining = item.tasks.length - MAX_TASKS_PER_ENTRY;
        block += `  <i>...dan ${remaining} tugasan lain</i>\n`;
      }
      return block;
    });

    section1 += entries.join("\n");
    sections.push(section1);
  }

  // Section 2: Pending review tasks
  if (hasPendingReview) {
    const totalReviewTasks = pending_review.reduce((acc, item) => acc + item.tasks.length, 0);
    let section2 = `⏳ <b>Tugasan Menunggu Semakan (&gt;24 jam)</b> — ${totalReviewTasks} tugasan:\n\n`;

    const entries = pending_review.map((item) => {
      let block = "";
      if (item.type === "group") {
        block += `👥 <b>Kumpulan Semakan: ${escapeHtml(item.group_name || "")}</b> (${item.tasks.length} tugasan)\n`;
      } else {
        block += `👤 <b>${escapeHtml(item.pic || "")}</b> (${item.tasks.length} tugasan)\n`;
      }

      const visible = item.tasks.slice(0, MAX_TASKS_PER_ENTRY);
      visible.forEach((t) => {
        block += `  • ${escapeHtml(t)}\n`;
      });
      if (item.tasks.length > MAX_TASKS_PER_ENTRY) {
        const remaining = item.tasks.length - MAX_TASKS_PER_ENTRY;
        block += `  <i>...dan ${remaining} tugasan lain</i>\n`;
      }
      return block;
    });

    section2 += entries.join("\n");
    sections.push(section2);
  }

  return sections.join("\n\n");
}

Deno.serve(async (req: Request) => {
  // CORS PREFLIGHT
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const checkpoint = url.searchParams.get("checkpoint") ?? "Semak";

  console.log(`Running combined timer nudge & review check for checkpoint: ${checkpoint}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const nowMs = Date.now();
    const thresholdIso = new Date(nowMs - TWENTY_FOUR_HOURS_MS).toISOString();

    // 1. Fetch IN_PROGRESS tasks
    const { data: inProgressTasks, error: tasksErr } = await supabase
      .from("tsk_tasks")
      .select(`
        id,
        title,
        department,
        customer_name,
        is_internal,
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

    // 3. Filter untracked IN_PROGRESS tasks
    const untrackedTasks = (inProgressTasks ?? []).filter(task => !runningTaskIds.has(task.id));

    // 4. Fetch pending REVIEW tasks (> 24 hours)
    const { data: reviewTasks, error: reviewErr } = await supabase
      .from("tsk_tasks")
      .select(`
        id,
        title,
        department,
        customer_name,
        is_internal,
        updated_at,
        created_at,
        escalated_to_user_id,
        escalated_to_group_id,
        assignee_id,
        assignee:lv_profiles!tsk_tasks_assignee_id_fkey (
          id,
          full_name
        ),
        escalated_user:lv_profiles!tsk_tasks_escalated_to_user_id_fkey (
          id,
          full_name
        ),
        escalated_group:tsk_review_groups!tsk_tasks_escalated_to_group_id_fkey (
          id,
          name
        )
      `)
      .eq("status", "REVIEW");

    if (reviewErr && reviewErr.code !== '42703' && reviewErr.code !== '42P01') {
      console.warn("Error querying review tasks:", reviewErr);
    }

    const pendingReviewTasks = (reviewTasks ?? []).filter(task => {
      const referenceTime = task.updated_at ? new Date(task.updated_at).getTime() : new Date(task.created_at).getTime();
      return (nowMs - referenceTime) >= TWENTY_FOUR_HOURS_MS;
    });

    console.log(`Found ${untrackedTasks.length} untracked tasks, ${pendingReviewTasks.length} overdue review tasks.`);

    if (untrackedTasks.length === 0 && pendingReviewTasks.length === 0) {
      return new Response(JSON.stringify({ message: "No untracked or overdue review tasks found. No messages sent.", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Fetch department settings for Telegram group routing
    const deptGroupMap = await getDepartmentGroupMap(supabase);

    // 6. Group items by resolved destination Telegram chat ID
    const destinationMap: Record<
      string,
      {
        untrackedMap: Record<string, string[]>;
        pendingReviewMap: Record<string, { type: "group" | "individual"; group_name?: string; pic?: string; tasks: string[] }>;
        departments: Set<string>;
      }
    > = {};

    const getOrCreateDest = (chatId: string) => {
      if (!destinationMap[chatId]) {
        destinationMap[chatId] = {
          untrackedMap: {},
          pendingReviewMap: {},
          departments: new Set()
        };
      }
      return destinationMap[chatId];
    };

    // Group untracked tasks
    untrackedTasks.forEach(task => {
      const targetChatId = resolveTaskTelegramGroup(task, deptGroupMap, TELEGRAM_CHAT_ID);
      if (!targetChatId) return;

      const dest = getOrCreateDest(targetChatId);
      if (task.department) dest.departments.add(task.department);

      const pic = task.assignee?.full_name || "Unassigned";
      if (!dest.untrackedMap[pic]) {
        dest.untrackedMap[pic] = [];
      }
      dest.untrackedMap[pic].push(task.title);
    });

    // Group pending review tasks
    pendingReviewTasks.forEach(task => {
      const targetChatId = resolveTaskTelegramGroup(task, deptGroupMap, TELEGRAM_CHAT_ID);
      if (!targetChatId) return;

      const dest = getOrCreateDest(targetChatId);
      if (task.department) dest.departments.add(task.department);

      if (task.escalated_to_group_id && task.escalated_group?.name) {
        const groupKey = `grp_${task.escalated_to_group_id}`;
        if (!dest.pendingReviewMap[groupKey]) {
          dest.pendingReviewMap[groupKey] = {
            type: "group",
            group_name: task.escalated_group.name,
            tasks: []
          };
        }
        dest.pendingReviewMap[groupKey].tasks.push(task.title);
      } else {
        const reviewerPic = task.escalated_user?.full_name || task.assignee?.full_name || "Unassigned";
        const indKey = `ind_${reviewerPic}`;
        if (!dest.pendingReviewMap[indKey]) {
          dest.pendingReviewMap[indKey] = {
            type: "individual",
            pic: reviewerPic,
            tasks: []
          };
        }
        dest.pendingReviewMap[indKey].tasks.push(task.title);
      }
    });

    const deliveries: any[] = [];

    // 7. Deliver digests per resolved Telegram group
    for (const [targetChatId, destInfo] of Object.entries(destinationMap)) {
      const untrackedEntries: UntrackedPicEntry[] = Object.entries(destInfo.untrackedMap).map(([pic, taskTitles]) => ({
        pic,
        tasks: taskTitles
      }));

      const pendingReviewEntries: PendingReviewEntry[] = Object.values(destInfo.pendingReviewMap);

      const messageText = buildCombinedDigestMessage({
        checkpoint,
        untracked: untrackedEntries,
        pending_review: pendingReviewEntries
      });

      if (!messageText) continue;

      const deptsList = Array.from(destInfo.departments).join(", ") || "General";
      console.log(`Sending combined digest to chat_id ${targetChatId} (${deptsList}):\n${messageText}`);
      await sendTelegramToChat(messageText, targetChatId);

      deliveries.push({
        chat_id: targetChatId,
        departments: Array.from(destInfo.departments),
        untracked_count: untrackedEntries.reduce((acc, e) => acc + e.tasks.length, 0),
        pending_review_count: pendingReviewEntries.reduce((acc, e) => acc + e.tasks.length, 0),
      });
    }

    return new Response(JSON.stringify({ message: "Combined timer & review digests processed.", deliveries }), {
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
