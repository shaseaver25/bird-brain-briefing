-- Inbound lead intake with source attribution.
-- Every inbound touch (demo booking, website form fill, manually logged
-- LinkedIn/referral contact) lands here with a source tag, so "where did
-- this lead come from?" always has a factual answer.

create table if not exists public.inbound_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  business text not null default 'unknown'
    check (business in ('realpath', 'tailoredu', 'aiwhisperers', 'stonearch', 'unknown')),
  source text not null default 'other'
    check (source in ('booking_page', 'website_form', 'linkedin', 'referral', 'organic', 'other')),
  source_detail text,          -- utm string, referrer, post link, referrer name...
  notes text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'demo_booked', 'converted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inbound_leads_created on public.inbound_leads (created_at desc);
create index if not exists idx_inbound_leads_source on public.inbound_leads (source, created_at desc);

-- Same email + source within a short window shouldn't duplicate;
-- handled in application code (upsert-style check), not a constraint,
-- so a genuine repeat inquiry weeks later still records.

alter table public.inbound_leads enable row level security;

-- Admin-only read (matches the access model in 20260706000139);
-- writes happen via service role inside edge functions.
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
end $$;

do $$
begin
  create trigger update_inbound_leads_updated_at
    before update on public.inbound_leads
    for each row execute function public.update_updated_at_column();
exception when undefined_function or duplicate_object then
  null;
end $$;
