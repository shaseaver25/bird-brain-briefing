-- 1. Track when migration was run
ALTER TABLE public.agent_builds
ADD COLUMN IF NOT EXISTS migration_ran_at timestamptz;

-- 2. Secure SQL executor: reads sql_migration from agent_builds and runs it.
-- Service role only (called from osprey-run-migration edge function).
CREATE OR REPLACE FUNCTION public.exec_agent_migration(_build_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sql text;
  _lower text;
  _forbidden text[] := ARRAY[
    'auth.', 'storage.', 'vault.', 'supabase_functions.', 'realtime.',
    'pg_catalog.', 'information_schema.', 'drop database', 'drop schema public',
    'alter database', 'create extension', 'drop extension'
  ];
  _kw text;
BEGIN
  SELECT sql_migration INTO _sql
  FROM public.agent_builds
  WHERE id = _build_id;

  IF _sql IS NULL OR length(trim(_sql)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', 'No migration to run');
  END IF;

  _lower := lower(_sql);

  FOREACH _kw IN ARRAY _forbidden LOOP
    IF position(_kw IN _lower) > 0 THEN
      RAISE EXCEPTION 'Migration contains forbidden token: %', _kw;
    END IF;
  END LOOP;

  EXECUTE _sql;

  UPDATE public.agent_builds
  SET migration_ran_at = now(), updated_at = now()
  WHERE id = _build_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Migration executed successfully');
END;
$$;

-- Lock down: only service role can invoke
REVOKE ALL ON FUNCTION public.exec_agent_migration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_agent_migration(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.exec_agent_migration(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_agent_migration(uuid) TO service_role;