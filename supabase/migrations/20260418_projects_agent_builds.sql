-- projects: Merlin's live project tracking
-- project_tasks: per-project task list with status
-- agent_builds: Osprey's agent factory queue

-- ── Projects ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  description    text,
  status         text CHECK (status IN ('active', 'paused', 'completed', 'cancelled')) DEFAULT 'active',
  priority       text CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  owner          text,
  completion_pct integer DEFAULT 0,
  deadline       date,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects (status);
CREATE INDEX IF NOT EXISTS projects_priority_idx ON public.projects (priority);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage projects"
  ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage projects"
  ON public.projects FOR ALL TO service_role USING (true);

CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Project Tasks ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  status      text CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
  assignee    text,
  due_date    date,
  blocker     text,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON public.project_tasks (project_id);
CREATE INDEX IF NOT EXISTS project_tasks_status_idx  ON public.project_tasks (status);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage project_tasks"
  ON public.project_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage project_tasks"
  ON public.project_tasks FOR ALL TO service_role USING (true);

CREATE TRIGGER set_updated_at_project_tasks
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Agent Builds (Osprey's factory) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_builds (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                text NOT NULL,
  description         text NOT NULL,
  status              text CHECK (status IN ('generating', 'ready', 'deployed', 'cancelled')) DEFAULT 'generating',
  requested_by        text DEFAULT 'shannon',
  system_prompt       text,
  edge_function_code  text,
  widget_code         text,
  sql_migration       text,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.agent_builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage agent_builds"
  ON public.agent_builds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage agent_builds"
  ON public.agent_builds FOR ALL TO service_role USING (true);

CREATE TRIGGER set_updated_at_agent_builds
  BEFORE UPDATE ON public.agent_builds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: Projects ─────────────────────────────────────────────────────────────

INSERT INTO public.projects (id, name, description, status, priority, owner, completion_pct, deadline) VALUES
  (
    'a1b20001-0001-0001-0001-000000000001',
    'TinyFish / Vanta Hackathon',
    'Build a compelling multi-agent AI demo using TinyFish browser automation and Vanta for the hackathon. Showcase Bird Brain platform as the submission.',
    'active', 'high', 'Shannon', 15, '2026-04-30'
  ),
  (
    'a1b20002-0002-0002-0002-000000000002',
    'Bird Brain Briefing Platform',
    'Multi-agent staff meeting platform with live dashboards, SalesHawk prospecting, Kiro intel feed, and Wren morning briefings.',
    'active', 'high', 'Shannon', 65, NULL
  ),
  (
    'a1b20003-0003-0003-0003-000000000003',
    'AI Whisperers Co-Lab',
    'Premium membership community launching Fall 2026 for AI practitioners and SMB owners.',
    'active', 'medium', 'Shannon', 20, '2026-09-01'
  ),
  (
    'a1b20004-0004-0004-0004-000000000004',
    'TailoredU Landing Page',
    'New landing page optimized for SMB AI training service conversions.',
    'active', 'medium', 'Shannon', 70, '2026-05-01'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Hackathon tasks ──────────────────────────────────────────────────────

INSERT INTO public.project_tasks (project_id, title, status, assignee, due_date, sort_order) VALUES
  ('a1b20001-0001-0001-0001-000000000001', 'Define hackathon demo concept and judging criteria', 'in_progress', 'Shannon', '2026-04-19', 1),
  ('a1b20001-0001-0001-0001-000000000001', 'Wire TinyFish API into Bird Brain (SalesHawk enrichment)', 'todo', 'Shannon', '2026-04-21', 2),
  ('a1b20001-0001-0001-0001-000000000001', 'Build live demo scenario end-to-end', 'todo', 'Shannon', '2026-04-23', 3),
  ('a1b20001-0001-0001-0001-000000000001', 'Deploy Merlin + Osprey dashboards for demo', 'in_progress', 'Shannon', '2026-04-24', 4),
  ('a1b20001-0001-0001-0001-000000000001', 'Record 3-minute demo video', 'todo', 'Shannon', '2026-04-27', 5),
  ('a1b20001-0001-0001-0001-000000000001', 'Write submission writeup and tag Vanta', 'todo', 'Shannon', '2026-04-29', 6),
  ('a1b20001-0001-0001-0001-000000000001', 'Submit to hackathon portal', 'todo', 'Shannon', '2026-04-30', 7)
;

-- ── Seed: Bird Brain tasks ─────────────────────────────────────────────────────

INSERT INTO public.project_tasks (project_id, title, status, assignee, due_date, sort_order) VALUES
  ('a1b20002-0002-0002-0002-000000000002', 'Deploy wren-briefing edge function', 'in_progress', 'Shannon', '2026-04-18', 1),
  ('a1b20002-0002-0002-0002-000000000002', 'Add wren-briefing to n8n cron at 7:05 AM', 'todo', 'Shannon', '2026-04-18', 2),
  ('a1b20002-0002-0002-0002-000000000002', 'Enable pg_cron for kiro_intel cleanup', 'todo', 'Shannon', '2026-04-19', 3),
  ('a1b20002-0002-0002-0002-000000000002', 'Deploy Merlin + Osprey dashboards', 'in_progress', 'Shannon', '2026-04-19', 4),
  ('a1b20002-0002-0002-0002-000000000002', 'SalesHawk live pipeline from CRM (real lead data)', 'todo', 'Shannon', '2026-04-22', 5),
  ('a1b20002-0002-0002-0002-000000000002', 'TinyFish enrichment in SalesHawk', 'todo', 'Shannon', '2026-04-25', 6)
;
