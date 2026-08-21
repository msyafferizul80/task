-- ==============================================================================
-- Migration: Multi-Department Staff Assignment (Staff Loan Support)
-- Date: 2026-08-21
-- Description:
-- 1. Creates user_departments table for additive department grants.
-- 2. Creates shared SECURITY DEFINER function user_has_department_access with explicit search_path.
-- 3. Updates RLS policies on tsk_tasks, tsk_time_logs, tsk_comments, tsk_attachments, and review groups.
-- 4. Updates trigger trg_sync_and_validate_task with strict validation order.
-- ==============================================================================

-- 1. Create user_departments table
CREATE TABLE IF NOT EXISTS public.user_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.lv_profiles(id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    granted_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_department UNIQUE (user_id, department)
);

-- Enable RLS on user_departments
ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view user departments" ON public.user_departments;
CREATE POLICY "Authenticated users can view user departments"
ON public.user_departments FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage user departments" ON public.user_departments;
CREATE POLICY "Admins can manage user departments"
ON public.user_departments FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.lv_profiles
        WHERE id = auth.uid() AND role::text = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.lv_profiles
        WHERE id = auth.uid() AND role::text = 'admin'
    )
);

-- 2. Create Shared Access Function (SECURITY DEFINER with locked search_path)
CREATE OR REPLACE FUNCTION public.user_has_department_access(p_user_id UUID, p_department TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_role TEXT;
    v_home_dept TEXT;
BEGIN
    IF p_user_id IS NULL OR p_department IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user is admin or manager (organization-wide global scope)
    SELECT role::text, department::text 
    INTO v_role, v_home_dept
    FROM public.lv_profiles 
    WHERE id = p_user_id;

    IF v_role IN ('admin', 'manager') THEN
        RETURN TRUE;
    END IF;

    -- Check primary/home department
    IF v_home_dept IS NOT NULL AND v_home_dept = p_department THEN
        RETURN TRUE;
    END IF;

    -- Check borrowed/loaned department in user_departments
    IF EXISTS (
        SELECT 1 
        FROM public.user_departments 
        WHERE user_id = p_user_id 
          AND department = p_department
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- Grant execute permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.user_has_department_access(UUID, TEXT) TO authenticated, service_role;

-- 3. RLS Updates across tsk_tasks
DROP POLICY IF EXISTS "Authenticated users can view department tasks" ON public.tsk_tasks;
DROP POLICY IF EXISTS "Users can view accessible tasks" ON public.tsk_tasks;
CREATE POLICY "Users can view accessible tasks"
ON public.tsk_tasks FOR SELECT
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
);

DROP POLICY IF EXISTS "Users can insert department tasks" ON public.tsk_tasks;
CREATE POLICY "Users can insert department tasks"
ON public.tsk_tasks FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_department_access(auth.uid(), department::text)
);

DROP POLICY IF EXISTS "Users can update department tasks" ON public.tsk_tasks;
CREATE POLICY "Users can update department tasks"
ON public.tsk_tasks FOR UPDATE
TO authenticated
USING (
    auth.uid() = assignee_id
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
    public.user_has_department_access(auth.uid(), department::text)
);

-- Review Group Specific RLS for tsk_tasks
DROP POLICY IF EXISTS "Review group members can view pending review tasks in their department" ON public.tsk_tasks;
CREATE POLICY "Review group members can view pending review tasks in their department"
ON public.tsk_tasks FOR SELECT
TO authenticated
USING (
    status = 'REVIEW'
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
        AND rgm.user_id = auth.uid()
    )
    AND public.user_has_department_access(auth.uid(), tsk_tasks.department::text)
);

DROP POLICY IF EXISTS "Review group members can resolve pending review tasks in their department" ON public.tsk_tasks;
CREATE POLICY "Review group members can resolve pending review tasks in their department"
ON public.tsk_tasks FOR UPDATE
TO authenticated
USING (
    status = 'REVIEW'
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
        AND rgm.user_id = auth.uid()
    )
    AND public.user_has_department_access(auth.uid(), tsk_tasks.department::text)
)
WITH CHECK (
    public.user_has_department_access(auth.uid(), tsk_tasks.department::text)
);

-- 4. RLS Updates on tsk_time_logs
ALTER TABLE public.tsk_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant time logs" ON public.tsk_time_logs;
CREATE POLICY "Users can view relevant time logs"
ON public.tsk_time_logs FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM public.tsk_tasks t
        WHERE t.id = tsk_time_logs.task_id
        AND public.user_has_department_access(auth.uid(), t.department::text)
    )
);

DROP POLICY IF EXISTS "Users can manage own time logs" ON public.tsk_time_logs;
CREATE POLICY "Users can manage own time logs"
ON public.tsk_time_logs FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. RLS Updates on tsk_comments & tsk_attachments
ALTER TABLE public.tsk_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view task comments" ON public.tsk_comments;
CREATE POLICY "Users can view task comments"
ON public.tsk_comments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tsk_tasks t
        WHERE t.id = tsk_comments.task_id
        AND (
            auth.uid() = t.assignee_id
            OR auth.uid() = t.created_by
            OR public.user_has_department_access(auth.uid(), t.department::text)
        )
    )
);

DROP POLICY IF EXISTS "Users can insert task comments" ON public.tsk_comments;
CREATE POLICY "Users can insert task comments"
ON public.tsk_comments FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM public.tsk_tasks t
        WHERE t.id = tsk_comments.task_id
        AND (
            auth.uid() = t.assignee_id
            OR auth.uid() = t.created_by
            OR public.user_has_department_access(auth.uid(), t.department::text)
        )
    )
);

DROP POLICY IF EXISTS "Users can delete own comments or admin delete" ON public.tsk_comments;
CREATE POLICY "Users can delete own comments or admin delete"
ON public.tsk_comments FOR DELETE
TO authenticated
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM public.lv_profiles
        WHERE id = auth.uid() AND role::text IN ('admin', 'manager')
    )
);

-- Attachments RLS
ALTER TABLE public.tsk_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view task attachments" ON public.tsk_attachments;
CREATE POLICY "Users can view task attachments"
ON public.tsk_attachments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tsk_tasks t
        WHERE t.id = tsk_attachments.task_id
        AND (
            auth.uid() = t.assignee_id
            OR auth.uid() = t.created_by
            OR public.user_has_department_access(auth.uid(), t.department::text)
        )
    )
);

DROP POLICY IF EXISTS "Users can insert task attachments" ON public.tsk_attachments;
CREATE POLICY "Users can insert task attachments"
ON public.tsk_attachments FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1 FROM public.tsk_tasks t
        WHERE t.id = tsk_attachments.task_id
        AND (
            auth.uid() = t.assignee_id
            OR auth.uid() = t.created_by
            OR public.user_has_department_access(auth.uid(), t.department::text)
        )
    )
);

DROP POLICY IF EXISTS "Users can delete own attachments or admin delete" ON public.tsk_attachments;
CREATE POLICY "Users can delete own attachments or admin delete"
ON public.tsk_attachments FOR DELETE
TO authenticated
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM public.lv_profiles
        WHERE id = auth.uid() AND role::text IN ('admin', 'manager')
    )
);

-- 6. Trigger Function with Strict Step Ordering
CREATE OR REPLACE FUNCTION public.fn_sync_and_validate_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_internal BOOLEAN;
    v_creator_role TEXT;
    v_creator_dept TEXT;
BEGIN
    -- STEP 1: Sync is_internal flag based on customer
    IF NEW.customer_name IS NOT NULL THEN
        SELECT COALESCE(is_internal, false)
        INTO v_is_internal
        FROM public.tsk_customers
        WHERE name = NEW.customer_name;

        NEW.is_internal := COALESCE(v_is_internal, false);
    END IF;

    -- STEP 2: Creator department validation and fallback
    IF NEW.created_by IS NOT NULL THEN
        SELECT role::text, department::text
        INTO v_creator_role, v_creator_dept
        FROM public.lv_profiles
        WHERE id = NEW.created_by;

        -- If department was not supplied, default to creator's home department
        IF NEW.department IS NULL AND v_creator_dept IS NOT NULL THEN
            NEW.department := v_creator_dept;
        END IF;

        -- If creator is not admin/manager, ensure they have department access
        IF v_creator_role NOT IN ('admin', 'manager') AND NEW.department IS NOT NULL THEN
            IF NOT public.user_has_department_access(NEW.created_by, NEW.department::text) THEN
                RAISE EXCEPTION 'Pengguna tidak mempunyai kebenaran untuk jabatan "%"', NEW.department;
            END IF;
        END IF;
    END IF;

    -- STEP 3: Strict Outsourcing + Internal Customer rule validation
    IF NEW.is_internal = true AND NEW.department = 'Outsourcing' THEN
        RAISE EXCEPTION 'Tugasan pelanggan dalaman tidak boleh ditetapkan kepada Jabatan Outsourcing';
    END IF;

    -- STEP 4: Assignee department access validation
    IF NEW.assignee_id IS NOT NULL AND NEW.department IS NOT NULL THEN
        IF NOT public.user_has_department_access(NEW.assignee_id, NEW.department::text) THEN
            RAISE EXCEPTION 'Assignee tidak mempunyai akses kepada jabatan "%"', NEW.department;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Attach Trigger to tsk_tasks
DROP TRIGGER IF EXISTS trg_sync_and_validate_task ON public.tsk_tasks;
CREATE TRIGGER trg_sync_and_validate_task
BEFORE INSERT OR UPDATE ON public.tsk_tasks
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_and_validate_task();
