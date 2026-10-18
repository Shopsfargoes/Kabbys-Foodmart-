const $ = (id) => document.getElementById(id);
const NG_PHONE = /^(?:\+?234|0)[789][01]\d{8}$/;
const setErr = (t) => { $('err').textContent = t || ''; };

$('date').min = new Date().toISOString().slice(0, 10);

$('cf').addEventListener('submit', async (e) => {
  e.preventDefault(); setErr('');
  const name = $('name').value.trim(), phone = $('phone').value.trim().replace(/\s+/g, '');
  const email = $('email').value.trim(), details = $('details').value.trim();
  if (name.length < 2) return setErr('Please enter your full name.');
  if (!NG_PHONE.test(phone)) return setErr('Enter a valid Nigerian phone number.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter a valid email address.');
  if (details.length < 10) return setErr('Please tell us a little more about what you need.');

  const btn = $('send'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/custom-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone, email, details, website: $('website').value,
        quantity_note: $('qty').value.trim() || undefined, preferred_date: $('date').value || undefined,
      }),
    });
    const j = await res.json();
    if (!res.ok) { setErr(j.error || 'Could not send your request.'); btn.disabled = false; btn.textContent = 'Send request'; return; }
    $('cf').hidden = true; $('done').hidden = false;
  } catch {
    setErr('Something went wrong. Please try again.'); btn.disabled = false; btn.textContent = 'Send request';
  }
});
