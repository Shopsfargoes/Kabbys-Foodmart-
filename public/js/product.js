import { supabase } from './supabaseClient.js';
import { productInfoLink } from './waLink.js';
import { addToCart, cartCount } from './cart.js';
import { $, el, naira, media, productCard, effectivePrice, priceEl } from './ui.js';

const slug = new URLSearchParams(location.search).get('slug') || '';
const r3 = (n) => Math.round(n * 1000) / 1000;
const link = (href, text) => { const a = el('a', null, text); a.href = href; return a; };

function notFound() {
  $('#view').replaceChildren(el('p', 'note', 'Sorry, we could not find that product.'), (() => {
    const p = el('p', 'center'); const a = el('a', 'btn btn-green', 'Back to shop'); a.href = 'shop.html'; p.append(a); return p;
  })());
}

function crumbs(p) {
  const c = $('#crumbs'); c.replaceChildren(link('index.html', 'Home'), ' / ', link('shop.html', 'Shop'));
  if (p.categories) c.append(' / ', link('shop.html?category=' + encodeURIComponent(p.categories.slug), p.categories.name));
  c.append(' / ', el('span', null, p.name));
}

function view(p) {
  const min = Number(p.min_order_kg), step = Number(p.step_kg), stock = Number(p.stock_kg);
  const max = r3(Math.floor(stock / step + 1e-9) * step);
  const out = max < min;
  let qty = min;
  const clamp = (v) => {
    v = Number(v); if (!isFinite(v)) v = min;
    return r3(Math.min(Math.max(Math.round(v / step) * step, min), Math.max(max, min)));
  };

  const wrap = el('div', 'pd');
  const img = media(p.image_url, p.name, p.name.charAt(0)); img.classList.add('pd-img');
  const info = el('div', 'pd-info');

  const meta = el('div', 'meta');
  meta.append(priceEl(p));
  if (p.categories) meta.append(el('span', 'tag', p.categories.name));
  const status = out ? 'Out of stock' : stock <= Number(p.low_stock_kg) ? `Only ${stock}kg left` : 'In stock';
  info.append(el('h1', null, p.name), meta, el('p', 'stock ' + (out ? 'out' : 'ok'), status));
  if (p.description) info.append(el('p', 'desc', p.description));

  const label = el('label', 'qty-label', 'Quantity (kg)'); label.htmlFor = 'qty';
  const row = el('div', 'qty');
  const minus = el('button', 'btn btn-outline btn-sm', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Decrease');
  const plus = el('button', 'btn btn-outline btn-sm', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Increase');
  const input = el('input'); input.id = 'qty'; input.type = 'number'; input.inputMode = 'decimal';
  input.min = min; input.step = step; if (!out) input.max = max;
  row.append(minus, input, plus);
  const hint = el('small', 'hint', `Minimum ${min}kg, in steps of ${step}kg`);
  const total = el('p', 'total'); const totalVal = el('strong');
  total.append('Total: ', totalVal);

  const update = () => { input.value = qty; totalVal.textContent = naira(r3(qty * effectivePrice(p))); };
  minus.addEventListener('click', () => { qty = clamp(qty - step); update(); });
  plus.addEventListener('click', () => { qty = clamp(qty + step); update(); });
  input.addEventListener('change', () => { qty = clamp(input.value); update(); });
  update();

  const msg = el('p', 'added'); msg.setAttribute('role', 'status');
  const add = el('button', 'btn btn-green', 'Add to cart'); add.type = 'button';
  const now = el('button', 'btn btn-gold', 'Order now'); now.type = 'button';
  add.addEventListener('click', () => {
    addToCart(p.id, qty);
    const n = $('.cart-count'); if (n) n.textContent = cartCount();
    msg.replaceChildren(`Added ${qty}kg to your cart. `, link('cart.html', 'View cart'));
  });
  now.addEventListener('click', () => { addToCart(p.id, qty); location.href = 'checkout.html'; });
  if (out) { [minus, plus, input, add, now].forEach((x) => { x.disabled = true; }); }

  const wa = el('a', 'btn btn-outline', 'Ask for more information');
  wa.hidden = true; wa.target = '_blank'; wa.rel = 'noopener noreferrer';
  productInfoLink(p).then((u) => { if (u) { wa.href = u; wa.hidden = false; } });

  const btns = el('div', 'pd-actions'); btns.append(add, now, wa);
  const note = el('p', 'hint', p.ships_intercity
    ? 'Pickup is free. Delivery fee is shown at checkout. This item can also ship to other cities.'
    : 'Pickup is free. Delivery fee is shown at checkout. Local delivery only for this item.');
  info.append(label, row, hint, total, btns, msg, note);
  wrap.append(img, info);
  $('#view').replaceChildren(wrap);
}

async function related(p) {
  if (!p.category_id) return;
  const { data } = await supabase.from('products')
    .select('id,name,slug,price_per_kg,stock_kg,min_order_kg,image_url,category_id,discount_type,discount_value,discount_starts_at,discount_ends_at')
    .eq('is_active', true).eq('category_id', p.category_id).neq('id', p.id).limit(4);
  if (!data || !data.length) return;
  $('#relTitle').hidden = false;
  data.forEach((x) => $('#related').append(productCard(x, p.categories?.name)));
}

async function load() {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(slug)) return notFound();
  try {
    const { data: p, error } = await supabase.from('products')
      .select('*, categories(name,slug)').eq('slug', slug).eq('is_active', true).maybeSingle();
    if (error || !p) return notFound();
    document.title = `${p.name} | Kabby’s Foodmart`;
    crumbs(p); view(p); related(p);
  } catch (e) {
    console.error('Product load failed', e);
    notFound();
  }
}
load();
