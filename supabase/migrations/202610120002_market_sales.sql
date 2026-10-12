-- TTOGRM market sales ledger.
-- Records must originate from a trusted source and be deduplicated by source_event_id.
create table if not exists public.market_sales (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[A-Za-z0-9_]{5,32}$'),
  sale_price_ton numeric(24, 9) check (sale_price_ton is null or sale_price_ton >= 0),
  sold_at timestamptz not null,
  source text not null check (source in ('fragment', 'ton_blockchain', 'verified_manual', 'other')),
  source_event_id text,
  source_url text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, source_event_id)
);
create index if not exists market_sales_verified_sold_at_idx
  on public.market_sales (sold_at desc)
  where verification_status = 'verified';
create index if not exists market_sales_verified_price_idx
  on public.market_sales (sale_price_ton desc)
  where verification_status = 'verified';
alter table public.market_sales enable row level security;
revoke all on table public.market_sales from anon, authenticated;
grant all on table public.market_sales to service_role;
comment on table public.market_sales is 'Verified public-market sale observations only. Do not store speculative estimates as sales.';
