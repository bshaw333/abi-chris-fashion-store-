-- Admin-only reset of all business transactions so profit starts again from 0.
-- Run once in the Supabase SQL Editor (same project as the other upgrade files).
--
-- Clears:  orders (sales), order_items (sale items), deliveries, expenses,
--          stock_movements (inventory movements), intakes (purchases), intake_items (purchase items)
-- Keeps:   products, product_variants, product_images, categories, customers, profiles,
--          wholesale data and audit_logs.

create or replace function public.admin_clear_business_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order_items bigint;
  v_deliveries bigint;
  v_orders bigint;
  v_expenses bigint;
  v_stock_movements bigint;
  v_intake_items bigint;
  v_intakes bigint;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required';
  end if;

  delete from public.order_items where true;
  get diagnostics v_order_items = row_count;

  delete from public.deliveries where true;
  get diagnostics v_deliveries = row_count;

  delete from public.orders where true;
  get diagnostics v_orders = row_count;

  delete from public.expenses where true;
  get diagnostics v_expenses = row_count;

  delete from public.stock_movements where true;
  get diagnostics v_stock_movements = row_count;

  delete from public.intake_items where true;
  get diagnostics v_intake_items = row_count;

  delete from public.intakes where true;
  get diagnostics v_intakes = row_count;

  return jsonb_build_object(
    'order_items', v_order_items,
    'deliveries', v_deliveries,
    'orders', v_orders,
    'expenses', v_expenses,
    'stock_movements', v_stock_movements,
    'intake_items', v_intake_items,
    'intakes', v_intakes
  );
end;
$$;

revoke all on function public.admin_clear_business_data() from public, anon;
grant execute on function public.admin_clear_business_data() to authenticated;
