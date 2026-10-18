// Cart in localStorage. The server re-validates prices, stock and quantities at checkout.
const KEY = 'kfm_cart';

export function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(c) ? c.filter((i) => i && typeof i.id === 'string' && Number(i.qty_kg) > 0) : [];
  } catch { return []; }
}
function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked */ } }

export function addToCart(id, qty) {
  const c = getCart();
  const line = c.find((i) => i.id === id);
  if (line) line.qty_kg = Math.round((Number(line.qty_kg) + qty) * 1000) / 1000;
  else c.push({ id, qty_kg: qty });
  save(c);
}
export function cartCount() { return getCart().length; }
export function clearCart() { save([]); }

export function setQty(id, qty) {
  const c = getCart(); const line = c.find((i) => i.id === id);
  if (line) { line.qty_kg = Math.round(qty * 1000) / 1000; save(c); }
}
export function removeFromCart(id) { save(getCart().filter((i) => i.id !== id)); }
