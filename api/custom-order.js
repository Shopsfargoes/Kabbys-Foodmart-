// POST custom/bulk order request. Customers cannot write to the database directly,
// so this validates everything and inserts with the service role.
import { z } from 'zod';
import { supabaseAdmin as db } from './_lib/supabaseAdmin.js';
import { rateLimit } from './_lib/rateLimit.js';
import { notifyCustomOrder } from './_lib/notify.js';

const NG_PHONE = /^(?:\+?234|0)([789][01]\d{8})$/;
const Body = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(NG_PHONE),
  email: z.string().trim().toLowerCase().email().max(254),
  details: z.string().trim().min(10).max(2000),
  quantity_note: z.string().trim().max(200).optional(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const origin = req.headers.origin;
  if (origin && origin !== process.env.SITE_URL) return res.status(403).json({ error: 'Forbidden' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await rateLimit(req, { key: `custom:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check your details and try again.' });
  const b = parsed.data;

  if (b.preferred_date) {
    const t = Date.parse(b.preferred_date);
    const now = Date.now();
    if (isNaN(t) || t < now - 36 * 3600 * 1000 || t > now + 366 * 24 * 3600 * 1000) {
      return res.status(400).json({ error: 'Please choose a date within the next year.' });
    }
  }

  try {
    const { data: cust } = await db.from('customers').select('id').eq('email', b.email).maybeSingle();
    const row = {
      customer_id: cust?.id ?? null, name: b.name, phone: '234' + b.phone.match(NG_PHONE)[1], email: b.email,
      details: b.details, quantity_note: b.quantity_note || null, preferred_date: b.preferred_date || null,
    };
    const { error } = await db.from('custom_orders').insert(row);
    if (error) throw error;
    await notifyCustomOrder(row);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('custom-order failed', e);
    return res.status(500).json({ error: 'Could not send your request. Please try again.' });
  }
}
