
CREATE TABLE public.saleshawk_scan_state (
  user_id uuid PRIMARY KEY,
  last_scan_at timestamptz NOT NULL DEFAULT (now() - interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saleshawk_scan_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own scan_state" ON public.saleshawk_scan_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.saleshawk_networking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granola_meeting_id text,
  meeting_title text,
  meeting_date timestamptz,
  attendee_name text NOT NULL,
  attendee_email text,
  attendee_company text,
  attendee_title text,
  meeting_notes text,
  ai_suggested_business text,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | skipped | error
  confirmed_business text,
  crm_action text, -- inserted | appended | none
  crm_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.saleshawk_networking_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own networking_queue" ON public.saleshawk_networking_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_saleshawk_queue_user_status ON public.saleshawk_networking_queue(user_id, status, created_at DESC);
CREATE UNIQUE INDEX idx_saleshawk_queue_dedup ON public.saleshawk_networking_queue(user_id, granola_meeting_id, attendee_email)
  WHERE granola_meeting_id IS NOT NULL AND attendee_email IS NOT NULL;
