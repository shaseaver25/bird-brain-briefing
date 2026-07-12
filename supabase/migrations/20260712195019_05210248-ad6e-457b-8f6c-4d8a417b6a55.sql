
-- booking_rate_limits: service-role managed only
DROP POLICY IF EXISTS "service_role manages booking_rate_limits" ON public.booking_rate_limits;
CREATE POLICY "service_role manages booking_rate_limits" ON public.booking_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- mcp_tools: service-role managed only
DROP POLICY IF EXISTS "service_role manages mcp_tools" ON public.mcp_tools;
CREATE POLICY "service_role manages mcp_tools" ON public.mcp_tools
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- quickbooks_auth: service-role managed only (OAuth tokens)
DROP POLICY IF EXISTS "service_role manages quickbooks_auth" ON public.quickbooks_auth;
CREATE POLICY "service_role manages quickbooks_auth" ON public.quickbooks_auth
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- guidebook_concepts: service-role writes (edge functions), admins already read
DROP POLICY IF EXISTS "service_role manages guidebook_concepts" ON public.guidebook_concepts;
CREATE POLICY "service_role manages guidebook_concepts" ON public.guidebook_concepts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- agent_profiles: explicit service-role management alongside existing admin policy
DROP POLICY IF EXISTS "service_role manages agent_profiles" ON public.agent_profiles;
CREATE POLICY "service_role manages agent_profiles" ON public.agent_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
