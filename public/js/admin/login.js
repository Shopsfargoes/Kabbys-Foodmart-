import { supabase } from '../supabaseClient.js';
document.getElementById('lf').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg'); msg.textContent = '';
  const { error } = await supabase.auth.signInWithPassword({
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('pw').value,
  });
  if (error) { msg.textContent = 'Invalid email or password.'; return; } // generic on purpose
  location.replace('dashboard.html');
});
