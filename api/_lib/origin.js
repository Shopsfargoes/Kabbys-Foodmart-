// Same-site check for our API. Accepts:
//  - SITE_URL (one address, or several separated by commas), trailing slashes and letter case ignored
//  - the Vercel production address and this deployment's own address (set automatically by Vercel)
const clean = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();

export function allowedOrigins() {
  const list = String(process.env.SITE_URL || '').split(',').map(clean).filter(Boolean);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) list.push(clean('https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL));
  if (process.env.VERCEL_URL) list.push(clean('https://' + process.env.VERCEL_URL));
  return list;
}

export function isAllowedOrigin(origin) {
  const ok = allowedOrigins().includes(clean(origin));
  if (!ok) console.warn('Blocked request from origin:', origin, '| allowed:', allowedOrigins().join(', ') || '(none set)');
  return ok;
}