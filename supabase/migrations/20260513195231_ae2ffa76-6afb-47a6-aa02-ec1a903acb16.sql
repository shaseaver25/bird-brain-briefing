
CREATE TABLE public.merlin_scan_state (
  user_id uuid PRIMARY KEY,
  last_scan_at timestamptz NOT NULL DEFAULT (now() - interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.merlin_scan_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own merlin_scan_state" ON public.merlin_scan_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.merlin_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  context text,
  due_date date,
  status text NOT NULL DEFAULT 'todo', -- todo | in_progress | done
  source text NOT NULL DEFAULT 'granola',
  source_meeting_id text,
  source_meeting_title text,
  source_meeting_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.merlin_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own merlin_action_items" ON public.merlin_action_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_merlin_actions_user_status ON public.merlin_action_items(user_id, status, created_at DESC);
CREATE UNIQUE INDEX idx_merlin_actions_dedup ON public.merlin_action_items(user_id, source_meeting_id, title)
  WHERE source_meeting_id IS NOT NULL;
