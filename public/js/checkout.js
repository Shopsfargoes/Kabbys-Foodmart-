import { supabase } from './supabaseClient.js';
import { getCart, clearCart } from './cart.js';
import { $, el, naira, effectivePrice } from './ui.js';

const PAYSTACK_PUBLIC_KEY = 'pk_test_xxxxxxxx'; // TODO: your Paystack PUBLIC key (never the secret key)
const NG_PHONE = /^(?:\+?234|0)[789][01]\d{8}$/;
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

let items = [], zones = [], rules = [], settings = {}, coupon = null;
const dtype = () => document.querySelector('input[name="dt"]:checked').value;
const setErr = (t) => { $('#err').textContent = t || ''; };

function estimate() {
  const subtotal = r2(items.reduce((s, i) => s + i.qty_kg * effectivePrice(i.p), 0));
  const kg = r3(items.reduce((s, i) => s + i.qty_kg, 0));
  const disc = coupon ? coupon.discount : 0;
  const th = Number(settings.free_delivery_threshold || 0);
  let fee = 0, problem = '';
  if (dtype() === 'delivery') {
    const a = $('#area').value;
    if (!a) problem = 'Choose your delivery area or city.';
    else if (a.startsWith('zone:')) {
      const z = zones.find((x) => x.id === a.slice(5));
      fee = z ? Number(z.fee) : 0;
      if (th > 0 && subtotal - disc >= th) fee = 0;
    } else {
      const r = rules.find((x) => x.city === a.slice(5));
      if (items.some((i) => !i.p.ships_intercity)) problem = 'Some items in your cart cannot be shipped to another city.';
      else if (r) fee = r2(Number(r.base_fee) + Number(r.fee_per_kg) * kg);
    }
  }
  return { subtotal, disc, fee, total: r2(subtotal - disc + fee), problem };
}

function paint() {
  const e = estimate();
  $('#sumSub').textContent = naira(e.subtotal);
  $('#discRow').hidden = !coupon; if (coupon) $('#sumDisc').textContent = '−' + naira(e.disc);
  $('#sumFee').textContent = dtype() === 'pickup' ? 'Free' : e.fee ? naira(e.fee) : e.problem ? '-' : 'Free';
  $('#sumTotal').textContent = naira(e.total);
  return e;
}

function paintItems() {
  const box = $('#sumItems'); box.replaceChildren();
  items.forEach((i) => {
    const p = el('p', 'sum-line'); p.append(el('span', null, `${i.p.name} × ${i.qty_kg}kg`), el('span', null, naira(r2(i.qty_kg * effectivePrice(i.p)))));
    box.append(p);
  });
}

function fillAreas() {
  const sel = $('#area');
  zones.forEach((z) => { const o = el('option', null, `${z.city} - ${z.zone_name} (${naira(z.fee)})`); o.value = 'zone:' + z.id; sel.append(o); });
  rules.forEach((r) => { const o = el('option', null, `${r.city} (other city, ${r.est_days_min}-${r.est_days_max} days)`); o.value = 'city:' + r.city; sel.append(o); });
}

function toggleDelivery() {
  const d = dtype() === 'delivery';
  $('#deliveryBox').hidden = !d;
  $('#pickupInfo').textContent = d ? '' : [settings.pickup_address && 'Pickup at: ' + settings.pickup_address, settings.pickup_hours && 'Hours: ' + settings.pickup_hours].filter(Boolean).join(' | ');
  paint();
}

async function applyCoupon() {
  const code = $('#coupon').value.trim().toUpperCase(); const msg = $('#couponMsg');
  if (!code) return;
  const email = $('#email').value.trim();
  try {
    const res = await fetch('/api/validate-coupon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email: /\S+@\S+\.\S+/.test(email) ? email : undefined, items: items.map((i) => ({ product_id: i.id, qty_kg: i.qty_kg })) }),
    });
    const j = await res.json();
    if (!res.ok) { coupon = null; msg.textContent = j.error || 'Coupon not valid.'; msg.style.color = 'var(--color-error)'; }
    else { coupon = j; msg.textContent = `Coupon ${j.code} applied.`; msg.style.color = 'var(--color-success)'; }
  } catch { msg.textContent = 'Could not check the coupon. Try again.'; }
  paint();
}

async function pay() {
  setErr('');
  const name = $('#name').value.trim(), phone = $('#phone').value.trim().replace(/\s+/g, ''), email = $('#email').value.trim();
  const e = paint();
  if (name.length < 2) return setErr('Please enter your full name.');
  if (!NG_PHONE.test(phone)) return setErr('Enter a valid Nigerian phone number.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter a valid email address.');
  if (e.problem) return setErr(e.problem);
  if (dtype() === 'delivery' && !$('#address').value.trim()) return setErr('Please enter your delivery address.');

  const body = {
    items: items.map((i) => ({ product_id: i.id, qty_kg: i.qty_kg })),
    name, phone, email, delivery_type: dtype(), note: $('#note').value.trim() || undefined,
    website: $('#website').value, coupon: coupon ? coupon.code : undefined,
  };
  if (dtype() === 'delivery') {
    body.address = $('#address').value.trim();
    const a = $('#area').value;
    if (a.startsWith('zone:')) body.zone_id = a.slice(5); else body.city = a.slice(5);
  }

  const btn = $('#payBtn'); btn.disabled = true; btn.textContent = 'Preparing your order…';
  const reset = () => { btn.disabled = false; btn.textContent = 'Pay securely with Paystack'; };
  try {
    const res = await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error || 'Could not create your order.'); return reset(); }
    if (Math.round(e.total * 100) !== j.amount_kobo) {
      $('#sumTotal').textContent = naira(j.total); $('#sumFee').textContent = naira(j.delivery_fee);
      setErr('Prices were updated. Please review the total and click Pay again.'); return reset();
    }
    if (!window.PaystackPop) { setErr('Payment could not load. Please refresh and try again.'); return reset(); }
    window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY, email: j.email, amount: j.amount_kobo, currency: 'NGN', ref: j.reference,
      callback: function () { clearCart(); location.href = 'order-success.html?ref=' + encodeURIComponent(j.reference); },
      onClose: function () { setErr('Payment window closed. Your cart is saved.'); reset(); },
    }).openIframe();
  } catch (err) {
    console.error('Checkout failed', err); setErr('Something went wrong. Please try again.'); reset();
  }
}

async function load() {
  const cart = getCart();
  if (!cart.length) { location.replace('cart.html'); return; }
  try {
    const [p, z, r, s] = await Promise.all([
      supabase.from('products').select('id,name,price_per_kg,discount_type,discount_value,discount_starts_at,discount_ends_at,ships_intercity,is_active').in('id', cart.map((i) => i.id)),
      supabase.from('delivery_zones').select('*').eq('is_active', true).order('city'),
      supabase.from('delivery_rules').select('*').eq('is_active', true).order('city'),
      supabase.from('site_settings').select('key,value').in('key', ['free_delivery_threshold', 'pickup_address', 'pickup_hours']),
    ]);
    const byId = new Map((p.data || []).filter((x) => x.is_active).map((x) => [x.id, x]));
    items = cart.filter((i) => byId.has(i.id)).map((i) => ({ id: i.id, qty_kg: Number(i.qty_kg), p: byId.get(i.id) }));
    if (!items.length) { location.replace('cart.html'); return; }
    zones = z.data || []; rules = r.data || [];
    settings = Object.fromEntries((s.data || []).map((x) => [x.key, x.value]));
    fillAreas(); paintItems(); toggleDelivery();
  } catch (e) {
    console.error('Checkout load failed', e); setErr('Could not load checkout. Please refresh.');
  }
}

document.querySelectorAll('input[name="dt"]').forEach((r) => r.addEventListener('change', toggleDelivery));
$('#area').addEventListener('change', paint);
$('#applyCoupon').addEventListener('click', applyCoupon);
$('#payBtn').addEventListener('click', pay);
load();
