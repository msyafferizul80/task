export type PriorityType = 'DO_FIRST' | 'SCHEDULE' | 'DELEGATE' | 'ELIMINATE';
export type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

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
    assignee?: Profile;
}
