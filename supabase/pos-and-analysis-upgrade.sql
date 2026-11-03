-- Secure point-of-sale and sales-analysis functions for the NEW Abi-Chris Supabase project.
-- Run only after schema.sql, storefront-upgrades.sql, catalogue-inventory-upgrades.sql,
-- business-operations-upgrades.sql, customer-workflows-upgrades.sql, and
-- business-profit-upgrade.sql have been applied successfully.
-- This file is a migration for the project owner to review and run; it is not executed by the app.

-- Salespeople can search active items in the physical shop without direct table access
-- to product cost, wholesale price, or internal SKU/barcode values.
create or replace function public.search_pos_products(p_search text default '', p_limit integer default 30)
returns table (
  product_id uuid,
  variant_id uuid,
  product_name text,
  variant_name text,
  retail_price numeric,
  stock_quantity integer,
  unit_name text,
  category_name text
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not coalesce(public.current_role() in ('owner','admin','salesperson'), false) then
    raise exception 'Active store staff access required';
  end if;
  if length(v_search) > 100 then raise exception 'Search text is too long'; end if;

  return query
  select p.id, null::uuid, p.name, null::text, p.retail_price, p.stock_quantity, p.unit_name,
    coalesce(c.name, 'Uncategorised')
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.is_active = true
    and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active = true)
    and (v_search = '' or lower(concat_ws(' ', p.name, p.description, c.name, p.sku)) like '%' || v_search || '%')

  union all

  select p.id, v.id, p.name, v.variant_name, coalesce(v.retail_price, p.retail_price),
    v.stock_quantity, p.unit_name, coalesce(c.name, 'Uncategorised')
  from public.products p
  join public.product_variants v on v.product_id = p.id and v.is_active = true
  left join public.categories c on c.id = p.category_id
  where p.is_active = true
    and (v_search = '' or lower(concat_ws(' ', p.name, p.description, c.name, p.sku, v.variant_name, v.sku)) like '%' || v_search || '%')
  order by 3, 4 nulls first
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

revoke all on function public.search_pos_products(text, integer) from public, anon;
grant execute on function public.search_pos_products(text, integer) to authenticated;

-- Record the whole counter sale in one transaction. Prices and costs are read from
-- the database while rows are locked. The browser never submits a price or cost.
create or replace function public.record_pos_sale(
  p_items jsonb,
  p_payment_method text,
  p_payment_status text default 'paid',
  p_discount_total numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order_id uuid;
  v_customer_id uuid;
  v_order_number text := 'AC-POS-' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_line record;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_item_name text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_receipt_items jsonb := '[]'::jsonb;
begin
  if not coalesce(public.current_role() in ('owner','admin','salesperson'), false) then
    raise exception 'Active store staff access required';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','mobile_money','bank_transfer','card','other') then
    raise exception 'Choose a supported payment method';
  end if;
  if p_payment_status is null or p_payment_status not in ('paid','unpaid') then
    raise exception 'Payment status must be paid or unpaid';
  end if;
  if p_discount_total is null or p_discount_total < 0 then raise exception 'Discount cannot be negative'; end if;
  v_discount := round(p_discount_total, 2);
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Add between 1 and 100 product lines';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity integer)
    where x.product_id is null or x.quantity is null or x.quantity < 1 or x.quantity > 500
  ) then raise exception 'Each quantity must be a whole number between 1 and 500'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity integer)
    group by x.product_id, x.variant_id having sum(x.quantity) > 500
  ) then raise exception 'Combined quantity for one product cannot exceed 500'; end if;
  if (nullif(btrim(coalesce(p_customer_name, '')), '') is null)
     and nullif(btrim(coalesce(p_customer_phone, '')), '') is not null then
    raise exception 'Enter the customer name when saving a phone number';
  end if;

  if nullif(btrim(coalesce(p_customer_name, '')), '') is not null then
    insert into public.customers(full_name, phone, customer_type)
    values (btrim(p_customer_name), nullif(btrim(coalesce(p_customer_phone, '')), ''), 'retail')
    returning id into v_customer_id;
  end if;

  insert into public.orders(order_number, customer_id, sales_channel, order_status, payment_status,
    payment_method, subtotal, discount_total, delivery_fee, total, notes, created_by)
  values (v_order_number, v_customer_id, 'pos', 'confirmed', p_payment_status,
    p_payment_method, 0, v_discount, 0, 0, 'Counter sale recorded through POS', v_user_id)
  returning id into v_order_id;

  perform set_config('app.stock_movement_type', 'sale', true);
  perform set_config('app.stock_movement_notes', 'POS sale ' || v_order_number, true);

  for v_line in
    select x.product_id, x.variant_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity integer)
    group by x.product_id, x.variant_id
    order by x.product_id, x.variant_id
  loop
    select * into v_product from public.products p where p.id = v_line.product_id and p.is_active = true for update;
    if not found then raise exception 'A selected product is no longer available'; end if;

    if v_line.variant_id is null then
      if exists (select 1 from public.product_variants v where v.product_id = v_product.id and v.is_active = true) then
        raise exception 'Choose a size or colour for %', v_product.name;
      end if;
      if v_product.stock_quantity < v_line.quantity then raise exception 'Not enough stock for %', v_product.name; end if;
      v_unit_price := v_product.retail_price;
      v_unit_cost := v_product.cost_price;
      v_item_name := v_product.name;
      update public.products set stock_quantity = stock_quantity - v_line.quantity where id = v_product.id;
    else
      select * into v_variant from public.product_variants v
      where v.id = v_line.variant_id and v.product_id = v_product.id and v.is_active = true for update;
      if not found then raise exception 'A selected size or colour is no longer available'; end if;
      if v_variant.stock_quantity < v_line.quantity then raise exception 'Not enough stock for % / %', v_product.name, v_variant.variant_name; end if;
      v_unit_price := coalesce(v_variant.retail_price, v_product.retail_price);
      v_unit_cost := v_variant.cost_price;
      v_item_name := v_product.name || ' / ' || v_variant.variant_name;
      update public.product_variants set stock_quantity = stock_quantity - v_line.quantity where id = v_variant.id;
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_line.quantity;
    insert into public.order_items(order_id, product_id, variant_id, product_name_snapshot,
      sku_snapshot, unit_cost_snapshot, unit_price, quantity, discount, line_total)
    values (v_order_id, v_product.id, v_line.variant_id, v_item_name,
      null, v_unit_cost, v_unit_price, v_line.quantity, 0, v_unit_price * v_line.quantity);

    v_receipt_items := v_receipt_items || jsonb_build_array(jsonb_build_object(
      'name', v_item_name, 'quantity', v_line.quantity,
      'unit_price', v_unit_price, 'line_total', v_unit_price * v_line.quantity
    ));
  end loop;

  if v_discount > v_subtotal then raise exception 'Discount cannot exceed the product total'; end if;
  v_total := v_subtotal - v_discount;
  update public.orders set subtotal = v_subtotal, discount_total = v_discount, total = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'created_at', now(),
    'subtotal', v_subtotal, 'discount_total', v_discount, 'total', v_total,
    'payment_method', p_payment_method, 'payment_status', p_payment_status,
    'customer_name', nullif(btrim(coalesce(p_customer_name, '')), ''),
    'customer_phone', nullif(btrim(coalesce(p_customer_phone, '')), ''), 'items', v_receipt_items
  );
end;
$$;

revoke all on function public.record_pos_sale(jsonb, text, text, numeric, text, text) from public, anon;
grant execute on function public.record_pos_sale(jsonb, text, text, numeric, text, text) to authenticated;

-- Admin-only dashboard analysis. Merchandise sales are after order discounts and
-- exclude delivery fees; only paid, non-cancelled, non-refunded orders count.
create or replace function public.get_admin_sales_analysis(p_from_date date, p_to_date date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date or p_to_date - p_from_date > 365 then
    raise exception 'Choose a valid date range of up to 366 days';
  end if;

  with eligible as (
    select o.id, o.created_at, o.subtotal, o.discount_total, o.delivery_fee, o.total
    from public.orders o
    where o.payment_status = 'paid'
      and o.order_status not in ('cancelled','refunded')
      and (o.created_at at time zone 'UTC')::date between p_from_date and p_to_date
  ), days as (
    select series.day::date as sale_date,
      coalesce(sum(e.subtotal - e.discount_total), 0)::numeric as merchandise_sales,
      coalesce(sum(e.delivery_fee), 0)::numeric as delivery_fees,
      count(e.id)::bigint as paid_orders
    from generate_series(p_from_date::timestamp, p_to_date::timestamp, interval '1 day') series(day)
    left join eligible e on (e.created_at at time zone 'UTC')::date = series.day::date
    group by series.day
  ), best as (
    select oi.product_name_snapshot as product_name,
      sum(oi.quantity)::bigint as units_sold,
      coalesce(sum(oi.line_total - case when e.subtotal > 0 then e.discount_total * oi.line_total / e.subtotal else 0 end), 0)::numeric as net_product_sales
    from eligible e join public.order_items oi on oi.order_id = e.id
    group by oi.product_name_snapshot
    order by units_sold desc, net_product_sales desc, product_name_snapshot
    limit 10
  )
  select jsonb_build_object(
    'from_date', p_from_date, 'to_date', p_to_date,
    'merchandise_sales', coalesce((select sum(d.merchandise_sales) from days d), 0),
    'delivery_fees', coalesce((select sum(d.delivery_fees) from days d), 0),
    'paid_orders', coalesce((select sum(d.paid_orders) from days d), 0),
    'daily_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'sale_date', d.sale_date, 'merchandise_sales', d.merchandise_sales,
      'delivery_fees', d.delivery_fees, 'paid_orders', d.paid_orders
    ) order by d.sale_date) from days d), '[]'::jsonb),
    'best_sellers', coalesce((select jsonb_agg(jsonb_build_object(
      'product_name', b.product_name, 'units_sold', b.units_sold, 'net_product_sales', b.net_product_sales
    ) order by b.units_sold desc, b.net_product_sales desc) from best b), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_sales_analysis(date, date) from public, anon;
grant execute on function public.get_admin_sales_analysis(date, date) to authenticated;
