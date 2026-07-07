-- Tables for the new agent capabilities:
--   clients            — Merlin's client-delivery tracker
--   finance_snapshots  — Magpie's weekly finance cache
--   guidebooks/…       — Owl's intelligent guidebooks + knowledge graph

create or replace function public._has_role_available() returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_role'
  );
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  business text not null default 'unknown'
    check (business in ('realpath', 'tailoredu', 'aiwhisperers', 'stonearch', 'unknown')),
  signed_at timestamptz not null default now(),
  last_touch_at timestamptz not null default now(),
  cadence_days integer not null default 14,
  status text not null default 'active'
    check (status in ('active', 'paused', 'churned')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_status on public.clients (status, last_touch_at);
grant select, insert, update on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;

create table if not exists public.finance_snapshots (
  id uuid primary key default gen_random_uuid(),
  cash_position numeric,
  unpaid_invoices_total numeric,
  unpaid_invoices_count integer,
  revenue_by_business jsonb not null default '{}'::jsonb,
  summary text,
  source text not null default 'quickbooks',
  is_connected boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_snapshots_created on public.finance_snapshots (created_at desc);
grant select on public.finance_snapshots to authenticated;
grant all on public.finance_snapshots to service_role;
alter table public.finance_snapshots enable row level security;

create table if not exists public.quickbooks_auth (
  id integer primary key default 1 check (id = 1),
  refresh_token text,
  realm_id text,
  updated_at timestamptz not null default now()
);
grant all on public.quickbooks_auth to service_role;
alter table public.quickbooks_auth enable row level security;

create table if not exists public.guidebooks (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text,
  audience text,
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'error')),
  summary text,
  learning_objectives text[] not null default '{}',
  knowledge_graph jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_guidebooks_created on public.guidebooks (created_at desc);
grant select, insert on public.guidebooks to authenticated;
grant all on public.guidebooks to service_role;
alter table public.guidebooks enable row level security;

create table if not exists public.guidebook_concepts (
  id uuid primary key default gen_random_uuid(),
  guidebook_id uuid not null references public.guidebooks(id) on delete cascade,
  concept_key text not null,
  label text not null,
  definition text,
  prerequisites text[] not null default '{}',
  learning_objective text,
  bloom_level text,
  content text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_guidebook_concepts_book on public.guidebook_concepts (guidebook_id, sort_order);
grant select on public.guidebook_concepts to authenticated;
grant all on public.guidebook_concepts to service_role;
alter table public.guidebook_concepts enable row level security;

do $$
declare
  admin_gate text := case when public._has_role_available()
    then 'public.has_role(auth.uid(), ''admin'')' else 'true' end;
begin
  execute format('create policy "clients_select" on public.clients for select to authenticated using (%s)', admin_gate);
  execute format('create policy "clients_insert" on public.clients for insert to authenticated with check (%s)', admin_gate);
  execute format('create policy "clients_update" on public.clients for update to authenticated using (%s) with check (%s)', admin_gate, admin_gate);

  execute format('create policy "finance_select" on public.finance_snapshots for select to authenticated using (%s)', admin_gate);

  execute format('create policy "guidebooks_select" on public.guidebooks for select to authenticated using (%s)', admin_gate);
  execute format('create policy "guidebooks_insert" on public.guidebooks for insert to authenticated with check (%s)', admin_gate);
  execute format('create policy "concepts_select" on public.guidebook_concepts for select to authenticated using (%s)', admin_gate);
exception when duplicate_object then null;
end $$;

do $$
begin
  create trigger update_clients_updated_at before update on public.clients
    for each row execute function public.update_updated_at_column();
exception when undefined_function or duplicate_object then null;
end $$;

do $$
begin
  create trigger update_guidebooks_updated_at before update on public.guidebooks
    for each row execute function public.update_updated_at_column();
exception when undefined_function or duplicate_object then null;
end $$;