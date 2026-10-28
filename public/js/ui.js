// Shared DOM helpers and the product card. Database text is only ever set via textContent.
import { productInfoLink } from './waLink.js';
import { addToCart } from './cart.js';

export const $ = (s, r = document) => r.querySelector(s);
export const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
export const httpsUrl = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : null);
export function effectivePrice(p, now = Date.now()) {
  const base = Number(p.price_per_kg), v = Number(p.discount_value || 0);
  if (!p.discount_type || p.discount_type === 'none' || v <= 0) return base;
  if (p.discount_starts_at && Date.parse(p.discount_starts_at) > now) return base;
  if (p.discount_ends_at && Date.parse(p.discount_ends_at) < now) return base;
  const out = p.discount_type === 'percent' ? base * (1 - Math.min(v, 100) / 100) : base - v;
  return Math.max(0, Math.round(out * 100) / 100);
}
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function priceEl(p) {
  const eff = effectivePrice(p);
  const s = el('span', 'price', naira(eff) + (p.sold_by === 'unit' ? ' each' : '/kg'));
  if (eff < Number(p.price_per_kg)) s.append(' ', el('del', 'was', naira(p.price_per_kg)));
  return s;
}

export function media(url, alt, letter) {
  const m = el('div', 'media');
  const src = httpsUrl(url);
  if (src) { const i = new Image(); i.src = src; i.alt = alt; i.loading = 'lazy'; m.append(i); }
  else m.append(el('span', 'ph', letter));
  return m;
}

export function productCard(p, catName) {
  const href = 'product.html?slug=' + encodeURIComponent(p.slug);
  const card = el('article', 'card product');
  const imgLink = el('a'); imgLink.href = href; imgLink.tabIndex = -1;
  imgLink.append(media(p.image_url, p.name, p.name.charAt(0)));

  const body = el('div', 'body');
  const meta = el('div', 'meta');
  meta.append(priceEl(p));
  if (catName) meta.append(el('span', 'tag', catName));
  const h = el('h3'); const a = el('a', null, p.name); a.href = href; h.append(a);
  body.append(meta, h);

  const actions = el('div', 'actions');
  const out = Number(p.stock_kg) < Number(p.min_order_kg);
  const order = el('button', 'btn btn-green btn-sm', out ? 'Out of stock' : 'Order now');
  order.type = 'button'; order.disabled = out;
  order.addEventListener('click', () => { addToCart(p.id, Number(p.min_order_kg)); location.href = 'checkout.html'; });
  const info = el('a', 'btn btn-outline btn-sm', 'Ask for more information');
  info.hidden = true; info.target = '_blank'; info.rel = 'noopener noreferrer';
  productInfoLink(p).then((u) => { if (u) { info.href = u; info.hidden = false; } });
  actions.append(order, info);
  body.append(actions);
  card.append(imgLink, body);
  return card;
}