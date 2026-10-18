// Shared header and footer for inner pages. Set <body data-page="shop"> to highlight a nav item.
import { el } from './ui.js';
import { cartCount } from './cart.js';

const page = document.body.dataset.page || '';
const link = (href, text, cls) => { const a = el('a', cls, text); a.href = href; return a; };

function header() {
  const h = el('header', 'site-header'); const c = el('div', 'container');
  const brand = link('index.html', 'Kabby’s', 'brand'); brand.append(el('span', null, 'Foodmart'));
  const nav = el('nav', 'nav'); nav.setAttribute('aria-label', 'Main');
  [['index.html', 'Home', 'home'], ['shop.html', 'Shop', 'shop'], ['custom-order.html', 'Custom Order', 'custom'], ['account.html', 'Account', 'account']]
    .forEach(([href, label, key]) => nav.append(link(href, label, key === page ? 'active' : '')));
  const cart = link('cart.html', 'Cart (', 'cart-link');
  cart.append(el('span', 'cart-count', String(cartCount())), ')');
  c.append(brand, nav, cart); h.append(c); return h;
}

function footer() {
  const f = el('footer', 'site-footer'); const c = el('div', 'container foot');
  const a = el('div'); const b = link('index.html', 'Kabby’s', 'brand'); b.append(el('span', null, 'Foodmart'));
  a.append(b, el('p', null, 'Quality you will taste, prices you will love.'));
  const q = el('div'); q.append(el('h4', null, 'Quick links'), link('shop.html', 'Shop'), link('custom-order.html', 'Custom order'), link('privacy.html', 'Privacy policy'));
  const t = el('div'); t.append(el('h4', null, 'Get in touch'), link('tel:+2348127580727', '+234 812 758 0727'), el('span', null, 'Beside 19:30 Hotel, Sijuade, Akure, Ondo State'));
  c.append(a, q, t); f.append(c, el('p', 'copy', '© 2026 Kabby’s Foodmart. All rights reserved.')); return f;
}

document.body.prepend(header());
document.body.append(footer());
