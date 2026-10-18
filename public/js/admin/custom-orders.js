import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('custom-orders');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const fmt = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
const day = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { dateStyle: 'medium' });

const STATUS = { new: 'New', quoted: 'Quoted', accepted: 'Accepted', paid: 'Paid', completed: 'Completed', declined: 'Declined' };
const CLS = { new: 'warn', quoted: '', accepted: 'ok', paid: 'ok', completed: 'ok', declined: 'bad' };
const TABS = [
  ['new', 'New', (o) => o.status === 'new'],
  ['open', 'In progress', (o) => ['quoted', 'accepted', 'paid'].includes(o.status)],
  ['closed', 'Closed', (o) => ['completed', 'declined'].includes(o.status)],
  ['all', 'All', () => true],
];
let rows = [], tab = 'new', q = '';

function render() {
  const box = $('#tabs'); box.replaceChildren();
  TABS.forEach(([k, label, fn]) => {
    const b = el('button', 'tab' + (tab === k ? ' on' : ''), `${label} (${rows.filter(fn).length})`);
    b.type = 'button'; b.setAttribute('aria-pressed', String(tab === k));
    b.addEventListener('click', () => { tab = k; render(); }); box.append(b);
  });
  const fn = TABS.find((t) => t[0] === tab)[2], s = q.trim().toLowerCase();
  const list = rows.filter(fn).filter((o) => !s || [o.name, o.phone, o.email].some((v) => String(v).toLowerCase().includes(s)));
  const tb = $('#rows'); tb.replaceChildren();
  list.forEach((o) => {
    const tr = el('tr', 'rowlink'); tr.tabIndex = 0;
    const open = () => openDetail(o.id);
    tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    const st = el('td'); st.append(el('span', 'badge ' + CLS[o.status], STATUS[o.status]));
    const snippet = o.details.length > 60 ? o.details.slice(0, 60) + '…' : o.details;
    tr.append(el('td', null, o.name), el('td', null, snippet), el('td', null, o.preferred_date ? day(o.preferred_date) : '-'),
      el('td', null, o.quoted_amount != null ? naira(o.quoted_amount) : '-'), st, el('td', null, fmt(o.created_at)));
    tb.append(tr);
  });
  $('#empty').textContent = list.length ? '' : 'No requests here.';
}

const link = (href, text, ext) => { const a = el('a', null, text); a.href = href; if (ext) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };

function openDetail(id) {
  const o = rows.find((x) => x.id === id);
  const box = $('#detail'); box.replaceChildren(); box.hidden = false;

  const dl = el('dl');
  const add = (l, v) => { if (v) dl.append(el('dt', null, l), el('dd', null, v)); };
  add('From', o.name); add('Received', fmt(o.created_at)); add('Quantities', o.quantity_note);
  add('Needed by', o.preferred_date ? day(o.preferred_date) : '');
  const contact = el('dd'); contact.append(link('tel:+' + o.phone, '+' + o.phone), ' | ', link('mailto:' + o.email, o.email));
  dl.append(el('dt', null, 'Contact'), contact);
  const details = el('p', null, o.details); details.style.whiteSpace = 'pre-wrap';

  const status = el('select'); status.setAttribute('aria-label', 'Status');
  Object.entries(STATUS).forEach(([v, t]) => { const op = el('option', null, t); op.value = v; status.append(op); });
  status.value = o.status;
  const amount = el('input'); amount.type = 'number'; amount.min = 0; amount.step = 0.01; amount.placeholder = 'Quote (₦)';
  amount.value = o.quoted_amount ?? ''; amount.setAttribute('aria-label', 'Quote amount in naira');
  amount.addEventListener('input', () => { if (amount.value && status.value === 'new') status.value = 'quoted'; });
  const note = el('textarea'); note.rows = 2; note.maxLength = 500; note.placeholder = 'Internal note'; note.value = o.admin_note || '';
  const msg = el('p', 'msg'); msg.setAttribute('role', 'status');

  const save = el('button', 'btn', 'Save'); save.type = 'button';
  save.addEventListener('click', async () => {
    const amt = amount.value === '' ? null : Number(amount.value);
    if (amt !== null && !(amt >= 0)) { msg.textContent = 'Enter a valid amount.'; msg.style.color = 'crimson'; return; }
    if (status.value === 'quoted' && amt === null) { msg.textContent = 'Add the quote amount first.'; msg.style.color = 'crimson'; return; }
    const { data, error } = await supabase.from('custom_orders')
      .update({ status: status.value, quoted_amount: amt, admin_note: note.value.trim() || null }).eq('id', o.id).select('*').single();
    if (error) { msg.textContent = 'Could not save.'; msg.style.color = 'crimson'; return; }
    await supabase.from('audit_log').insert({ admin_id: user.id, action: 'custom_order:' + status.value, table_name: 'custom_orders', record_id: o.id });
    rows = rows.map((x) => (x.id === o.id ? data : x)); render(); openDetail(o.id);
  });

  const text = o.quoted_amount != null
    ? `Hello ${o.name}, this is Kabby's Foodmart. Thank you for your custom order request. Our quote is ${naira(o.quoted_amount)}. Please let us know if you would like to go ahead.`
    : `Hello ${o.name}, this is Kabby's Foodmart about your custom order request. We would like to confirm a few details.`;
  const actions = el('div', 'actions-row'); actions.append(status, amount, save);
  if (/^234\d{10}$/.test(o.phone)) actions.append(link(`https://wa.me/${o.phone}?text=${encodeURIComponent(text)}`, 'Reply on WhatsApp', true));
  const close = el('button', 'btn sm', 'Close'); close.type = 'button'; close.addEventListener('click', () => { box.hidden = true; });

  box.append(el('h2', null, 'Request from ' + o.name), dl, el('h3', null, 'What they need'), details, note, actions, msg, close);
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function load() {
  const { data, error } = await supabase.from('custom_orders').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { $('#empty').textContent = 'Could not load requests.'; return; }
  rows = data || []; render();
}
$('#q').addEventListener('input', (e) => { q = e.target.value.slice(0, 60); render(); });
load();
