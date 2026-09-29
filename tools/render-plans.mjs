// Renders the plan blocks of debyko.com and studio.debyko.com from one file, data/plans.json.
//
// Why: prices and limits were typed by hand in two repositories and drifted (Studio still showed five
// keys on Pro after the database moved every plan to one, and no Pro Plus column). Now both pages are
// generated from the same JSON; a page's block carries the sha256 of the plans.json it was rendered
// from, so a drift guard can compare it with https://debyko.com/data/plans.json.
//
// Regions (each rewritten between its markers, the rest of the file untouched):
//   index.html             <!-- plans-grid:begin -->   … <!-- plans-grid:end -->    the price list in #studio
//                          <!-- plans-cards:begin -->  … <!-- plans-cards:end -->   the cards in #pricing
//                          <!-- plans-table:begin -->  … <!-- plans-table:end -->   the table in #plans
//   studio landing         <!-- plans:begin -->        … <!-- plans:end -->         the table in #plans
//   (platform: deploy/studio-stub/index.html, given with --studio)
// Every region starts with <!-- plans:sha256=<sha256 of plans.json> -->.
//
// Usage:
//   node tools/render-plans.mjs                          rewrite index.html
//   node tools/render-plans.mjs --studio <path>          … and the studio landing at <path>
//   node tools/render-plans.mjs --check [--studio <p>]   write nothing; exit 1 if a region differs
//   --plans <path>                                       read another plans.json (default data/plans.json)
// No dependencies; Node 18 or later. Running it twice changes nothing.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// ── arguments ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; if (!v || v.startsWith('--')) fail(name + ' needs a path'); return v; };
function fail(msg, code = 2) { console.error('render-plans: ' + msg); process.exit(code); }
const known = new Set(['--check', '--studio', '--plans', '--index']);
for (const a of args) if (a.startsWith('--') && !known.has(a)) fail('unknown option ' + a);

const check = args.includes('--check');
const plansPath = resolve(opt('--plans') || root + 'data/plans.json');
const indexPath = resolve(opt('--index') || root + 'index.html');
const studioPath = opt('--studio') ? resolve(opt('--studio')) : null;

// ── data ───────────────────────────────────────────────────────────────────────────────────

const raw = readFileSync(plansPath);
const sha = createHash('sha256').update(raw).digest('hex');
const data = JSON.parse(raw.toString('utf8'));
validate(data);
const plans = data.plans;

function validate(d) {
  const need = { code: 'string', name: 'string', price_eur_month: 'number', trial_days: 'number', card_required: 'boolean',
    for: 'string', summary: 'string', dql_per_minute: 'number', requests_per_second: 'number', requests_per_day: 'number',
    stream_connections: 'number', csv_export: 'boolean', api_keys: 'number' };
  if (!Array.isArray(d.plans) || !d.plans.length) fail('plans.json has no plans');
  for (const k of ['checkout_open']) if (typeof d[k] !== 'boolean') fail('plans.json: ' + k + ' must be true or false');
  for (const k of ['checkout_url', 'free_url', 'waitlist_url']) if (typeof d[k] !== 'string') fail('plans.json: ' + k + ' is missing');
  for (const p of d.plans) {
    for (const [k, t] of Object.entries(need)) if (typeof p[k] !== t) fail(`plans.json: ${p.code || '?'}.${k} must be a ${t}`);
    for (const k of ['venues', 'instruments', 'history_days', 'order_book_levels'])
      if (typeof p[k] !== 'number' && !['all', 'full'].includes(p[k])) fail(`plans.json: ${p.code}.${k} must be a number, "all" or "full"`);
  }
}

// ── formatting ─────────────────────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const price = p => p.price_eur_month === 0 ? '€0' : '€' + num(p.price_eur_month) + ' / month';
const history = p => p.history_days === 'all' ? 'all' : p.history_days === 365 ? '1 year' : num(p.history_days) + ' days';
const book = p => typeof p.order_book_levels === 'number' ? 'top ' + p.order_book_levels + ' levels' : p.order_book_levels;
const card = p => !p.card_required ? 'no' : p.trial_days > 0 ? 'trial' : 'yes';
const paid = p => p.price_eur_month > 0;
const checkoutUrl = p => data.checkout_url.replace('{code}', encodeURIComponent(p.code));
const buyLabel = (p, short) => p.trial_days > 0 ? (short ? 'Start the trial' : `Start the ${p.trial_days}-day trial`) : 'Buy now';
const pathOf = url => { const u = new URL(url); return u.pathname + u.search; };

/** The rows both tables show, in this order. `v` gives [value, sub-line] for one plan, or a boolean. */
const ROWS = [
  { k: 'Venues', v: p => [String(p.venues)] },
  { k: 'Instruments', v: p => [String(p.instruments), p.instruments_rule] },
  { k: 'Live comparison, with the age of every figure', v: () => true },
  { k: 'History back', v: p => [history(p)] },
  { k: 'Order book', v: p => [book(p)] },
  { k: 'Point-in-time replay (<span class="mono">as of</span>)', studio: 'Point-in-time replay (as of)', v: () => ['within history'] },
  { k: 'DQL screening', v: p => [num(p.dql_per_minute) + ' / min'] },
  { k: 'API requests per second', v: p => [num(p.requests_per_second)] },
  { k: 'API requests per day', v: p => [num(p.requests_per_day)] },
  { k: 'Live stream connections', v: p => [num(p.stream_connections)] },
  { k: 'CSV export', v: p => p.csv_export },
  { k: 'API keys', v: p => [num(p.api_keys)] },
  { k: 'Card required', v: p => [card(p)] }
];

const YES = '<svg class="icon plan-yes" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Included"><path d="M20 6 9 17l-5-5"/></svg>';
const NO = '<span class="plan-no" aria-label="Not included">—</span>';
const CLOSED = 'Checkout opens soon';

// ── debyko.com ─────────────────────────────────────────────────────────────────────────────

/** Paid-plan action on debyko.com: the checkout link, or while checkout is closed a disabled button and the waitlist. */
function siteAction(p, cls) {
  if (!paid(p)) return `<a class="btn ${cls}" href="${esc(data.free_url)}"><span>Get a key</span></a>`;
  if (data.checkout_open) return `<a class="btn ${cls}" href="${esc(checkoutUrl(p))}"><span>${buyLabel(p)}</span></a>`;
  return `<button class="btn ${cls}" type="button" disabled aria-disabled="true"><span>${CLOSED}</span></button>`
    + `<a class="link-btn plan-alt" href="/?open=wait" data-open="wait" data-product="Studio subscription">Join the waitlist</a>`;
}

function renderGrid() {
  const line = p => !paid(p) ? '€0 · live now' : price(p) + ' · ' + (p.trial_days > 0 ? p.trial_days + '-day trial' : 'no trial');
  return [
    '<div class="price-grid">',
    ...plans.map(p => `  <span class="label">${esc(p.name)}</span><span class="price-line__value">${esc(line(p))}</span>`),
    '</div>'
  ];
}

function renderCards() {
  const out = ['<div class="plan-cards">'];
  for (const p of plans) out.push(
    '  <div class="plan-card">',
    `    <span class="plan-card__name">${esc(p.name)}</span>`,
    `    <span class="plan-card__price">${esc(price(p))}</span>`,
    `    <p class="plan-card__desc">${esc(p.summary)}</p>`,
    `    <div class="plan-card__cta">${siteAction(p, 'btn--sm btn--full')}</div>`,
    '  </div>');
  out.push(
    '  <div class="plan-card">',
    '    <span class="plan-card__name">Team and enterprise</span>',
    '    <span class="plan-card__price">By scope</span>',
    '    <p class="plan-card__desc">Several keys under one account, dedicated capacity, retention and support terms agreed per engagement.</p>',
    '    <div class="plan-card__cta"><button class="btn btn--sm btn--full" data-open="sales"><span>Contact sales</span></button></div>',
    '  </div>',
    '</div>');
  return out;
}

function renderTable() {
  const cell = v => v === true ? YES : v === false ? NO
    : `<span class="plans__v">${esc(v[0])}</span>` + (v[1] ? `<span class="plans__sub">${esc(v[1])}</span>` : '');
  return [
    `<table class="plans plans--${plans.length}">`,
    '  <thead>',
    '    <tr>',
    '      <th scope="col"><span class="label">Included</span></th>',
    ...plans.map(p => `      <th scope="col"><span class="plans__name">${esc(p.name)}</span><span class="plans__price">${esc(price(p))}</span><span class="plans__for">${esc(p.for)}</span></th>`),
    '    </tr>',
    '  </thead>',
    '  <tbody>',
    ...ROWS.map(r => `    <tr><th scope="row">${r.k}</th>${plans.map(p => '<td>' + cell(r.v(p)) + '</td>').join('')}</tr>`),
    '  </tbody>',
    '  <tfoot>',
    '    <tr>',
    '      <th scope="row"></th>',
    ...plans.map(p => `      <td>${siteAction(p, 'btn--full')}</td>`),
    '    </tr>',
    '  </tfoot>',
    '</table>'
  ];
}

// ── studio.debyko.com ──────────────────────────────────────────────────────────────────────

// Uses only classes the studio stub already styles (css/studio.css: .st-plans, th.l/td.l, td.n,
// .st-plan-for; css/site.css: .btn, .btn--sm, .btn--full, .btn:disabled). Links to its own account
// pages are relative, as on the rest of that page; the waitlist is debyko.com's dialog.
function renderStudio() {
  const cell = v => v === true ? 'yes' : v === false ? '—' : esc(v[0]) + (v[1] ? ' · ' + esc(v[1]) : '');
  const action = p => {
    if (!paid(p)) return `<a class="btn btn--sm btn--full" href="${esc(pathOf(data.free_url))}"><span>Get a key</span></a>`;
    if (data.checkout_open) return `<a class="btn btn--sm btn--full" href="${esc(pathOf(checkoutUrl(p)))}"><span>${buyLabel(p, true)}</span></a>`;
    return `<button class="btn btn--sm btn--full" type="button" disabled aria-disabled="true"><span>${CLOSED}</span></button>`
      + `<a class="st-plan-for" href="${esc(data.waitlist_url)}">Join the waitlist</a>`;
  };
  return [
    '<table class="st-plans">',
    `  <thead><tr><th class="l">Included</th>${plans.map(p => `<th>${esc(p.name)}<span class="st-plan-for">${esc(price(p))} · ${esc(p.for)}</span></th>`).join('')}</tr></thead>`,
    '  <tbody>',
    ...ROWS.map(r => `    <tr><td class="l">${r.studio || r.k}</td>${plans.map(p => '<td class="n">' + cell(r.v(p)) + '</td>').join('')}</tr>`),
    '  </tbody>',
    '  <tfoot>',
    '    <tr><td class="l"></td>',
    ...plans.map(p => `      <td class="n">${action(p)}</td>`),
    '    </tr>',
    '  </tfoot>',
    '</table>'
  ];
}

// ── regions ────────────────────────────────────────────────────────────────────────────────

/** Rewrites the region between <!-- NAME:begin --> and <!-- NAME:end -->, indented like its begin marker. */
function region(html, name, lines, file) {
  const re = new RegExp(`^([ \\t]*)<!-- ${name}:begin -->\\n[\\s\\S]*?^[ \\t]*<!-- ${name}:end -->`, 'm');
  const m = html.match(re);
  if (!m) fail(`${file}: markers <!-- ${name}:begin --> / <!-- ${name}:end --> not found`);
  const pad = m[1];
  const body = [`<!-- ${name}:begin -->`, `<!-- plans:sha256=${sha} -->`, ...lines, `<!-- ${name}:end -->`]
    .map(l => pad + l).join('\n');
  return html.slice(0, m.index) + body + html.slice(m.index + m[0].length);
}

const targets = [{ file: indexPath, regions: [['plans-grid', renderGrid], ['plans-cards', renderCards], ['plans-table', renderTable]] }];
if (studioPath) targets.push({ file: studioPath, regions: [['plans', renderStudio]] });

let stale = 0;
for (const t of targets) {
  const before = readFileSync(t.file, 'utf8');
  let html = before;
  for (const [name, render] of t.regions) html = region(html, name, render(), t.file);
  if (html === before) { console.log(`${t.file}: up to date (plans.json sha256 ${sha.slice(0, 12)}…)`); continue; }
  if (check) { stale++; console.error(`${t.file}: differs from what plans.json renders — run node tools/render-plans.mjs${t === targets[0] ? '' : ' --studio <path>'}`); continue; }
  writeFileSync(t.file, html);
  console.log(`${t.file}: rendered (plans.json sha256 ${sha.slice(0, 12)}…)`);
}
if (stale) process.exit(1);
