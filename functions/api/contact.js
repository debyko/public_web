// POST /api/contact — the Contact sales and Join the waitlist forms, sent to hello@debyko.com
// through Mailjet (Send API v3.1). Cloudflare Pages Function.
//
// Credentials come from the Pages project's environment only (MAILJET_API_KEY, MAILJET_SECRET_KEY);
// nothing secret lives in this file or anywhere in the repository.
//
// Rate limit: 5 requests per 10 minutes per client IP. The store is a KV namespace when one is bound
// as CONTACT_RL; without it, a Map in this isolate's memory. The in-memory store is per isolate and
// per data centre, so it is a brake, not a guarantee — bind KV to make it exact.

const TO = 'hello@debyko.com';
const FROM = { Email: 'noreply@debyko.com', Name: 'DEBYKO site' };
const MAILJET_URL = 'https://api.mailjet.com/v3.1/send';

// The values the two modals offer (index.html, #dialog-sales and #dialog-wait). Free text is refused.
const ENGAGEMENTS = [
  'Execution Evidence Pilot', 'One-off Execution Audit', 'Continuous Execution Monitoring',
  'Venue Comparison Report', 'Custom dataset or export', 'Connector', 'White-label',
  'Enterprise API', 'Studio Pro access', 'Agent early access'
];
const PRODUCTS = ['Studio Trader', 'Agent', 'Both'];

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGE_BYTES = 4096;
const MAX_ORGANISATION = 200;
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:".]+(\.[^\s@<>()[\],;:".]+)+$/;

/** debyko.com, the production alias on pages.dev and its per-branch previews. */
function originAllowed(origin) {
  if (!origin) return false;
  if (origin === 'https://debyko.com') return true;
  return /^https:\/\/([a-z0-9-]+\.)?debyko-public-web\.pages\.dev$/.test(origin);
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// ── Rate limit ──────────────────────────────────────────────────────────────────────────────

const memory = new Map(); // ip → [timestamps], this isolate only

/** Records this request and says whether the IP is over the limit. */
async function overLimit(env, ip, now) {
  if (env.CONTACT_RL) {
    const key = 'rl:' + ip;
    const stored = JSON.parse((await env.CONTACT_RL.get(key)) || '[]').filter(t => now - t < WINDOW_MS);
    stored.push(now);
    // KV needs a TTL of at least 60 s; the window is longer anyway.
    await env.CONTACT_RL.put(key, JSON.stringify(stored), { expirationTtl: Math.ceil(WINDOW_MS / 1000) });
    return stored.length > LIMIT;
  }
  const recent = (memory.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  memory.set(ip, recent);
  // Keep the Map from growing without bound across many IPs.
  if (memory.size > 5000) for (const [k, v] of memory) if (!v.some(t => now - t < WINDOW_MS)) memory.delete(k);
  return recent.length > LIMIT;
}

// ── Validation ──────────────────────────────────────────────────────────────────────────────

const text = v => (typeof v === 'string' ? v.trim() : '');

/** A normalised request, or { error } with a reason short enough to show under the form. */
function validate(body) {
  const kind = text(body.kind);
  if (kind !== 'sales' && kind !== 'waitlist') return { error: 'Unknown request type.' };
  const email = text(body.email);
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  const organisation = text(body.organisation);
  if (organisation.length > MAX_ORGANISATION) return { error: 'Organisation is longer than 200 characters.' };
  const message = text(body.message);
  if (new TextEncoder().encode(message).length > MAX_MESSAGE_BYTES) return { error: 'The message is longer than 4 KB.' };
  if (kind === 'sales') {
    const engagement = text(body.engagement);
    if (!ENGAGEMENTS.includes(engagement)) return { error: 'Choose an engagement from the list.' };
    return { kind, email, organisation, message, engagement };
  }
  const product = text(body.product);
  if (!PRODUCTS.includes(product)) return { error: 'Choose a product from the list.' };
  return { kind, email, organisation, message, product };
}

// ── Mail ────────────────────────────────────────────────────────────────────────────────────

/** The Mailjet v3.1 payload. Every field on its own line, then when, and from where for triage. */
export function buildPayload(req, meta) {
  const subject = req.kind === 'sales' ? 'Contact sales — ' + req.engagement : 'Waitlist — ' + req.product;
  const lines = req.kind === 'sales'
    ? ['Engagement: ' + req.engagement, 'Organisation: ' + (req.organisation || '—'), 'Email: ' + req.email,
       'Venues · instruments · period:', req.message || '—']
    : ['Product: ' + req.product, 'Email: ' + req.email];
  lines.push('', 'Received ' + meta.receivedAt, 'Client IP: ' + (meta.ip || 'unknown') + ' · country ' + (meta.country || 'unknown'));
  return {
    Messages: [{
      From: FROM,
      To: [{ Email: TO }],
      ReplyTo: { Email: req.email },
      Subject: subject,
      TextPart: lines.join('\n'),
      CustomID: 'debyko-' + req.kind
    }]
  };
}

async function send(env, payload) {
  const res = await fetch(MAILJET_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Basic ' + btoa(env.MAILJET_API_KEY + ':' + env.MAILJET_SECRET_KEY)
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 200) return true;
  // Server-side only: the reason stays in the Pages log, never in the response.
  console.error('mailjet', res.status, (await res.text()).slice(0, 2000));
  return false;
}

// ── Handler ─────────────────────────────────────────────────────────────────────────────────

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, reason: 'POST only.' });
  if (!originAllowed(request.headers.get('origin'))) return json(403, { ok: false, reason: 'Origin not allowed.' });

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (await overLimit(env, ip, Date.now())) return json(429, { ok: false, reason: 'Too many requests from this address. Try again in ten minutes.' });

  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json(400, { ok: false, reason: 'Send the form as JSON.' });
  }
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, reason: 'The request could not be read.' }); }
  if (!body || typeof body !== 'object') return json(400, { ok: false, reason: 'The request could not be read.' });

  // Honeypot: a field no person fills. Say yes, send nothing, record nothing about the sender.
  if (text(body.website)) return json(200, { ok: true });

  const req = validate(body);
  if (req.error) return json(400, { ok: false, reason: req.error });

  if (!env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY) {
    console.error('mailjet credentials missing from the environment');
    return json(502, { ok: false });
  }
  const payload = buildPayload(req, {
    receivedAt: new Date().toISOString(),
    ip,
    country: request.headers.get('cf-ipcountry') || (request.cf && request.cf.country) || ''
  });
  let ok = false;
  try { ok = await send(env, payload); } catch (e) { console.error('mailjet fetch failed', String(e)); }
  return ok ? json(200, { ok: true }) : json(502, { ok: false });
}
