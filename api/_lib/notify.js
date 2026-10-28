// Email through Gmail SMTP (nodemailer). Needs these Vercel environment variables:
//   GMAIL_USER          the Gmail address that sends the mail
//   GMAIL_APP_PASSWORD  a 16-character Google "app password" (NOT the Gmail login password)
//   OWNER_EMAIL         where owner alerts go (optional, defaults to GMAIL_USER)
//   MAIL_FROM_NAME      sender name customers see (optional, default "Kabby's Foodmart")
// If Gmail is not configured, emails are skipped and a line is written to the logs.
import nodemailer from 'nodemailer';

let transporter;
function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // Google shows it with spaces
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    });
  }
  return transporter;
}

// Throws on failure (so the test script can show why). Returns false if Gmail is not configured.
export async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) { console.log('[mail skipped: Gmail not configured]', subject); return false; }
  await t.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || "Kabby's Foodmart", address: process.env.GMAIL_USER },
    replyTo: process.env.GMAIL_USER, to, subject, text, // plain text only
  });
  return true;
}

// An email problem must never break an order, so these wrappers only log.
async function safe(fn) { try { return await fn(); } catch (e) { console.error('email failed:', e.message); return false; } }

const owner = () => process.env.OWNER_EMAIL || process.env.GMAIL_USER;
const money = (n) => 'NGN ' + Number(n).toLocaleString('en-NG');
const qty = (i) => `${i.qty_kg}${i.sold_by === 'unit' ? '' : 'kg'}`;
const siteUrl = () => {
  const u = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '');
  return u.split(',')[0].trim().replace(/\/+$/, '');
};
const where = (o) => (o.delivery_type === 'pickup' ? 'PICKUP' : `DELIVERY to ${o.city || ''}\n${o.address || ''}`);

export const notifyOwner = (order, items) => safe(() => sendMail({
  to: owner(),
  subject: `New paid order ${order.reference}`,
  text: [
    `Customer: ${order.name}`, `Phone: ${order.phone}`, `Email: ${order.email}`, where(order), '',
    ...items.map((i) => `- ${i.product_name}: ${qty(i)} (${money(i.line_total)})`), '',
    order.coupon_code ? `Coupon: ${order.coupon_code} (-${money(order.coupon_discount)})` : '',
    `Delivery fee: ${money(order.delivery_fee)}`, `TOTAL: ${money(order.total)}`,
    order.note ? `Note: ${order.note}` : '',
  ].filter((l) => l !== '').join('\n'),
}));

export const sendCustomerReceipt = (order, items) => safe(() => sendMail({
  to: order.email,
  subject: `Your order ${order.reference} is confirmed`,
  text: [
    `Hello ${String(order.name).split(' ')[0]},`, '',
    "Thank you for your order at Kabby's Foodmart. We have received your payment.", '',
    `Order: ${order.reference}`, where(order), '',
    ...items.map((i) => `- ${i.product_name}: ${qty(i)} (${money(i.line_total)})`), '',
    order.coupon_code ? `Coupon ${order.coupon_code}: -${money(order.coupon_discount)}` : '',
    `Delivery: ${Number(order.delivery_fee) ? money(order.delivery_fee) : 'Free'}`, `TOTAL PAID: ${money(order.total)}`, '',
    siteUrl() ? `Track your order: ${siteUrl()}/login.html (use this email address)` : '',
    '', 'Questions? Just reply to this email.',
  ].filter((l, idx, arr) => l !== '' || (arr[idx - 1] !== '' && idx !== 0)).join('\n'),
}));

export const notifyIssue = (message) => safe(() => sendMail({
  to: owner(), subject: "Kabby's Foodmart: order needs attention", text: message,
}));

export const notifyCustomOrder = (o) => safe(() => sendMail({
  to: owner(),
  subject: `New custom order request from ${o.name}`,
  text: [
    `Name: ${o.name}`, `Phone: ${o.phone}`, `Email: ${o.email}`,
    o.preferred_date ? `Needed by: ${o.preferred_date}` : '', o.quantity_note ? `Quantities: ${o.quantity_note}` : '',
    '', o.details, '', 'Reply with a quote from the admin Custom Orders page.',
  ].filter((l) => l !== '').join('\n'),
}));