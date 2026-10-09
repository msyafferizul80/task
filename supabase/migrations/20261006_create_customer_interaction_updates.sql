CREATE TABLE IF NOT EXISTS public.tsk_customer_interaction_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL
        REFERENCES public.tsk_customer_interaction_logs(id) ON DELETE CASCADE,
    interaction_at TIMESTAMPTZ NOT NULL,
    interaction_type TEXT NOT NULL CHECK (btrim(interaction_type) <> ''),
    subject TEXT NOT NULL CHECK (btrim(subject) <> ''),
    notes TEXT,
    logged_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    logged_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsk_customer_interaction_updates_timeline
    ON public.tsk_customer_interaction_updates (interaction_id, interaction_at);

CREATE OR REPLACE FUNCTION public.fn_set_customer_interaction_update_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.logged_by := auth.uid();
    IF NEW.logged_by IS NULL THEN
        RAISE EXCEPTION 'An authenticated user is required to add an interaction follow-up';
    END IF;

    SELECT full_name
    INTO NEW.logged_by_name
    FROM public.lv_profiles
    WHERE id = NEW.logged_by;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A user profile is required to add an interaction follow-up';
    END IF;

    NEW.created_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_interaction_update_actor
    ON public.tsk_customer_interaction_updates;
CREATE TRIGGER trg_set_customer_interaction_update_actor
    BEFORE INSERT ON public.tsk_customer_interaction_updates
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_customer_interaction_update_actor();

ALTER TABLE public.tsk_customer_interaction_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view customer interaction updates"
    ON public.tsk_customer_interaction_updates;
CREATE POLICY "Authenticated users can view customer interaction updates"
    ON public.tsk_customer_interaction_updates
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can add customer interaction updates"
    ON public.tsk_customer_interaction_updates;
CREATE POLICY "Authenticated users can add customer interaction updates"
    ON public.tsk_customer_interaction_updates
    FOR INSERT
    TO authenticated
    WITH CHECK (logged_by = auth.uid());

GRANT SELECT, INSERT
    ON public.tsk_customer_interaction_updates
    TO authenticated;

NOTIFY pgrst, 'reload schema';
