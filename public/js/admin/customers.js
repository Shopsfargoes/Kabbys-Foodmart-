import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

await requireAdmin();
mountNav('customers');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const fmt = (d) => new Date(d).toLocaleDateString('en-NG', { dateStyle: 'medium' });
const STATUS = { new: 'New', packed: 'Packed', out_for_delivery: 'Out for delivery', ready_for_pickup: 'Ready for pickup', delivered: 'Delivered', cancelled: 'Cancelled' };

let customers = [], orders = [], stats = new Map(), q = '', sort = 'new';

function render() {
  const s = q.trim().toLowerCase();
  const get = (c) => stats.get(c.id) || { count: 0, total: 0, last: null };
  let list = customers.filter((c) => !s || [c.name, c.email, c.phone].some((v) => String(v || '').toLowerCase().includes(s)));
  if (sort === 'spend') list.sort((a, b) => get(b).total - get(a).total);
  if (sort === 'orders') list.sort((a, b) => get(b).count - get(a).count);
  const tb = $('#rows'); tb.replaceChildren();
  list.forEach((c) => {
    const st = get(c), tr = el('tr', 'rowlink'); tr.tabIndex = 0;
    const open = () => openDetail(c);
    tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    tr.append(el('td', null, c.name || '-'), el('td', null, c.email), el('td', null, c.phone ? '+' + c.phone : '-'),
      el('td', null, String(st.count)), el('td', null, naira(st.total)), el('td', null, st.last ? fmt(st.last) : '-'));
    tb.append(tr);
  });
  $('#empty').textContent = list.length ? '' : 'No customers yet. Accounts are created automatically after a first paid order.';
}

function openDetail(c) {
  const box = $('#detail'); box.replaceChildren(); box.hidden = false;
  const st = stats.get(c.id) || { count: 0, total: 0 };
  const dl = el('dl');
  const add = (l, v) => { if (v) dl.append(el('dt', null, l), el('dd', null, v)); };
  add('Name', c.name); add('Customer since', fmt(c.created_at)); add('Saved address', c.default_address);
  add('Paid orders', `${st.count} (${naira(st.total)} total)`);
  const contact = el('dd'); const a = el('a', null, c.email); a.href = 'mailto:' + c.email; contact.append(a);
  if (c.phone) {
    contact.append(' | '); const t = el('a', null, '+' + c.phone); t.href = 'tel:+' + c.phone; contact.append(t);
    if (/^234\d{10}$/.test(c.phone)) {
      contact.append(' | '); const w = el('a', null, 'WhatsApp'); w.href = 'https://wa.me/' + c.phone; w.target = '_blank'; w.rel = 'noopener noreferrer'; contact.append(w);
    }
  }
  dl.append(el('dt', null, 'Contact'), contact);

  const tbl = el('table'); const th = el('thead'); const hr = el('tr');
  ['Ref', 'Date', 'Total', 'Status'].forEach((h) => hr.append(el('th', null, h))); th.append(hr); tbl.append(th);
  const tb = el('tbody');
  orders.filter((o) => o.customer_id === c.id).forEach((o) => {
    const r = el('tr'); [o.reference.slice(-8), fmt(o.created_at), naira(o.total), STATUS[o.status] || o.status].forEach((v) => r.append(el('td', null, v))); tb.append(r);
  });
  tbl.append(tb);
  const wrap = el('div', 'wrap'); wrap.append(tbl);
  const close = el('button', 'btn sm', 'Close'); close.type = 'button'; close.addEventListener('click', () => { box.hidden = true; });
  box.append(el('h2', null, c.name || c.email), dl, el('h3', null, 'Orders'), wrap, close);
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function load() {
  const [c, o] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('orders').select('id,reference,customer_id,total,status,created_at').eq('payment_status', 'paid').order('created_at', { ascending: false }).limit(1000),
  ]);
  if (c.error) { $('#empty').textContent = 'Could not load customers.'; return; }
  customers = c.data || []; orders = o.data || [];
  orders.filter((x) => x.customer_id && x.status !== 'cancelled').forEach((x) => {
    const s = stats.get(x.customer_id) || { count: 0, total: 0, last: null };
    s.count += 1; s.total += Number(x.total); if (!s.last || x.created_at > s.last) s.last = x.created_at;
    stats.set(x.customer_id, s);
  });
  render();
}
$('#q').addEventListener('input', (e) => { q = e.target.value.slice(0, 60); render(); });
$('#sort').addEventListener('change', (e) => { sort = e.target.value; render(); });
load();
