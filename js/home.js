// Homepage wiring: navigation, dialogs, and the blocks fed by health and coverage.

import { createStore, normaliseCoverage, normaliseCoverageHours, normaliseHealth, leadMailto, LEAD_ADDRESS } from './api.js';
import { mountSlice, mountFull, mountArena, closeProvenance } from './live-market.js';
import { esc, fmt, age, utcTime, stateBlock } from './format.js';
import { sourceText, sourceTimeText, metaStateBlock, coverageTotalsLine, datasetChips, filterHealthToCoverage } from './pages/shared.js';

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
  dlg.querySelector('[data-part="submit"]').hidden = false;
  dlg.hidden = false;
  const first = dlg.querySelector('input, select, textarea');
  if (first) first.focus();
}
const closeDialogs = () => document.querySelectorAll('.dialog-scrim').forEach(d => { d.hidden = true; });

document.querySelectorAll('.dialog-scrim').forEach(scrim => {
  scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-close]')) closeDialogs(); });
  scrim.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.currentTarget;
    const href = leadMailto(scrim.id.replace('dialog-', ''), Object.fromEntries(new FormData(form)));
    // Hand the message to the reader's email app, then say plainly what happened and where it goes —
    // with the address as a link, for a browser that has no email app to open.
    window.location.href = href;
    scrim.querySelector('[data-part="form"]').hidden = true;
    scrim.querySelector('[data-part="submit"]').hidden = true;
    const out = scrim.querySelector('[data-part="result"]');
    out.textContent = '';
    out.append(out.dataset.success + ' If no email app opened, write to ');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = LEAD_ADDRESS;
    out.append(link, '.');
    out.hidden = false;
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

// ── Live market blocks ──────────────────────────────────────────────────────────────────────

mountSlice($('#live-slice'), store, () => scrollToId('proof'));
mountFull($('#live-full'), store);
mountArena($('#live-arena'), store);

// ── Studio Pro: catalogue, coverage hours, API snippet ──────────────────────────────────────

function renderCatalogue(S) {
  const rows = S.cov ? normaliseCoverage(S.cov.data) : [];
  $('#catalogue-tag').textContent = S.cov && rows.length ? sourceText(S.cov, store.env, 'perp venues · collected / listed') : 'No data';
  $('#catalogue-rows').innerHTML = rows.map(v => `<tr>
    <td class="td-venue">${esc(v.venue)}</td>
    <td style="padding:6px 10px"><div class="row gap-6" style="gap:4px">${datasetChips(v)}</div></td>
    <td class="td-num">${v.collected != null ? fmt(v.collected, 0) + (v.listed != null ? ' / ' + fmt(v.listed, 0) : '') : '—'}</td>
    <td class="td-mono r">${v.since ? esc(String(v.since).slice(0, 10)) : '—'}</td>
  </tr>`).join('');
  $('#catalogue-state').innerHTML = rows.length ? '' : `<div style="padding:14px">${metaStateBlock(S.metaLoaded, 'GET /v1/coverage')}</div>`;
  // The table lists the perp venues this page compares; the totals are every collecting venue, spot
  // included — which is why the two counts differ, and the response says both.
  const line = coverageTotalsLine(S.cov && S.cov.data && S.cov.data.totals);
  if (line) $('#catalogue-totals').textContent = line;
}

function renderHours(S) {
  const rows = S.covHours ? normaliseCoverageHours(S.covHours.data, 48) : null;
  $('#hours-tag').textContent = rows ? sourceText(S.covHours, store.env) : S.covHours ? 'Shape not recognised' : 'No data';
  if (!rows || !rows.length) { $('#hours-rows').innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/coverage/hours?days=7'); return; }
  // This strip covers every collecting venue, spot included — more than the perp venues in the tables above.
  $('#hours-scope').textContent = rows.length + ' collecting venues · perp and spot';
  $('#hours-rows').innerHTML = rows.map(v => {
    const cells = v.cells.map((h, i) => {
      const when = h.hour ? new Date(h.hour).toISOString().slice(5, 13).replace('T', ' ') + ':00 UTC' : '';
      let fill = 'transparent', stroke = 'var(--dk-border-strong)', tip;
      if (/not_collected/.test(h.state)) { fill = 'url(#hatch-hours)'; stroke = 'var(--dk-border-hairline)'; tip = when + ' · not_collected_yet'; }
      else if (/not_observed/.test(h.state)) { tip = when + ' · not_observed' + (h.cause ? ' · interruption: ' + h.cause : ' · no recorded interruption — cause unknown'); }
      else {
        const comp = h.completeness == null ? 1 : Math.max(0, Math.min(1, h.completeness));
        fill = 'rgba(5,7,12,' + (0.2 + 0.75 * comp).toFixed(2) + ')'; stroke = 'transparent';
        tip = when + ' · observed · completeness ' + Math.round(comp * 100) + '%' + (h.cause ? ' · interruption: ' + h.cause : '');
      }
      return `<rect x="${i * 10}" y="0" width="9" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(tip)}</title></rect>` +
        (h.cause && !/not_collected/.test(h.state) ? `<rect x="${i * 10 + 3}" y="-5" width="4" height="4" fill="#DE1A8C"/>` : '');
    }).join('');
    return `<div class="hours__row"><span class="hours__venue">${esc(v.code)}</span><svg class="hours__strip" viewBox="0 -6 480 20" preserveAspectRatio="none">${cells}</svg></div>`;
  }).join('');
}

function renderSnippet(S) {
  const t = S.live && S.live.targets.find(x => x.row && x.code === 'okx-perp') || S.live && S.live.targets.find(x => x.row);
  if (!t) return;
  const r = t.row;
  const pick = ['segmentCode', 'symbol', 'baseAsset', 'quoteAsset', 'bidPrice', 'askPrice', 'spreadBps', 'markPrice', 'indexPrice', 'fundingRate', 'fundingRatePredicted', 'openInterest', 'openInterestAt', 'depthBid25Bps', 'depthAsk25Bps', 'depthRef', 'depthAt', 'venueTs', 'receivedAt', 'ageSeconds'];
  const body = JSON.stringify(Object.fromEntries(pick.map(k => [k, r[k] ?? null])), null, 2);
  $('#api-snippet').textContent = `GET /v1/snapshot?exchange=${t.code}\n    &symbols=${t.inst.symbol}&include=quote,depth,instrument\n\n${body}`;
  $('#snippet-tag').textContent = 'values from the live response · ' + utcTime(S.live.at);
}

// ── Status ──────────────────────────────────────────────────────────────────────────────────

function renderStatus(S) {
  // /health also reports internal service segments (the rollup runs under one); only venues listed
  // by /coverage are shown, once that list is known.
  const H = S.health ? filterHealthToCoverage(normaliseHealth(S.health.data), S.cov && S.cov.data) : null;
  if (!H) {
    $('#status-table').hidden = true;
    $('#status-overall').hidden = true;
    $('#status-tag').textContent = 'No data';
    $('#status-state').innerHTML = `<div style="padding:14px">${!S.metaLoaded ? stateBlock('loading', 'Requesting GET /health', 'Nothing is shown until the service answers.') : S.health ? stateBlock('error', '/health answered but its shape did not match', 'Nothing is shown in its place.')
      : stateBlock('error', 'The status service did not answer and no saved response is on disk', 'Nothing is shown in its place.')}</div>`;
    return;
  }
  $('#status-state').innerHTML = '';
  $('#status-table').hidden = false;
  $('#status-overall').hidden = false;
  const overall = H.overall || 'unknown';
  $('#status-overall-word').textContent = overall;
  $('#status-overall-word').className = 'ar-chip ' + (overall === 'ok' ? 'ar-chip--live' : 'ar-chip--delayed');
  $('#status-tag').textContent = sourceTimeText(S.health, store.env);
  $('#status-rows').innerHTML = H.rows.map(r => {
    const kind = !r.fails ? 'live' : r.fails >= 5 ? 'stale' : 'delayed';
    return `<tr>
      <td class="td-venue">${esc(r.code)}</td>
      <td><span class="ar-chip ar-chip--${kind}">${r.fails ? 'degraded' : 'Collecting'}</span><span class="meta-xs status-note">${esc(r.note)}</span></td>
      <td class="td-mono r">${r.lastSuccessAt ? utcTime(r.lastSuccessAt).slice(0, 8) + ' · ' + age(r.lastSuccessAge) : '—'}</td>
      <td class="td-num ${r.fails ? 'is-alert' : ''}">${fmt(r.fails, 0)}</td>
      <td class="td-mono r muted wrap-cell">${r.lastError ? esc((r.lastErrorAge != null ? age(r.lastErrorAge) + ' · ' : '') + r.lastError) : '—'}</td>
      <td class="td-num ${r.stale ? 'is-alert' : ''}">${fmt(r.stale, 0)}</td>
      <td class="td-mono r">${r.lastSuccessAt ? utcTime(r.lastSuccessAt) : '—'}</td>
    </tr>`;
  }).join('');
}

store.subscribe(S => { renderCatalogue(S); renderHours(S); renderStatus(S); }, ['meta']);
store.subscribe(renderSnippet, ['snapshot']);
renderCatalogue(store.state); renderHours(store.state); renderStatus(store.state);
store.start();
