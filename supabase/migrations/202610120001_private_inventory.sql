-- TTOGRM private inventory foundation.
-- Client roles receive no table access. Trusted Edge Functions write/read via server-side
-- Supabase credentials after validating Telegram initData.
create table if not exists public.username_entries (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  username text not null check (username ~ '^[A-Za-z0-9_]{5,32}$'),
  entity_type text not null check (entity_type in ('personal', 'group', 'channel')),
  username_type text not null default 'basic' check (username_type in ('basic', 'collectible')),
  assignment_status text not null default 'unknown' check (assignment_status in ('assigned', 'unassigned', 'unknown')),
  title text,
  telegram_peer_id bigint,
  ton_wallet_address text,
  discovery_source text not null default 'manual' check (discovery_source in ('manual', 'telegram_api', 'mtproto', 'ton_wallet', 'import')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'observed', 'verified')),
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists username_entries_owner_idx
  on public.username_entries (telegram_user_id);
create index if not exists username_entries_owner_type_idx
  on public.username_entries (telegram_user_id, entity_type);
create unique index if not exists username_entries_owner_username_entity_uidx
  on public.username_entries (telegram_user_id, lower(username), entity_type);

create table if not exists public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  discovery_method text not null check (discovery_method in ('manual', 'telegram_api', 'mtproto', 'ton_wallet', 'import')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  items_found integer not null default 0 check (items_found >= 0),
  error_code text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists discovery_runs_owner_created_idx
  on public.discovery_runs (telegram_user_id, created_at desc);

alter table public.username_entries enable row level security;
alter table public.discovery_runs enable row level security;

-- No browser/API role may query these tables directly. Server-side functions must
-- authenticate Telegram initData and scope every query to that verified Telegram user.
revoke all on table public.username_entries from anon, authenticated;
revoke all on table public.discovery_runs from anon, authenticated;
grant all on table public.username_entries to service_role;
grant all on table public.discovery_runs to service_role;

comment on table public.username_entries is
  'Private TTOGRM username inventory; rows are owned by verified Telegram user ID.';
comment on table public.discovery_runs is
  'Audit trail for TTOGRM inventory discovery and sync attempts.';
