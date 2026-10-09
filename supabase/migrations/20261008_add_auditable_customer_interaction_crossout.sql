ALTER TABLE public.tsk_customer_interaction_logs
    ADD COLUMN IF NOT EXISTS is_crossed_out BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS crossed_out_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS crossed_out_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS crossed_out_by_name TEXT;

ALTER TABLE public.tsk_customer_interaction_updates
    ADD COLUMN IF NOT EXISTS is_crossed_out BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS crossed_out_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS crossed_out_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS crossed_out_by_name TEXT;

REVOKE UPDATE ON public.tsk_customer_interaction_logs FROM authenticated;
GRANT UPDATE (
    customer_id,
    customer_name,
    employee_name,
    interaction_at,
    interaction_type,
    subject,
    notes
)
ON public.tsk_customer_interaction_logs
TO authenticated;

CREATE TABLE IF NOT EXISTS public.tsk_customer_interaction_entry_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL
        REFERENCES public.tsk_customer_interaction_logs(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('interaction', 'update')),
    entry_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('cross_out', 'restore')),
    acted_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    acted_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsk_customer_interaction_entry_actions_timeline
    ON public.tsk_customer_interaction_entry_actions (interaction_id, created_at);

ALTER TABLE public.tsk_customer_interaction_entry_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view interaction entry actions"
    ON public.tsk_customer_interaction_entry_actions;
CREATE POLICY "Authenticated users can view interaction entry actions"
    ON public.tsk_customer_interaction_entry_actions
    FOR SELECT
    TO authenticated
    USING (true);

GRANT SELECT ON public.tsk_customer_interaction_entry_actions TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_customer_interaction_entry_crossout(
    p_entry_type TEXT,
    p_entry_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_logged_by UUID;
    v_actor_name TEXT;
    v_is_crossed_out BOOLEAN;
    v_new_state BOOLEAN;
    v_interaction_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'An authenticated user is required to update a timeline entry';
    END IF;

    SELECT lower(role::text), full_name
    INTO v_role, v_actor_name
    FROM public.lv_profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A user profile is required to update a timeline entry';
    END IF;

    IF p_entry_type = 'interaction' THEN
        SELECT logged_by, is_crossed_out
        INTO v_logged_by, v_is_crossed_out
        FROM public.tsk_customer_interaction_logs
        WHERE id = p_entry_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Interaction entry not found';
        END IF;

        v_interaction_id := p_entry_id;
    ELSIF p_entry_type = 'update' THEN
        SELECT logged_by, is_crossed_out, interaction_id
        INTO v_logged_by, v_is_crossed_out, v_interaction_id
        FROM public.tsk_customer_interaction_updates
        WHERE id = p_entry_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Interaction follow-up entry not found';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid interaction entry type';
    END IF;

    IF v_logged_by IS DISTINCT FROM v_user_id AND coalesce(v_role, '') <> 'admin' THEN
        RAISE EXCEPTION 'Only the entry logger or an admin can update this timeline entry';
    END IF;

    v_new_state := NOT v_is_crossed_out;

    IF p_entry_type = 'interaction' THEN
        UPDATE public.tsk_customer_interaction_logs
        SET is_crossed_out = v_new_state,
            crossed_out_at = CASE WHEN v_new_state THEN now() ELSE crossed_out_at END,
            crossed_out_by = CASE WHEN v_new_state THEN v_user_id ELSE crossed_out_by END,
            crossed_out_by_name = CASE WHEN v_new_state THEN v_actor_name ELSE crossed_out_by_name END
        WHERE id = p_entry_id;
    ELSE
        UPDATE public.tsk_customer_interaction_updates
        SET is_crossed_out = v_new_state,
            crossed_out_at = CASE WHEN v_new_state THEN now() ELSE crossed_out_at END,
            crossed_out_by = CASE WHEN v_new_state THEN v_user_id ELSE crossed_out_by END,
            crossed_out_by_name = CASE WHEN v_new_state THEN v_actor_name ELSE crossed_out_by_name END
        WHERE id = p_entry_id;
    END IF;

    INSERT INTO public.tsk_customer_interaction_entry_actions (
        interaction_id,
        entry_type,
        entry_id,
        action,
        acted_by,
        acted_by_name
    )
    VALUES (
        v_interaction_id,
        p_entry_type,
        p_entry_id,
        CASE WHEN v_new_state THEN 'cross_out' ELSE 'restore' END,
        v_user_id,
        v_actor_name
    );

    RETURN v_new_state;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_customer_interaction_entry_crossout(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_customer_interaction_entry_crossout(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
