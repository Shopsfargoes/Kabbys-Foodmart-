// api/_lib/ensureCustomer.js
// Call ONLY after Paystack payment is verified server-side.
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin.js'; // service-role client

// Anon client, used only to trigger the magic-link email
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const normalizeEmail = (e) => String(e).trim().toLowerCase();

export async function ensureCustomer({ email, name, phone }) {
  const cleanEmail = normalizeEmail(email);

  // 1. Existing customer? Link silently (never reveal this to the browser)
  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('id, name, phone')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (existing) {
    // Fill blanks only; never overwrite details they've set themselves
    const patch = {};
    if (!existing.name && name) patch.name = name;
    if (!existing.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length) {
      await supabaseAdmin.from('customers').update(patch).eq('id', existing.id);
    }
    return { customerId: existing.id, isNew: false };
  }

  // 2. Create the auth user (passwordless, email not yet verified)
  let userId;
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    email_confirm: false,
    user_metadata: { name },
  });

  if (error) {
    // Auth user exists but has no customers row: look it up via SQL helper
    const { data: foundId, error: rpcErr } = await supabaseAdmin.rpc(
      'auth_user_id_by_email',
      { p_email: cleanEmail }
    );
    if (rpcErr || !foundId) throw new Error('Could not create or find user');
    userId = foundId;
  } else {
    userId = created.user.id;
  }

  // 3. Create the customers row
  const { error: insErr } = await supabaseAdmin
    .from('customers')
    .insert({ id: userId, email: cleanEmail, name, phone });
  if (insErr) throw insErr;

  return { customerId: userId, isNew: true };
}

// Sends the "view your order" magic link. Logging in via this link
// is what verifies the email. Configure custom SMTP in Supabase
// (Resend/Brevo) so delivery is reliable.
export async function sendAccessLink(email) {
  const { error } = await supabasePublic.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.SITE_URL}/account.html`,
    },
  });
  if (error) console.error('Magic link failed:', error.message); // log, don't throw
}

/* ---- Usage inside api/paystack-webhook.js (after signature + amount checks) ----

import { ensureCustomer, sendAccessLink } from './_lib/ensureCustomer.js';

// order already verified as paid, and not processed before (idempotency)
const { customerId, isNew } = await ensureCustomer({
  email: order.email, name: order.name, phone: order.phone,
});

await supabaseAdmin.from('orders')
  .update({ customer_id: customerId, status: 'paid' })
  .eq('id', order.id);

if (isNew) await sendAccessLink(order.email);
*/
