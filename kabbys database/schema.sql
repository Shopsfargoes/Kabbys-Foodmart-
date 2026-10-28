-- supabase/schema.sql
-- Run order: schema.sql -> customers_rls.sql -> site_settings.sql -> policies.sql -> seed.sql
-- Quantities are in KG. Money is NGN (numeric, 2 decimals).

create extension if not exists pgcrypto;

-- ========== Shared trigger ==========
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ========== Identity ==========
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

-- ========== Catalog ==========
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  price_per_kg numeric(12,2) not null check (price_per_kg >= 0),
  stock_kg numeric(10,3) not null default 0 check (stock_kg >= 0),
  min_order_kg numeric(6,3) not null default 0.5 check (min_order_kg > 0),
  step_kg numeric(6,3) not null default 0.5 check (step_kg > 0),
  low_stock_kg numeric(10,3) not null default 5,
  ships_intercity boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists products_category_idx on products(category_id);
create index if not exists products_active_idx on products(is_active);

drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- ========== Delivery ==========
-- Local (same city): flat fee per zone
create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  zone_name text not null,
  fee numeric(10,2) not null check (fee >= 0),
  is_active boolean not null default true,
  unique (city, zone_name)
);

-- Inter-city: base fee + per-kg rate
create table if not exists delivery_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null unique,
  base_fee numeric(10,2) not null check (base_fee >= 0),
  fee_per_kg numeric(10,2) not null default 0 check (fee_per_kg >= 0),
  est_days_min int not null default 2,
  est_days_max int not null default 4,
  is_active boolean not null default true
);

create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  is_active boolean not null default true
);

-- ========== Orders ==========
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,              -- Paystack reference
  customer_id uuid references customers(id) on delete set null,

  -- contact snapshot (kept even if the account changes)
  name text not null,
  phone text not null,
  email text not null,

  delivery_type text not null check (delivery_type in ('pickup', 'delivery')),
  city text,
  zone_id uuid references delivery_zones(id) on delete set null,
  address text,
  note text,

  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0),

  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  status text not null default 'new'
    check (status in ('new', 'packed', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled')),
  paid_at timestamptz,
  stock_deducted boolean not null default false,  -- idempotency guard

  rider_id uuid references riders(id) on delete set null,
  courier_name text,                              -- inter-city dispatch
  tracking_note text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- delivery orders need an address
  constraint delivery_needs_address check (
    delivery_type = 'pickup' or (address is not null and length(address) > 0)
  )
);
create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists orders_status_idx on orders(status, payment_status);
create index if not exists orders_created_idx on orders(created_at desc);

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,                      -- snapshot
  price_per_kg numeric(12,2) not null,             -- snapshot
  qty_kg numeric(10,3) not null check (qty_kg > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists order_items_product_idx on order_items(product_id);

create table if not exists custom_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  name text not null,
  phone text not null,
  email text not null,
  details text not null check (length(details) <= 2000),
  quantity_note text,
  preferred_date date,
  status text not null default 'new'
    check (status in ('new', 'quoted', 'accepted', 'paid', 'completed', 'declined')),
  quoted_amount numeric(12,2) check (quoted_amount >= 0),
  admin_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists custom_orders_customer_idx on custom_orders(customer_id);

drop trigger if exists custom_orders_updated_at on custom_orders;
create trigger custom_orders_updated_at before update on custom_orders
  for each row execute function set_updated_at();

-- ========== Inventory & audit ==========
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  change_kg numeric(10,3) not null,
  reason text not null check (reason in ('order', 'restock', 'adjustment', 'spoilage')),
  order_id uuid references orders(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists inv_mov_product_idx on inventory_movements(product_id, created_at desc);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text,
  record_id text,
  details jsonb,
  created_at timestamptz default now()
);

-- Webhook idempotency: insert event id first; a duplicate insert = already processed
create table if not exists paystack_events (
  id text primary key,
  received_at timestamptz default now()
);

-- ========== Atomic stock deduction (service role only) ==========
create or replace function deduct_stock_for_order(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o record;
  i record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.stock_deducted then return; end if;            -- already done
  if o.payment_status <> 'paid' then raise exception 'Order not paid'; end if;

  for i in select product_id, qty_kg from order_items where order_id = p_order_id loop
    if i.product_id is null then continue; end if;
    -- check constraint (stock_kg >= 0) aborts the whole transaction if oversold
    update products set stock_kg = stock_kg - i.qty_kg where id = i.product_id;
    insert into inventory_movements (product_id, change_kg, reason, order_id)
    values (i.product_id, -i.qty_kg, 'order', p_order_id);
  end loop;

  update orders set stock_deducted = true where id = p_order_id;
end $$;

revoke all on function deduct_stock_for_order(uuid) from public, anon, authenticated;
grant execute on function deduct_stock_for_order(uuid) to service_role;

-- ========== Basic RLS lock (policies added in later files) ==========
alter table categories           enable row level security;
alter table products             enable row level security;
alter table delivery_zones       enable row level security;
alter table delivery_rules       enable row level security;
alter table riders               enable row level security;
alter table inventory_movements  enable row level security;
alter table audit_log            enable row level security;
alter table paystack_events      enable row level security;
