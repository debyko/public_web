// /data/status/ — overall state and the counts it summarises from GET /v1/health, one row per
// venue expandable into one row per collector, and stale instruments grouped by venue. Refreshes
// on the shared meta cadence (30 s); this page mounts no live market table, so it starts only that
// cadence, never the snapshot fan-out.

import { createStore, normaliseHealth, scrubError } from '../api.js';
import { esc, fmt, age, icon } from '../format.js';
import { sourceTimeText, metaStateBlock, knownSegmentCodes } from './shared.js';

const store = createStore();

const kindOf = fails => (!fails ? 'live' : fails >= 5 ? 'stale' : 'delayed');
const collectorAge = c => (c.lastSuccessAgeSeconds != null ? Math.round(c.lastSuccessAgeSeconds) : null);
const errorText = c => (c.lastError
  ? (c.lastErrorAgeSeconds != null ? age(Math.round(c.lastErrorAgeSeconds)) + ' · ' : '') + scrubError(c.lastError)
  : null);

// ── Overall and counts ─────────────────────────────────────────────────────────────────────

function renderOverall(S) {
  const overallEl = document.getElementById('status-overall');
  const countsEl = document.getElementById('status-counts');
  const tagEl = document.getElementById('status-tag');

  if (!S.health || !S.cov) {
    overallEl.innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/health');
    countsEl.innerHTML = '';
    tagEl.textContent = S.metaLoaded ? 'No data' : 'Requesting';
    return;
  }

  tagEl.textContent = sourceTimeText(S.health, store.env);
  const known = knownSegmentCodes(S.cov.data);
  const collectors = (S.health.data.collectors || []).filter(c => known.has(c.segmentCode));
  const stale = (S.health.data.staleInstruments || []).filter(s => known.has(s.segmentCode));
  const venues = new Set(collectors.map(c => c.segmentCode)).size;
  const failing = collectors.filter(c => (c.consecutiveFailures || 0) > 0).length;

  const overall = String(S.health.data.status || '').toLowerCase() || 'unknown';
  overallEl.innerHTML = `<span class="ar-chip ${overall === 'ok' ? 'ar-chip--live' : 'ar-chip--delayed'}">${esc(overall)}</span>`;

  countsEl.innerHTML = `
    <div class="fact"><span class="fact__k">Venues reporting</span><span class="fact__v">${fmt(venues, 0)}</span></div>
    <div class="fact"><span class="fact__k">Collectors reporting</span><span class="fact__v">${fmt(collectors.length, 0)}</span></div>
    <div class="fact"><span class="fact__k">Collectors with consecutive failures</span><span class="fact__v">${fmt(failing, 0)}</span></div>
    <div class="fact"><span class="fact__k">Instruments stale</span><span class="fact__v">${fmt(stale.length, 0)}</span></div>`;
}

// ── Collectors, one venue row expanding into one row per collector ────────────────────────────

// The 30 s meta refresh rebuilds this table from scratch; without this, a row a reader opened
// to inspect a failing collector would silently snap shut under them on the next poll.
const expandedVenues = new Set();

function renderCollectors(S) {
  const tbody = document.getElementById('status-collector-rows');
  if (!S.health || !S.cov) { tbody.innerHTML = `<tr><td colspan="6" style="padding:0">${metaStateBlock(S.metaLoaded, 'GET /v1/health')}</td></tr>`; return; }

  const known = knownSegmentCodes(S.cov.data);
  const staleBy = new Map();
  for (const s of S.health.data.staleInstruments || []) {
    if (!known.has(s.segmentCode)) continue;
    staleBy.set(s.segmentCode, (staleBy.get(s.segmentCode) || 0) + 1);
  }
  const byVenue = new Map();
  for (const c of S.health.data.collectors || []) {
    if (!known.has(c.segmentCode)) continue;
    if (!byVenue.has(c.segmentCode)) byVenue.set(c.segmentCode, []);
    byVenue.get(c.segmentCode).push(c);
  }
  const venues = [...byVenue.entries()]
    .map(([code, cols]) => ({ code, cols: cols.slice().sort((a, b) => a.collector.localeCompare(b.collector)), fails: cols.reduce((w, c) => Math.max(w, c.consecutiveFailures || 0), 0) }))
    .sort((a, b) => b.fails - a.fails || a.code.localeCompare(b.code));

  if (!venues.length) { tbody.innerHTML = `<tr><td colspan="6" style="padding:0">${metaStateBlock(S.metaLoaded, 'GET /v1/health')}</td></tr>`; return; }

  tbody.innerHTML = venues.map(v => {
    const worstError = v.cols.filter(c => c.lastError).sort((a, b) => (a.lastErrorAgeSeconds ?? 1e12) - (b.lastErrorAgeSeconds ?? 1e12))[0];
    const lastSuccessAt = v.cols.map(c => c.lastSuccessAt).filter(Boolean).sort().pop() || null;
    const successAges = v.cols.map(c => c.lastSuccessAgeSeconds).filter(x => x != null);
    const lastSuccessAge = successAges.length ? Math.round(Math.min(...successAges)) : null;
    const stale = staleBy.get(v.code) || 0;

    const open = expandedVenues.has(v.code);
    const venueRow = `<tr>
      <td><button class="row-toggle" type="button" aria-expanded="${open}" data-venue="${esc(v.code)}">${icon('chevron-down', 14)}${esc(v.code.toUpperCase())}</button></td>
      <td><span class="ar-chip ar-chip--${kindOf(v.fails)}">${v.fails ? 'degraded' : 'Collecting'}</span></td>
      <td class="td-mono r">${lastSuccessAt ? age(lastSuccessAge) : '—'}</td>
      <td class="td-num ${v.fails ? 'is-alert' : ''}">${fmt(v.fails, 0)}</td>
      <td class="td-mono">${worstError ? esc(errorText(worstError)) : '—'}</td>
      <td class="td-num ${stale ? 'is-alert' : ''}">${fmt(stale, 0)}</td>
    </tr>`;

    const detailRows = v.cols.map(c => {
      const err = errorText(c);
      return `<tr class="is-detail" ${open ? '' : 'hidden'} data-venue="${esc(v.code)}">
        <td class="td-mono">${esc(c.collector)}</td>
        <td><span class="ar-chip ar-chip--${kindOf(c.consecutiveFailures || 0)}">${c.consecutiveFailures ? 'degraded' : 'Collecting'}</span></td>
        <td class="td-mono r">${c.lastSuccessAt ? age(collectorAge(c)) : '—'}</td>
        <td class="td-num ${c.consecutiveFailures ? 'is-alert' : ''}">${fmt(c.consecutiveFailures || 0, 0)}</td>
        <td class="td-mono">${err ? esc(err) : '—'}</td>
        <td class="td-num faint">—</td>
      </tr>`;
    }).join('');

    return venueRow + detailRows;
  }).join('');
}

document.getElementById('status-collector-rows').addEventListener('click', e => {
  const btn = e.target.closest('.row-toggle');
  if (!btn) return;
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  document.querySelectorAll('tr.is-detail[data-venue="' + btn.dataset.venue + '"]').forEach(tr => { tr.hidden = expanded; });
  if (expanded) expandedVenues.delete(btn.dataset.venue); else expandedVenues.add(btn.dataset.venue);
});

// ── Stale instruments ───────────────────────────────────────────────────────────────────────

function renderStale(S) {
  const el = document.getElementById('status-stale');
  if (!S.health || !S.cov) { el.innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/health'); return; }
  const known = knownSegmentCodes(S.cov.data);
  const stale = (S.health.data.staleInstruments || []).filter(s => known.has(s.segmentCode));
  if (!stale.length) { el.innerHTML = '<div class="meta">The response lists no stale instruments.</div>'; return; }

  const byVenue = new Map();
  for (const s of stale) {
    if (!byVenue.has(s.segmentCode)) byVenue.set(s.segmentCode, []);
    byVenue.get(s.segmentCode).push(s);
  }
  const venues = [...byVenue.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  el.innerHTML = venues.map(([code, symbols]) => `<div class="stack gap-6" style="margin-bottom:14px">
    <a class="hours__venue" href="../coverage/#${esc(code)}">${esc(code.toUpperCase())}</a>
    <div class="sym-list">${symbols.map(s => `<span>${esc(s.symbol)}<span class="age">${esc(age(s.ageSeconds != null ? Math.round(s.ageSeconds) : null))}</span></span>`).join('')}</div>
  </div>`).join('');
}

store.subscribe(S => { renderOverall(S); renderCollectors(S); renderStale(S); }, ['meta']);
renderOverall(store.state); renderCollectors(store.state); renderStale(store.state);
// No live market table on this page — start only the health/coverage cadence, never snapshots.
store.startMeta();
