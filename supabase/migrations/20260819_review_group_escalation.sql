-- ==============================================================================
-- Migration: Review Group Escalation
-- Date: 2026-08-19
-- Description:
-- 1. Creates tsk_review_groups and tsk_review_group_members tables.
-- 2. Adds escalation target fields (individual & group), originator, and reviewer tracking to tsk_tasks.
-- 3. Enforces mutual exclusivity constraint between individual and group escalation targets.
-- 4. Establishes Option A strict department-scoped RLS policies.
-- ==============================================================================

-- 1. Create Review Groups tables
CREATE TABLE IF NOT EXISTS tsk_review_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES lv_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tsk_review_group_members (
    group_id UUID NOT NULL REFERENCES tsk_review_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES lv_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- 2. Alter tsk_tasks to support Group Escalation & Review tracking
ALTER TABLE tsk_tasks
ADD COLUMN IF NOT EXISTS escalated_to_user_id UUID REFERENCES lv_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS escalated_to_group_id UUID REFERENCES tsk_review_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS escalated_from_user_id UUID REFERENCES lv_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES lv_profiles(id) ON DELETE SET NULL;

-- 3. Enforce mutual exclusivity at DB constraint level
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_escalation_target_exclusive'
    ) THEN
        ALTER TABLE tsk_tasks
        ADD CONSTRAINT chk_escalation_target_exclusive
        CHECK (NOT (escalated_to_user_id IS NOT NULL AND escalated_to_group_id IS NOT NULL));
    END IF;
END $$;

-- 4. Alter tsk_escalation_logs
ALTER TABLE tsk_escalation_logs
ADD COLUMN IF NOT EXISTS to_group_id UUID REFERENCES tsk_review_groups(id) ON DELETE SET NULL;

-- 5. RLS on tsk_review_groups & tsk_review_group_members
ALTER TABLE tsk_review_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsk_review_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view review groups" ON tsk_review_groups;
CREATE POLICY "Authenticated users can view review groups"
ON tsk_review_groups FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage review groups" ON tsk_review_groups;
CREATE POLICY "Admins can manage review groups"
ON tsk_review_groups FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM lv_profiles WHERE id = auth.uid() AND role::text = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM lv_profiles WHERE id = auth.uid() AND role::text = 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can view review group members" ON tsk_review_group_members;
CREATE POLICY "Authenticated users can view review group members"
ON tsk_review_group_members FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage review group members" ON tsk_review_group_members;
CREATE POLICY "Admins can manage review group members"
ON tsk_review_group_members FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM lv_profiles WHERE id = auth.uid() AND role::text = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM lv_profiles WHERE id = auth.uid() AND role::text = 'admin')
);

-- 6. Option A Strict Department-Scoped RLS for Review Groups on tsk_tasks (with explicit ::text casts)
DROP POLICY IF EXISTS "Review group members can view pending review tasks in their department" ON tsk_tasks;
CREATE POLICY "Review group members can view pending review tasks in their department"
ON tsk_tasks FOR SELECT
TO authenticated
USING (
    status = 'REVIEW'
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
        AND rgm.user_id = auth.uid()
    )
    AND (
        tsk_tasks.department::text = (SELECT department::text FROM lv_profiles WHERE id = auth.uid())
        OR (SELECT role::text FROM lv_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
);

DROP POLICY IF EXISTS "Review group members can resolve pending review tasks in their department" ON tsk_tasks;
CREATE POLICY "Review group members can resolve pending review tasks in their department"
ON tsk_tasks FOR UPDATE
TO authenticated
USING (
    status = 'REVIEW'
    AND escalated_to_group_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM tsk_review_group_members rgm
        WHERE rgm.group_id = tsk_tasks.escalated_to_group_id
        AND rgm.user_id = auth.uid()
    )
    AND (
        tsk_tasks.department::text = (SELECT department::text FROM lv_profiles WHERE id = auth.uid())
        OR (SELECT role::text FROM lv_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
)
WITH CHECK (
    (
        tsk_tasks.department::text = (SELECT department::text FROM lv_profiles WHERE id = auth.uid())
        OR (SELECT role::text FROM lv_profiles WHERE id = auth.uid()) IN ('admin', 'manager')
    )
);
