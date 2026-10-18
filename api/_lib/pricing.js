// SERVER-SIDE pricing rules. The browser's numbers are never trusted.
export const round2 = (n) => Math.round(n * 100) / 100;

// Price per kg after the product's own discount (flat NGN off, or percent), if active now.
export function unitPrice(p, now = Date.now()) {
  const base = Number(p.price_per_kg);
  const v = Number(p.discount_value || 0);
  if (!p.discount_type || p.discount_type === 'none' || v <= 0) return base;
  if (p.discount_starts_at && Date.parse(p.discount_starts_at) > now) return base;
  if (p.discount_ends_at && Date.parse(p.discount_ends_at) < now) return base;
  const out = p.discount_type === 'percent' ? base * (1 - Math.min(v, 100) / 100) : base - v;
  return Math.max(0, round2(out));
}

// Coupon applies to the subtotal AFTER product discounts. Delivery is never discounted.
export async function evaluateCoupon(db, rawCode, { subtotal, email }) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: 'Invalid coupon code.' };

  const { data: c } = await db.from('coupons').select('*').eq('code', code).maybeSingle();
  const now = Date.now();
  if (!c || !c.is_active ||
      (c.starts_at && Date.parse(c.starts_at) > now) ||
      (c.ends_at && Date.parse(c.ends_at) < now)) {
    return { ok: false, error: 'This coupon is not valid.' };
  }
  if (subtotal < Number(c.min_order)) {
    return { ok: false, error: `Minimum order for this coupon is ₦${Number(c.min_order).toLocaleString('en-NG')}.` };
  }
  if (c.max_uses != null && c.used_count >= c.max_uses) {
    return { ok: false, error: 'This coupon has been fully used.' };
  }
  if (c.one_per_customer) {
    const { count } = await db.from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', c.id).eq('email', String(email).toLowerCase());
    if (count > 0) return { ok: false, error: 'You have already used this coupon.' };
  }

  let d = c.type === 'percent' ? (subtotal * Number(c.value)) / 100 : Number(c.value);
  if (c.type === 'percent' && c.max_discount != null) d = Math.min(d, Number(c.max_discount));
  return { ok: true, coupon: c, discount: round2(Math.min(d, subtotal)) };
}
