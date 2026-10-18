import { supabase } from './supabaseClient.js';

// Returns { user, customer } or redirects to login. customer is null if this login has no customer record.
export async function requireCustomer() {
  const { data: { session } } = await supabase.auth.getSession(); // also completes a magic-link sign-in
  if (!session) { location.replace('login.html'); return new Promise(() => {}); }
  const { data: customer } = await supabase.from('customers').select('*').eq('id', session.user.id).maybeSingle();
  return { user: session.user, customer };
}
export async function signOut() { await supabase.auth.signOut(); location.replace('index.html'); }
