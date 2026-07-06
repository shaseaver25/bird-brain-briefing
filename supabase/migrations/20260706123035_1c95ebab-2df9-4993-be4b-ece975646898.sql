-- 20260706130000_inbound_leads.sql
create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  business text not null default 'unknown'
    check (business in ('realpath', 'tailoredu', 'aiwhisperers', 'stonearch', 'unknown')),
  source text not null default 'other'
    check (source in ('booking_page', 'booking_agent', 'website_form', 'linkedin', 'referral', 'organic', 'other')),
  source_detail text,
  notes text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'demo_booked', 'converted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.inbound_leads to authenticated;
grant all on public.inbound_leads to service_role;

create index if not exists idx_inbound_leads_created on public.inbound_leads (created_at desc);
create index if not exists idx_inbound_leads_source on public.inbound_leads (source, created_at desc);

alter table public.inbound_leads enable row level security;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_role'
  ) then
    execute $pol$
      create policy "Admins read inbound_leads" on public.inbound_leads
        for select to authenticated using (public.has_role(auth.uid(), 'admin'))
    $pol$;
  else
    execute $pol$
      create policy "authenticated can read inbound_leads" on public.inbound_leads
        for select to authenticated using (true)
    $pol$;
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  create trigger update_inbound_leads_updated_at
    before update on public.inbound_leads
    for each row execute function public.update_updated_at_column();
exception when undefined_function or duplicate_object then
  null;
end $$;

-- 20260706150000_booking_rate_limits.sql
create table if not exists public.booking_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

grant all on public.booking_rate_limits to service_role;

create index if not exists idx_booking_rate_limits_ip
  on public.booking_rate_limits (ip, created_at desc);

alter table public.booking_rate_limits enable row level security;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'booking-rate-limits-cleanup',
      '45 3 * * *',
      $sql$ delete from public.booking_rate_limits where created_at < now() - interval '2 days' $sql$
    );
  end if;
exception when others then
  raise notice 'booking-rate-limits cleanup cron not scheduled: %', sqlerrm;
end $$;