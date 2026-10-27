// POST { code, email?, items:[{product_id, qty_kg}] } -> { code, discount }
// Lets checkout preview a coupon. create-order.js re-validates everything before charging.
import { z } from 'zod';
import { isAllowedOrigin } from './_lib/origin.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { rateLimit } from './_lib/rateLimit.js';
import { unitPrice, evaluateCoupon, round2 } from './_lib/pricing.js';

const Body = z.object({
  code: z.string().trim().min(3).max(30),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  items: z.array(z.object({ product_id: z.string().uuid(), qty_kg: z.number().positive().max(500) })).min(1).max(30),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Forbidden' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await rateLimit(req, { key: `coupon:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request.' });
  const { code, email, items } = parsed.data;

  try {
    const qty = new Map();
    items.forEach((i) => qty.set(i.product_id, (qty.get(i.product_id) || 0) + i.qty_kg));
    const { data: products, error } = await supabaseAdmin.from('products')
      .select('id, price_per_kg, discount_type, discount_value, discount_starts_at, discount_ends_at, is_active')
      .in('id', [...qty.keys()]);
    if (error) throw error;

    let subtotal = 0;
    for (const p of products) if (p.is_active) subtotal = round2(subtotal + qty.get(p.id) * unitPrice(p));

    const r = await evaluateCoupon(supabaseAdmin, code, { subtotal, email: email || '' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.status(200).json({ code: r.coupon.code, discount: r.discount });
  } catch (err) {
    console.error('validate-coupon failed:', err);
    return res.status(500).json({ error: 'Could not check that coupon. Please try again.' });
  }
}