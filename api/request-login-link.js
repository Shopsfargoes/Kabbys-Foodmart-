// POST { email } -> always { ok: true }. Never reveals whether an account exists.
import { z } from 'zod';
import { isAllowedOrigin } from './_lib/origin.js';
import { supabaseAdmin as db } from './_lib/supabaseAdmin.js';
import { rateLimit } from './_lib/rateLimit.js';
import { sendAccessLink } from './_lib/ensureCustomer.js';

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const { email } = parsed.data;

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const a = await rateLimit(req, { key: `login-ip:${ip}`, limit: 5, windowMs: 10 * 60 * 1000 });
  const b = await rateLimit(req, { key: `login-email:${email}`, limit: 3, windowMs: 10 * 60 * 1000 });
  if (!a.ok || !b.ok) return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });

  try {
    const { data: c } = await db.from('customers').select('id').eq('email', email).maybeSingle();
    if (c) await sendAccessLink(email);
  } catch (e) { console.error('request-login-link failed', e); }
  return res.status(200).json({ ok: true }); // same answer whether or not the account exists
}