-- Run once in the already-created NEW Supabase project.
-- Safe to rerun: grants are additive and the functions are replaceable.

grant insert (name, slug, parent_id) on public.categories to authenticated;

-- Public product photos are stored in a public bucket; uploads are admin-only.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

grant insert (product_id, image_url, alt_text, sort_order) on public.product_images to authenticated;

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

-- Log each opening quantity and every later stock adjustment in the same transaction.
create or replace function public.log_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.stock_quantity > 0 then
    insert into public.stock_movements (product_id, movement_type, quantity_change, reference_type, reference_id, notes, created_by)
    values (new.id, 'opening', new.stock_quantity, 'product', new.id, 'Initial product stock', (select auth.uid()));
  elsif tg_op = 'UPDATE' and new.stock_quantity is distinct from old.stock_quantity then
    insert into public.stock_movements (product_id, movement_type, quantity_change, reference_type, reference_id, notes, created_by)
    values (new.id, 'adjustment', new.stock_quantity - old.stock_quantity, 'product', new.id, 'Product stock changed in admin dashboard', (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists products_log_stock_insert on public.products;
drop trigger if exists products_log_stock_update on public.products;
create trigger products_log_stock_insert
after insert on public.products
for each row execute function public.log_product_stock_change();
create trigger products_log_stock_update
after update of stock_quantity on public.products
for each row execute function public.log_product_stock_change();

insert into public.stock_movements (product_id, movement_type, quantity_change, reference_type, reference_id, notes)
select p.id, 'opening', p.stock_quantity, 'product', p.id, 'Opening stock recorded during dashboard upgrade'
from public.products p
where p.stock_quantity > 0
  and not exists (
    select 1 from public.stock_movements sm
    where sm.product_id = p.id and sm.movement_type = 'opening' and sm.reference_type = 'product' and sm.reference_id = p.id
  );

grant select (id, name, sku, category_id, description, retail_price, wholesale_price, cost_price, is_published, stock_quantity, created_at)
  on public.products to authenticated;
grant update (name, sku, category_id, retail_price, wholesale_price, cost_price, stock_quantity, description, is_published)
  on public.products to authenticated;

-- Public retail search, paged over the complete published catalogue.
-- Only public display fields are returned; internal stock and all wholesale/cost fields are excluded.
create or replace function public.search_public_products(
  search_term text default null,
  result_limit integer default 24,
  result_offset integer default 0
)
returns table (
  id uuid,
  name text,
  description text,
  retail_price numeric,
  unit_name text,
  category_name text,
  image_url text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible_products as (
    select p.id, p.name, p.description, p.retail_price, p.unit_name,
           case when parent.name is null then c.name else parent.name || ' / ' || c.name end as category_name,
           (select pi.image_url from public.product_images pi
            where pi.product_id = p.id order by pi.sort_order desc, pi.created_at desc limit 1) as image_url
    from public.products p
    left join public.categories c on c.id = p.category_id and c.is_active = true
    left join public.categories parent on parent.id = c.parent_id and parent.is_active = true
    where p.is_active = true and p.is_published = true
      and (
        coalesce(btrim(search_term), '') = ''
        or lower(concat_ws(' ', p.name, p.description, c.name, parent.name))
           like '%' || lower(btrim(search_term)) || '%'
      )
  ), counted_products as (
    select v.*, count(*) over () as total_count from visible_products v
  )
  select v.id, v.name, v.description, v.retail_price, v.unit_name,
         v.category_name, v.image_url, v.total_count
  from counted_products v
  order by v.name
  limit least(greatest(coalesce(result_limit, 24), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

-- Wholesale prices are returned only for the signed-in user with an active approval row.
-- The public product view and public search function never include wholesale prices.
create or replace function public.get_wholesale_products()
returns table (
  id uuid,
  name text,
  description text,
  retail_price numeric,
  wholesale_price numeric,
  unit_name text,
  category_name text,
  image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, p.retail_price, p.wholesale_price, p.unit_name,
         case when parent.name is null then c.name else parent.name || ' / ' || c.name end,
         (select pi.image_url from public.product_images pi
          where pi.product_id = p.id order by pi.sort_order desc, pi.created_at desc limit 1)
  from public.products p
  left join public.categories c on c.id = p.category_id and c.is_active = true
  left join public.categories parent on parent.id = c.parent_id and parent.is_active = true
  where p.is_active = true and p.is_published = true
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.wholesale_customers w
      where w.user_id = (select auth.uid()) and w.is_active = true
    )
  order by p.name;
$$;

revoke all on function public.search_public_products(text, integer, integer) from public;
grant execute on function public.search_public_products(text, integer, integer) to anon, authenticated;
revoke all on function public.get_wholesale_products() from public;
grant execute on function public.get_wholesale_products() to authenticated;
revoke all on function public.is_wholesale_customer() from public;
grant execute on function public.is_wholesale_customer() to authenticated;

-- Approval is intentionally separate from public applications. To approve a customer,
-- create their Auth account, review their application, then add/update their row in
-- public.wholesale_customers with their Auth user_id and is_active = true in the trusted
-- Supabase dashboard. The wholesale functions check that active row on every request.
