
-- Add user_id column
ALTER TABLE public.app_config ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- Swap primary key
ALTER TABLE public.app_config DROP CONSTRAINT app_config_pkey;
ALTER TABLE public.app_config DROP COLUMN id;
ALTER TABLE public.app_config ADD PRIMARY KEY (user_id);

-- Create per-user RLS policies
CREATE POLICY "Users can read own config" ON public.app_config
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own config" ON public.app_config
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config" ON public.app_config
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
