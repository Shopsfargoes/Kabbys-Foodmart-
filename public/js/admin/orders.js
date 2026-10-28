import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('orders');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const fmt = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

const FLOW = { pickup: ['new', 'packed', 'ready_for_pickup', 'delivered'], delivery: ['new', 'packed', 'out_for_delivery', 'delivered'] };
const LABEL = { new: 'New', packed: 'Packed', out_for_delivery: 'Out for delivery', ready_for_pickup: 'Ready for pickup', delivered: 'Delivered', cancelled: 'Cancelled' };
const ACTIVE = ['new', 'packed', 'out_for_delivery', 'ready_for_pickup'];
const TABS = [
  ['active', 'Active', (o) => o.payment_status === 'paid' && ACTIVE.includes(o.status)],
  ['done', 'Delivered', (o) => o.status === 'delivered'],
  ['cancelled', 'Cancelled', (o) => o.status === 'cancelled'],
  ['unpaid', 'Unpaid / failed', (o) => o.payment_status !== 'paid' && o.status !== 'cancelled'],
  ['all', 'All', () => true],
];
let orders = [], riders = [], tab = 'active', q = '';

const payClass = { paid: 'ok', pending: 'warn', failed: 'bad', refunded: 'bad' };
const badge = (text, cls) => el('span', 'badge ' + (cls || ''), text);

function renderTabs() {
  const box = $('#tabs'); box.replaceChildren();
  TABS.forEach(([key, label, fn]) => {
    const b = el('button', 'tab' + (tab === key ? ' on' : ''), `${label} (${orders.filter(fn).length})`);
    b.type = 'button'; b.setAttribute('aria-pressed', String(tab === key));
    b.addEventListener('click', () => { tab = key; render(); });
    box.append(b);
  });
}

function render() {
  renderTabs();
  const fn = TABS.find((t) => t[0] === tab)[2];
  const s = q.trim().toLowerCase();
  const list = orders.filter(fn).filter((o) => !s || [o.name, o.phone, o.reference].some((v) => String(v).toLowerCase().includes(s)));
  const tb = $('#rows'); tb.replaceChildren();
  list.forEach((o) => {
    const tr = el('tr', 'rowlink'); tr.tabIndex = 0;
    const open = () => openDetail(o.id);
    tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    const pay = el('td'); pay.append(badge(o.payment_status, payClass[o.payment_status]));
    const st = el('td'); st.append(badge(LABEL[o.status]));
    tr.append(el('td', null, o.reference.slice(-8)), el('td', null, o.name), el('td', null, o.delivery_type === 'pickup' ? 'Pickup' : 'Delivery'),
      el('td', null, naira(o.total)), pay, st, el('td', null, fmt(o.created_at)));
    tb.append(tr);
  });
  $('#empty').textContent = list.length ? '' : 'No orders here yet.';
}

function field(dl, label, value) { if (value) { dl.append(el('dt', null, label), el('dd', null, value)); } }
function link(href, text) { const a = el('a', null, text); a.href = href; return a; }

async function openDetail(id) {
  const o = orders.find((x) => x.id === id);
  const { data: items } = await supabase.from('order_items').select('product_name,qty_kg,price_per_kg,line_total,sold_by').eq('order_id', id);
  const box = $('#detail'); box.replaceChildren(); box.hidden = false;

  const head = el('h2', null, `Order ${o.reference.slice(-8)}`);
  const who = el('dl'); field(who, 'Customer', o.name);
  who.append(el('dt', null, 'Phone'), (() => { const d = el('dd'); d.append(link('tel:+' + o.phone, '+' + o.phone)); if (/^234\d{10}$/.test(o.phone)) { d.append(' | ', (() => { const a = link(`https://wa.me/${o.phone}?text=${encodeURIComponent(`Hello ${o.name}, this is Kabby's Foodmart about your order ${o.reference.slice(-8)}.`)}`, 'WhatsApp'); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; })()); } return d; })());
  who.append(el('dt', null, 'Email'), (() => { const d = el('dd'); d.append(link('mailto:' + o.email, o.email)); return d; })());

  const where = el('dl');
  field(where, 'Method', o.delivery_type === 'pickup' ? 'Pickup' : 'Delivery');
  field(where, 'City', o.city); field(where, 'Address', o.address); field(where, 'Customer note', o.note);
  field(where, 'Placed', fmt(o.created_at)); field(where, 'Paid', o.paid_at ? fmt(o.paid_at) : 'Not paid');

  const tbl = el('table'); const th = el('thead'); const hr = el('tr');
  ['Item', 'Qty', 'Price', 'Total'].forEach((h) => hr.append(el('th', null, h))); th.append(hr); tbl.append(th);
  const tb = el('tbody');
  (items || []).forEach((i) => { const r = el('tr'); [i.product_name, i.qty_kg + (i.sold_by === 'unit' ? '' : ' kg'), naira(i.price_per_kg), naira(i.line_total)].forEach((v) => r.append(el('td', null, v))); tb.append(r); });
  tbl.append(tb);
  const wrap = el('div', 'wrap'); wrap.append(tbl);

  const sums = el('div');
  const row = (l, v, c) => { const r = el('div', 'sumrow ' + (c || '')); r.append(el('span', null, l), el('span', null, v)); sums.append(r); };
  row('Subtotal', naira(o.subtotal));
  if (Number(o.coupon_discount) > 0) row(`Coupon ${o.coupon_code}`, '−' + naira(o.coupon_discount));
  row('Delivery', naira(o.delivery_fee)); row('Total', naira(o.total), 't');

  // status controls
  const paid = o.payment_status === 'paid';
  const flow = FLOW[o.delivery_type];
  const sel = el('select'); sel.setAttribute('aria-label', 'Order status');
  (paid ? [...flow, 'cancelled'] : ['new', 'cancelled']).forEach((s) => { const op = el('option', null, LABEL[s]); op.value = s; sel.append(op); });
  sel.value = o.status;
  const inter = o.delivery_type === 'delivery' && !o.zone_id;
  const local = o.delivery_type === 'delivery' && !!o.zone_id;
  const courier = el('input'); courier.placeholder = 'Courier / park name'; courier.value = o.courier_name || ''; courier.maxLength = 80;
  const track = el('input'); track.placeholder = 'Tracking note'; track.value = o.tracking_note || ''; track.maxLength = 160;
  const msg = el('p', 'msg'); msg.setAttribute('role', 'status');

  // Rider assignment (local deliveries). The rider gets the details on WhatsApp, no app needed.
  const riderSel = el('select'); riderSel.setAttribute('aria-label', 'Rider');
  const none = el('option', null, 'No rider'); none.value = ''; riderSel.append(none);
  riders.filter((r) => r.is_active || r.id === o.rider_id).forEach((r) => { const op = el('option', null, r.name); op.value = r.id; riderSel.append(op); });
  riderSel.value = o.rider_id || '';
  const riderLink = link('#', 'Send to rider on WhatsApp'); riderLink.target = '_blank'; riderLink.rel = 'noopener noreferrer';
  const updateRider = () => {
    const r = riders.find((x) => x.id === riderSel.value);
    if (!r || !/^234\d{10}$/.test(r.phone)) { riderLink.hidden = true; return; }
    const text = [`New delivery - Order ${o.reference.slice(-8)}`, `Customer: ${o.name}`, `Phone: +${o.phone}`,
      `Address: ${o.address || ''}${o.city ? ', ' + o.city : ''}`, 'Items:', ...(items || []).map((i) => `- ${i.product_name} ${i.qty_kg}${i.sold_by === 'unit' ? '' : 'kg'}`),
      o.note ? `Note: ${o.note}` : '', 'Already paid online. Please do not collect any money.'].filter(Boolean).join('\n');
    riderLink.href = `https://wa.me/${r.phone}?text=${encodeURIComponent(text)}`; riderLink.hidden = false;
  };
  riderSel.addEventListener('change', updateRider); updateRider();

  const save = async (status) => {
    if (status === 'cancelled' && o.status !== 'cancelled' &&
        !confirm('Cancel this order? Stock is NOT returned automatically and refunds are done in the Paystack dashboard.')) return;
    const patch = { status };
    if (local) patch.rider_id = riderSel.value || null;
    if (inter) { patch.courier_name = courier.value.trim() || null; patch.tracking_note = track.value.trim() || null; }
    const { data, error } = await supabase.from('orders').update(patch).eq('id', o.id).select('*').single();
    if (error) { msg.textContent = 'Could not save.'; msg.style.color = 'crimson'; return; }
    await supabase.from('audit_log').insert({ admin_id: user.id, action: 'order_status:' + status, table_name: 'orders', record_id: o.id });
    orders = orders.map((x) => (x.id === o.id ? data : x)); render(); openDetail(o.id);
  };
  const saveBtn = el('button', 'btn', 'Save'); saveBtn.type = 'button'; saveBtn.addEventListener('click', () => save(sel.value));
  const actions = el('div', 'actions-row'); actions.append(sel);
  if (inter) actions.append(courier, track);
  if (local) actions.append(riderSel, riderLink);
  actions.append(saveBtn);
  const i = flow.indexOf(o.status);
  if (paid && i >= 0 && i < flow.length - 1) {
    const nxt = el('button', 'btn alt', 'Mark as ' + LABEL[flow[i + 1]]); nxt.type = 'button';
    nxt.addEventListener('click', () => save(flow[i + 1])); actions.append(nxt);
  }
  const close = el('button', 'btn sm', 'Close'); close.type = 'button'; close.addEventListener('click', () => { box.hidden = true; });
  if (!paid) actions.append(el('span', 'hint', 'Unpaid orders cannot be moved forward.'));

  const two = el('div', 'two'); two.append(who, where);
  box.append(head, badge(o.payment_status, payClass[o.payment_status]), two, wrap, sums, actions, msg, close);
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function load() {
  const [o, r] = await Promise.all([
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300),
    supabase.from('riders').select('id,name,phone,is_active').order('name'),
  ]);
  if (o.error) { $('#empty').textContent = 'Could not load orders.'; return; }
  orders = o.data || []; riders = r.data || []; render();
}
$('#q').addEventListener('input', (e) => { q = e.target.value.slice(0, 60); render(); });
load();