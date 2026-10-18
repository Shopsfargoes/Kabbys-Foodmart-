import { supabase } from '../supabaseClient.js';
    import { requireAdmin } from './auth.js'; // redirects non-admins to login

    const $ = (id) => document.getElementById(id);
    const status = (msg, ok = true) => {
      $('status').textContent = msg;
      $('status').style.color = ok ? 'green' : 'crimson';
    };

    await requireAdmin();

    const { data } = await supabase.from('site_settings').select('key, value');
    const s = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    $('waEnabled').checked = s.whatsapp_enabled === 'true';
    $('waNumber').value = s.whatsapp_number || '';
    $('waGreeting').value = s.whatsapp_greeting || '';

    $('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const number = $('waNumber').value.replace(/\s+/g, '');
      if (number && !/^[0-9]{10,15}$/.test(number)) {
        return status('Number must be 10-15 digits, no + or spaces.', false);
      }
      const rows = [
        { key: 'whatsapp_enabled',  value: String($('waEnabled').checked) },
        { key: 'whatsapp_number',   value: number },
        { key: 'whatsapp_greeting', value: $('waGreeting').value.trim().slice(0, 200) },
      ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));

      // RLS enforces admin-only writes; this is not the security boundary
      const { error } = await supabase.from('site_settings').upsert(rows);
      error ? status('Could not save. Try again.', false) : status('Saved.');
    });
