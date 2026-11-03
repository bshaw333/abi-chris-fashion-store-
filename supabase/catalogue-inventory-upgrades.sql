-- Variation-level inventory for an existing NEW Supabase project.
-- Run after schema.sql. This does not decrement inventory for sales.

alter table public.product_variants
  add column if not exists low_stock_threshold integer not null default 5
  check (low_stock_threshold >= 0);
alter table public.products
  add column if not exists low_stock_threshold integer not null default 5
  check (low_stock_threshold >= 0);
grant select (low_stock_threshold) on public.products to authenticated;
grant insert (low_stock_threshold) on public.products to authenticated;
grant update (low_stock_threshold) on public.products to authenticated;
create index if not exists product_variants_active_stock_idx
  on public.product_variants (product_id, is_active, stock_quantity);

-- The underlying table includes wholesale and cost prices. Keep direct API access
-- closed and expose its sensitive fields only through administrator-checked RPCs.
drop policy if exists "staff read active variants" on public.product_variants;
revoke all on public.product_variants from anon, authenticated;

create or replace function public.get_admin_product_variants(p_product_id uuid)
returns table (
  id uuid, product_id uuid, sku text, variant_name text, attributes jsonb,
  retail_price numeric, wholesale_price numeric, cost_price numeric,
  stock_quantity integer, low_stock_threshold integer, is_active boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  return query select v.id, v.product_id, v.sku, v.variant_name, v.attributes,
    v.retail_price, v.wholesale_price, v.cost_price, v.stock_quantity,
    v.low_stock_threshold, v.is_active
  from public.product_variants v where v.product_id = p_product_id order by v.variant_name;
end;
$$;

create or replace function public.create_product_variant(
  p_product_id uuid, p_variant_name text, p_size text, p_colour text, p_sku text,
  p_retail_price numeric, p_wholesale_price numeric, p_cost_price numeric,
  p_initial_stock integer, p_low_stock_threshold integer
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_variant_name is null or btrim(p_variant_name) = '' then raise exception 'Variation name is required'; end if;
  if p_initial_stock < 0 or p_low_stock_threshold < 0 or p_cost_price < 0
    or (p_retail_price is not null and p_retail_price < 0)
    or (p_wholesale_price is not null and p_wholesale_price < 0) then
    raise exception 'Prices and quantities must be zero or greater';
  end if;
  insert into public.product_variants (
    product_id, variant_name, attributes, sku, retail_price, wholesale_price,
    cost_price, stock_quantity, low_stock_threshold
  ) values (
    p_product_id, btrim(p_variant_name),
    jsonb_strip_nulls(jsonb_build_object('size', nullif(btrim(p_size), ''), 'colour', nullif(btrim(p_colour), ''))),
    nullif(btrim(p_sku), ''), p_retail_price, p_wholesale_price, p_cost_price,
    p_initial_stock, p_low_stock_threshold
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_product_variant(
  p_variant_id uuid, p_variant_name text, p_size text, p_colour text, p_sku text,
  p_retail_price numeric, p_wholesale_price numeric, p_cost_price numeric,
  p_low_stock_threshold integer
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_variant_name is null or btrim(p_variant_name) = '' then raise exception 'Variation name is required'; end if;
  if p_low_stock_threshold < 0 or p_cost_price < 0
    or (p_retail_price is not null and p_retail_price < 0)
    or (p_wholesale_price is not null and p_wholesale_price < 0) then
    raise exception 'Prices and alert threshold must be zero or greater';
  end if;
  update public.product_variants set
    variant_name = btrim(p_variant_name),
    attributes = jsonb_strip_nulls(jsonb_build_object('size', nullif(btrim(p_size), ''), 'colour', nullif(btrim(p_colour), ''))),
    sku = nullif(btrim(p_sku), ''), retail_price = p_retail_price,
    wholesale_price = p_wholesale_price, cost_price = p_cost_price,
    low_stock_threshold = p_low_stock_threshold
  where id = p_variant_id;
  if not found then raise exception 'Product variation not found'; end if;
end;
$$;

create or replace function public.receive_variant_stock(p_variant_id uuid, p_quantity integer, p_notes text default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_new_quantity integer;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Received quantity must be greater than zero'; end if;
  perform set_config('app.stock_movement_type', 'intake', true);
  perform set_config('app.stock_movement_notes', coalesce(nullif(btrim(p_notes), ''), 'Stock received'), true);
  update public.product_variants set stock_quantity = stock_quantity + p_quantity
  where id = p_variant_id and is_active = true returning stock_quantity into v_new_quantity;
  if not found then raise exception 'Active product variation not found'; end if;
  return v_new_quantity;
end;
$$;

create or replace function public.log_variant_stock_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_delta integer; v_kind text; v_notes text;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock_quantity; v_kind := 'opening'; v_notes := 'Initial variation stock';
  else
    v_delta := new.stock_quantity - old.stock_quantity;
    v_kind := coalesce(nullif(current_setting('app.stock_movement_type', true), ''), 'adjustment');
    v_notes := coalesce(nullif(current_setting('app.stock_movement_notes', true), ''), 'Variation stock adjusted');
  end if;
  if v_delta <> 0 then
    insert into public.stock_movements (product_id, variant_id, movement_type, quantity_change, reference_type, reference_id, notes, created_by)
    values (new.product_id, new.id, v_kind, v_delta, 'product_variant', new.id, v_notes, (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_log_stock on public.product_variants;
create trigger product_variants_log_stock after insert or update of stock_quantity
on public.product_variants for each row execute function public.log_variant_stock_change();

revoke all on function public.get_admin_product_variants(uuid) from public, anon;
grant execute on function public.get_admin_product_variants(uuid) to authenticated;
revoke all on function public.create_product_variant(uuid,text,text,text,text,numeric,numeric,numeric,integer,integer) from public, anon;
grant execute on function public.create_product_variant(uuid,text,text,text,text,numeric,numeric,numeric,integer,integer) to authenticated;
revoke all on function public.update_product_variant(uuid,text,text,text,text,numeric,numeric,numeric,integer) from public, anon;
grant execute on function public.update_product_variant(uuid,text,text,text,text,numeric,numeric,numeric,integer) to authenticated;
revoke all on function public.receive_variant_stock(uuid,integer,text) from public, anon;
grant execute on function public.receive_variant_stock(uuid,integer,text) to authenticated;
