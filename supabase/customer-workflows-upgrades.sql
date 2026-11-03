-- Wholesale application review and online order requests for an existing NEW project.
-- Orders submitted by customers are unpaid requests until an owner/admin confirms stock
-- and separately verifies payment. No payment processor is connected by this migration.

-- Admin-only application review. The existing RLS policy limits rows to owner/admin.
grant select on public.wholesale_applications to authenticated;

create or replace function public.get_public_product_variants(p_product_id uuid)
returns table (id uuid, variant_name text, attributes jsonb, retail_price numeric, is_available boolean)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.variant_name, v.attributes,
    coalesce(v.retail_price, p.retail_price), v.stock_quantity > 0
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.product_id = p_product_id and v.is_active = true
    and p.is_active = true and p.is_published = true
  order by v.variant_name;
$$;
revoke all on function public.get_public_product_variants(uuid) from public;
grant execute on function public.get_public_product_variants(uuid) to anon, authenticated;

create or replace function public.review_wholesale_application(p_application_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_app public.wholesale_applications%rowtype; v_user_id uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into v_app from public.wholesale_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if v_app.status <> 'pending' then raise exception 'This application has already been reviewed'; end if;

  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(v_app.email) and u.email_confirmed_at is not null and u.deleted_at is null
  limit 1;
  if p_decision = 'approved' and v_user_id is null then
    raise exception 'The customer must create and confirm a sign-in account using this same email before approval';
  end if;

  update public.wholesale_applications
  set status = p_decision::public.wholesale_status, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_application_id;

  if p_decision = 'approved' then
    insert into public.wholesale_customers (user_id, application_id, approved_by, approved_at, business_name, is_active)
    values (v_user_id, v_app.id, (select auth.uid()), now(), v_app.business_name, true)
    on conflict (user_id) do update set application_id = excluded.application_id,
      approved_by = excluded.approved_by, approved_at = excluded.approved_at,
      business_name = excluded.business_name, is_active = true;
  elsif v_user_id is not null then
    update public.wholesale_customers set is_active = false where user_id = v_user_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_decision, 'wholesale_application', v_app.id::text,
    jsonb_build_object('application_status_before', v_app.status, 'application_status_after', p_decision));
end;
$$;

revoke all on function public.review_wholesale_application(uuid,text) from public, anon;
grant execute on function public.review_wholesale_application(uuid,text) to authenticated;

-- Keep customer contact records visible only to owner/admin. Future POS staff access
-- should use a narrowly scoped sale function, not broad reads of the customer table.
drop policy if exists "staff read customers" on public.customers;
drop policy if exists "staff manage customers" on public.customers;
drop policy if exists "admins manage customers" on public.customers;
create policy "admins manage customers" on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.customers to authenticated;

drop policy if exists "admins and salespeople read orders" on public.orders;
drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items" on public.order_items for select to authenticated using (public.is_admin());
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;
drop policy if exists "admins and salespeople create orders" on public.orders;
drop policy if exists "admins manage orders" on public.orders;
drop policy if exists "admins and salespeople create order items" on public.order_items;
drop policy if exists "admins update order items" on public.order_items;

create or replace function public.submit_online_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_payment_method text,
  p_items jsonb
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text := 'AC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_line record;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_variant_id uuid;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_sku text;
  v_item_name text;
  v_subtotal numeric(12,2) := 0;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then raise exception 'Enter your name'; end if;
  if p_customer_email is null or position('@' in p_customer_email) < 2 then raise exception 'Enter a valid email'; end if;
  if p_customer_phone is null or btrim(p_customer_phone) = '' then raise exception 'Enter a phone or WhatsApp number'; end if;
  if p_delivery_address is null or btrim(p_delivery_address) = '' then raise exception 'Enter a delivery or collection address'; end if;
  if p_payment_method not in ('cash_on_delivery','mobile_money','bank_transfer') then raise exception 'Choose a supported payment method'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Basket contents are invalid'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Your basket must contain between 1 and 30 product lines';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity integer) where x.product_id is null or x.quantity is null or x.quantity < 1 or x.quantity > 50) then
    raise exception 'Each product quantity must be between 1 and 50';
  end if;

  insert into public.customers (full_name, email, phone, address, customer_type)
  values (btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone), btrim(p_delivery_address), 'retail')
  returning id into v_customer_id;

  insert into public.orders (order_number, customer_id, customer_user_id, sales_channel, order_status,
    payment_status, payment_method, subtotal, delivery_fee, total, notes)
  values (v_order_number, v_customer_id, (select auth.uid()), 'online', 'pending', 'unpaid',
    p_payment_method, 0, 0, 0, 'Online order request; delivery fee and stock confirmation pending')
  returning id into v_order_id;

  for v_line in
    select x.product_id, x.variant_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity integer)
    group by x.product_id, x.variant_id
    order by x.product_id, x.variant_id
  loop
    select * into v_product from public.products p
    where p.id = v_line.product_id and p.is_active and p.is_published
    for update;
    if not found then raise exception 'One of the selected products is no longer available'; end if;
    v_variant_id := v_line.variant_id;
    if v_variant_id is null then
      if v_product.stock_quantity < v_line.quantity then
        raise exception 'Not enough current stock for %; please reduce the quantity or contact the store', v_product.name;
      end if;
      v_unit_price := v_product.retail_price; v_unit_cost := v_product.cost_price;
      v_sku := v_product.sku; v_item_name := v_product.name;
    else
      select * into v_variant from public.product_variants v
      where v.id = v_variant_id and v.product_id = v_product.id and v.is_active
      for update;
      if not found or v_variant.stock_quantity < v_line.quantity then
        raise exception 'This size or colour is no longer available';
      end if;
      v_unit_price := coalesce(v_variant.retail_price, v_product.retail_price);
      v_unit_cost := v_variant.cost_price; v_sku := v_variant.sku;
      v_item_name := v_product.name || ' — ' || v_variant.variant_name;
    end if;
    v_subtotal := v_subtotal + (v_unit_price * v_line.quantity);
    insert into public.order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
      unit_cost_snapshot, unit_price, quantity, line_total)
    values (v_order_id, v_product.id, v_variant_id, v_item_name, v_sku,
      v_unit_cost, v_unit_price, v_line.quantity, v_unit_price * v_line.quantity);
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;
  return v_order_number;
end;
$$;

create or replace function public.confirm_online_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_line record; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.sales_channel <> 'online' then raise exception 'Online order not found'; end if;
  if v_order.order_status <> 'pending' then raise exception 'Only pending orders can be confirmed'; end if;

  perform set_config('app.stock_movement_type', 'sale', true);
  perform set_config('app.stock_movement_notes', 'Stock committed for online order ' || v_order.order_number, true);
  for v_line in select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id, oi.variant_id order by oi.product_id, oi.variant_id
  loop
    select * into v_product from public.products where id = v_line.product_id for update;
    if not found or not v_product.is_active then raise exception 'Product is no longer active'; end if;
    if v_line.variant_id is null then
      if v_product.stock_quantity < v_line.quantity then raise exception 'Insufficient stock to confirm order %', v_order.order_number; end if;
      update public.products set stock_quantity = stock_quantity - v_line.quantity where id = v_line.product_id;
    else
      select * into v_variant from public.product_variants where id = v_line.variant_id and product_id = v_line.product_id for update;
      if not found or not v_variant.is_active or v_variant.stock_quantity < v_line.quantity then
        raise exception 'Insufficient variation stock to confirm order %', v_order.order_number;
      end if;
      update public.product_variants set stock_quantity = stock_quantity - v_line.quantity where id = v_line.variant_id;
    end if;
  end loop;
  update public.orders set order_status = 'confirmed', notes = 'Stock confirmed; payment remains unpaid until verified'
  where id = p_order_id;
end;
$$;

create or replace function public.mark_online_order_paid(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  update public.orders set payment_status = 'paid'
  where id = p_order_id and sales_channel = 'online' and order_status in ('confirmed','processing','ready','dispatched','delivered')
    and payment_status in ('unpaid','pending');
  if not found then raise exception 'Order must be confirmed before recording payment'; end if;
end;
$$;

create or replace function public.cancel_online_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  update public.orders set order_status = 'cancelled'
  where id = p_order_id and sales_channel = 'online' and order_status = 'pending';
  if not found then raise exception 'Only pending online orders can be cancelled'; end if;
end;
$$;

-- Honor transaction-specific movement labels set by the confirmation function.
create or replace function public.log_product_stock_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_kind text; v_notes text;
begin
  if tg_op = 'INSERT' and new.stock_quantity > 0 then
    insert into public.stock_movements (product_id, movement_type, quantity_change, reference_type, reference_id, notes, created_by)
    values (new.id, 'opening', new.stock_quantity, 'product', new.id, 'Initial product stock', (select auth.uid()));
  elsif tg_op = 'UPDATE' and new.stock_quantity is distinct from old.stock_quantity then
    v_kind := coalesce(nullif(current_setting('app.stock_movement_type', true), ''), 'adjustment');
    v_notes := coalesce(nullif(current_setting('app.stock_movement_notes', true), ''), 'Product stock changed in admin dashboard');
    insert into public.stock_movements (product_id, movement_type, quantity_change, reference_type, reference_id, notes, created_by)
    values (new.id, v_kind, new.stock_quantity - old.stock_quantity, 'product', new.id, v_notes, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function public.submit_online_order(text,text,text,text,text,jsonb) from public;
grant execute on function public.submit_online_order(text,text,text,text,text,jsonb) to anon, authenticated;
revoke all on function public.confirm_online_order(uuid) from public, anon;
grant execute on function public.confirm_online_order(uuid) to authenticated;
revoke all on function public.mark_online_order_paid(uuid) from public, anon;
grant execute on function public.mark_online_order_paid(uuid) to authenticated;
revoke all on function public.cancel_online_order(uuid) from public, anon;
grant execute on function public.cancel_online_order(uuid) to authenticated;
