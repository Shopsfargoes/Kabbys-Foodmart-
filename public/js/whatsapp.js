// public/js/whatsapp.js
// Include on any page:  <script type="module" src="js/whatsapp.js"></script>
// On product pages, set:  <body data-product="Smoked Catfish">
import { supabase } from './supabaseClient.js';

const ICON_SVG = `<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 0 0 16 29c7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.7c-2 0-3.9-.6-5.6-1.6l-.4-.2-4 1 1.1-3.9-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-1.9-.9-3.2-1.7-4.4-3.8-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.8 5.1 2.1.9 2.9.9 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>`;

async function initWhatsApp() {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['whatsapp_number', 'whatsapp_greeting', 'whatsapp_enabled']);
    if (error || !data) return; // fail silently: no bubble is better than a broken one

    const s = Object.fromEntries(data.map((r) => [r.key, r.value]));
    if (s.whatsapp_enabled !== 'true') return;
    if (!/^[0-9]{10,15}$/.test(s.whatsapp_number || '')) return; // validate before use

    let text = s.whatsapp_greeting || 'Hello, I would like to make an enquiry';
    const product = document.body.dataset.product;
    if (product) text = `Hello, I'm interested in ${product}`;

    const a = document.createElement('a');
    a.className = 'wa-bubble';
    a.href = `https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent(text)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Chat with us on WhatsApp');
    a.innerHTML = ICON_SVG; // static constant only, never DB data
    document.body.appendChild(a);
  } catch (e) {
    console.error('WhatsApp bubble failed', e);
  }
}

initWhatsApp();
