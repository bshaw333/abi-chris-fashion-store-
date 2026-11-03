-- Run once in the NEW Supabase project's SQL Editor to enable the admin
-- dashboard to add categories and load/edit the product fields in its form.
-- The existing RLS policy still restricts product access to admins and owners.
grant insert (name, slug, parent_id) on public.categories to authenticated;

grant select (id, name, sku, category_id, description, retail_price, wholesale_price, cost_price, is_published, stock_quantity, created_at)
  on public.products to authenticated;

grant update (name, sku, category_id, retail_price, wholesale_price, cost_price, stock_quantity, description, is_published)
  on public.products to authenticated;
