DROP POLICY IF EXISTS "Review group members can view assigned review tasks" ON public.tsk_tasks;
CREATE POLICY "Review group members can view assigned review tasks"
ON public.tsk_tasks FOR SELECT
TO authenticated
USING (
    status IN ('BACKLOG', 'REVIEW')
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
          AND rgm.user_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.start_review_group_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_task_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to start a group review.';
    END IF;

    UPDATE public.tsk_tasks
    SET status = 'REVIEW',
        updated_at = NOW()
    WHERE id = p_task_id
      AND status = 'BACKLOG'
      AND escalated_to_group_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.tsk_review_group_members rgm
          WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
            AND rgm.user_id = v_user_id
      )
    RETURNING id INTO v_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.tsk_task_history (
        task_id,
        status_before,
        new_status,
        changed_by
    )
    VALUES (
        v_task_id,
        'BACKLOG',
        'REVIEW',
        v_user_id
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.start_review_group_task(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_review_group_task(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
