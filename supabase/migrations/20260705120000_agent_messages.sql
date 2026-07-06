-- Inter-agent message bus.
-- Agents are identified by the same text slugs used in widget_data
-- ("wren", "saleshawk", "kiro", "merlin", "owl", "mockingjay", "osprey").
-- Single-operator app: no user_id column (consistent with widget_data);
-- a multi-tenant deployment would add one plus per-user RLS.

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  from_agent text not null,
  to_agent text not null default 'all',
  kind text not null default 'report'
    check (kind in ('report', 'request', 'handoff', 'alert')),
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  read_by text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists idx_agent_messages_inbox
  on public.agent_messages (to_agent, created_at desc);
create index if not exists idx_agent_messages_feed
  on public.agent_messages (created_at desc);

alter table public.agent_messages enable row level security;

-- Authenticated users can read the feed; writes happen only via the
-- service role inside edge functions (service role bypasses RLS).
-- (A later migration may replace this with an admin-only policy.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_messages'
  ) then
    create policy "authenticated can read agent messages"
      on public.agent_messages for select
      to authenticated
      using (true);
  end if;
end $$;

-- Realtime for the Comms Feed UI.
do $$
begin
  alter publication supabase_realtime add table public.agent_messages;
exception when duplicate_object then
  null;
end $$;

-- Bridge the slug (edge functions / widget_data) and UUID (agents table)
-- registries so functions can resolve an agent row from its slug.
alter table public.agents add column if not exists slug text unique;

update public.agents set slug = 'wren'       where slug is null and name ilike 'wren';
update public.agents set slug = 'saleshawk'  where slug is null and name ilike 'saleshawk';
update public.agents set slug = 'osprey'     where slug is null and name ilike 'osprey';
update public.agents set slug = 'merlin'     where slug is null and name ilike 'merlin';
update public.agents set slug = 'kiro'       where slug is null and (name ilike 'kiro' or name ilike 'warbler');
update public.agents set slug = 'owl'        where slug is null and name ilike 'owl';
update public.agents set slug = 'mockingjay' where slug is null and name ilike 'mockingjay';

-- Housekeeping: purge expired bus messages daily if pg_cron is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'agent-messages-cleanup',
      '15 3 * * *',
      $sql$ delete from public.agent_messages where expires_at < now() $sql$
    );
  end if;
exception when others then
  raise notice 'agent-messages-cleanup cron not scheduled: %', sqlerrm;
end $$;
