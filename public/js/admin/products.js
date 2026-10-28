import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('products');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const num = (id) => Number($('#' + id).value);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const localInput = (v) => { if (!v) return ''; const d = new Date(v); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const isUnit = () => document.querySelector('input[name="sold"]:checked').value === 'unit';
let editing = null, cats = [], slugTouched = false;

const msg = (t, bad) => { const m = $('#msg'); m.textContent = t; m.style.color = bad ? 'crimson' : 'green'; };

function labels() {
  const u = isUnit(), word = u ? 'units' : 'kg';
  $('#priceLbl').textContent = u ? 'Price per pack (₦)' : 'Price per kilo (₦)';
  $('#stockLbl').textContent = `Total in stock (${word})`;
  $('#lowLbl').textContent = `Stock alert at (${word})`;
  $('#minLbl').textContent = `Smallest order (${word})`;
  $('#stepLbl').textContent = `Order goes up by (${word})`;
  $('#weightRow').hidden = !u;
  const step = u ? '1' : '0.001';
  ['stock', 'low'].forEach((id) => { $('#' + id).step = u ? '1' : '0.001'; });
  $('#min').step = step; $('#step').step = step;
  preview();
}

function preview() {
  const price = num('price') || 0, t = $('#dtype').value, v = num('dval') || 0, per = isUnit() ? ' each' : '/kg';
  let out = price;
  if (t === 'percent') out = price * (1 - Math.min(v, 100) / 100);
  if (t === 'flat') out = price - v;
  out = Math.max(0, Math.round(out * 100) / 100);
  $('#dval').disabled = t === 'none';
  $('#preview').textContent = !price ? '' : out < price ? `Customers pay ${naira(out)}${per} (was ${naira(price)})` : `Customers pay ${naira(price)}${per}`;
}
['price', 'dtype', 'dval'].forEach((id) => $('#' + id).addEventListener('input', preview));

document.querySelectorAll('input[name="sold"]').forEach((r) => r.addEventListener('change', () => {
  const u = isUnit();
  $('#min').value = 1; $('#step').value = u ? 1 : 0.5;
  if (!editing) $('#low').value = u ? 3 : 5;
  labels();
}));

function resetForm() { editing = null; slugTouched = false; $('#pf').reset(); $('#formTitle').textContent = 'Add product'; labels(); }
$('#reset').addEventListener('click', () => { resetForm(); msg(''); });

function edit(p) {
  editing = p; slugTouched = true; $('#formTitle').textContent = 'Edit: ' + p.name;
  document.querySelector(`input[name="sold"][value="${p.sold_by || 'kg'}"]`).checked = true;
  $('#name').value = p.name; $('#slug').value = p.slug; $('#cat').value = p.category_id || '';
  $('#desc').value = p.description || ''; $('#price').value = p.price_per_kg;
  $('#dtype').value = p.discount_type; $('#dval').value = p.discount_value;
  $('#dstart').value = localInput(p.discount_starts_at); $('#dend').value = localInput(p.discount_ends_at);
  $('#stock').value = p.stock_kg; $('#min').value = p.min_order_kg; $('#step').value = p.step_kg; $('#low').value = p.low_stock_kg;
  $('#weight').value = p.weight_kg || 0; $('#inter').checked = p.ships_intercity; $('#active').checked = p.is_active;
  labels(); scrollTo({ top: 0, behavior: 'smooth' });
}

function renderRows(list) {
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const tb = $('#rows'); tb.replaceChildren();
  list.forEach((p) => {
    const u = p.sold_by === 'unit';
    const tr = el('tr', p.is_active ? '' : 'off');
    const d = el('td');
    if (p.discount_type === 'none') d.textContent = '-';
    else d.append(el('span', 'badge', p.discount_type === 'percent' ? `${p.discount_value}% off` : `${naira(p.discount_value)} off`));
    const act = el('td'); const b = el('button', 'btn sm', 'Edit'); b.type = 'button'; b.addEventListener('click', () => edit(p)); act.append(b);
    tr.append(el('td', null, p.name + (p.is_active ? '' : ' (hidden)')), el('td', null, names.get(p.category_id) || '-'),
      el('td', null, naira(p.price_per_kg) + (u ? ' each' : '/kg')), d, el('td', null, p.stock_kg + (u ? ' units' : ' kg')), act);
    tb.append(tr);
  });
}

async function loadAll() {
  const [c, p] = await Promise.all([
    supabase.from('categories').select('id,name').order('sort_order'),
    supabase.from('products').select('*').order('created_at', { ascending: false }),
  ]);
  cats = c.data || [];
  if ($('#cat').options.length === 1) cats.forEach((x) => { const o = el('option', null, x.name); o.value = x.id; $('#cat').append(o); });
  if (p.error) return msg('Could not load products. Have you run units.sql?', true);
  renderRows(p.data || []);
}

$('#name').addEventListener('input', () => { if (!slugTouched) $('#slug').value = slugify($('#name').value); });
$('#slug').addEventListener('input', () => { slugTouched = true; });

$('#pf').addEventListener('submit', async (e) => {
  e.preventDefault(); msg('');
  const u = isUnit();
  const name = $('#name').value.trim(), slug = slugify($('#slug').value || name);
  const price = num('price'), dtype = $('#dtype').value, dval = dtype === 'none' ? 0 : num('dval');
  const stock = num('stock'), low = num('low'), min = num('min'), step = num('step');
  if (name.length < 2 || !slug) return msg('Enter the product name.', true);
  if (!(price >= 0) || $('#price').value === '') return msg('Enter the price.', true);
  if (dtype !== 'none' && !(dval > 0)) return msg('Enter a discount value above 0, or choose "No discount".', true);
  if (dtype === 'percent' && dval > 100) return msg('A percentage discount cannot be more than 100.', true);
  if (dtype === 'flat' && dval > price) return msg('The discount cannot be more than the price.', true);
  if (!(stock >= 0) || !(low >= 0) || !(min > 0) || !(step > 0)) return msg('Check the stock and order numbers.', true);
  if (u && ![stock, low, min, step].every(Number.isInteger)) return msg('For packs, use whole numbers (1, 2, 3...).', true);

  let image_url = editing ? editing.image_url : null;
  const file = $('#image').files[0];
  if (file) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    if (!ext || file.size > 2 * 1024 * 1024) return msg('The image must be jpg, png or webp, under 2MB.', true);
    const path = `${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type });
    if (up.error) return msg('The image could not be uploaded.', true);
    image_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  const row = {
    name, slug, category_id: $('#cat').value || null, description: $('#desc').value.trim() || null, image_url,
    sold_by: u ? 'unit' : 'kg', weight_kg: u ? (num('weight') || 0) : 0,
    price_per_kg: price, discount_type: dtype, discount_value: dval,
    discount_starts_at: iso($('#dstart').value), discount_ends_at: iso($('#dend').value),
    stock_kg: stock, min_order_kg: min, step_kg: step, low_stock_kg: low,
    ships_intercity: $('#inter').checked, is_active: $('#active').checked,
  };
  const q = editing ? supabase.from('products').update(row).eq('id', editing.id) : supabase.from('products').insert(row);
  const { data, error } = await q.select('id').single();
  if (error) return msg(error.code === '23505' ? 'That web address (slug) is already used. Change the slug.' : 'Could not save. Have you run units.sql?', true);

  const delta = editing ? stock - Number(editing.stock_kg) : stock;
  if (delta !== 0) await supabase.from('inventory_movements').insert({ product_id: data.id, change_kg: delta, reason: editing ? 'adjustment' : 'restock', created_by: user.id });
  await supabase.from('audit_log').insert({ admin_id: user.id, action: editing ? 'product_update' : 'product_create', table_name: 'products', record_id: data.id });
  resetForm(); loadAll(); msg('Saved.');
});

labels(); loadAll();