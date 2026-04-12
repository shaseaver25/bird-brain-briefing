
CREATE TABLE public.app_config (
  id text PRIMARY KEY DEFAULT 'default',
  agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  api_key text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read config" ON public.app_config FOR SELECT USING (true);
CREATE POLICY "Anyone can insert config" ON public.app_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update config" ON public.app_config FOR UPDATE USING (true);
