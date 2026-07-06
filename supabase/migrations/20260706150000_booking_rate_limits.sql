-- Booking rate limiting: max 2 successful bookings per IP per rolling 24h,
-- enforced in booking-create (which both the /book page and the Swift
-- booking agent flow through).

create table if not exists public.booking_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_rate_limits_ip
  on public.booking_rate_limits (ip, created_at desc);

-- Service-role only (edge functions); no client access at all.
alter table public.booking_rate_limits enable row level security;

-- Rows are useless after the 24h window; purge daily if pg_cron is available.
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
