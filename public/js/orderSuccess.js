const $ = (id) => document.getElementById(id);
const ref = new URLSearchParams(location.search).get('ref') || '';

if (/^[A-Za-z0-9-]{6,60}$/.test(ref)) {
  $('ref').textContent = ref;
  const check = async (n) => {
    try {
      const r = await fetch('/api/verify-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: ref }),
      });
      const j = await r.json();
      if (j.status === 'paid') {
        $('title').textContent = 'Payment confirmed!';
        $('lead').textContent = 'Thank you. We are getting your order ready.';
      } else if (j.status === 'failed') {
        $('title').textContent = 'Payment not completed';
        $('lead').textContent = 'Your payment did not go through. Please try again from your cart.';
      } else if (n < 6) setTimeout(() => check(n + 1), 3000);
    } catch { if (n < 6) setTimeout(() => check(n + 1), 3000); }
  };
  check(0);
}
