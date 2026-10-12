-- Rename the native-currency denomination in the market ledger and public RPC.
-- TON remains the blockchain name; Gram (GRAM) is the native currency.
alter table public.market_sales
  rename column sale_price_ton to sale_price_gram;

drop index if exists public.market_sales_verified_price_idx;
create index market_sales_verified_price_idx
  on public.market_sales (sale_price_gram desc)
  where verification_status = 'verified';

create or replace function public.get_public_market_board()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select username, sale_price_gram, sold_at, source_url
    from public.market_sales
    where verification_status = 'verified'
      and sold_at >= now() - interval '24 hours'
      and sold_at <= now() + interval '5 minutes'
  ),
  aggregate_stats as (
    select count(*)::integer as sold_count,
           case when count(sale_price_gram) = 0 then null else sum(sale_price_gram) end as volume_gram,
           max(sold_at) as updated_at
    from recent
  ),
  top_sale as (
    select jsonb_build_object(
      'username', username,
      'sale_price_gram', sale_price_gram,
      'sold_at', sold_at,
      'source_url', source_url
    ) as item
    from recent
    where sale_price_gram is not null
    order by sale_price_gram desc, sold_at desc
    limit 1
  ),
  latest_sales as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'username', username,
      'sale_price_gram', sale_price_gram,
      'sold_at', sold_at,
      'source_url', source_url
    ) order by sold_at desc), '[]'::jsonb) as items
    from (select * from recent order by sold_at desc limit 10) rows
  )
  select jsonb_build_object(
    'windowStart', now() - interval '24 hours',
    'soldCount', aggregate_stats.sold_count,
    'volumeGram', aggregate_stats.volume_gram,
    'topSale', (select item from top_sale),
    'recentSales', latest_sales.items,
    'updatedAt', aggregate_stats.updated_at
  )
  from aggregate_stats cross join latest_sales;
$$;
revoke all on function public.get_public_market_board() from public, anon, authenticated;
grant execute on function public.get_public_market_board() to service_role;
