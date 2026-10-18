const $ = (id) => document.getElementById(id);
$('lf').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim(), msg = $('msg');
  msg.style.color = 'var(--color-error)'; msg.textContent = '';
  if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
  const btn = $('go'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/request-login-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    if (res.ok) {
      msg.style.color = 'var(--color-success)';
      msg.textContent = 'If that email has an account, we have sent a login link. Please check your inbox (and spam).';
    } else { msg.textContent = (await res.json()).error || 'Something went wrong.'; }
  } catch { msg.textContent = 'Something went wrong. Please try again.'; }
  btn.disabled = false; btn.textContent = 'Email me a login link';
});
