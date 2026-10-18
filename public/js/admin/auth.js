import { supabase } from '../supabaseClient.js';

// UX guard only. The real protection is RLS (is_admin()) in the database.
export async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.replace('login.html'); throw new Error('Not signed in'); }
  const { data: ok } = await supabase.rpc('is_admin');
  if (ok !== true) { await supabase.auth.signOut(); location.replace('login.html'); throw new Error('Not an admin'); }
  return session.user;
}

export function mountNav(active) {
  const nav = document.createElement('nav'); nav.className = 'admin-nav';
  [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['products', 'Products'], ['categories', 'Categories'], ['inventory', 'Inventory'], ['custom-orders', 'Custom Orders'], ['customers', 'Customers'], ['delivery', 'Delivery'], ['coupons', 'Coupons'], ['settings', 'Settings']].forEach(([k, t]) => {
    const a = document.createElement('a'); a.href = k + '.html'; a.textContent = t;
    if (k === active) a.className = 'on'; nav.append(a);
  });
  const out = document.createElement('button'); out.type = 'button'; out.textContent = 'Sign out';
  out.addEventListener('click', async () => { await supabase.auth.signOut(); location.replace('login.html'); });
  nav.append(out); document.body.prepend(nav);
}
