create or replace function public.get_public_market_board()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select username, sale_price_ton, sold_at, source_url
    from public.market_sales
    where verification_status = 'verified'
      and sold_at >= now() - interval '24 hours'
      and sold_at <= now() + interval '5 minutes'
  ),
  aggregate_stats as (
    select count(*)::integer as sold_count,
           case when count(sale_price_ton) = 0 then null else sum(sale_price_ton) end as volume_ton,
           max(sold_at) as updated_at
    from recent
  ),
  top_sale as (
    select jsonb_build_object(
      'username', username,
      'sale_price_ton', sale_price_ton,
      'sold_at', sold_at,
      'source_url', source_url
    ) as item
    from recent
    where sale_price_ton is not null
    order by sale_price_ton desc, sold_at desc
    limit 1
  ),
  latest_sales as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'username', username,
      'sale_price_ton', sale_price_ton,
      'sold_at', sold_at,
      'source_url', source_url
    ) order by sold_at desc), '[]'::jsonb) as items
    from (select * from recent order by sold_at desc limit 10) rows
  )
  select jsonb_build_object(
    'windowStart', now() - interval '24 hours',
    'soldCount', aggregate_stats.sold_count,
    'volumeTon', aggregate_stats.volume_ton,
    'topSale', (select item from top_sale),
    'recentSales', latest_sales.items,
    'updatedAt', aggregate_stats.updated_at
  )
  from aggregate_stats cross join latest_sales;
$$;
revoke all on function public.get_public_market_board() from public, anon, authenticated;
grant execute on function public.get_public_market_board() to service_role;
