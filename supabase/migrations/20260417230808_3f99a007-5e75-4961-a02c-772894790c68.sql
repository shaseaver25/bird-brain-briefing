-- Drop policy that depends on agent_id column
DROP POLICY IF EXISTS "Authenticated users can read widget data for published dashboar" ON public.widget_data;

-- Drop FKs and convert columns to text
ALTER TABLE public.widget_data DROP CONSTRAINT IF EXISTS widget_data_agent_id_fkey;
ALTER TABLE public.widget_data ALTER COLUMN agent_id TYPE text USING agent_id::text;

ALTER TABLE public.dashboard_configs DROP CONSTRAINT IF EXISTS dashboard_configs_agent_id_fkey;
ALTER TABLE public.dashboard_configs ALTER COLUMN agent_id TYPE text USING agent_id::text;

-- Recreate the policy now that both columns are text
CREATE POLICY "Authenticated users can read widget data for published dashboar"
ON public.widget_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dashboard_configs dc
    WHERE dc.agent_id = widget_data.agent_id AND dc.is_published = true
  )
);

-- Unique key for upsert
CREATE UNIQUE INDEX IF NOT EXISTS widget_data_agent_widget_key_idx
  ON public.widget_data (agent_id, widget_key);