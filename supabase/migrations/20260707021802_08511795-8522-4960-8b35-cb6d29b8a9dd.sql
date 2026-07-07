create table if not exists public.mockingjay_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  content text not null,
  hook text,
  hashtags text[] not null default '{}',
  source text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'revise_requested', 'scheduled', 'posted', 'discarded')),
  revise_note text,
  scheduled_for timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mockingjay_posts_status on public.mockingjay_posts (status, created_at desc);
create index if not exists idx_mockingjay_posts_platform on public.mockingjay_posts (platform, created_at desc);

grant select on public.mockingjay_posts to authenticated;
grant all on public.mockingjay_posts to service_role;

alter table public.mockingjay_posts enable row level security;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_role'
  ) then
    execute $pol$
      create policy "Admins read mockingjay_posts" on public.mockingjay_posts
        for select to authenticated using (public.has_role(auth.uid(), 'admin'))
    $pol$;
    execute $pol$
      create policy "Admins update mockingjay_posts" on public.mockingjay_posts
        for update to authenticated using (public.has_role(auth.uid(), 'admin'))
        with check (public.has_role(auth.uid(), 'admin'))
    $pol$;
  else
    execute $pol$
      create policy "authenticated read mockingjay_posts" on public.mockingjay_posts
        for select to authenticated using (true)
    $pol$;
    execute $pol$
      create policy "authenticated update mockingjay_posts" on public.mockingjay_posts
        for update to authenticated using (true) with check (true)
    $pol$;
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  create trigger update_mockingjay_posts_updated_at
    before update on public.mockingjay_posts
    for each row execute function public.update_updated_at_column();
exception when undefined_function or duplicate_object then null;
end $$;