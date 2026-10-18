// Marks an order paid ONLY after Paystack confirms it. Every step is idempotent, so the
// webhook, the success page and Paystack retries can all call this safely.
import { supabaseAdmin as db } from './supabaseAdmin.js';
import { ensureCustomer, sendAccessLink } from './ensureCustomer.js';
import { notifyOwner, notifyIssue } from './notify.js';

export async function finalizeOrder({ reference, tx }) {
  const { data: order } = await db.from('orders').select('*').eq('reference', reference).maybeSingle();
  if (!order) return { status: 'pending' }; // unknown reference: ignore
  const paidAlready = order.payment_status === 'paid';
  if (!tx || tx.reference !== reference) return { status: paidAlready ? 'paid' : 'pending' };

  if (tx.status !== 'success') {
    if (tx.status === 'failed' && order.payment_status === 'pending') {
      await db.from('orders').update({ payment_status: 'failed' }).eq('id', order.id).eq('payment_status', 'pending');
    }
    return { status: paidAlready ? 'paid' : tx.status === 'failed' ? 'failed' : 'pending' };
  }

  // Amount and currency must match what WE calculated at checkout
  const expected = Math.round(Number(order.total) * 100);
  if (tx.currency !== 'NGN' || Number(tx.amount) !== expected) {
    await notifyIssue(`Payment mismatch for ${reference}: Paystack says ${tx.amount} ${tx.currency}, expected ${expected} kobo NGN. Order NOT marked paid. Check the Paystack dashboard.`);
    return { status: 'pending' };
  }

  // Claim the order (only one caller flips it to paid)
  const { data: claimed } = await db.from('orders')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id).in('payment_status', ['pending', 'failed']).select('id');
  const first = !!(claimed && claimed.length);

  // Idempotent follow-ups (safe to repeat if an earlier attempt half-failed)
  const stock = await db.rpc('deduct_stock_for_order', { p_order_id: order.id });
  if (stock.error) await notifyIssue(`Order ${reference} is PAID but stock could not be deducted (possibly oversold): ${stock.error.message}. Please review manually.`);

  const coupon = await db.rpc('redeem_coupon_for_order', { p_order_id: order.id });
  if (coupon.error) console.error('redeem coupon failed', coupon.error.message);

  if (!order.customer_id) {
    try {
      const { customerId, isNew } = await ensureCustomer({ email: order.email, name: order.name, phone: order.phone });
      await db.from('orders').update({ customer_id: customerId }).eq('id', order.id);
      if (isNew) await sendAccessLink(order.email);
    } catch (e) { console.error('customer step failed', e); }
  }

  if (first) {
    const { data: items } = await db.from('order_items').select('product_name, qty_kg, line_total').eq('order_id', order.id);
    await notifyOwner(order, items || []);
  }
  return { status: 'paid' };
}
