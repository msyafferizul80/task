CREATE TABLE IF NOT EXISTS public.tsk_customer_interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL CHECK (btrim(customer_name) <> ''),
    employee_name TEXT NOT NULL CHECK (btrim(employee_name) <> ''),
    interaction_at TIMESTAMPTZ NOT NULL,
    interaction_type TEXT NOT NULL CHECK (btrim(interaction_type) <> ''),
    subject TEXT NOT NULL CHECK (btrim(subject) <> ''),
    notes TEXT,
    logged_by UUID REFERENCES public.lv_profiles(id) ON DELETE SET NULL,
    logged_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsk_customer_interaction_logs_interaction_at
    ON public.tsk_customer_interaction_logs (interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_tsk_customer_interaction_logs_logged_by
    ON public.tsk_customer_interaction_logs (logged_by);

CREATE OR REPLACE FUNCTION public.fn_set_customer_interaction_log_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.logged_by := auth.uid();
        IF NEW.logged_by IS NULL THEN
            RAISE EXCEPTION 'An authenticated user is required to log an interaction';
        END IF;

        SELECT full_name
        INTO NEW.logged_by_name
        FROM public.lv_profiles
        WHERE id = NEW.logged_by;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A user profile is required to log an interaction';
        END IF;

        NEW.created_at := now();
    ELSE
        NEW.logged_by := OLD.logged_by;
        NEW.logged_by_name := OLD.logged_by_name;
        NEW.created_at := OLD.created_at;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_interaction_log_actor
    ON public.tsk_customer_interaction_logs;
CREATE TRIGGER trg_set_customer_interaction_log_actor
    BEFORE INSERT OR UPDATE ON public.tsk_customer_interaction_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_customer_interaction_log_actor();

ALTER TABLE public.tsk_customer_interaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view customer interaction logs"
    ON public.tsk_customer_interaction_logs;
CREATE POLICY "Authenticated users can view customer interaction logs"
    ON public.tsk_customer_interaction_logs
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can create customer interaction logs"
    ON public.tsk_customer_interaction_logs;
CREATE POLICY "Authenticated users can create customer interaction logs"
    ON public.tsk_customer_interaction_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (logged_by = auth.uid());

DROP POLICY IF EXISTS "Authors can update their customer interaction logs"
    ON public.tsk_customer_interaction_logs;
CREATE POLICY "Authors can update their customer interaction logs"
    ON public.tsk_customer_interaction_logs
    FOR UPDATE
    TO authenticated
    USING (logged_by = auth.uid())
    WITH CHECK (logged_by = auth.uid());

DROP POLICY IF EXISTS "Authors can delete their customer interaction logs"
    ON public.tsk_customer_interaction_logs;
CREATE POLICY "Authors can delete their customer interaction logs"
    ON public.tsk_customer_interaction_logs
    FOR DELETE
    TO authenticated
    USING (logged_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.tsk_customer_interaction_logs
    TO authenticated;

NOTIFY pgrst, 'reload schema';
