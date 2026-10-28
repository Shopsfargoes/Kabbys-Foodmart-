// Builds a WhatsApp "ask for more info" link for a product.
// Uses the same site_settings as the floating bubble, so there is one number to manage.
import { supabase } from './supabaseClient.js';

let cached; // fetched once per page load

async function getSettings() {
  if (cached !== undefined) return cached;
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['whatsapp_number', 'whatsapp_enabled']);
    if (error || !data) return (cached = null);
    cached = Object.fromEntries(data.map((r) => [r.key, r.value]));
  } catch {
    cached = null;
  }
  return cached;
}

// product: { name, price_per_kg, sold_by }
// Returns a URL string, or null if WhatsApp is disabled or misconfigured.
export async function productInfoLink(product) {
  const s = await getSettings();
  if (!s || s.whatsapp_enabled !== 'true') return null;
  if (!/^[0-9]{10,15}$/.test(s.whatsapp_number || '')) return null;

  const name = String(product.name).slice(0, 80);
  const price = Number(product.price_per_kg).toLocaleString('en-NG');
  const per = product.sold_by === 'unit' ? ' each' : '/kg';
  const text =
    `Hello Kabby's Food Mart, I'd like more information about ` +
    `${name} (₦${price}${per}). Is it available?`;

  return `https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent(text)}`;
}