import { supabase } from './supabaseClient.js';
import { cartCount } from './cart.js';
import { $, el, naira, media, productCard } from './ui.js';

function categoryTile(c, count) {
  const a = el('a', 'cat');
  a.href = 'shop.html?category=' + encodeURIComponent(c.slug);
  const label = el('div', 'label');
  label.append(el('strong', null, c.name), el('small', null, count + (count === 1 ? ' item' : ' items')));
  a.append(media(c.image_url, c.name, c.name.charAt(0)), label);
  return a;
}

function applySettings(rows) {
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const th = Number(s.free_delivery_threshold || 0);
  if (th > 0) $('#promoFree').textContent = `Free delivery on local orders above ${naira(th)}. Pickup is always free.`;
  const digits = String(s.store_phone || '').replace(/[^0-9+]/g, '');
  if (digits.length >= 10) { $('#footPhone').textContent = s.store_phone; $('#footPhone').href = 'tel:' + digits; }
  if (s.pickup_hours) $('#footHours').textContent = 'Hours: ' + s.pickup_hours;
}

async function load() {
  $('#cartCount').textContent = cartCount();
  try {
    const [cats, prods, sets] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products')
        .select('id,name,slug,price_per_kg,stock_kg,min_order_kg,image_url,category_id,discount_type,discount_value,discount_starts_at,discount_ends_at')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(200),
      supabase.from('site_settings').select('key,value')
        .in('key', ['store_phone', 'free_delivery_threshold', 'pickup_hours']),
    ]);

    const catList = cats.data || [];
    const prodList = prods.data || [];
    const names = new Map(catList.map((c) => [c.id, c.name]));
    const counts = new Map();
    prodList.forEach((p) => counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1));

    const pg = $('#productGrid'); pg.replaceChildren();
    if (prods.error || !prodList.length) pg.append(el('p', 'note', 'Products are coming soon. Check back shortly!'));
    else prodList.slice(0, 8).forEach((p) => pg.append(productCard(p, names.get(p.category_id))));

    const cg = $('#categoryGrid'); cg.replaceChildren();
    if (cats.error || !catList.length) cg.append(el('p', 'note', 'Categories are coming soon.'));
    else catList.forEach((c) => cg.append(categoryTile(c, counts.get(c.id) || 0)));

    if (sets.data) applySettings(sets.data);
  } catch (e) {
    console.error('Home load failed', e);
    $('#productGrid').replaceChildren(el('p', 'note', 'Could not load products. Please refresh.'));
    $('#categoryGrid').replaceChildren();
  }
}
load();
