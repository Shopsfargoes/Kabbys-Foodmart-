// SERVER ONLY. Asks Paystack directly for the truth about a transaction.
export async function verifyTransaction(reference) {
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Paystack verify failed (${r.status})`);
  const j = await r.json();
  return j.status ? j.data : null; // data.status: success | failed | abandoned | ...
}
