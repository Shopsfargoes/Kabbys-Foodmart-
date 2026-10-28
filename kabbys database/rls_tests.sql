-- supabase/rls_tests.sql
-- MANUAL security tests. Run each block separately in the Supabase SQL editor.
-- Replace UUID_A / UUID_B with two real customer ids (select id, email from customers;).
-- Every block ends with ROLLBACK, so nothing is changed.

-- 1) Anonymous visitors must see NO orders, customers, coupons or settings secrets. Expect 0 rows each.
begin; set local role anon;
select (select count(*) from orders) as orders, (select count(*) from customers) as customers,
       (select count(*) from coupons) as coupons, (select count(*) from order_items) as items;
rollback;

-- 2) Anonymous visitors CAN read active products/categories (expect > 0 once you have products).
begin; set local role anon;
select (select count(*) from products) as products, (select count(*) from categories) as categories;
rollback;

-- 3) Customer A sees only their own orders. Expect: other_orders = 0.
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'UUID_A', true);
select count(*) filter (where customer_id = 'UUID_A') as own_orders,
       count(*) filter (where customer_id <> 'UUID_A') as other_orders from orders;
select count(*) as other_customers from customers where id <> 'UUID_A';   -- expect 0
rollback;

-- 4) A customer must NOT be able to change an order or their email. Expect an error or 0 rows updated.
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'UUID_A', true);
update orders set status = 'delivered' where customer_id = 'UUID_A';        -- expect UPDATE 0
update customers set email = 'x@example.com' where id = 'UUID_A';           -- expect permission denied
rollback;

-- 5) A non-admin must NOT run admin functions. Expect: 'Not allowed' errors.
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'UUID_A', true);
select admin_analytics(30);                                  -- expect error: Not allowed
select adjust_stock(gen_random_uuid(), 1, 'restock', null);  -- expect error: Not allowed
rollback;

-- 6) Service-only functions must be blocked for everyone else. Expect: permission denied.
begin; set local role authenticated;
select deduct_stock_for_order(gen_random_uuid());
rollback;
