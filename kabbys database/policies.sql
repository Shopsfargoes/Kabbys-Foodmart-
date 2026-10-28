-- supabase/policies.sql
-- Run after schema.sql, customers_rls.sql (defines is_admin()), and site_settings.sql.
-- Orders, order_items, custom_orders, customers, admins: see customers_rls.sql.

-- ========== Public catalog (read-only, active rows only) ==========
create policy "public reads active categories" on categories
  for select using (is_active);
create policy "admin manages categories" on categories
  for all using (is_admin()) with check (is_admin());

create policy "public reads active products" on products
  for select using (is_active);
create policy "admin manages products" on products
  for all using (is_admin()) with check (is_admin());

create policy "public reads active zones" on delivery_zones
  for select using (is_active);
create policy "admin manages zones" on delivery_zones
  for all using (is_admin()) with check (is_admin());

create policy "public reads active delivery rules" on delivery_rules
  for select using (is_active);
create policy "admin manages delivery rules" on delivery_rules
  for all using (is_admin()) with check (is_admin());

-- ========== Admin-only tables ==========
create policy "admin manages riders" on riders
  for all using (is_admin()) with check (is_admin());

create policy "admin manages inventory movements" on inventory_movements
  for all using (is_admin()) with check (is_admin());

create policy "admin reads audit log" on audit_log
  for select using (is_admin());
create policy "admin writes own audit entries" on audit_log
  for insert with check (is_admin() and admin_id = auth.uid());

-- paystack_events: intentionally NO policies (service role only)

-- ========== Product image storage ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public reads product images" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "admin uploads product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and is_admin());
create policy "admin updates product images" on storage.objects
  for update using (bucket_id = 'product-images' and is_admin());
create policy "admin deletes product images" on storage.objects
  for delete using (bucket_id = 'product-images' and is_admin());
