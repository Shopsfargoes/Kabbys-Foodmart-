// Database-backed limiter (see supabase/security.sql). Same signature as before.
// If the database call itself fails we log and allow the request, so a limiter outage never blocks real customers.
import { supabaseAdmin } from './supabaseAdmin.js';

export async function rateLimit(_req, { key, limit, windowMs }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: String(key).slice(0, 200), p_limit: limit, p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw error;
    return { ok: data === true };
  } catch (e) {
    console.error('rateLimit failed', e);
    return { ok: true };
  }
}
