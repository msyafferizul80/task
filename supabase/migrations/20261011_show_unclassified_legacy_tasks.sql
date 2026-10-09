DROP POLICY IF EXISTS "Users can view accessible tasks" ON public.tsk_tasks;
CREATE POLICY "Users can view accessible tasks"
ON public.tsk_tasks FOR SELECT
TO authenticated
USING (
    department IS NULL
    OR auth.uid() = assignee_id
    OR auth.uid() = created_by
    OR public.user_has_department_access(auth.uid(), department::text)
    OR (
        status = 'REVIEW'
        AND escalated_to_group_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.tsk_review_group_members rgm
            WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
            AND rgm.user_id = auth.uid()
        )
        AND public.user_has_department_access(auth.uid(), department::text)
    )
);

NOTIFY pgrst, 'reload schema';
