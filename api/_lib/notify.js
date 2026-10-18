// Owner alerts by email via Resend (optional). Without the env vars it just logs.
// Needs: RESEND_API_KEY, OWNER_EMAIL, MAIL_FROM (an address on a domain verified in Resend).
async function send(subject, text) {
  const { RESEND_API_KEY: key, OWNER_EMAIL: to, MAIL_FROM: from } = process.env;
  if (!key || !to || !from) { console.log('[notify]', subject); return; }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }), // plain text only
    });
  } catch (e) { console.error('notify failed', e); }
}

export async function notifyOwner(order, items) {
  const naira = (n) => 'NGN ' + Number(n).toLocaleString('en-NG');
  const lines = items.map((i) => `- ${i.product_name}: ${i.qty_kg}kg (${naira(i.line_total)})`);
  const where = order.delivery_type === 'pickup' ? 'PICKUP' : `DELIVERY to ${order.city || ''}\n${order.address || ''}`;
  await send(`New paid order ${order.reference}`, [
    `Customer: ${order.name}`, `Phone: ${order.phone}`, `Email: ${order.email}`, where, '', ...lines, '',
    order.coupon_code ? `Coupon: ${order.coupon_code} (-${naira(order.coupon_discount)})` : '',
    `Delivery fee: ${naira(order.delivery_fee)}`, `TOTAL: ${naira(order.total)}`,
    order.note ? `Note: ${order.note}` : '',
  ].filter((l) => l !== '').join('\n'));
}

export const notifyIssue = (message) => send('Kabbys Food Mart: order needs attention', message);

export async function notifyCustomOrder(o) {
  await send(`New custom order request from ${o.name}`, [
    `Name: ${o.name}`, `Phone: ${o.phone}`, `Email: ${o.email}`,
    o.preferred_date ? `Needed by: ${o.preferred_date}` : '', o.quantity_note ? `Quantities: ${o.quantity_note}` : '',
    '', o.details, '', 'Reply with a quote from the admin Custom Orders page.',
  ].filter((l) => l !== '').join('\n'));
}
