
-- Create agent_notes table
CREATE TABLE public.agent_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent notes" ON public.agent_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agent notes" ON public.agent_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent notes" ON public.agent_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent notes" ON public.agent_notes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_agent_notes_user_agent ON public.agent_notes(user_id, agent_id);

-- Create agent_tasks table
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent tasks" ON public.agent_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agent tasks" ON public.agent_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent tasks" ON public.agent_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent tasks" ON public.agent_tasks FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_agent_tasks_user_agent ON public.agent_tasks(user_id, agent_id);

-- Create agent_widgets table
CREATE TABLE public.agent_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  widget_type TEXT NOT NULL DEFAULT 'kpi',
  title TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent widgets" ON public.agent_widgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agent widgets" ON public.agent_widgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent widgets" ON public.agent_widgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent widgets" ON public.agent_widgets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_agent_widgets_user_agent ON public.agent_widgets(user_id, agent_id);

-- Timestamp trigger (reusable)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_agent_notes_updated_at BEFORE UPDATE ON public.agent_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_widgets_updated_at BEFORE UPDATE ON public.agent_widgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
