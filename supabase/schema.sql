-- Abi-Chris-Fashion and Store: initial hosted database schema
-- Run in the Supabase SQL Editor for a NEW project. Review before applying to an existing database.
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','admin','salesperson','delivery');
create type public.wholesale_status as enum ('pending','approved','rejected');
create type public.product_intake_status as enum ('expected','awaiting_clearance','received_pending_check','sellable','held','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'salesperson',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wholesale_applications (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  business_name text not null,
  email text not null,
  phone text,
  details text,
  status public.wholesale_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wholesale_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  application_id uuid references public.wholesale_applications(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  business_name text not null default '',
  is_active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  sku text unique,
  barcode text unique,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  retail_price numeric(12,2) not null check (retail_price >= 0),
  wholesale_price numeric(12,2) check (wholesale_price is null or wholesale_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  unit_name text not null default 'item',
  is_published boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  barcode text unique,
  variant_name text not null,
  attributes jsonb not null default '{}'::jsonb,
  retail_price numeric(12,2) check (retail_price is null or retail_price >= 0),
  wholesale_price numeric(12,2) check (wholesale_price is null or wholesale_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  supplier text,
  container_reference text,
  expected_arrival date,
  status public.product_intake_status not null default 'expected',
  notes text,
  created_by uuid references public.profiles(id),
  received_by uuid references public.profiles(id),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.intake_items (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity_expected integer not null default 0 check (quantity_expected >= 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  sellable_approved boolean not null default false,
  notes text
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  address text,
  customer_type text not null default 'retail' check (customer_type in ('retail','wholesale')),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  sales_channel text not null check (sales_channel in ('online','pos','wholesale')),
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','ready','dispatched','delivered','cancelled','refunded')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','part_paid','paid','refunded','part_refunded')),
  payment_method text,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'SLE' check (currency = 'SLE'),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  unit_cost_snapshot numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  quantity integer not null check (quantity > 0),
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  movement_type text not null check (movement_type in ('opening','intake','sale','return','damage','adjustment','transfer')),
  quantity_change integer not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  delivery_status text not null default 'unassigned' check (delivery_status in ('unassigned','assigned','picked_up','in_transit','delivered','failed','returned')),
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_fee numeric(12,2) not null default 0,
  assigned_at timestamptz,
  delivered_at timestamptz,
  proof_note text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active = true limit 1 $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_role() in ('owner','admin'), false) $$;

create or replace function public.is_wholesale_customer()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.wholesale_customers w where w.user_id = (select auth.uid()) and w.is_active = true) $$;

-- Narrow public catalogue view. It deliberately excludes SKU/barcode, wholesale/cost prices,
-- stock quantities, publication flags, and internal timestamps. The trusted migration owner
-- supplies source-table access; anon receives access only to this view, never products itself.
create or replace view public.public_products
with (security_invoker = false, security_barrier = true) as
select p.id, p.name, p.slug, p.description, p.retail_price, p.unit_name,
       case when parent.name is null then c.name else parent.name || ' / ' || c.name end as category_name,
       (select pi.image_url from public.product_images pi
        where pi.product_id=p.id order by pi.sort_order desc, pi.created_at desc limit 1) as image_url
from public.products p left join public.categories c on c.id=p.category_id and c.is_active=true
left join public.categories parent on parent.id=c.parent_id and parent.is_active=true
where p.is_active=true and p.is_published=true;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.wholesale_applications enable row level security;
alter table public.wholesale_customers enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.intakes enable row level security;
alter table public.intake_items enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.deliveries enable row level security;
alter table public.audit_logs enable row level security;

-- First-owner bootstrap (one-time, in the trusted Supabase SQL Editor only).
-- Create the first user in Supabase Auth, replace the sentinel UUID with that user's Auth UID,
-- uncomment and run this block. It fails closed when misconfigured or when an owner exists.
-- This never uses a service-role secret in application code.
-- do $$
-- declare v_owner_id uuid := '00000000-0000-0000-0000-000000000000';
-- begin
--   if v_owner_id = '00000000-0000-0000-0000-000000000000' then raise exception 'Replace bootstrap UUID'; end if;
--   if not exists (select 1 from auth.users where id = v_owner_id) then raise exception 'Auth user not found'; end if;
--   if exists (select 1 from public.profiles where role = 'owner') then raise exception 'An owner already exists'; end if;
--   insert into public.profiles (id, full_name, role) values (v_owner_id, 'Store Owner', 'owner');
-- end $$;

create policy "profiles self or admin read" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "owner manages profiles" on public.profiles for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

create policy "active categories public read" on public.categories for select to anon, authenticated using (is_active=true);
create policy "admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public submit wholesale application" on public.wholesale_applications for insert to anon, authenticated with check (status='pending' and reviewed_by is null and reviewed_at is null);
create policy "admins manage wholesale applications" on public.wholesale_applications for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "wholesale user reads own approval" on public.wholesale_customers for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "admins manage wholesale customers" on public.wholesale_customers for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read products" on public.products for select to authenticated using (public.is_admin());
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read images for published products" on public.product_images for select to anon, authenticated using (exists(select 1 from public.products p where p.id=product_id and p.is_published=true and p.is_active=true));
create policy "admins manage product images" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read active variants" on public.product_variants for select to authenticated using (is_active=true and public.current_role() in ('owner','admin','salesperson'));
create policy "admins manage variants" on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage intakes" on public.intakes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage intake items" on public.intake_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff read customers" on public.customers for select to authenticated using (public.current_role() in ('owner','admin','salesperson'));
create policy "staff manage customers" on public.customers for all to authenticated using (public.current_role() in ('owner','admin','salesperson')) with check (public.current_role() in ('owner','admin','salesperson'));

create policy "admins and salespeople read orders" on public.orders for select to authenticated using (public.current_role() in ('owner','admin','salesperson'));
create policy "admins and salespeople create orders" on public.orders for insert to authenticated with check (public.current_role() in ('owner','admin','salesperson'));
create policy "admins manage orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read order items" on public.order_items for select to authenticated using (public.is_admin() or public.current_role()='salesperson');
create policy "admins and salespeople create order items" on public.order_items for insert to authenticated with check (public.current_role() in ('owner','admin','salesperson'));
create policy "admins update order items" on public.order_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage expenses" on public.expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read stock movements" on public.stock_movements for select to authenticated using (public.current_role() in ('owner','admin','salesperson'));
create policy "admins manage stock movements" on public.stock_movements for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage deliveries" on public.deliveries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "delivery staff see assigned jobs" on public.deliveries for select to authenticated using (assigned_to=auth.uid() and public.current_role()='delivery');
create policy "delivery staff update assigned jobs" on public.deliveries for update to authenticated using (assigned_to=auth.uid() and public.current_role()='delivery') with check (assigned_to=auth.uid() and public.current_role()='delivery');

create policy "admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());
create policy "authenticated write audit logs" on public.audit_logs for insert to authenticated with check (actor_id=auth.uid());

-- Explicitly remove ambient API grants, then grant only the capabilities this first build uses.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.public_products to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert (name, slug, parent_id) on public.categories to authenticated;
grant insert (contact_name, business_name, email, phone, details) on public.wholesale_applications to anon, authenticated;

-- Dashboard product access remains protected by staff RLS and column grants.
grant select (id, name, sku, category_id, description, retail_price, wholesale_price, cost_price, is_published, stock_quantity, low_stock_threshold, created_at) on public.products to authenticated;
grant insert (name, sku, category_id, retail_price, wholesale_price, cost_price, stock_quantity, low_stock_threshold, description, is_published, created_by) on public.products to authenticated;
grant update (name, sku, category_id, retail_price, wholesale_price, cost_price, stock_quantity, low_stock_threshold, description, is_published) on public.products to authenticated;
grant select (id, full_name, role, is_active) on public.profiles to authenticated;
