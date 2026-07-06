
-- agent_messages: admin-only read
DROP POLICY IF EXISTS "authenticated can read agent messages" ON public.agent_messages;
CREATE POLICY "Admins read agent_messages" ON public.agent_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- agent_profiles: admin-only read
DROP POLICY IF EXISTS "Authenticated users can read agent profiles" ON public.agent_profiles;
DROP POLICY IF EXISTS "Authenticated users can read agent_profiles" ON public.agent_profiles;
CREATE POLICY "Admins read agent_profiles" ON public.agent_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- agents: admin-only read
DROP POLICY IF EXISTS "Authenticated users can read agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can read all agents" ON public.agents;
CREATE POLICY "Admins read agents" ON public.agents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- dashboard_configs: drop universal read
DROP POLICY IF EXISTS "Authenticated users can read dashboard_configs" ON public.dashboard_configs;

-- kiro_intel: admin-only read
DROP POLICY IF EXISTS "Authenticated users can read kiro_intel" ON public.kiro_intel;
CREATE POLICY "Admins read kiro_intel" ON public.kiro_intel
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- legislation_items: admin-only manage, admin-only read
DROP POLICY IF EXISTS "Authenticated manage legislation" ON public.legislation_items;
DROP POLICY IF EXISTS "Authenticated read legislation" ON public.legislation_items;
CREATE POLICY "Admins manage legislation_items" ON public.legislation_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read legislation_items" ON public.legislation_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- project_tasks: admin-only read
DROP POLICY IF EXISTS "Authenticated read project_tasks" ON public.project_tasks;
CREATE POLICY "Admins read project_tasks" ON public.project_tasks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- projects: admin-only read
DROP POLICY IF EXISTS "Authenticated read projects" ON public.projects;
CREATE POLICY "Admins read projects" ON public.projects
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- widget_data: admin-only read
DROP POLICY IF EXISTS "Authenticated users can read widget_data" ON public.widget_data;
CREATE POLICY "Admins read widget_data" ON public.widget_data
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
