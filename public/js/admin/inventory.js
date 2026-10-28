import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

await requireAdmin();
mountNav('inventory');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const r3 = (n) => Math.round(n * 1000) / 1000;
const fmt = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

const U = (p) => (p.sold_by === 'unit' ? ' units' : ' kg');
const state = (p) => Number(p.stock_kg) < Number(p.min_order_kg) ? ['Out of stock', 'bad', 'out']
  : Number(p.stock_kg) <= Number(p.low_stock_kg) ? ['Low', 'warn', 'low'] : ['OK', 'ok', 'ok'];
const TABS = [['all', 'All', () => true], ['low', 'Low stock', (p) => state(p)[2] === 'low'], ['out', 'Out of stock', (p) => state(p)[2] === 'out']];
const REASON = { restock: 'Restock', adjustment: 'Correction', spoilage: 'Spoilage / waste', order: 'Customer order' };
let products = [], tab = 'all', q = '';

function render() {
  const box = $('#tabs'); box.replaceChildren();
  TABS.forEach(([k, label, fn]) => {
    const b = el('button', 'tab' + (tab === k ? ' on' : ''), `${label} (${products.filter(fn).length})`);
    b.type = 'button'; b.setAttribute('aria-pressed', String(tab === k));
    b.addEventListener('click', () => { tab = k; render(); }); box.append(b);
  });
  const fn = TABS.find((t) => t[0] === tab)[2], s = q.trim().toLowerCase();
  const list = products.filter(fn).filter((p) => !s || p.name.toLowerCase().includes(s));
  const tb = $('#rows'); tb.replaceChildren();
  list.forEach((p) => {
    const [label, cls] = state(p);
    const tr = el('tr', p.is_active ? '' : 'off');
    const st = el('td'); st.append(el('span', 'badge ' + cls, label));
    const act = el('td'); const b = el('button', 'btn sm', 'Update stock'); b.type = 'button'; b.addEventListener('click', () => openPanel(p)); act.append(b);
    tr.append(el('td', null, p.name + (p.is_active ? '' : ' (hidden)')), el('td', null, p.stock_kg + U(p)), el('td', null, p.low_stock_kg + U(p)), st, act);
    tb.append(tr);
  });
  $('#empty').textContent = list.length ? '' : 'Nothing here.';
}

async function history(p, into) {
  const { data } = await supabase.from('inventory_movements').select('created_at,change_kg,reason,note')
    .eq('product_id', p.id).order('created_at', { ascending: false }).limit(15);
  into.replaceChildren();
  (data || []).forEach((m) => {
    const r = el('tr'); const ch = Number(m.change_kg);
    r.append(el('td', null, fmt(m.created_at)), el('td', null, (ch > 0 ? '+' : '') + ch + U(p)), el('td', null, REASON[m.reason] || m.reason), el('td', null, m.note || ''));
    into.append(r);
  });
}

function openPanel(p) {
  const box = $('#panel'); box.replaceChildren(); box.hidden = false;
  const msg = el('p', 'msg'); msg.setAttribute('role', 'status');
  const mode = el('select'); mode.setAttribute('aria-label', 'Action');
  [['restock', 'Restock (add)'], ['spoilage', 'Spoilage / waste (remove)'], ['set', 'Correction (set exact amount)']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; mode.append(o); });
  const amt = el('input'); amt.type = 'number'; amt.min = 0; amt.step = 0.001; amt.placeholder = U(p).trim(); amt.setAttribute('aria-label', 'Amount');
  const note = el('input'); note.placeholder = 'Note (optional)'; note.maxLength = 200;
  const hist = el('tbody');

  const save = async () => {
    msg.textContent = '';
    const kg = Number(amt.value);
    if (!isFinite(kg) || kg < 0 || (mode.value !== 'set' && kg <= 0)) { msg.textContent = 'Enter a valid amount.'; msg.style.color = 'crimson'; return; }
    const { data: fresh } = await supabase.from('products').select('stock_kg').eq('id', p.id).single();
    const cur = Number(fresh?.stock_kg ?? p.stock_kg);
    const change = r3(mode.value === 'restock' ? kg : mode.value === 'spoilage' ? -kg : kg - cur);
    if (change === 0) { msg.textContent = 'Stock is already at that amount.'; msg.style.color = 'crimson'; return; }
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_product_id: p.id, p_change: change,
      p_reason: mode.value === 'restock' ? 'restock' : mode.value === 'spoilage' ? 'spoilage' : 'adjustment',
      p_note: note.value.trim() || null,
    });
    if (error) { msg.textContent = error.code === '23514' ? 'Not enough stock to remove that amount.' : 'Could not update stock.'; msg.style.color = 'crimson'; return; }
    p.stock_kg = data; amt.value = ''; note.value = '';
    msg.textContent = `Saved. New stock: ${data}${U(p)}.`; msg.style.color = 'green';
    cur_.textContent = data + U(p); render(); history(p, hist);
  };

  const cur_ = el('strong', null, p.stock_kg + U(p));
  const head = el('h2', null, p.name); const line = el('p'); line.append('Current stock: ', cur_);
  const go = el('button', 'btn', 'Save'); go.type = 'button'; go.addEventListener('click', save);
  const close = el('button', 'btn sm', 'Close'); close.type = 'button'; close.addEventListener('click', () => { box.hidden = true; });
  const row = el('div', 'actions-row'); row.append(mode, amt, note, go);

  const tbl = el('table'); const th = el('thead'); const hr = el('tr');
  ['When', 'Change', 'Reason', 'Note'].forEach((h) => hr.append(el('th', null, h))); th.append(hr); tbl.append(th, hist);
  const wrap = el('div', 'wrap'); wrap.append(tbl);
  box.append(head, line, row, msg, el('h3', null, 'Recent changes'), wrap, close);
  history(p, hist); scrollTo({ top: 0, behavior: 'smooth' });
}

async function load() {
  const { data, error } = await supabase.from('products').select('id,name,stock_kg,low_stock_kg,min_order_kg,sold_by,is_active').order('name');
  if (error) { $('#empty').textContent = 'Could not load products.'; return; }
  products = data || []; render();
}
$('#q').addEventListener('input', (e) => { q = e.target.value.slice(0, 60); render(); });
load();