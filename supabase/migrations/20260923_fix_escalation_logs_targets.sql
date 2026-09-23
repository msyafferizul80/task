-- Fix review-group escalation logs on databases where the original migration was not applied.
-- Individual escalations use to_user_id; group escalations use to_group_id.

ALTER TABLE public.tsk_escalation_logs
    ALTER COLUMN to_user_id DROP NOT NULL;

ALTER TABLE public.tsk_escalation_logs
    ADD COLUMN IF NOT EXISTS to_group_id UUID
        REFERENCES public.tsk_review_groups(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_escalation_log_target_exclusive'
          AND conrelid = 'public.tsk_escalation_logs'::regclass
    ) THEN
        ALTER TABLE public.tsk_escalation_logs
        ADD CONSTRAINT chk_escalation_log_target_exclusive
        CHECK (
            (to_user_id IS NOT NULL AND to_group_id IS NULL)
            OR (to_user_id IS NULL AND to_group_id IS NOT NULL)
        );
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
