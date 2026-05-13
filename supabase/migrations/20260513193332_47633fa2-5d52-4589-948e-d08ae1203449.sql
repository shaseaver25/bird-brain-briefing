
CREATE TABLE public.owl_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owl_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own owl_topics" ON public.owl_topics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.legislation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  level text NOT NULL,
  jurisdiction text NOT NULL,
  bill_id text,
  title text NOT NULL,
  summary text,
  status text,
  last_action text,
  last_action_date date,
  url text,
  source text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legislation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read legislation" ON public.legislation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage legislation" ON public.legislation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_legislation_topic ON public.legislation_items(topic);
CREATE INDEX idx_legislation_jurisdiction ON public.legislation_items(jurisdiction);
