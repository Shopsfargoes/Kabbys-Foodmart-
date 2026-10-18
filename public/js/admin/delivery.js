import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('delivery');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const flash = (id, t, bad) => { const m = $('#' + id); m.textContent = t; m.style.color = bad ? 'crimson' : 'green'; };
const audit = (action, table, id) => supabase.from('audit_log').insert({ admin_id: user.id, action, table_name: table, record_id: id });
const btn = (text, fn) => { const b = el('button', 'btn sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; };
const NG_PHONE = /^(?:\+?234|0)([789][01]\d{8})$/;
const ed = { z: null, r: null, d: null };

// Generic: save (insert or update), toggle visibility, audit
async function save(kind, table, row, msgId, reload) {
  const q = ed[kind] ? supabase.from(table).update(row).eq('id', ed[kind].id) : supabase.from(table).insert({ ...row, is_active: true });
  const { data, error } = await q.select('id').single();
  if (error) return flash(msgId, error.code === '23505' ? 'That one already exists.' : 'Could not save. Check the values.', true);
  await audit(`${table}_${ed[kind] ? 'update' : 'create'}`, table, data.id);
  ed[kind] = null; $(`#${kind}f`).reset(); flash(msgId, 'Saved.'); reload();
}
async function toggle(table, row, reload) {
  await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
  await audit(`${table}_${row.is_active ? 'hide' : 'show'}`, table, row.id); reload();
}
const actions = (table, row, onEdit, reload) => { const td = el('td'); const w = el('div', 'inline'); w.append(btn('Edit', onEdit), btn(row.is_active ? 'Hide' : 'Show', () => toggle(table, row, reload))); td.append(w); return td; };
['z', 'r', 'd'].forEach((k) => $(`#${k}cancel`).addEventListener('click', () => { ed[k] = null; $(`#${k}f`).reset(); flash(`${k}msg`, ''); }));

// ----- Zones -----
async function loadZones() {
  const { data } = await supabase.from('delivery_zones').select('*').order('city').order('zone_name');
  const tb = $('#zrows'); tb.replaceChildren();
  (data || []).forEach((z) => {
    const tr = el('tr', z.is_active ? '' : 'off');
    tr.append(el('td', null, z.city), el('td', null, z.zone_name), el('td', null, naira(z.fee)),
      actions('delivery_zones', z, () => { ed.z = z; $('#zcity').value = z.city; $('#zname').value = z.zone_name; $('#zfee').value = z.fee; scrollTo({ top: 0, behavior: 'smooth' }); }, loadZones));
    tb.append(tr);
  });
}
$('#zf').addEventListener('submit', (e) => {
  e.preventDefault();
  const city = $('#zcity').value.trim(), zone_name = $('#zname').value.trim(), fee = Number($('#zfee').value);
  if (!city || !zone_name || !(fee >= 0)) return flash('zmsg', 'Enter the city, zone name and a fee of 0 or more.', true);
  save('z', 'delivery_zones', { city, zone_name, fee }, 'zmsg', loadZones);
});

// ----- Other cities -----
async function loadRules() {
  const { data } = await supabase.from('delivery_rules').select('*').order('city');
  const tb = $('#rrows'); tb.replaceChildren();
  (data || []).forEach((r) => {
    const tr = el('tr', r.is_active ? '' : 'off');
    tr.append(el('td', null, r.city), el('td', null, naira(r.base_fee)), el('td', null, naira(r.fee_per_kg)), el('td', null, `${r.est_days_min}-${r.est_days_max}`),
      actions('delivery_rules', r, () => {
        ed.r = r; $('#rcity').value = r.city; $('#rbase').value = r.base_fee; $('#rkg').value = r.fee_per_kg; $('#rmin').value = r.est_days_min; $('#rmax').value = r.est_days_max;
        scrollTo({ top: 0, behavior: 'smooth' });
      }, loadRules));
    tb.append(tr);
  });
}
$('#rf').addEventListener('submit', (e) => {
  e.preventDefault();
  const city = $('#rcity').value.trim(), base_fee = Number($('#rbase').value), fee_per_kg = Number($('#rkg').value || 0);
  const est_days_min = Number($('#rmin').value), est_days_max = Number($('#rmax').value);
  if (!city || !(base_fee >= 0) || !(fee_per_kg >= 0)) return flash('rmsg', 'Enter the city and valid fees.', true);
  if (!(est_days_min >= 1) || est_days_max < est_days_min) return flash('rmsg', 'Delivery days: max must be at least the minimum.', true);
  save('r', 'delivery_rules', { city, base_fee, fee_per_kg, est_days_min, est_days_max }, 'rmsg', loadRules);
});

// ----- Riders -----
async function loadRiders() {
  const { data } = await supabase.from('riders').select('*').order('name');
  const tb = $('#drows'); tb.replaceChildren();
  (data || []).forEach((r) => {
    const tr = el('tr', r.is_active ? '' : 'off');
    tr.append(el('td', null, r.name), el('td', null, '+' + r.phone),
      actions('riders', r, () => { ed.d = r; $('#dname').value = r.name; $('#dphone').value = '0' + r.phone.slice(3); scrollTo({ top: 0, behavior: 'smooth' }); }, loadRiders));
    tb.append(tr);
  });
}
$('#df').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#dname').value.trim(), m = $('#dphone').value.trim().replace(/\s+/g, '').match(NG_PHONE);
  if (name.length < 2 || !m) return flash('dmsg', 'Enter the rider name and a valid Nigerian phone number.', true);
  save('d', 'riders', { name, phone: '234' + m[1] }, 'dmsg', loadRiders);
});

// ----- Pickup & free delivery (site_settings) -----
const KEYS = { spickup: 'pickup_address', shours: 'pickup_hours', sphone: 'store_phone', sfree: 'free_delivery_threshold' };
async function loadSettings() {
  const { data } = await supabase.from('site_settings').select('key,value').in('key', Object.values(KEYS));
  const s = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  Object.entries(KEYS).forEach(([id, key]) => { $('#' + id).value = s[key] || (id === 'sfree' ? '0' : ''); });
}
$('#sf').addEventListener('submit', async (e) => {
  e.preventDefault();
  const free = $('#sfree').value.trim() || '0';
  if (!/^[0-9]{1,9}$/.test(free)) return flash('smsg', 'Free delivery amount must be a whole number.', true);
  const rows = Object.entries(KEYS).map(([id, key]) => ({ key, value: id === 'sfree' ? free : $('#' + id).value.trim(), updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('site_settings').upsert(rows);
  flash('smsg', error ? 'Could not save.' : 'Saved.', !!error);
});

loadZones(); loadRules(); loadRiders(); loadSettings();
