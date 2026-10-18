# Kabby's Food Mart

E-commerce site: HTML/CSS/JS, Supabase (PostgreSQL), Vercel, Paystack, OpenRouter.

## Database setup (Supabase SQL editor, in this order)
1. supabase/schema.sql
2. supabase/customers_rls.sql
3. supabase/site_settings.sql
4. supabase/policies.sql
5. supabase/discounts.sql (discounts + coupons)
5b. supabase/inventory.sql (restock / adjust stock function)
5c. supabase/analytics.sql (dashboard numbers)
5d. supabase/security.sql (shared rate limiter)
6. supabase/seed.sql (edit placeholder cities/fees first, then add the admin user as described inside)

## Environment
Copy .env.example values into Vercel project settings. Secrets stay server-side (/api only).

## Status
Written: schema, RLS, settings, seed, create-order, ensureCustomer, whatsapp bubble, product enquiry links, admin settings page.
Everything else is a stub, built phase by phase.


See LAUNCH.md for the full go-live checklist and supabase/rls_tests.sql for the security tests.
