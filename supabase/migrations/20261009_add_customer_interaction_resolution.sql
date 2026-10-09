ALTER TABLE public.tsk_customer_interaction_logs
    ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resolved_by_name TEXT;

CREATE OR REPLACE FUNCTION public.toggle_customer_interaction_resolution(
    p_interaction_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_actor_name TEXT;
    v_logged_by UUID;
    v_is_resolved BOOLEAN;
    v_new_state BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'An authenticated user is required to update an interaction';
    END IF;

    SELECT lower(role::text), full_name
    INTO v_role, v_actor_name
    FROM public.lv_profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A user profile is required to update an interaction';
    END IF;

    SELECT logged_by, is_resolved
    INTO v_logged_by, v_is_resolved
    FROM public.tsk_customer_interaction_logs
    WHERE id = p_interaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer interaction not found';
    END IF;

    IF v_logged_by IS DISTINCT FROM v_user_id AND coalesce(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION 'Only the interaction owner or an admin can update its status';
    END IF;

    v_new_state := NOT v_is_resolved;

    UPDATE public.tsk_customer_interaction_logs
    SET is_resolved = v_new_state,
        resolved_at = CASE WHEN v_new_state THEN now() ELSE NULL END,
        resolved_by = CASE WHEN v_new_state THEN v_user_id ELSE NULL END,
        resolved_by_name = CASE WHEN v_new_state THEN v_actor_name ELSE NULL END
    WHERE id = p_interaction_id;

    RETURN v_new_state;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_customer_interaction_resolution(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_customer_interaction_resolution(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
