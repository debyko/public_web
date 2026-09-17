// Formatting and small DOM helpers shared by every live block.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

/** Fixed decimals with thousands separators; null stays null so callers print "—". */
export const fmt = (n, decimals) => n == null || !isFinite(n)
  ? null
  : Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Seconds as the page prints an age: "12 s", "3 m 4 s", "2 h 10 m". */
export const age = s => s == null ? '—'
  : s < 60 ? s + ' s'
  : s < 3600 ? Math.floor(s / 60) + ' m' + (s % 60 ? ' ' + (s % 60) + ' s' : '')
  : Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' m';

export const utcTime = iso => iso ? new Date(iso).toISOString().slice(11, 19) + ' UTC' : '—';
export const utcMinute = iso => iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
export const utcMillis = iso => iso ? new Date(iso).toISOString().slice(11, 23) : null;

// Icon geometry copied from the design system bundle (Lucide, ISC licence): 24×24, 2px stroke.
const PATHS = {
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  columns: '<path d="M3 3h18v18H3zM9 3v18M15 3v18"/>',
  'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'circle-dot': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>',
  'circle-slash': '<circle cx="12" cy="12" r="10"/><line x1="9" x2="15" y1="15" y2="9"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  loader: '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
  terminal: '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};

export const icon = (name, size = 14, extraClass = '') =>
  `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

/** DS StateBlock: loading / error / unmeasured, with a title and a sentence. */
export const stateBlock = (state, title, body, { compact = false, tall = false } = {}) => {
  const glyph = state === 'loading' ? 'loader' : state === 'error' ? 'circle-alert' : 'circle-slash';
  const cls = ['state-block', compact ? 'state-block--compact' : '', tall ? 'state-block--tall' : ''].join(' ');
  return `<div class="${cls}">${icon(glyph, compact ? 16 : 20, state === 'loading' ? 'spin' : '')}` +
    `<div class="state-block__title">${esc(title)}</div><div class="state-block__body">${esc(body)}</div></div>`;
};
