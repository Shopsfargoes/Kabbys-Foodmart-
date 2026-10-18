// public/js/waLink.js
// Builds a WhatsApp "ask for more info" link for a product.
// Uses the same site_settings as the floating bubble, so one number to manage.
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

// product: { name, price_per_kg }
// Returns a URL string, or null if WhatsApp is disabled/misconfigured.
export async function productInfoLink(product) {
  const s = await getSettings();
  if (!s || s.whatsapp_enabled !== 'true') return null;
  if (!/^[0-9]{10,15}$/.test(s.whatsapp_number || '')) return null;

  const name = String(product.name).slice(0, 80);
  const price = Number(product.price_per_kg).toLocaleString('en-NG');
  const text =
    `Hello Kabby's Food Mart, I'd like more information about ` +
    `${name} (₦${price}/kg). Is it available?`;

  return `https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent(text)}`;
}

/* ---- Usage in shop.js / product.js (DOM-safe card buttons) ----

import { productInfoLink } from './waLink.js';
import { addToCart } from './cart.js';

function actionButtons(p) {
  const wrap = document.createElement('div');
  wrap.className = 'product-actions';

  const order = document.createElement('button');
  order.type = 'button';
  order.className = 'btn btn-primary';
  order.textContent = 'Order now';
  order.disabled = p.stock_kg < p.min_order_kg;
  order.addEventListener('click', () => {
    addToCart(p.id, p.min_order_kg);
    location.href = 'checkout.html';
  });
  wrap.appendChild(order);

  const info = document.createElement('a');
  info.className = 'btn btn-outline';
  info.textContent = 'Ask for more information';
  info.target = '_blank';
  info.rel = 'noopener noreferrer';
  info.hidden = true;                       // shown only when a valid link exists
  productInfoLink(p).then((url) => { if (url) { info.href = url; info.hidden = false; } });
  wrap.appendChild(info);

  return wrap;
}
*/
