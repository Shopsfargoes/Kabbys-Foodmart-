// Paystack -> us. Source of truth for payment. Set this URL in the Paystack dashboard:
//   https://YOUR-DOMAIN/api/paystack-webhook
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin as db } from './_lib/supabaseAdmin.js';
import { verifyTransaction } from './_lib/paystack.js';
import { finalizeOrder } from './_lib/finalizeOrder.js';

export const config = { api: { bodyParser: false } }; // we need the RAW body for the signature

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body)); // fallback if already parsed
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = await rawBody(req);
  const sig = String(req.headers['x-paystack-signature'] || '');
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).end();

  let evt;
  try { evt = JSON.parse(body.toString('utf8')); } catch { return res.status(400).end(); }
  if (evt.event !== 'charge.success') return res.status(200).json({ received: true });

  const reference = evt.data?.reference;
  const eventId = String(evt.data?.id || '');
  if (!/^[A-Za-z0-9-]{6,60}$/.test(String(reference))) return res.status(200).json({ received: true });

  try {
    if (eventId) {
      const { data: seen } = await db.from('paystack_events').select('id').eq('id', eventId).maybeSingle();
      if (seen) return res.status(200).json({ received: true }); // duplicate delivery
    }
    // Never trust the webhook payload's amounts: re-check with Paystack itself
    const tx = await verifyTransaction(reference);
    const r = await finalizeOrder({ reference, tx });
    if (eventId && r.status === 'paid') await db.from('paystack_events').upsert({ id: eventId });
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook failed', e);
    return res.status(500).end(); // Paystack will retry
  }
}
