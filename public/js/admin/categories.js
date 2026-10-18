import { supabase } from '../supabaseClient.js';
import { requireAdmin, mountNav } from './auth.js';

const user = await requireAdmin();
mountNav('categories');

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const msg = (t, bad) => { const m = $('#msg'); m.textContent = t; m.style.color = bad ? 'crimson' : 'green'; };
const audit = (action, id) => supabase.from('audit_log').insert({ admin_id: user.id, action, table_name: 'categories', record_id: id });

let cats = [], counts = new Map(), editing = null;

function resetForm() { editing = null; $('#cf').reset(); $('#formTitle').textContent = 'Add category'; }
$('#cancel').addEventListener('click', () => { resetForm(); msg(''); });

function btn(text, fn, cls = 'btn sm') {
  const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b;
}

async function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  const changed = cats.map((c, idx) => [c, idx]).filter(([c, idx]) => c.sort_order !== idx);
  await Promise.all(changed.map(([c, idx]) => supabase.from('categories').update({ sort_order: idx }).eq('id', c.id)));
  await audit('category_reorder', cats[i].id);
  load();
}

async function toggle(c) {
  await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
  await audit(c.is_active ? 'category_hide' : 'category_show', c.id);
  load();
}

function render() {
  const tb = $('#rows'); tb.replaceChildren();
  cats.forEach((c, i) => {
    const tr = el('tr', c.is_active ? '' : 'off');
    const img = el('td');
    if (/^https:\/\//.test(c.image_url || '')) { const im = new Image(); im.src = c.image_url; im.alt = ''; im.className = 'thumb'; img.append(im); }
    else img.append(el('div', 'thumb', c.name.charAt(0)));
    const order = el('td'); const o = el('div', 'inline');
    o.append(btn('↑', () => move(i, -1)), btn('↓', () => move(i, 1))); order.append(o);
    order.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-label', k ? 'Move down' : 'Move up'));
    const vis = el('td'); vis.append(btn(c.is_active ? 'Hide' : 'Show', () => toggle(c)));
    const act = el('td'); act.append(btn('Edit', () => {
      editing = c; $('#formTitle').textContent = 'Edit: ' + c.name; $('#name').value = c.name; scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tr.append(img, el('td', null, c.name + (c.is_active ? '' : ' (hidden)')), el('td', null, String(counts.get(c.id) || 0)), order, vis, act);
    tb.append(tr);
  });
}

async function load() {
  const [c, p] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('name'),
    supabase.from('products').select('category_id'),
  ]);
  cats = c.data || [];
  counts = new Map();
  (p.data || []).forEach((x) => counts.set(x.category_id, (counts.get(x.category_id) || 0) + 1));
  render();
}

$('#cf').addEventListener('submit', async (e) => {
  e.preventDefault(); msg('');
  const name = $('#name').value.trim();
  if (name.length < 2 || !slugify(name)) return msg('Enter a category name (2-40 characters).', true);

  let image_url = editing ? editing.image_url : null;
  const file = $('#image').files[0];
  if (file) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    if (!ext || file.size > 2 * 1024 * 1024) return msg('Image must be jpg, png or webp under 2MB.', true);
    const path = `categories/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type });
    if (up.error) return msg('Image upload failed.', true);
    image_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  // The slug is set once and never changed, so existing shop links keep working after a rename.
  const q = editing
    ? supabase.from('categories').update({ name, image_url }).eq('id', editing.id)
    : supabase.from('categories').insert({ name, slug: slugify(name), image_url, sort_order: cats.length });
  const { data, error } = await q.select('id').single();
  if (error) return msg(error.code === '23505' ? 'A category with that name already exists.' : 'Could not save the category.', true);

  await audit(editing ? 'category_update' : 'category_create', data.id);
  resetForm(); msg('Saved.'); load();
});

load();
