
ALTER FUNCTION public._has_role_available() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.exec_agent_migration(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_conversations() FROM PUBLIC, anon, authenticated;
