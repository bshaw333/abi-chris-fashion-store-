-- Read-only security review for the NEW Supabase project.
-- Apply the project SQL upgrades first, then run this in Supabase SQL Editor.
-- Every row should return passed = true. This inspects grants and policies; it does
-- not replace sign-in tests using real owner, staff, wholesale, and delivery accounts.

with checks as (
  select
    'Anonymous role cannot SELECT the products table'::text as check_name,
    not has_table_privilege('anon', 'public.products', 'SELECT') as passed,
    'anon must use the narrow public_products view/search function'::text as detail
  union all
  select
    'Anonymous role cannot read sensitive product columns',
    not has_column_privilege('anon', 'public.products', 'sku', 'SELECT')
      and not has_column_privilege('anon', 'public.products', 'barcode', 'SELECT')
      and not has_column_privilege('anon', 'public.products', 'wholesale_price', 'SELECT')
      and not has_column_privilege('anon', 'public.products', 'cost_price', 'SELECT')
      and not has_column_privilege('anon', 'public.products', 'stock_quantity', 'SELECT')
      and not has_column_privilege('anon', 'public.products', 'low_stock_threshold', 'SELECT'),
    'SKU, barcode, wholesale/cost prices, and internal stock must remain private'
  union all
  select
    'Public catalogue view omits sensitive fields',
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'public_products'
        and column_name in ('sku','barcode','wholesale_price','cost_price','stock_quantity','low_stock_threshold','is_published')
    ),
    'Only display fields and retail price belong in the public view'
  union all
  select
    'Customer records are not available to anonymous visitors',
    not has_table_privilege('anon', 'public.customers', 'SELECT'),
    'Customer names, phone numbers, email addresses, and addresses are private'
  union all
  select
    'RLS is enabled on sensitive tables',
    (select count(*) = 4
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('products','customers','deliveries','audit_logs')
        and c.relrowsecurity),
    'RLS should be enabled for products, customers, deliveries, and audit logs'
  union all
  select
    'Delivery policies are restricted to assigned worker',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'deliveries' and cmd = 'SELECT'
        and lower(coalesce(qual, '')) like '%assigned_to%'
        and lower(coalesce(qual, '')) like '%auth.uid%'
        and lower(coalesce(qual, '')) like '%delivery%'
    ),
    'The delivery SELECT policy must bind the row to the signed-in delivery user'
  union all
  select
    'Audit history has database-generated triggers',
    (select count(distinct c.relname) >= 7
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and t.tgfoid = to_regprocedure('public.write_business_audit_log()')),
    'Expected triggers cover products, variants, orders, order lines, expenses, deliveries, and staff profiles'
  union all
  select
    'Public search function does not return private product data',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'search_public_products'
        and position('wholesale_price' in pg_get_function_result(p.oid)) = 0
        and position('cost_price' in pg_get_function_result(p.oid)) = 0
        and position('stock_quantity' in pg_get_function_result(p.oid)) = 0
    ),
    'The public search result must contain display fields and retail price only'
  union all
  select
    'Security-definer functions pin their search path',
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not (
          coalesce(p.proconfig, array[]::text[])
            && array['search_path=""', 'search_path=pg_catalog']::text[]
        )
    ),
    'Every public SECURITY DEFINER function should pin search_path to empty or pg_catalog and schema-qualify objects'
)
select check_name, passed, detail
from checks
order by passed asc, check_name;
