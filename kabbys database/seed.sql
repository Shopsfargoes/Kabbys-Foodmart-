-- supabase/seed.sql
-- PLACEHOLDER starter data. Replace city names, zones and fees with Kabby's real ones
-- (or edit them later in the admin). Safe to re-run.

-- ========== Categories (she can add/rename/hide these in the admin) ==========
insert into categories (name, slug, sort_order) values
  ('Grains & Cereals',     'grains-cereals',   1),
  ('Fish & Seafood',       'fish-seafood',     2),
  ('Meat & Poultry',       'meat-poultry',     3),
  ('Spices & Seasonings',  'spices-seasonings',4),
  ('Oils & Condiments',    'oils-condiments',  5),
  ('Vegetables & Tubers',  'vegetables-tubers',6),
  ('Fruits',               'fruits',           7),
  ('Dried & Packaged',     'dried-packaged',   8)
on conflict (slug) do nothing;

-- ========== Local delivery zones (flat fee, NGN) ==========
-- Replace 'Home City' with the real city name used at checkout.
insert into delivery_zones (city, zone_name, fee) values
  ('Home City', 'Zone A (nearby)',   1000),
  ('Home City', 'Zone B (mid)',      2000),
  ('Home City', 'Zone C (far)',      3500)
on conflict (city, zone_name) do nothing;

-- ========== Inter-city rules (base fee + per kg, NGN) ==========
insert into delivery_rules (city, base_fee, fee_per_kg, est_days_min, est_days_max) values
  ('Other City 1', 3000, 300, 2, 4),
  ('Other City 2', 4000, 400, 2, 5)
on conflict (city) do nothing;

-- ========== First admin ==========
-- 1. In Supabase Dashboard > Authentication > Users, create her admin user.
-- 2. Copy that user's UUID and run:
--
--   insert into admins (user_id) values ('PASTE-USER-UUID-HERE');
--
-- 3. Then turn OFF public signups (Authentication > Providers > Email).
--    Customers still work: the server creates them through the admin API,
--    which is not affected by that toggle, and magic links are sent with
--    shouldCreateUser:false to existing users only.
