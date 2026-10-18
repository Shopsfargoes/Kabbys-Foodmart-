import { supabase } from './supabaseClient.js';
import { getCart, setQty, removeFromCart } from './cart.js';
import { $, el, naira, media, priceEl, effectivePrice } from './ui.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
let products = new Map();
let removedNote = false;

function bump() { const n = $('.cart-count'); if (n) n.textContent = getCart().length; }

function emptyState() {
  const box = $('#cartBox'); box.replaceChildren();
  const p = el('p', 'center'); p.append(el('span', null, 'Your cart is empty. '));
  const a = el('a', 'btn btn-green', 'Start shopping'); a.href = 'shop.html'; p.append(a);
  box.append(p);
}

function row(item, p) {
  const min = Number(p.min_order_kg), step = Number(p.step_kg);
  const max = r3(Math.floor(Number(p.stock_kg) / step + 1e-9) * step);
  const clamp = (v) => r3(Math.min(Math.max(Math.round(Number(v) / step) * step, min), Math.max(max, min)));
  const unit = effectivePrice(p);

  const r = el('div', 'cart-row');
  const a = el('a'); a.href = 'product.html?slug=' + encodeURIComponent(p.slug); a.append(media(p.image_url, p.name, p.name.charAt(0)));
  const info = el('div', 'cart-info');
  const h = el('h3'); const hl = el('a', null, p.name); hl.href = a.href; h.append(hl);
  info.append(h, priceEl(p));

  const q = el('div', 'qty');
  const minus = el('button', 'btn btn-outline btn-sm', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Decrease');
  const plus = el('button', 'btn btn-outline btn-sm', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Increase');
  const input = el('input'); input.type = 'number'; input.inputMode = 'decimal'; input.min = min; input.step = step; input.max = max; input.value = item.qty_kg;
  input.setAttribute('aria-label', `Quantity in kg for ${p.name}`);
  const set = (v) => { setQty(item.id, clamp(v)); render(); };
  minus.addEventListener('click', () => set(item.qty_kg - step));
  plus.addEventListener('click', () => set(item.qty_kg + step));
  input.addEventListener('change', () => set(input.value));
  q.append(minus, input, plus, el('span', 'unit', 'kg'));

  const rm = el('button', 'link-btn', 'Remove'); rm.type = 'button';
  rm.addEventListener('click', () => { removeFromCart(item.id); render(); });
  const total = el('strong', 'line-total', naira(r3(item.qty_kg * unit)));
  r.append(a, info, q, total, rm);
  return { node: r, total: r3(item.qty_kg * unit) };
}

function render() {
  bump();
  const cart = getCart().filter((i) => {
    if (products.get(i.id)?.is_active) return true;
    removeFromCart(i.id); removedNote = true; return false;
  });
  if (!cart.length) return emptyState();

  const box = $('#cartBox'); box.replaceChildren();
  if (removedNote) box.append(el('p', 'note', 'Some items are no longer available and were removed.'));
  const list = el('div', 'cart-list'); let sub = 0;
  cart.forEach((i) => { const r = row(i, products.get(i.id)); sub = r3(sub + r.total); list.append(r.node); });

  const sum = el('aside', 'card summary');
  sum.append(el('h2', null, 'Summary'));
  const line = el('p', 'sum-line'); line.append(el('span', null, 'Subtotal'), el('strong', null, naira(sub)));
  const co = el('a', 'btn btn-gold', 'Proceed to checkout'); co.href = 'checkout.html';
  const more = el('a', 'btn btn-outline', 'Continue shopping'); more.href = 'shop.html';
  sum.append(line, el('p', 'hint', 'Delivery fees and coupons are applied at checkout.'), co, more);
  box.append(el('div', 'co'), );
  const grid = box.lastChild; grid.append(list, sum);
}

async function load() {
  const cart = getCart();
  if (!cart.length) return emptyState();
  try {
    const { data, error } = await supabase.from('products')
      .select('id,name,slug,price_per_kg,discount_type,discount_value,discount_starts_at,discount_ends_at,stock_kg,min_order_kg,step_kg,image_url,is_active')
      .in('id', cart.map((i) => i.id));
    if (error) throw error;
    products = new Map((data || []).map((p) => [p.id, p]));
    render();
  } catch (e) {
    console.error('Cart load failed', e);
    $('#cartBox').replaceChildren(el('p', 'note', 'Could not load your cart. Please refresh.'));
  }
}
load();
