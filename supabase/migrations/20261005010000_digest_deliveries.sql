-- Additive migration for the recovered existing Supabase project.
-- This is not a complete baseline of the production database.
create table public.digest_deliveries (
  digest_key text primary key,
  owner_id uuid not null references auth.users(id),
  week_key date not null,
  status text not null default 'reserved' check (status in ('reserved', 'accepted')),
  provider text not null default 'sendgrid',
  provider_message_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.digest_deliveries enable row level security;
revoke all on table public.digest_deliveries from anon, authenticated;
grant select, insert, update on table public.digest_deliveries to service_role;
comment on table public.digest_deliveries is 'Server-only digest send reservations. Reserved attempts must be reviewed before retrying; never automatically expire them.';
