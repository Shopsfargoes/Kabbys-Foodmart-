import { supabase } from './supabaseClient.js';
import { requireCustomer } from './customerAuth.js';
import { addToCart } from './cart.js';
import { $, el, naira } from './ui.js';

const FLOW = { pickup: ['new', 'packed', 'ready_for_pickup', 'delivered'], delivery: ['new', 'packed', 'out_for_delivery', 'delivered'] };
const LABEL = { new: 'Received', packed: 'Packed', out_for_delivery: 'Out for delivery', ready_for_pickup: 'Ready for pickup', delivered: 'Delivered' };
const fmt = (d) => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
const view = $('#view');
const note = (t) => view.replaceChildren(el('p', 'note', t));

await requireCustomer();
const id = new URLSearchParams(location.search).get('id') || '';
if (!/^[0-9a-f-]{36}$/i.test(id)) note('Order not found.');
else {
  // Row-level security guarantees customers can only read their own orders
  const { data: o } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (!o) note('Order not found.');
  else {
    const { data: items } = await supabase.from('order_items').select('product_id,product_name,qty_kg,price_per_kg,line_total').eq('order_id', id);
    view.replaceChildren();
    const card = el('div', 'card'); card.style.padding = '1.2rem';
    card.append(el('h1', null, 'Order ' + o.reference.slice(-8)), el('p', 'hint', 'Placed ' + fmt(o.created_at)));

    if (o.status === 'cancelled') card.append(el('p', 'err', 'This order was cancelled.'));
    else {
      const steps = el('ul', 'steps'); const flow = FLOW[o.delivery_type]; const at = flow.indexOf(o.status);
      flow.forEach((s, i) => steps.append(el('li', i <= at ? 'done' : '', LABEL[s])));
      card.append(steps);
    }
    const dl = el('p');
    dl.append(el('strong', null, o.delivery_type === 'pickup' ? 'Pickup' : 'Delivery'));
    if (o.delivery_type === 'delivery') dl.append(el('br'), (o.address || '') + (o.city ? ', ' + o.city : ''));
    if (o.courier_name) dl.append(el('br'), 'Courier: ' + o.courier_name + (o.tracking_note ? ' (' + o.tracking_note + ')' : ''));
    card.append(dl);

    const tbl = el('table', 'plain');
    (items || []).forEach((i) => {
      const r = el('tr'); r.append(el('td', null, `${i.product_name} × ${i.qty_kg}kg`), el('td', 'r', naira(i.line_total))); tbl.append(r);
    });
    const row = (l, v, cls) => { const r = el('tr', cls); r.append(el('td', null, l), el('td', 'r', v)); tbl.append(r); };
    row('Subtotal', naira(o.subtotal));
    if (Number(o.coupon_discount) > 0) row(`Coupon ${o.coupon_code}`, '−' + naira(o.coupon_discount));
    row('Delivery', Number(o.delivery_fee) ? naira(o.delivery_fee) : 'Free');
    row('Total', naira(o.total), 'tot');
    card.append(tbl);

    const again = el('button', 'btn btn-gold', 'Order these items again'); again.type = 'button';
    again.addEventListener('click', () => {
      (items || []).filter((i) => i.product_id).forEach((i) => addToCart(i.product_id, Number(i.qty_kg)));
      location.href = 'cart.html';
    });
    card.append(el('p'), again);
    view.append(card);
  }
}
