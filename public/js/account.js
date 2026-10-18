import { supabase } from './supabaseClient.js';
import { requireCustomer, signOut } from './customerAuth.js';
import { $, el, naira } from './ui.js';

const NG_PHONE = /^(?:\+?234|0)([789][01]\d{8})$/;
const STATUS = { new: 'Received', packed: 'Packed', out_for_delivery: 'Out for delivery', ready_for_pickup: 'Ready for pickup', delivered: 'Delivered', cancelled: 'Cancelled' };
const fmt = (d) => new Date(d).toLocaleDateString('en-NG', { dateStyle: 'medium' });

const { user, customer } = await requireCustomer();
const box = $('#acct'); box.replaceChildren();

if (!customer) {
  box.append(el('p', 'note', 'We could not find a customer account for this login. Orders you place will create one automatically.'));
  const b = el('button', 'btn btn-outline', 'Sign out'); b.type = 'button'; b.addEventListener('click', signOut);
  box.append(b);
} else {
  $('#hello').textContent = customer.name ? `Hello, ${customer.name.split(' ')[0]}` : 'My account';

  // ----- profile -----
  const form = el('form', 'card'); form.noValidate = true; form.style.padding = '1.2rem';
  form.append(el('h2', null, 'Your details'));
  const grid = el('div', 'form-grid');
  const field = (label, id, value, attrs = {}) => {
    const l = el('label', 'field' + (attrs.wide ? ' wide' : ''), label); const i = el(attrs.area ? 'textarea' : 'input');
    i.id = id; i.value = value || ''; if (attrs.area) i.rows = 2; i.maxLength = attrs.max || 100; if (attrs.type) i.type = attrs.type;
    l.append(i); grid.append(l); return i;
  };
  const name = field('Full name', 'pname', customer.name);
  const phone = field('Phone number', 'pphone', customer.phone ? '0' + customer.phone.slice(3) : '', { type: 'tel', max: 20 });
  const email = field('Email (cannot be changed)', 'pemail', customer.email, { wide: true, max: 254 }); email.disabled = true;
  const addr = field('Saved delivery address', 'paddr', customer.default_address, { wide: true, area: true, max: 300 });
  const msg = el('p', 'err'); msg.setAttribute('role', 'status');
  const save = el('button', 'btn btn-green', 'Save details'); save.type = 'submit';
  form.append(grid, msg, save);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.style.color = 'var(--color-error)'; msg.textContent = '';
    const m = phone.value.trim().replace(/\s+/g, '').match(NG_PHONE);
    if (name.value.trim().length < 2) { msg.textContent = 'Please enter your name.'; return; }
    if (phone.value.trim() && !m) { msg.textContent = 'Enter a valid Nigerian phone number.'; return; }
    const { error } = await supabase.from('customers').update({
      name: name.value.trim(), phone: m ? '234' + m[1] : null, default_address: addr.value.trim() || null,
    }).eq('id', user.id);
    msg.style.color = error ? 'var(--color-error)' : 'var(--color-success)';
    msg.textContent = error ? 'Could not save. Please try again.' : 'Saved.';
  });

  // ----- orders -----
  const orders = el('section'); orders.append(el('h2', null, 'Your orders'));
  const list = el('div', 'olist'); orders.append(list);
  const out = el('button', 'btn btn-outline', 'Sign out'); out.type = 'button'; out.addEventListener('click', signOut);
  box.append(form, el('div', 'spacer'), orders, el('div', 'spacer'), out);

  const { data, error } = await supabase.from('orders')
    .select('id,reference,total,status,created_at').eq('payment_status', 'paid').order('created_at', { ascending: false }).limit(50);
  if (error) list.append(el('p', 'note', 'Could not load your orders.'));
  else if (!data.length) {
    const p = el('p', 'note', 'No orders yet. '); const a = el('a', null, 'Start shopping'); a.href = 'shop.html'; p.append(a); list.append(p);
  } else data.forEach((o) => {
    const a = el('a', 'orow'); a.href = 'account-order.html?id=' + encodeURIComponent(o.id);
    const left = el('div'); left.append(el('strong', null, 'Order ' + o.reference.slice(-8)), el('div', 'hint', fmt(o.created_at)));
    const right = el('div'); right.append(el('span', 'tag', STATUS[o.status] || o.status), ' ', el('strong', null, naira(o.total)));
    a.append(left, right); list.append(a);
  });
}
