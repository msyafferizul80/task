# Product Requirement Document (PRD): Syazna-OS Task Management System

**Document Version:** 1.0.0  
**Status:** Ready for Review  
**Target Audience:** Senior Software Engineer / Technical Architect  
**Author:** Antigravity AI Pair Partner  

---

## 1. Executive Summary

The **Syazna-OS Task Management System** is a real-time, department-scoped task execution and monitoring application. It implements the **Eisenhower Matrix** for task prioritization and tracks actual developer working hours using an interactive, real-time **Task Timer**. The application is designed to support role-based permission scoping, segregation of client tasks from internal company tasks, and automated department-level status alerts via Telegram.

---

## 2. Technology Stack & System Architecture

The application is built on a modern serverless architecture with real-time replication capabilities:

* **Frontend**: Next.js (App Router), TypeScript, Ant Design (UI Framework), and TailwindCSS.
* **Backend / Database**: Supabase (PostgreSQL) with Row Level Security (RLS) enabled.
* **Real-time Engine**: Supabase Realtime (Postgres Changes Replication) for live timers and task status sync.
* **Serverless Functions**: Supabase Edge Functions (Deno Runtime) for cron triggers, summary generation, and webhook notification handlers.
* **Database Webhooks**: PostgreSQL trigger hooks making asynchronous HTTP POST calls to Edge Functions using the `pg_net` extension.

---

## 3. User Roles & Permission Scoping Matrix

The system segregates users into four main roles, each with strict row-level security constraints:

| Role | Department Scope | Done Task Edit Lock | Analytics Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | Global (All departments) | **Bypassed** (Can edit completed tasks) | Full Organization |
| **Manager** | Global (All departments) | **Bypassed** (Can edit completed tasks) | Full Organization |
| **Supervisor** | Department-specific | **Locked** (Cannot edit completed tasks) | Department-specific |
| **Employee** | Department-specific | **Locked** (Cannot edit completed tasks) | Self Only |

### Core Validation Rules:
1. **Department Restrictions**: Employees and Supervisors are bound to a single department. Supervisors can only view, create, edit, or assign tasks within their department.
2. **Supervisor Assignment Policy**: Supervisors are restricted from assigning tasks to users outside their department. (Note: Admin and Manager roles have a `NULL` department and are bypassed from this restriction).
3. **Strict Cross-Department Visibility & Action**: A Supervisor must NOT see, edit, or log time against a task from another department under any circumstances, even if that task is personally assigned to them (Option A strict mode).
4. **Review Group Department Scoping (Option A Strict)**: Review group membership does NOT bypass department scoping. A Supervisor or Employee in a Review Group can only view and resolve group-escalated tasks belonging to their own department. Admin and Manager roles maintain global organization-wide review scope across all review groups.
5. **Escalation Assignee & Originator Lifecycle (Option B)**:
   - **Individual Escalation**: Sets `assignee_id = to_user_id`, transferring active ownership to the single reviewer.
   - **Group Escalation**: Sets `assignee_id = null` (pooled queue) while `status = 'REVIEW'` and preserves the creator in `escalated_from_user_id`.
   - **Originator Visibility**: Originators maintain continuous tracking of tasks they escalated out through a dedicated "Menunggu Semakan (Escalated Out)" view in *Tugasan Saya*, queried via `escalated_from_user_id = auth.uid()`.
   - **Resolution Restoration**: When a review is resolved (Approved &rarr; `DONE`, Rejected &rarr; `IN_PROGRESS`), `assignee_id` is restored back to `escalated_from_user_id`.

---

## 4. System Modules Breakdown

### 4.1 Task Timer & Work Logging Module (`tsk_time_logs`)
Designed to capture actual developer effort. Each task can have multiple work logging sessions.

* **Single-Timer Enforcement**: A user can only have **one active timer** running across the entire system. Starting a timer on Task B is blocked (rejected with a warning) until the user manually stops Task A's timer. This is enforced at the database level by a partial unique index `idx_one_active_timer_per_user` on `tsk_time_logs` (where `status = 'RUNNING'`).
* **State Persistence**: The timer state is derived directly from the database (`start_time` where `end_time IS NULL`), ensuring that page refreshes or tab closures do not reset or lose active timers.
* **Live Counter**: The UI uses a local React interval hook synced with real-time database changes. It displays:
  $$\text{Total Duration} = \text{Sum of Completed Sessions} + (\text{Current Time} - \text{Active Session Start Time})$$
* **Forgotten Timer Daemon**: A daily/hourly Deno cron function checks for active timers running past 12 hours and auto-closes them, prompting the user on their next login to adjust or discard the session.

### 4.2 Blueprint & Autopilot Module (`tsk_blueprints`)
Provides templating for recurring organizational workflows.

* **Blueprint Definitions**: Defines tasks with pre-configured priorities, descriptions, departments, and execution templates.
* **Autopilot Daemon**: Supabase Edge Function (`blueprint-autopilot`) acts as an orchestration engine, generating active tasks based on blueprint schedules.

### 4.3 Customer Scoping & Validation Module (`tsk_customers`)
Handles client records and segregates external billable workflows from internal tasks.

* **Internal vs. External Flag**: Customers are marked with an `is_internal` boolean flag.
* **Outsourcing Restriction**: Tasks assigned to internal customers (specifically `SYAZNA WORLD (INTERNAL)`) are strictly forbidden from being set to the `Outsourcing` department.
* **Multi-Layer Validation**:
  * **Frontend**: The "Outsourcing" option is hidden dynamically from dropdowns if an internal customer is selected. An inline warning flag is shown for legacy tasks.
  * **Database Layer**: A `BEFORE INSERT OR UPDATE` trigger `trg_sync_and_validate_task` queries the customer record directly to reject invalid combos at the SQL execution layer.

### 4.4 Automated Telegram Webhook Handler (`task-notification-handler`)
A centralized notification router that formats and pushes system alerts to Telegram groups.

* **Database-to-Edge Webhook**: A Postgres trigger `task_webhook` catches `AFTER INSERT OR UPDATE` events on `tsk_tasks` and POSTs the payload using the `pg_net` extension.
* **Notification Types Supported**:
  * **Task Created**: Triggers on `INSERT`.
  * **Status Updated**: Triggers when `old_record.status != record.status`.
  * **PIC Reassigned**: Triggers when `old_record.assignee_id != record.assignee_id`.
  * **Task Completed**: Triggers when status changes to `DONE`. Computes and appends the total time spent from `tsk_time_logs`.
  * **New Comment added**: Triggers on `INSERT` of `tsk_comments`.
* **Dynamic Telegram Routing**: 
  * Centralized shared resolver `resolveTaskTelegramGroup` (`_shared/routing.ts`) shared across `task-notification-handler`, `task-timer-nudge`, and `blueprint-autopilot`.
  * The handler queries `tsk_department_settings` using the task's department to locate the target `telegram_group_id`.
  * **Routing Override Rule**: Recruitment tasks with `is_internal = true` are routed to Group ID `-1004461542862` ("Internal SW"). All other Recruitment tasks go to `-1001567997515` ("SW Recruiter").
  * **Fallback**: Unconfigured departments default to the global `TELEGRAM_CHAT_ID` env setting.

---

## 5. Database Schema & Triggers

### 5.1 Tables Map
* `tsk_tasks`: Core task store containing title, description, department (enum), priority (enum), status, assignee, and internal/external flags.
* `tsk_time_logs`: Stores user timer segments (start, end, duration in seconds, status).
* `tsk_department_settings`: Stores department metadata, including specific Telegram Chat IDs.
* `tsk_customers`: Stores customer profiles and the `is_internal` boolean flag.
* `tsk_comments`: Stores comment threads on tasks.
* `tsk_attachments`: Stores file attachments uploaded to tasks and comments.
* `lv_profiles`: Auth-synced profiles containing user roles and primary departments.
* `user_departments`: Stores additive borrowed/loaned department access grants per user.

### 5.2 PostgreSQL Triggers & Shared Access Functions
1. `user_has_department_access(p_user_id, p_department)`: Centralized `SECURITY DEFINER` function (with locked `search_path = public, pg_temp`) returning `true` if the user is Admin/Manager, if `p_department` is their primary home department, or if an active grant exists in `user_departments`.
2. `trg_sync_and_validate_task`: Consolidates `is_internal` syncing, creator department validation (without auto-forcing), internal outsourcing validation, and universal assignee department consistency validation. Runs `BEFORE INSERT OR UPDATE` on `tsk_tasks`.
3. `task_webhook`: POSTs task creation/update payloads to the Telegram notification handler Edge Function. Runs `AFTER INSERT OR UPDATE` on `tsk_tasks`.

---

## 6. Proposed Improvements & Senior Developer Recommendations

During review, the senior developer should evaluate the following structural improvements:

1. **Transactional Locking on Timers**:
   * *Status*: **Implemented**. Enforced via a partial unique index `idx_one_active_timer_per_user` on `tsk_time_logs` where `status = 'RUNNING'`, preventing concurrent active timers at the database layer.
2. **Optimize Webhook Performance**:
   * *Problem*: `pg_net` makes raw HTTP POST calls from the DB. If the Edge Function endpoint is slow, or database triggers execute frequently, it could lead to transaction delays.
   * *Recommendation*: Use Supabase Database Webhooks which queue calls out-of-process via Supabase’s internal replication listener, decoupling DB transaction execution from network latency.
3. **Enum Scalability**:
   * *Problem*: Department names are stored as a hardcoded PostgreSQL enum (`tsk_department`). Renaming a department (e.g. `Management` to `Human Resources`) requires DDL operations (`ALTER TYPE`), database type migrations, and frontend updates.
   * *Recommendation*: Migrate departments to a relational table (`tsk_departments`) and use foreign keys. This allows name changes via a simple `UPDATE` query without type modifications.
4. **Offline Timer Handling**:
   * *Problem*: Users who lose internet connection while working might have their timers drift or fail to stop.
   * *Recommendation*: Implement local storage sync with a client-side network listener to queue timer start/stop events offline and sync them back once connectivity is restored.
5. **Telegram Routing Customer Hardcoding**:
   * *Status*: **Implemented**. Consolidated routing logic into `resolveTaskTelegramGroup` (`_shared/routing.ts`) utilizing the boolean `is_internal` flag across `task-notification-handler`, `task-timer-nudge`, and `blueprint-autopilot`.
6. **Auto-Closed Timer Session Flags (Backlog)**:
   * *Problem*: When the Forgotten Timer Daemon auto-closes a session after 12+ hours, the resulting `tsk_time_logs` row has no indicator distinguishing it from genuine work time, polluting duration-based reporting.
   * *Recommendation*: Add an `auto_closed` boolean column (default `false`) to `tsk_time_logs` to be set to `true` by the daemon when it force-closes a session.
7. **`tsk_comments` & `tsk_attachments` RLS Scope**:
   * *Status*: **Implemented**. Unified under `user_has_department_access` and task assignee/creator scoping across `tsk_comments` and `tsk_attachments`.
8. **Multi-Department Staff Assignment (Staff Loan Support)**:
   * *Status*: **Implemented**. Supported via `user_departments` additive grants table and the shared `user_has_department_access` SQL function across RLS policies, triggers, task creation department selector, and assignee scoping.
