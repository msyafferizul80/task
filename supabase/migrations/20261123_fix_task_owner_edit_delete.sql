-- Allow task creators and assignees to edit tasks they own.
-- Allow creators and assignees to delete their own active tasks.

DROP POLICY IF EXISTS "Users can update department tasks" ON public.tsk_tasks;
CREATE POLICY "Users can update department tasks"
ON public.tsk_tasks FOR UPDATE
TO authenticated
USING (
    auth.uid() = assignee_id
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
)
WITH CHECK (
    auth.uid() = assignee_id
    OR auth.uid() = created_by
    OR public.user_has_department_access(auth.uid(), department::text)
);

DROP POLICY IF EXISTS "Users can delete own tasks or admins can delete tasks" ON public.tsk_tasks;
CREATE POLICY "Users can delete own tasks or admins can delete tasks"
ON public.tsk_tasks FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by
    OR auth.uid() = assignee_id
    OR EXISTS (
        SELECT 1 FROM public.lv_profiles
        WHERE id = auth.uid()
          AND role::text IN ('admin', 'manager')
    )
);

NOTIFY pgrst, 'reload schema';
