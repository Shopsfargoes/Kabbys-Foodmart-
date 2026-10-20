// Browser client. Only the PUBLIC anon key goes here (RLS protects the data).
// Pinned version via jsDelivr (allowed in the CSP). Verify the version is current before launch.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://sewetcmatzhoezhormen.supabase.co';   // TODO
const SUPABASE_ANON_KEY = 'sb_publishable_NvwjX63Kql538pwliGqYMw_XoGHkDqi';                  // TODO (anon key only!)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
