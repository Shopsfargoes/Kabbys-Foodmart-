-- supabase/discounts.sql  (run after schema.sql, customers_rls.sql, policies.sql)

-- ===== Per-product discount (flat NGN off per kg, or percentage) =====
alter table products
  add column if not exists discount_type text not null default 'none'
    check (discount_type in ('none', 'percent', 'flat')),
  add column if not exists discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  add column if not exists discount_starts_at timestamptz,
  add column if not exists discount_ends_at timestamptz;

alter table products drop constraint if exists discount_valid;
alter table products add constraint discount_valid check (
  (discount_type <> 'percent' or discount_value <= 100) and
  (discount_type <> 'flat' or discount_value <= price_per_kg) and
  (discount_type = 'none' or discount_value > 0)
);

-- ===== Coupons =====
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text,
  type text not null check (type in ('percent', 'flat')),
  value numeric(10,2) not null check (value > 0),
  max_discount numeric(10,2) check (max_discount > 0),   -- cap for percent coupons
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  max_uses int check (max_uses > 0),                      -- null = unlimited
  used_count int not null default 0,
  one_per_customer boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint coupon_percent_max check (type <> 'percent' or value <= 100)
);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  order_id uuid not null unique references orders(id) on delete cascade,
  email text not null,
  amount numeric(12,2) not null,
  created_at timestamptz default now()
);
create index if not exists redemptions_coupon_email_idx on coupon_redemptions(coupon_id, email);

alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
-- Coupons are NOT publicly readable (codes can't be listed). The server validates them.
create policy "admin manages coupons" on coupons
  for all using (is_admin()) with check (is_admin());
create policy "admin reads redemptions" on coupon_redemptions
  for select using (is_admin());

-- ===== Order snapshots =====
alter table orders
  add column if not exists coupon_code text,
  add column if not exists coupon_discount numeric(12,2) not null default 0 check (coupon_discount >= 0);
alter table order_items
  add column if not exists list_price_per_kg numeric(12,2);   -- price before product discount

-- ===== Redeem after payment (idempotent, service role only) =====
create or replace function redeem_coupon_for_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from orders where id = p_order_id;
  if not found or o.coupon_code is null or o.coupon_discount <= 0 then return; end if;
  insert into coupon_redemptions (coupon_id, order_id, email, amount)
    select c.id, o.id, lower(o.email), o.coupon_discount from coupons c where c.code = o.coupon_code
    on conflict (order_id) do nothing;
  if found then
    update coupons set used_count = used_count + 1 where code = o.coupon_code;
  end if;
end $$;
revoke all on function redeem_coupon_for_order(uuid) from public, anon, authenticated;
grant execute on function redeem_coupon_for_order(uuid) to service_role;
