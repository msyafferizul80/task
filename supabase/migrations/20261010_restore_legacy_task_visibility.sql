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
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role::text, department::text
    INTO v_role, v_home_dept
    FROM public.lv_profiles
    WHERE id = p_user_id;

    IF v_role IN ('admin', 'manager') THEN
        RETURN TRUE;
    END IF;

    IF p_department IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_home_dept IS NOT NULL AND v_home_dept = p_department THEN
        RETURN TRUE;
    END IF;

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

NOTIFY pgrst, 'reload schema';
