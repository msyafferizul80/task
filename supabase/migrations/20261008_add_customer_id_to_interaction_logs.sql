ALTER TABLE public.tsk_customer_interaction_logs
    ADD COLUMN IF NOT EXISTS customer_id UUID
        REFERENCES public.tsk_customers(id) ON DELETE SET NULL;

WITH uniquely_named_customers AS (
    SELECT name, (array_agg(id))[1] AS id
    FROM public.tsk_customers
    GROUP BY name
    HAVING COUNT(*) = 1
)
UPDATE public.tsk_customer_interaction_logs AS interaction
SET customer_id = customer.id
FROM uniquely_named_customers AS customer
WHERE interaction.customer_id IS NULL
  AND interaction.customer_name = customer.name;

CREATE INDEX IF NOT EXISTS idx_tsk_customer_interaction_logs_customer_id
    ON public.tsk_customer_interaction_logs (customer_id);

NOTIFY pgrst, 'reload schema';
