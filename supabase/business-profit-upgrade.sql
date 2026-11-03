-- Admin profit summary and expense recording for the NEW project.
-- This reports only fully paid, non-cancelled, non-refunded orders.

create or replace function public.get_admin_profit_summary()
returns table (
  paid_sales numeric,
  product_cost numeric,
  operating_expenses numeric,
  net_profit numeric,
  fully_paid_orders bigint,
  excluded_orders bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  return query
  with included_orders as (
    select o.id, o.total
    from public.orders o
    where o.payment_status = 'paid'
      and o.order_status not in ('cancelled', 'refunded')
  ), included_costs as (
    select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)::numeric as amount
    from public.order_items oi
    join included_orders io on io.id = oi.order_id
  ), totals as (
    select coalesce(sum(io.total), 0)::numeric as sales, count(*)::bigint as order_count
    from included_orders io
  ), expense_total as (
    select coalesce(sum(e.amount), 0)::numeric as amount from public.expenses e
  ), excluded as (
    select count(*)::bigint as order_count from public.orders o
    where o.payment_status <> 'paid' or o.order_status in ('cancelled', 'refunded')
  )
  select t.sales, c.amount, e.amount, t.sales - c.amount - e.amount,
    t.order_count, x.order_count
  from totals t cross join included_costs c cross join expense_total e cross join excluded x;
end;
$$;

revoke all on function public.get_admin_profit_summary() from public, anon;
grant execute on function public.get_admin_profit_summary() to authenticated;

grant select on public.expenses to authenticated;
grant insert (expense_date, category, description, amount, payment_method, recorded_by)
  on public.expenses to authenticated;
