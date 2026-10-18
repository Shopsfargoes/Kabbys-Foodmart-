import { supabase } from './supabaseClient.js';
import { $, el, productCard, effectivePrice } from './ui.js';

const params = new URLSearchParams(location.search);
const state = { cat: params.get('category') || '', q: (params.get('q') || '').slice(0, 60), sort: 'new', stock: false };
let cats = [];
let prods = [];

function syncUrl() {
  const p = new URLSearchParams();
  if (state.cat) p.set('category', state.cat);
  if (state.q) p.set('q', state.q);
  history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
}

function renderChips() {
  const box = $('#chips'); box.replaceChildren();
  const add = (slug, label, n) => {
    const b = el('button', 'chip' + (state.cat === slug ? ' on' : ''), `${label} (${n})`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.cat === slug));
    b.addEventListener('click', () => { state.cat = slug; render(); });
    box.append(b);
  };
  add('', 'All', prods.length);
  cats.forEach((c) => add(c.slug, c.name, prods.filter((p) => p.category_id === c.id).length));
}

function render() {
  syncUrl(); renderChips();
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const catId = cats.find((c) => c.slug === state.cat)?.id;
  const q = state.q.trim().toLowerCase();
  let list = prods.filter((p) =>
    (!catId || p.category_id === catId) &&
    (!q || p.name.toLowerCase().includes(q)) &&
    (!state.stock || Number(p.stock_kg) >= Number(p.min_order_kg)));

  if (state.sort === 'low') list.sort((a, b) => effectivePrice(a) - effectivePrice(b));
  if (state.sort === 'high') list.sort((a, b) => effectivePrice(b) - effectivePrice(a));
  if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

  const grid = $('#grid'); grid.replaceChildren();
  $('#count').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  if (!list.length) grid.append(el('p', 'note', 'No products match your search. Try another category or keyword.'));
  else list.forEach((p) => grid.append(productCard(p, names.get(p.category_id))));
}

async function load() {
  $('#q').value = state.q;
  try {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('id,name,slug').eq('is_active', true).order('sort_order'),
      supabase.from('products')
        .select('id,name,slug,price_per_kg,stock_kg,min_order_kg,image_url,category_id,discount_type,discount_value,discount_starts_at,discount_ends_at')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(500),
    ]);
    if (c.error || p.error) throw (c.error || p.error);
    cats = c.data || []; prods = p.data || [];
    if (state.cat && !cats.some((x) => x.slug === state.cat)) state.cat = '';
    render();
  } catch (e) {
    console.error('Shop load failed', e);
    $('#grid').replaceChildren(el('p', 'note', 'Could not load products. Please refresh.'));
  }
}

let t;
$('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.slice(0, 60); render(); }, 200); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('#stock').addEventListener('change', (e) => { state.stock = e.target.checked; render(); });
load();
