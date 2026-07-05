
-- 1. Role infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Seed existing app_config users as admins
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'admin'::public.app_role FROM public.app_config WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. agent_profiles
DROP POLICY IF EXISTS "Only admins can modify agent profiles" ON public.agent_profiles;
DROP POLICY IF EXISTS "Authenticated users can manage agent_profiles" ON public.agent_profiles;
CREATE POLICY "Admins manage agent_profiles" ON public.agent_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. agent_builds
DROP POLICY IF EXISTS "Authenticated users can manage agent_builds" ON public.agent_builds;
DROP POLICY IF EXISTS "Service role can manage agent_builds" ON public.agent_builds;
CREATE POLICY "Admins manage agent_builds" ON public.agent_builds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. agents
DROP POLICY IF EXISTS "Authenticated users can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Service role can manage agents" ON public.agents;
CREATE POLICY "Admins manage agents" ON public.agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. dashboard_configs
DROP POLICY IF EXISTS "Authenticated users can manage dashboard_configs" ON public.dashboard_configs;
DROP POLICY IF EXISTS "Service role can manage dashboard configs" ON public.dashboard_configs;
CREATE POLICY "Admins manage dashboard_configs" ON public.dashboard_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. projects
DROP POLICY IF EXISTS "Authenticated users can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Service role can manage projects" ON public.projects;
CREATE POLICY "Admins manage projects" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read projects" ON public.projects FOR SELECT TO authenticated USING (true);

-- 7. project_tasks
DROP POLICY IF EXISTS "Authenticated users can manage project_tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Service role can manage project_tasks" ON public.project_tasks;
CREATE POLICY "Admins manage project_tasks" ON public.project_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read project_tasks" ON public.project_tasks FOR SELECT TO authenticated USING (true);

-- 8. widget_data
DROP POLICY IF EXISTS "Authenticated users can manage widget_data" ON public.widget_data;
DROP POLICY IF EXISTS "Service role can manage widget data" ON public.widget_data;
CREATE POLICY "Admins manage widget_data" ON public.widget_data FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 9. mcp_tools - remove authenticated read; service_role bypasses RLS
DROP POLICY IF EXISTS "Authenticated users can read MCP tools" ON public.mcp_tools;
DROP POLICY IF EXISTS "Authenticated users can read mcp_tools" ON public.mcp_tools;

-- 10. saleshawk_networking_queue - restrict to authenticated role
DROP POLICY IF EXISTS "users manage own networking_queue" ON public.saleshawk_networking_queue;
CREATE POLICY "Users manage own networking_queue" ON public.saleshawk_networking_queue
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11. Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.exec_agent_migration(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_conversations() FROM PUBLIC, anon, authenticated;

-- 12. Set search_path on remaining functions
CREATE OR REPLACE FUNCTION public.increment_dashboard_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.version = OLD.version + 1; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
