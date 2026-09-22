// Homepage wiring: navigation, dialogs, the hero's live slice, the API snippet and the status line.
// Everything else live lives on its own page — /arena/, /data/coverage/, /data/status/.

import { createStore, normaliseCoverage, normaliseHealth, submitLead, LEAD_ADDRESS } from './api.js';
import { mountSlice, closeProvenance } from './live-market.js';
import { fmt, utcTime } from './format.js';
import { filterHealthToCoverage } from './pages/shared.js';

const store = createStore();
const $ = sel => document.querySelector(sel);
const HEADER_OFFSET = 56;

const scrollToId = id => {
  const target = document.getElementById(id);
  if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: 'smooth' });
};

// ── Navigation ──────────────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav__item').forEach(item => {
  const menu = item.querySelector('.nav__menu');
  if (!menu) return;
  const open = () => { menu.hidden = false; item.querySelector('.nav__trigger').setAttribute('aria-expanded', 'true'); };
  const close = () => { menu.hidden = true; item.querySelector('.nav__trigger').setAttribute('aria-expanded', 'false'); };
  item.addEventListener('mouseenter', open);
  item.addEventListener('mouseleave', close);
  item.querySelector('.nav__trigger').addEventListener('click', () => (menu.hidden ? open() : close()));
});

$('.menu-btn').addEventListener('click', () => {
  const nav = $('.mobile-nav');
  nav.hidden = !nav.hidden;
  $('.menu-btn').setAttribute('aria-expanded', String(!nav.hidden));
});

document.addEventListener('click', e => {
  const scroll = e.target.closest('[data-scroll]');
  if (scroll) { e.preventDefault(); $('.mobile-nav').hidden = true; scrollToId(scroll.dataset.scroll); }
  const opener = e.target.closest('[data-open]');
  if (opener) { e.preventDefault(); openDialog(opener.dataset.open); }
});

// ── Dialogs ─────────────────────────────────────────────────────────────────────────────────

function openDialog(name) {
  const dlg = document.getElementById('dialog-' + name);
  if (!dlg) return;
  dlg.querySelector('[data-part="form"]').hidden = false;
  dlg.querySelector('[data-part="result"]').hidden = true;
  dlg.querySelector('[data-part="error"]').hidden = true;
  dlg.querySelector('[data-part="submit"]').hidden = false;
  dlg.hidden = false;
  const first = dlg.querySelector('input, select, textarea');
  if (first) first.focus();
}
const closeDialogs = () => document.querySelectorAll('.dialog-scrim').forEach(d => { d.hidden = true; });

document.querySelectorAll('.dialog-scrim').forEach(scrim => {
  scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-close]')) closeDialogs(); });
  scrim.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    const button = scrim.querySelector('[data-part="submit"]');
    const label = button.querySelector('span');
    const idle = label.textContent;
    const error = scrim.querySelector('[data-part="error"]');
    error.hidden = true;
    button.disabled = true;
    label.textContent = 'Sending…';
    const sales = scrim.id === 'dialog-sales';
    const result = await submitLead({
      kind: sales ? 'sales' : 'waitlist',
      engagement: sales ? f.engagement : undefined,
      product: sales ? undefined : f.product,
      organisation: f.organisation || '',
      email: f.email || '',
      message: f.scope || '',
      website: f.website || ''
    });
    button.disabled = false;
    label.textContent = idle;
    if (result.ok) {
      scrim.querySelector('[data-part="form"]').hidden = true;
      button.hidden = true;
      const out = scrim.querySelector('[data-part="result"]');
      out.textContent = out.dataset.success;
      out.hidden = false;
      return;
    }
    // A reason the reader can act on keeps the form open; anything else points to the mailbox.
    error.textContent = '';
    if ((result.status === 400 || result.status === 429) && result.reason) {
      error.textContent = result.reason;
    } else {
      const link = document.createElement('a');
      link.href = 'mailto:' + LEAD_ADDRESS;
      link.textContent = LEAD_ADDRESS;
      error.append('Could not send — write to ', link, '.');
    }
    error.hidden = false;
  });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeDialogs();
  closeProvenance();
  document.querySelectorAll('.nav__menu').forEach(m => { m.hidden = true; });
});

// The data pages' header and footer link "Contact sales" and "Join the waitlist" here, at
// ?open=sales / ?open=wait, because the dialogs live only in this document.
const openOnLoad = new URLSearchParams(location.search).get('open');
if (openOnLoad === 'sales' || openOnLoad === 'wait') openDialog(openOnLoad);

// ── Live market slice ───────────────────────────────────────────────────────────────────────

// The full comparison is Arena's; the slice's own link leads there rather than down the page.
mountSlice($('#live-slice'), store, () => { location.href = '/arena/'; });
$('#live-slice [data-slot="more"]').textContent = 'Full comparison →';

// ── For bot builders: the curl on the page, run live ────────────────────────────────────────

// The command shown is the request made: same URL, no key, production.
(async () => {
  const out = $('#curl-out'), tag = $('#curl-tag');
  if (!out) return;
  const url = $('#curl-live').textContent.match(/"(.+)"/)[1];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const t = (d.tickers || [])[0];
    if (!t) throw new Error('no ticker in the response');
    const pick = ['segmentCode', 'symbol', 'quoteAsset', 'bidPrice', 'askPrice', 'markPrice', 'fundingRate', 'openInterest', 'openInterestAt', 'depthAt', 'venueTs', 'receivedAt', 'ageSeconds'];
    out.textContent = JSON.stringify({ asOf: d.asOf, exchange: d.exchange, tickers: [Object.fromEntries(pick.map(k => [k, t[k] ?? null]))] }, null, 2);
    tag.textContent = 'live · fetched ' + utcTime(new Date().toISOString()) + ' · trimmed to 13 of its fields';
  } catch (err) {
    out.textContent = 'The request failed (' + err.message + '). Nothing is shown in its place.';
    tag.textContent = 'no response';
  }
})();

document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById(btn.dataset.copy).textContent); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Select and copy'; }
}));

// ── Studio Pro: API snippet ─────────────────────────────────────────────────────────────────

function renderSnippet(S) {
  const t = S.live && S.live.targets.find(x => x.row && x.code === 'okx-perp') || S.live && S.live.targets.find(x => x.row);
  if (!t) return;
  const r = t.row;
  const pick = ['segmentCode', 'symbol', 'baseAsset', 'quoteAsset', 'bidPrice', 'askPrice', 'spreadBps', 'markPrice', 'indexPrice', 'fundingRate', 'fundingRatePredicted', 'openInterest', 'openInterestAt', 'depthBid25Bps', 'depthAsk25Bps', 'depthRef', 'depthAt', 'venueTs', 'receivedAt', 'ageSeconds'];
  const body = JSON.stringify(Object.fromEntries(pick.map(k => [k, r[k] ?? null])), null, 2);
  $('#api-snippet').textContent = `GET /v1/snapshot?exchange=${t.code}\n    &symbols=${t.inst.symbol}&include=quote,depth,instrument\n\n${body}`;
  $('#snippet-tag').textContent = 'values from the live response · ' + utcTime(S.live.at);
}

// ── Status line ─────────────────────────────────────────────────────────────────────────────

// One line from /health, filtered to the venues /coverage lists. The per-collector table is
// /data/status/'s; here the claim keeps a live number so it cannot go stale silently.
function renderStatus(S) {
  const H = S.health ? filterHealthToCoverage(normaliseHealth(S.health.data), S.cov && S.cov.data) : null;
  const line = $('#status-line');
  if (!H) {
    line.textContent = !S.metaLoaded ? 'Requesting' : S.health ? '/health answered in an unrecognised shape · nothing shown' : '/health did not answer · nothing shown';
    return;
  }
  const degraded = H.rows.filter(r => r.fails).length;
  line.textContent = (S.health.src === 'live' ? '' : 'Saved · ') + fmt(H.rows.length - degraded, 0) + ' venues collecting · '
    + fmt(degraded, 0) + (degraded === 1 ? ' collector' : ' collectors') + ' degraded · updated ' + utcTime(S.health.at).slice(0, 5) + ' UTC';
}

// The venue count in the DQL list comes from /coverage (perp venues), never typed.
function renderDqlVenues(S) {
  const rows = S.cov ? normaliseCoverage(S.cov.data) : [];
  if (rows.length) $('#dql-venues').textContent = fmt(rows.length, 0) + ' perpetual venues collected today,';
}

store.subscribe(renderStatus, ['meta']);
store.subscribe(renderDqlVenues, ['meta']);
store.subscribe(renderSnippet, ['snapshot']);
renderStatus(store.state);
renderDqlVenues(store.state);
store.start();
