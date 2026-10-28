-- supabase/site_settings.sql
-- Requires is_admin() from customers_rls.sql

create table if not exists site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now(),
  -- WhatsApp number: international format, digits only, no +
  constraint wa_number_format check (
    key <> 'whatsapp_number' or value = '' or value ~ '^[0-9]{10,15}$'
  ),
  constraint wa_enabled_format check (
    key <> 'whatsapp_enabled' or value in ('true', 'false')
  ),
  constraint greeting_length check (length(value) <= 200),
  constraint threshold_format check (
    key <> 'free_delivery_threshold' or value ~ '^[0-9]{1,9}$'
  ),
  constraint value_length check (length(value) <= 300)
);

-- Only these keys may exist (stops junk rows)
alter table site_settings
  add constraint allowed_keys check (
    key in (
      'whatsapp_number', 'whatsapp_greeting', 'whatsapp_enabled',
      'store_phone', 'pickup_address', 'pickup_hours',
      'free_delivery_threshold'  -- naira, whole number; 0 = disabled
    )
  );

alter table site_settings enable row level security;

-- Everything here is public-by-design (shown on the storefront). Never store secrets.
create policy "public reads settings" on site_settings
  for select using (true);

create policy "admin writes settings" on site_settings
  for all using (is_admin()) with check (is_admin());

insert into site_settings (key, value) values
  ('whatsapp_number',   ''),
  ('whatsapp_greeting', 'Hello Kabby''s Food Mart, I''d like to make an enquiry'),
  ('whatsapp_enabled',  'true'),
  ('store_phone',        ''),
  ('pickup_address',     ''),
  ('pickup_hours',       ''),
  ('free_delivery_threshold', '0')
on conflict (key) do nothing;
