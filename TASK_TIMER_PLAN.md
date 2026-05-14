# Task Timer Implementation Game Plan

## 1. Database Schema Preparation
Since a task can be worked on in multiple sessions, we will store time logs in a separate table rather than modifying the `tsk_tasks` table directly.

### Table: `tsk_time_logs`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key. |
| `task_id` | `uuid` | Foreign Key to `tsk_tasks`. |
| `user_id` | `uuid` | Foreign Key to `lv_profiles`. |
| `start_time` | `timestamptz` | When the timer started. |
| `end_time` | `timestamptz` | NULL if the timer is currently running. |
| `duration` | `int8` | Calculated seconds (stored when the timer stops). |
| `status` | `text` | 'RUNNING' or 'COMPLETED'. |

## 2. Core Logic

### Start Functionality
- **Rule**: One active timer per user.
- **Logic**: Before starting, query for any log where `user_id = current_user` AND `end_time IS NULL`. 
- **Action**: If an active log exists, either prevent the new start or automatically stop the previous one at the current timestamp.

### Stop Functionality
- **Logic**: Update the row where `end_time` is NULL.
- **Calculation**: Set `end_time = now()` and `duration = (now() - start_time)`.

### Duration Display
- **Total Time**: `SUM(duration)` for all completed logs for a specific `task_id`.
- **Live Counter**: If a task has a running log, UI displays `Total + (current_time - start_time)`.

## 3. Frontend Strategy (Ant Design & React)
- **UI Components**: Add a "Play/Stop" toggle button in the `Action` column of the `TaskListingPage`.
- **Live Ticking**: Use a `useEffect` with a 1-second interval to update the local state of the "running" duration so the UI feels responsive.
- **Real-time**: Use Supabase Postgres Changes subscription on `tsk_time_logs` so the timer state stays in sync across multiple browser tabs.

## 4. Fallback (The "Forgotten Timer")
- **Auto-Stop (Server-side)**: Implement a Supabase Edge Function (Cron) that runs every hour to close any timer running longer than 12 hours.
- **User Resolution (Client-side)**: On app initialization, if an active timer exists from a previous day, show a Modal asking the user to:
    - Adjust the end time manually.
    - Discard the session.
    - Keep it running (if they actually worked 12+ hours).

## 5. Edge Cases & Considerations
- **Timezones**: Always use `timestamptz` in the database to ensure UTC consistency.
- **Persistence**: The timer state must be derived from the database on page load so a browser refresh doesn't "reset" the clock.
- **Concurrency**: Ensure that if multiple people are assigned to a task, they each generate their own logs correctly via `user_id`.
- **Permissions**: Update RLS (Row Level Security) so users can only view/edit their own time logs (unless they are Admins).
