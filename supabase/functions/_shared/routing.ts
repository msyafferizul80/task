import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Telegram Chat ID for internal Syazna World tasks override.
 * Routing Override Rule (PRD Section 4.4):
 * Recruitment tasks for internal customers (is_internal = true) are routed to Group ID -1004461542862 ("Internal SW").
 * All other Recruitment tasks route to the standard Recruitment group (-1001567997515).
 */
export const RECRUITMENT_INTERNAL_OVERRIDE_GROUP_ID = "-1004461542862";

export interface TaskRoutingInfo {
  department?: string | null;
  is_internal?: boolean | null;
  customer_name?: string | null;
}

/**
 * Synchronously resolves the target Telegram chat/group ID for a task given a pre-loaded department-to-group map.
 * 
 * Order of precedence:
 * 1. If department = Recruitment AND task is for internal customer (is_internal === true) -> return override group ID (-1004461542862).
 * 2. Otherwise -> return tsk_department_settings.telegram_group_id for the task's department.
 * 3. Fallback -> return global fallbackChatId (TELEGRAM_CHAT_ID).
 */
export function resolveTaskTelegramGroup(
  task: TaskRoutingInfo,
  deptGroupMap: Record<string, string>,
  fallbackChatId: string = ""
): string {
  // 1. Internal Recruitment override
  if (task.department === "Recruitment" && task.is_internal) {
    return RECRUITMENT_INTERNAL_OVERRIDE_GROUP_ID;
  }

  // 2. Department settings mapping
  if (task.department && deptGroupMap[task.department]) {
    return deptGroupMap[task.department];
  }

  // 3. Fallback chat ID
  return fallbackChatId;
}

/**
 * Fetches department to Telegram group mappings from tsk_department_settings table.
 */
export async function getDepartmentGroupMap(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("tsk_department_settings")
    .select("department_name, telegram_group_id");

  if (error || !data) {
    console.error("Error loading department settings map:", error);
    return {};
  }

  const deptGroupMap: Record<string, string> = {};
  for (const row of data) {
    if (row.department_name && row.telegram_group_id) {
      deptGroupMap[row.department_name] = row.telegram_group_id;
    }
  }

  return deptGroupMap;
}

/**
 * Asynchronously resolves target Telegram chat/group ID for a single task by querying database if needed.
 */
export async function resolveTaskTelegramGroupAsync(
  task: TaskRoutingInfo,
  supabase: SupabaseClient,
  fallbackChatId: string = ""
): Promise<string> {
  // 1. Internal Recruitment override
  if (task.department === "Recruitment" && task.is_internal) {
    return RECRUITMENT_INTERNAL_OVERRIDE_GROUP_ID;
  }

  // 2. Department settings lookup
  if (task.department) {
    const { data: deptData } = await supabase
      .from("tsk_department_settings")
      .select("telegram_group_id")
      .eq("department_name", task.department)
      .single();

    if (deptData?.telegram_group_id) {
      return deptData.telegram_group_id;
    }
  }

  // 3. Fallback chat ID
  return fallbackChatId;
}
