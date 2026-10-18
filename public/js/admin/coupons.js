import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('coupons');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const iso = (v) => (v ? new Date(v).toISOString() : null);
const msg = (t, bad) => { const m = $('#msg'); m.textContent = t; m.style.color = bad ? 'crimson' : 'green'; };

function maxdState() { $('#maxd').disabled = $('#type').value !== 'percent'; }
$('#type').addEventListener('change', maxdState); maxdState();

async function load() {
  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  const tb = $('#rows'); tb.replaceChildren();
  (data || []).forEach((c) => {
    const tr = el('tr', c.is_active ? '' : 'off');
    const disc = c.type === 'percent' ? `${c.value}%${c.max_discount ? ` (max ${naira(c.max_discount)})` : ''}` : naira(c.value);
    const used = `${c.used_count}${c.max_uses ? ' / ' + c.max_uses : ''}`;
    const exp = c.ends_at ? new Date(c.ends_at).toLocaleDateString('en-NG') : 'Never';
    const act = el('td'); const b = el('button', 'btn sm', c.is_active ? 'Deactivate' : 'Activate'); b.type = 'button';
    b.addEventListener('click', async () => {
      await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
      await supabase.from('audit_log').insert({ admin_id: user.id, action: 'coupon_toggle', table_name: 'coupons', record_id: c.id });
      load();
    });
    act.append(b);
    tr.append(el('td', null, c.code), el('td', null, disc), el('td', null, naira(c.min_order)), el('td', null, used), el('td', null, exp), act);
    tb.append(tr);
  });
}

$('#cf').addEventListener('submit', async (e) => {
  e.preventDefault(); msg('');
  const code = $('#code').value.trim().toUpperCase(), type = $('#type').value, value = Number($('#value').value);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return msg('Code: 3-30 letters, numbers, - or _.', true);
  if (!(value > 0) || (type === 'percent' && value > 100)) return msg('Enter a valid value (percent max 100).', true);
  const row = {
    code, type, value, description: $('#note').value.trim() || null,
    max_discount: type === 'percent' && $('#maxd').value ? Number($('#maxd').value) : null,
    min_order: Number($('#minOrder').value) || 0,
    max_uses: $('#maxUses').value ? Number($('#maxUses').value) : null,
    one_per_customer: $('#once').checked, starts_at: iso($('#starts').value), ends_at: iso($('#ends').value),
  };
  const { data, error } = await supabase.from('coupons').insert(row).select('id').single();
  if (error) return msg(error.code === '23505' ? 'That code already exists.' : 'Could not create coupon.', true);
  await supabase.from('audit_log').insert({ admin_id: user.id, action: 'coupon_create', table_name: 'coupons', record_id: data.id });
  $('#cf').reset(); maxdState(); msg('Coupon created.'); load();
});
load();
