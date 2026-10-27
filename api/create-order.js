// api/create-order.js
// Creates a PENDING order. Prices, delivery fee and total are ALWAYS recomputed here.
// The browser only sends: items (id + kg), contact details, delivery choice.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { isAllowedOrigin } from './_lib/origin.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { unitPrice, evaluateCoupon } from './_lib/pricing.js';
import { rateLimit } from './_lib/rateLimit.js'; // assumed: rateLimit(req, {key, limit, windowMs}) -> {ok}

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

// Nigerian mobile: 0803..., +234803..., 234803... -> stored as 234XXXXXXXXXX
const NG_PHONE = /^(?:\+?234|0)([789][01]\d{8})$/;

const Body = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        qty_kg: z.number().positive().max(500),
      })
    )
    .min(1)
    .max(30),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(NG_PHONE, 'Invalid phone number'),
  email: z.string().trim().toLowerCase().email().max(254),
  delivery_type: z.enum(['pickup', 'delivery']),
  zone_id: z.string().uuid().optional(),      // local delivery
  city: z.string().trim().max(80).optional(), // inter-city delivery
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
  website: z.string().max(0).optional(),      // honeypot: must be empty
  coupon: z.string().trim().max(30).optional(),
});

const fail = (res, code, msg) => res.status(code).json({ error: msg });

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  // Same-origin only
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return fail(res, 403, 'Forbidden');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await rateLimit(req, { key: `order:${ip}`, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return fail(res, 429, 'Too many requests. Please try again shortly.');

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Please check your details and try again.');
  const b = parsed.data;

  if (b.delivery_type === 'delivery' && !b.address) {
    return fail(res, 400, 'Delivery address is required.');
  }

  try {
    // ---- 1. Merge duplicate lines, load real products ----
    const qtyById = new Map();
    for (const it of b.items) {
      qtyById.set(it.product_id, round3((qtyById.get(it.product_id) || 0) + it.qty_kg));
    }
    const ids = [...qtyById.keys()];

    const { data: products, error: pErr } = await supabaseAdmin
      .from('products')
      .select('id, name, price_per_kg, discount_type, discount_value, discount_starts_at, discount_ends_at, stock_kg, min_order_kg, step_kg, ships_intercity, is_active')
      .in('id', ids);
    if (pErr) throw pErr;

    const byId = new Map(products.map((p) => [p.id, p]));
    let subtotal = 0;
    let totalKg = 0;
    const lines = [];

    for (const [id, qty] of qtyById) {
      const p = byId.get(id);
      if (!p || !p.is_active) return fail(res, 400, 'An item in your cart is no longer available.');

      const min = Number(p.min_order_kg);
      const step = Number(p.step_kg);
      const stock = Number(p.stock_kg);

      const onStep = Math.abs(qty / step - Math.round(qty / step)) < 1e-6;
      if (qty < min || !onStep) {
        return fail(res, 400, `Invalid quantity for ${p.name}.`);
      }
      if (qty > stock) {
        return fail(res, 400, `Only ${stock}kg of ${p.name} left in stock.`);
      }

      const unit = unitPrice(p); // after product discount
      const lineTotal = round2(qty * unit);
      subtotal = round2(subtotal + lineTotal);
      totalKg = round3(totalKg + qty);
      lines.push({
        product_id: p.id,
        product_name: p.name,
        price_per_kg: unit,
        list_price_per_kg: p.price_per_kg,
        qty_kg: qty,
        line_total: lineTotal,
        ships_intercity: p.ships_intercity,
      });
    }

    // ---- 1b. Coupon (on subtotal after product discounts) ----
    let couponCode = null;
    let couponDiscount = 0;
    if (b.coupon) {
      const r = await evaluateCoupon(supabaseAdmin, b.coupon, { subtotal, email: b.email });
      if (!r.ok) return fail(res, 400, r.error);
      couponCode = r.coupon.code;
      couponDiscount = r.discount;
    }

    // ---- 2. Delivery fee (server-side only) ----
    let deliveryFee = 0;
    let city = null;
    let zoneId = null;

    if (b.delivery_type === 'delivery') {
      if (b.zone_id) {
        // Local delivery: flat zone fee
        const { data: zone } = await supabaseAdmin
          .from('delivery_zones')
          .select('id, city, fee, is_active')
          .eq('id', b.zone_id)
          .maybeSingle();
        if (!zone || !zone.is_active) return fail(res, 400, 'Selected delivery zone is unavailable.');
        deliveryFee = Number(zone.fee);
        city = zone.city;
        zoneId = zone.id;

        // Free-delivery threshold applies to LOCAL delivery only
        const { data: th } = await supabaseAdmin
          .from('site_settings')
          .select('value')
          .eq('key', 'free_delivery_threshold')
          .maybeSingle();
        const threshold = Number(th?.value || 0);
        if (threshold > 0 && subtotal - couponDiscount >= threshold) deliveryFee = 0;
      } else if (b.city) {
        // Inter-city: base + per-kg; every item must be eligible
        if (lines.some((l) => !l.ships_intercity)) {
          return fail(res, 400, 'Some items in your cart cannot be shipped to another city.');
        }
        const { data: rule } = await supabaseAdmin
          .from('delivery_rules')
          .select('city, base_fee, fee_per_kg, is_active')
          .ilike('city', b.city)
          .maybeSingle();
        if (!rule || !rule.is_active) return fail(res, 400, 'We do not deliver to that city yet.');
        deliveryFee = round2(Number(rule.base_fee) + Number(rule.fee_per_kg) * totalKg);
        city = rule.city;
      } else {
        return fail(res, 400, 'Please choose a delivery zone or city.');
      }
    }

    const total = round2(subtotal - couponDiscount + deliveryFee);
    const phone = '234' + b.phone.match(NG_PHONE)[1];
    const reference = `KFM-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`.toUpperCase();

    // ---- 3. Insert order (pending) then items ----
    const { data: order, error: oErr } = await supabaseAdmin
      .from('orders')
      .insert({
        reference,
        name: b.name,
        phone,
        email: b.email,
        delivery_type: b.delivery_type,
        city,
        zone_id: zoneId,
        address: b.delivery_type === 'delivery' ? b.address : null,
        note: b.note || null,
        subtotal,
        coupon_code: couponCode,
        coupon_discount: couponDiscount,
        delivery_fee: deliveryFee,
        total,
      })
      .select('id')
      .single();
    if (oErr) throw oErr;

    const { error: iErr } = await supabaseAdmin.from('order_items').insert(
      lines.map(({ ships_intercity, ...l }) => ({ ...l, order_id: order.id }))
    );
    if (iErr) {
      await supabaseAdmin.from('orders').delete().eq('id', order.id); // roll back
      throw iErr;
    }

    // Frontend uses ONLY these values to open Paystack
    return res.status(200).json({
      reference,
      email: b.email,
      amount_kobo: Math.round(total * 100),
      subtotal,
      coupon_discount: couponDiscount,
      delivery_fee: deliveryFee,
      total,
    });
  } catch (err) {
    console.error('create-order failed:', err); // details stay server-side
    return fail(res, 500, 'Could not create your order. Please try again.');
  }
}

/* Reminder for verify-payment.js and paystack-webhook.js:
   - Look the order up by reference, compare Paystack's amount (kobo) to
     Math.round(order.total * 100), and its currency to NGN. Reject mismatches.
   - Insert event id into paystack_events first; a duplicate means already processed.
   - Then call supabaseAdmin.rpc('redeem_coupon_for_order', { p_order_id }) (idempotent).
   - Then set payment_status='paid', paid_at, call ensureCustomer(), and
     supabaseAdmin.rpc('deduct_stock_for_order', { p_order_id }).
*/