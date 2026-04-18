-- kiro_intel: rolling 2-week intelligence feed
-- Articles auto-expire and are purged nightly via pg_cron

CREATE TABLE IF NOT EXISTS public.kiro_intel (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text NOT NULL,
  url         text NOT NULL UNIQUE,  -- deduplication key
  source      text,
  summary     text,
  relevance   text CHECK (relevance IN ('high', 'medium', 'low')) DEFAULT 'medium',
  topic_id    text NOT NULL,         -- e.g. "ai_k12"
  topic_label text NOT NULL,         -- e.g. "AI in K-12 Education"
  business    text,                  -- "realpath" | "tailoredu" | "aiwhisperers" | "all"
  found_at    timestamptz DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS kiro_intel_topic_idx    ON public.kiro_intel (topic_id);
CREATE INDEX IF NOT EXISTS kiro_intel_relevance_idx ON public.kiro_intel (relevance);
CREATE INDEX IF NOT EXISTS kiro_intel_expires_idx  ON public.kiro_intel (expires_at);
CREATE INDEX IF NOT EXISTS kiro_intel_found_idx    ON public.kiro_intel (found_at DESC);

-- RLS
ALTER TABLE public.kiro_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kiro_intel"
  ON public.kiro_intel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage kiro_intel"
  ON public.kiro_intel FOR ALL TO service_role USING (true);

-- pg_cron: delete expired rows every night at 2 AM CT (8 AM UTC)
-- Requires pg_cron extension to be enabled in Supabase dashboard
SELECT cron.schedule(
  'kiro-intel-cleanup',
  '0 8 * * *',
  $$ DELETE FROM public.kiro_intel WHERE expires_at < now() $$
);
