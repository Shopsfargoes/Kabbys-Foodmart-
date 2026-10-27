// Called by the success page. Asks Paystack, then finalizes. Returns only a status.
import { z } from 'zod';
import { isAllowedOrigin } from './_lib/origin.js';
import { rateLimit } from './_lib/rateLimit.js';
import { verifyTransaction } from './_lib/paystack.js';
import { finalizeOrder } from './_lib/finalizeOrder.js';

const Body = z.object({ reference: z.string().regex(/^[A-Za-z0-9-]{6,60}$/) });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Forbidden' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await rateLimit(req, { key: `verify:${ip}`, limit: 30, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests.' });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request.' });

  try {
    const tx = await verifyTransaction(parsed.data.reference);
    const r = await finalizeOrder({ reference: parsed.data.reference, tx });
    return res.status(200).json({ status: r.status });
  } catch (e) {
    console.error('verify-payment failed', e);
    return res.status(200).json({ status: 'pending' }); // webhook will still confirm
  }
}