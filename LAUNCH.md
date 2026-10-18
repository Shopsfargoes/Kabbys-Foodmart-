# Launch checklist: Kabby's Food Mart

## A. Supabase
- [ ] Create project. Run SQL in order: schema, customers_rls, site_settings, policies, discounts, inventory, analytics, security, seed.
- [ ] Authentication: create the admin user, add their id to `admins`, turn OFF public signups.
- [ ] Authentication > URL Configuration: Site URL = your domain; Redirect URL = https://YOUR-DOMAIN/account.html
- [ ] Authentication > SMTP: add custom SMTP (Resend/Brevo). Customise the magic-link email wording.
- [ ] Storage: confirm bucket `product-images` exists (policies.sql creates it).
- [ ] Run supabase/rls_tests.sql blocks 1-6. Every expectation must hold.
- [ ] Turn on daily backups and do ONE test restore.

## B. Vercel + GitHub
- [ ] GitHub: protect `main`, enable Dependabot + secret scanning, 2FA on GitHub, Vercel, Supabase, Paystack.
- [ ] Env vars: SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY, RESEND_API_KEY, OWNER_EMAIL, MAIL_FROM.
- [ ] Put the Supabase URL + anon key in public/js/supabaseClient.js and the Paystack PUBLIC key in public/js/checkout.js.
- [ ] Replace YOUR-DOMAIN in public/robots.txt and public/sitemap.xml.
- [ ] Add the custom domain; confirm HTTPS works.

## C. Paystack
- [ ] Test mode first. Webhook URL: https://YOUR-DOMAIN/api/paystack-webhook
- [ ] Use the dashboard's "send test webhook" and confirm a 200 response (this proves the signature check works).

## D. Test every flow in TEST mode
- [ ] Pickup order, local delivery order, other-city order (and a cart with a non-shippable item is blocked).
- [ ] Successful payment: order turns paid, stock drops ONCE, owner email arrives, customer gets magic link and sees the order.
- [ ] Close the Paystack popup: order stays unpaid, cart is kept.
- [ ] Same webhook delivered twice: stock and coupon count change only once.
- [ ] Product discount (percent and flat) and a coupon: total matches what Paystack charged.
- [ ] Coupon rules: expired, minimum order, max uses, one per customer.
- [ ] Oversell: two buyers, last kg. Second one triggers the owner alert, nothing breaks.
- [ ] Custom order form: arrives in admin and by email.
- [ ] Admin: add product with image, category, restock, change order status, assign a rider (WhatsApp opens), dashboard numbers look right.

## E. Quality
- [ ] Open on a real phone: home, shop, product, cart, checkout, account.
- [ ] Lighthouse (mobile): aim for 90+ on Performance, Accessibility, SEO. Compress product photos (under 200KB each).
- [ ] Add real product photos, hero image (public/assets/images/hero.jpg), and a store email to the privacy page.

## F. Go live
- [ ] Switch Paystack to live keys (public key in checkout.js, secret key in Vercel), set the LIVE webhook URL.
- [ ] Place one real small order and refund it from Paystack.
- [ ] Give her a 20-minute walkthrough: products, categories, stock, orders, riders, delivery fees, coupons.

## Never
- Never commit .env or any secret key. If a key leaks, rotate it immediately.
- Never put the Supabase service-role key or Paystack secret key in /public.
