-- supabase/analytics.sql  (run after schema.sql, customers_rls.sql, discounts.sql)
-- One admin-only function that returns everything the dashboard needs, aggregated in the database.
-- Counts only PAID, non-cancelled orders. Days are Africa/Lagos days.
create or replace function admin_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  tz constant text := 'Africa/Lagos';
  start_ts timestamptz;
  result jsonb;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  start_ts := (date_trunc('day', now() at time zone tz) - make_interval(days => d - 1)) at time zone tz;

  result := (
    with o as (
      select * from orders
      where payment_status = 'paid' and status <> 'cancelled'
        and coalesce(paid_at, created_at) >= start_ts
    ),
    days as (
      select generate_series((start_ts at time zone tz)::date, (now() at time zone tz)::date, interval '1 day')::date as day
    ),
    daily as (
      select (coalesce(paid_at, created_at) at time zone tz)::date as day, sum(total) as revenue, count(*) as n
      from o group by 1
    ),
    first_paid as (
      select customer_id, min(coalesce(paid_at, created_at)) as f
      from orders
      where payment_status = 'paid' and status <> 'cancelled' and customer_id is not null
      group by customer_id
    ),
    cust as (select distinct customer_id from o where customer_id is not null)
    select jsonb_build_object(
      'days', d,
      'kpis', (select jsonb_build_object(
          'revenue', coalesce(sum(total), 0), 'orders', count(*),
          'aov', coalesce(round(avg(total), 2), 0),
          'discounts', coalesce(sum(coupon_discount), 0),
          'delivery_fees', coalesce(sum(delivery_fee), 0)) from o),
      'series', (select coalesce(jsonb_agg(jsonb_build_object(
          'day', days.day, 'revenue', coalesce(daily.revenue, 0), 'orders', coalesce(daily.n, 0)) order by days.day), '[]'::jsonb)
          from days left join daily on daily.day = days.day),
      'top_products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
          select i.product_name as name, sum(i.qty_kg) as kg, sum(i.line_total) as revenue
          from order_items i join o on o.id = i.order_id
          group by i.product_name order by sum(i.line_total) desc limit 8) t),
      'split', (select jsonb_build_object(
          'pickup', jsonb_build_object('orders', count(*) filter (where delivery_type = 'pickup'),
                    'revenue', coalesce(sum(total) filter (where delivery_type = 'pickup'), 0)),
          'local', jsonb_build_object('orders', count(*) filter (where delivery_type = 'delivery' and zone_id is not null),
                    'revenue', coalesce(sum(total) filter (where delivery_type = 'delivery' and zone_id is not null), 0)),
          'intercity', jsonb_build_object('orders', count(*) filter (where delivery_type = 'delivery' and zone_id is null),
                    'revenue', coalesce(sum(total) filter (where delivery_type = 'delivery' and zone_id is null), 0))
        ) from o),
      'customers', jsonb_build_object(
          'new', (select count(*) from cust join first_paid using (customer_id) where first_paid.f >= start_ts),
          'returning', (select count(*) from cust join first_paid using (customer_id) where first_paid.f < start_ts)),
      'stock', (select jsonb_build_object(
          'low', count(*) filter (where stock_kg >= min_order_kg and stock_kg <= low_stock_kg),
          'out', count(*) filter (where stock_kg < min_order_kg)) from products where is_active),
      'attention', jsonb_build_object(
          'to_process', (select count(*) from orders where payment_status = 'paid' and status = 'new'),
          'custom_new', (select count(*) from custom_orders where status = 'new'))
    )
  );
  return result;
end $$;

revoke all on function admin_analytics(int) from public, anon;
grant execute on function admin_analytics(int) to authenticated;  -- is_admin() check is inside
