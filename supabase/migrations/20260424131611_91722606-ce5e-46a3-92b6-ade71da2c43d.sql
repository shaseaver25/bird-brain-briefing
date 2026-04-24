
-- Enable pg_cron for scheduled deletion of old chat history
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Allow users to delete their own conversations (manual clear)
CREATE POLICY "Users can delete own conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Index to make purge + per-agent history queries fast
CREATE INDEX IF NOT EXISTS conversations_user_agent_created_idx
  ON public.conversations (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_created_at_idx
  ON public.conversations (created_at);

-- Function that purges conversations older than 14 days
CREATE OR REPLACE FUNCTION public.purge_old_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.conversations
  WHERE created_at < now() - interval '14 days';
END;
$$;

-- Schedule daily purge at 03:00 UTC
SELECT cron.schedule(
  'purge-old-conversations-daily',
  '0 3 * * *',
  $$SELECT public.purge_old_conversations();$$
);
