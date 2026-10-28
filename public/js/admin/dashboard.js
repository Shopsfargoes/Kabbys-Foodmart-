import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

await requireAdmin();
mountNav('dashboard');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Math.round(Number(n)).toLocaleString('en-NG');
let data = null;

function kpi(label, value, sub, href) {
  const c = el(href ? 'a' : 'div', 'kpi'); if (href) c.href = href;
  c.append(el('span', 'kpi-l', label), el('strong', 'kpi-v', value)); if (sub) c.append(el('span', 'kpi-s', sub));
  return c;
}

// ----- group daily rows into weeks / months -----
const parse = (s) => new Date(s + 'T00:00:00');
function grouped() {
  const mode = $('#group').value, map = new Map();
  data.series.forEach((r) => {
    const d = parse(r.day); let key, label;
    if (mode === 'week') { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); key = m.toISOString().slice(0, 10); label = m.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }); }
    else if (mode === 'month') { key = r.day.slice(0, 7); label = d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }); }
    else { key = r.day; label = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }); }
    const p = map.get(key) || { label, revenue: 0, orders: 0 };
    p.revenue += Number(r.revenue); p.orders += Number(r.orders); map.set(key, p);
  });
  return [...map.values()];
}

function chart() {
  const box = $('#chart'); box.replaceChildren();
  const pts = grouped(), max = Math.max(1, ...pts.map((p) => p.revenue)), step = Math.ceil(pts.length / 10);
  box.setAttribute('aria-label', `Revenue chart, ${pts.length} periods, total ${naira(pts.reduce((s, p) => s + p.revenue, 0))}`);
  pts.forEach((p, i) => {
    const col = el('div', 'bar-col'), bar = el('div', 'bar');
    bar.style.height = Math.max(p.revenue ? 3 : 1, (p.revenue / max) * 100) + '%';
    bar.title = `${p.label}: ${naira(p.revenue)} (${p.orders} order${p.orders === 1 ? '' : 's'})`;
    col.append(bar);
    if (pts.length <= 12 || i % step === 0) col.append(el('span', 'bar-lbl', p.label));
    box.append(col);
  });
}

function meters(box, rows) {
  box.replaceChildren();
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) { box.append(el('p', 'hint', 'No data in this period.')); return; }
  rows.forEach((r) => {
    const row = el('div', 'meter'); const pct = Math.round((r.value / total) * 100);
    const head = el('div', 'meter-h'); head.append(el('span', null, r.label), el('span', null, `${r.text} (${pct}%)`));
    const track = el('div', 'meter-t'); const fill = el('div', 'meter-f'); fill.style.width = pct + '%'; track.append(fill);
    row.append(head, track); box.append(row);
  });
}

function render() {
  const k = data.kpis, a = data.attention, s = data.stock;
  const att = $('#attention'); att.replaceChildren(
    kpi('Orders to process', String(a.to_process), 'paid, not yet packed', 'orders.html'),
    kpi('New custom requests', String(a.custom_new), 'waiting for a quote', 'custom-orders.html'),
    kpi('Low stock', String(s.low), 'products', 'inventory.html'),
    kpi('Out of stock', String(s.out), 'products', 'inventory.html'));
  $('#kpis').replaceChildren(
    kpi('Revenue', naira(k.revenue), `incl. ${naira(k.delivery_fees)} delivery`),
    kpi('Orders', String(k.orders), 'paid orders'),
    kpi('Average order', naira(k.aov)),
    kpi('Discounts given', naira(k.discounts), 'coupons'));
  chart();

  const top = $('#top'); top.replaceChildren();
  if (!data.top_products.length) top.append(el('p', 'hint', 'No sales in this period.'));
  else {
    const max = Math.max(...data.top_products.map((p) => Number(p.revenue)));
    data.top_products.forEach((p) => {
      const row = el('div', 'meter'), head = el('div', 'meter-h');
      head.append(el('span', null, p.name), el('span', null, `${naira(p.revenue)} · ${Number(p.kg).toLocaleString('en-NG', { maximumFractionDigits: 1 })} sold`));
      const track = el('div', 'meter-t'), fill = el('div', 'meter-f'); fill.style.width = (Number(p.revenue) / max) * 100 + '%';
      track.append(fill); row.append(head, track); top.append(row);
    });
  }
  const sp = data.split;
  meters($('#split'), [
    { label: 'Pickup', value: sp.pickup.orders, text: `${sp.pickup.orders} orders` },
    { label: 'Local delivery', value: sp.local.orders, text: `${sp.local.orders} orders` },
    { label: 'Other-city delivery', value: sp.intercity.orders, text: `${sp.intercity.orders} orders` }]);
  meters($('#cust'), [
    { label: 'New customers', value: data.customers.new, text: String(data.customers.new) },
    { label: 'Returning customers', value: data.customers.returning, text: String(data.customers.returning) }]);
}

async function load() {
  $('#err').textContent = '';
  const { data: d, error } = await supabase.rpc('admin_analytics', { p_days: Number($('#range').value) });
  if (error || !d) { $('#err').textContent = 'Could not load analytics. Make sure analytics.sql has been run.'; return; }
  data = d; render();
}
$('#range').addEventListener('change', () => { const n = Number($('#range').value); $('#group').value = n <= 30 ? 'day' : n <= 90 ? 'week' : 'month'; load(); });
$('#group').addEventListener('change', () => data && chart());
load();