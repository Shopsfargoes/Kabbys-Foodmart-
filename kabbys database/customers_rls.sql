-- supabase/customers_rls.sql
-- Assumes tables: orders, order_items, custom_orders already exist.

-- ========== Tables ==========
create table if not exists customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  phone text,
  default_address text,
  created_at timestamptz default now()
);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table orders        add column if not exists customer_id uuid references customers(id);
alter table custom_orders add column if not exists customer_id uuid references customers(id);

create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists custom_orders_customer_idx on custom_orders(customer_id);

-- ========== Helpers ==========
create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Used by the server only (service role) to find an existing auth user by email
create or replace function auth_user_id_by_email(p_email text)
returns uuid
language sql security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function auth_user_id_by_email(text) to service_role;

-- ========== Enable RLS ==========
alter table customers     enable row level security;
alter table admins        enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table custom_orders enable row level security;

-- ========== customers ==========
create policy "customer reads own row" on customers
  for select using (id = auth.uid());

create policy "customer updates own row" on customers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Only these columns can be edited by the customer (email/id are locked)
revoke update on customers from authenticated;
grant update (name, phone, default_address) on customers to authenticated;

create policy "admin reads customers" on customers
  for select using (is_admin());

-- No insert/delete policies for customers: the server (service role) creates rows.

-- ========== orders ==========
create policy "customer reads own orders" on orders
  for select using (customer_id = auth.uid());

create policy "admin manages orders" on orders
  for all using (is_admin()) with check (is_admin());

-- ========== order_items ==========
create policy "customer reads own order items" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );

create policy "admin manages order items" on order_items
  for all using (is_admin()) with check (is_admin());

-- ========== custom_orders ==========
create policy "customer reads own custom orders" on custom_orders
  for select using (customer_id = auth.uid());

create policy "admin manages custom orders" on custom_orders
  for all using (is_admin()) with check (is_admin());

-- ========== admins ==========
-- No policies: only the service role / SQL editor can add admins.
