-- Review group membership grants access to the pending review, even when
-- the reviewer does not have general access to the task's department.
DROP POLICY IF EXISTS "Review group members can view assigned review tasks" ON public.tsk_tasks;
CREATE POLICY "Review group members can view assigned review tasks"
ON public.tsk_tasks FOR SELECT
TO authenticated
USING (
    status = 'REVIEW'
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
          AND rgm.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Review group members can view comments on assigned review tasks" ON public.tsk_comments;
CREATE POLICY "Review group members can view comments on assigned review tasks"
ON public.tsk_comments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tsk_tasks t
        JOIN public.tsk_review_group_members rgm
          ON rgm.group_id = t.escalated_to_group_id
        WHERE t.id = tsk_comments.task_id
          AND t.status = 'REVIEW'
          AND rgm.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Review group members can comment on assigned review tasks" ON public.tsk_comments;
CREATE POLICY "Review group members can comment on assigned review tasks"
ON public.tsk_comments FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.tsk_tasks t
        JOIN public.tsk_review_group_members rgm
          ON rgm.group_id = t.escalated_to_group_id
        WHERE t.id = tsk_comments.task_id
          AND t.status = 'REVIEW'
          AND rgm.user_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.resolve_review_group_task(
    p_task_id UUID,
    p_approved BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_task public.tsk_tasks%ROWTYPE;
    v_new_status public.tsk_tasks.status%TYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to resolve a review task.';
    END IF;

    IF p_approved IS NULL THEN
        RAISE EXCEPTION 'A review decision is required.';
    END IF;

    IF NOT p_approved AND NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    IF p_approved THEN
        v_new_status := 'DONE';
    ELSE
        v_new_status := 'IN_PROGRESS';
    END IF;

    UPDATE public.tsk_tasks
    SET status = v_new_status,
        assignee_id = COALESCE(escalated_from_user_id, created_by),
        is_escalated = FALSE,
        escalated_to_user_id = NULL,
        escalated_to_group_id = NULL,
        reviewed_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_task_id
      AND status = 'REVIEW'
      AND escalated_to_group_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.tsk_review_group_members rgm
          WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
            AND rgm.user_id = v_user_id
      )
    RETURNING * INTO v_task;

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
        v_task.id,
        'REVIEW',
        v_task.status,
        v_user_id
    );

    INSERT INTO public.tsk_comments (task_id, user_id, content)
    VALUES (
        v_task.id,
        v_user_id,
        CASE
            WHEN p_approved THEN '✅ **Task Approved**: Tugasan telah diluluskan dan diselesaikan.'
            ELSE '❌ **Semakan Ditolak (Perlu Pembetulan)**:' || E'\n' || BTRIM(p_reason)
        END
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_review_group_task(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_review_group_task(UUID, BOOLEAN, TEXT) TO authenticated;
