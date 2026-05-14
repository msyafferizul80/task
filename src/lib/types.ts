export type PriorityType = 'DO_FIRST' | 'SCHEDULE' | 'DELEGATE' | 'ELIMINATE';
export type TaskStatus = 'BACKLOG' | 'CLIENT_HOLD' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export interface Profile {
    id: string;
    full_name: string;
    avatar_url?: string;
    jawatan?: string;
}

export interface Task {
    id: string;
    title: string;
    description: string | null;
    assignee_id: string | null;
    customer_name: string | null;
    priority_type: PriorityType | null;
    status: TaskStatus;
    due_date: string | null;
    created_at: string;
    updated_at?: string;
    created_by?: string | null;
    department?: string;
    is_internal?: boolean;
    assignee?: Profile;
    creator?: Profile;
    is_escalated?: boolean;
}

export interface EscalationLog {
    id: string;
    task_id: string;
    from_user_id: string;
    to_user_id: string;
    reason: string;
    task_description?: string;
    created_at: string;
    from_user?: Profile;
    to_user?: Profile;
}

export interface TaskChecklist {
    id: string;
    task_id: string;
    item_text: string;
    is_completed: boolean;
    created_at: string;
}
