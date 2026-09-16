// /data/coverage/ — the totals line, the full venue catalogue (perp and spot, grouped by kind),
// the hour-by-hour coverage strip with a switchable range, and the interruptions the same
// response records.

import { createStore, normaliseCoverage, normaliseCoverageHours } from '../api.js';
import { esc, fmt, utcMinute } from '../format.js';
import { sourceText, metaStateBlock, coverageTotalsLine, datasetChips } from './shared.js';

const store = createStore();

const KIND_LABEL = { perp: 'Perpetual', spot: 'Spot', futures: 'Futures', option: 'Option', stock: 'Stock', synthetic: 'Synthetic' };
const KIND_ORDER = { perp: 0, futures: 1, option: 2, spot: 3 };
const kindRank = kind => (kind in KIND_ORDER ? KIND_ORDER[kind] : 9);

// ── Totals ──────────────────────────────────────────────────────────────────────────────────

function renderTotals(S) {
  const el = document.getElementById('coverage-totals');
  const line = coverageTotalsLine(S.cov && S.cov.data && S.cov.data.totals);
  if (line) { el.textContent = sourceText(S.cov, store.env) + ' · ' + line; return; }
  el.innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/coverage');
}

// ── Catalogue ───────────────────────────────────────────────────────────────────────────────

// The catalogue is empty at first paint, so the browser resolves the URL's #fragment against
// nothing and never scrolls or applies :target. Once the row the link named actually exists,
// re-assign the hash to make the browser redo that resolution — but only the first time the
// data arrives, or a reader mid-scroll would get yanked back on every 30 s refresh.
let hashLanded = !location.hash;

function renderCatalogue(S) {
  const tbody = document.getElementById('coverage-catalogue-rows');
  const rows = S.cov ? normaliseCoverage(S.cov.data, { allKinds: true }) : [];
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4" style="padding:0">${metaStateBlock(S.metaLoaded, 'GET /v1/coverage')}</td></tr>`; return; }
  rows.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name));

  const counts = {};
  for (const v of rows) counts[v.kind] = (counts[v.kind] || 0) + 1;

  let lastKind = null;
  const out = [];
  for (const v of rows) {
    if (v.kind !== lastKind) {
      lastKind = v.kind;
      out.push(`<tr class="group-row"><th colspan="4">${esc(KIND_LABEL[v.kind] || v.kind)} · ${counts[v.kind]}</th></tr>`);
    }
    const counted = [v.collected, v.trading, v.listed].map(n => (n != null ? fmt(n, 0) : '—')).join(' / ');
    out.push(`<tr id="${esc(v.code)}">
      <td style="padding:10px 14px"><span style="display:block;font:600 13px/1.3 var(--dk-font-display);letter-spacing:-.01em">${esc(v.name)}</span><span class="status-note">${esc(v.code)}</span></td>
      <td style="padding:10px"><div class="row gap-6" style="gap:4px">${datasetChips(v)}</div></td>
      <td class="td-num" style="padding-top:10px;padding-bottom:10px">${counted}</td>
      <td class="td-mono r" style="padding-top:10px;padding-bottom:10px">${v.since ? esc(String(v.since).slice(0, 10)) : '—'}</td>
    </tr>`);
  }
  tbody.innerHTML = out.join('');

  if (!hashLanded && document.getElementById(decodeURIComponent(location.hash.slice(1)))) {
    hashLanded = true;
    const h = location.hash;
    location.hash = '';
    location.hash = h;
  }
}

// ── Hour strip ──────────────────────────────────────────────────────────────────────────────

const CELL_W = 8; // px per hour cell — wide enough to scroll cleanly at 744 cells (31 d).

function cellTip(h) {
  const when = h.hour ? new Date(h.hour).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  if (/not_collected/.test(h.state)) return when + ' · not collected yet';
  if (/not_observed/.test(h.state)) return when + ' · not observed' + (h.cause ? ' · interruption: ' + h.cause : ' · no recorded interruption — cause unknown');
  const comp = h.completeness == null ? 1 : Math.max(0, Math.min(1, h.completeness));
  return when + ' · observed · completeness ' + Math.round(comp * 100) + '%' + (h.cause ? ' · interruption: ' + h.cause : '');
}

function renderHours(S) {
  const el = document.getElementById('coverage-hours');
  const fresh = S.covHours && S.covHours.forDays === S.covHoursDays;
  const rows = fresh ? normaliseCoverageHours(S.covHours.data, S.covHoursDays * 24) : null;
  if (!rows || !rows.length) { el.innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/coverage/hours?days=' + S.covHoursDays); return; }

  const cellCount = rows[0].cells.length;
  const width = cellCount * CELL_W;
  el.style.minWidth = (118 + 10 + width) + 'px';
  el.innerHTML = rows.map(v => {
    const cells = v.cells.map((h, i) => {
      let fill = 'transparent', stroke = 'var(--dk-border-strong)';
      if (/not_collected/.test(h.state)) { fill = 'url(#hatch-hours)'; stroke = 'var(--dk-border-hairline)'; }
      else if (!/not_observed/.test(h.state)) {
        const comp = h.completeness == null ? 1 : Math.max(0, Math.min(1, h.completeness));
        fill = 'rgba(5,7,12,' + (0.2 + 0.75 * comp).toFixed(2) + ')'; stroke = 'transparent';
      }
      const mark = h.cause && !/not_collected/.test(h.state) ? `<rect x="${i * CELL_W + CELL_W / 2 - 2}" y="-5" width="4" height="4" fill="#DE1A8C"/>` : '';
      return `<rect x="${i * CELL_W}" y="0" width="${CELL_W - 1}" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(cellTip(h))}</title></rect>${mark}`;
    }).join('');
    return `<div class="hours__row"><span class="hours__venue"><a href="#${esc(v.code.toLowerCase())}">${esc(v.code)}</a></span>` +
      `<svg class="hours__strip" viewBox="0 -6 ${width} 20" preserveAspectRatio="none" style="width:${width}px">${cells}</svg></div>`;
  }).join('');
  // The newest hours are the ones a reader came for, so the strip opens at its right edge. Once the
  // reader scrolls it themselves, a 30 s refresh leaves their position alone.
  const scroller = el.closest('.scroll-x');
  if (scroller) {
    if (!scroller.dataset.bound) {
      scroller.dataset.bound = '1';
      scroller.addEventListener('scroll', () => {
        if (!scroller.dataset.auto) scroller.dataset.touched = '1';
        delete scroller.dataset.auto;
      }, { passive: true });
    }
    if (scroller.dataset.days !== String(S.covHoursDays)) { scroller.dataset.days = String(S.covHoursDays); delete scroller.dataset.touched; }
    if (!scroller.dataset.touched) { scroller.dataset.auto = '1'; scroller.scrollLeft = scroller.scrollWidth; }
  }
}

// ── Interruptions ───────────────────────────────────────────────────────────────────────────

// The service records an interruption per failed pass, so a rate-limited venue produces thousands
// of records a week, each a few seconds long. Listed one by one they bury the reader; merged into
// episodes — same venue, collector and cause, next record starting within MERGE_MS of the previous
// one ending — they say what happened. Each episode keeps its record count, so nothing is hidden.
const MERGE_MS = 15 * 60 * 1000;
const ms = iso => (iso ? Date.parse(iso) : NaN);

function episodes(gaps, now) {
  const sorted = gaps.slice().sort((a, b) =>
    String(a.segment).localeCompare(String(b.segment)) || String(a.collector).localeCompare(String(b.collector))
    || String(a.cause || '').localeCompare(String(b.cause || '')) || ms(a.start) - ms(b.start));
  const out = [];
  let cur = null;
  for (const g of sorted) {
    const s = ms(g.start), e = g.end ? ms(g.end) : null;
    const same = cur && cur.segment === g.segment && cur.collector === g.collector && (cur.cause || '') === (g.cause || '');
    if (same && cur.end !== null && s - cur.end <= MERGE_MS) {
      cur.count++;
      cur.end = e === null ? null : Math.max(cur.end, e);
    } else if (same && cur.end === null) {
      cur.count++;
    } else {
      cur = { segment: g.segment, collector: g.collector, cause: g.cause, start: s, end: e, count: 1 };
      out.push(cur);
    }
  }
  return out.sort((a, b) => (b.end === null ? now : b.end) - (a.end === null ? now : a.end) || b.start - a.start);
}

const span = (a, b) => {
  const m = Math.max(0, Math.round((b - a) / 60000));
  return m < 1 ? '< 1 min' : m < 120 ? m + ' min' : (m / 60).toFixed(1) + ' h';
};

function renderInterruptions(S) {
  const el = document.getElementById('coverage-interruptions');
  const fresh = S.covHours && S.covHours.forDays === S.covHoursDays;
  if (!fresh) { el.innerHTML = metaStateBlock(S.metaLoaded, 'GET /v1/coverage/hours?days=' + S.covHoursDays); return; }
  const data = S.covHours.data;
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  if (!gaps.length) { el.innerHTML = '<div class="meta" style="padding:14px">No interruption was recorded in this range.</div>'; return; }
  const now = Date.now();
  const list = episodes(gaps, now);
  // The service caps one response at a fixed number of records and drops the oldest. Say where the
  // list therefore starts, in the reader's terms, instead of relaying the API's advice to callers.
  const cut = (data.warnings || []).some(w => /cut|truncat/i.test(String(w)));
  const oldest = Math.min(...gaps.map(g => ms(g.start)).filter(Number.isFinite));
  const head = `${fmt(gaps.length, 0)} records in ${fmt(list.length, 0)} episodes` +
    (cut ? ` · the service returns at most ${fmt(gaps.length, 0)} records, so older interruptions in this range are not listed; the list starts ${esc(utcMinute(new Date(oldest).toISOString()))}` : '');
  el.innerHTML = `<div class="meta" style="padding:8px 14px;border-bottom:1px solid var(--dk-border-hairline)">${head}</div>` +
    `<div class="scroll-x scroll-x--tall"><table class="tbl tbl--roomy min-640">
      <thead><tr><th class="l">Venue</th><th>Collector</th><th>Start</th><th>End</th><th class="r">Length</th><th class="r">Records</th><th>Cause</th></tr></thead>
      <tbody>${list.map(g => `<tr>
        <td class="td-venue"><a href="#${esc(String(g.segment || ''))}">${esc(String(g.segment || '').toUpperCase())}</a></td>
        <td class="td-mono">${esc(g.collector || '—')}</td>
        <td class="td-mono r">${esc(utcMinute(new Date(g.start).toISOString()))}</td>
        <td class="td-mono r">${g.end === null ? 'ongoing' : esc(utcMinute(new Date(g.end).toISOString()))}</td>
        <td class="td-num">${span(g.start, g.end === null ? now : g.end)}</td>
        <td class="td-num">${fmt(g.count, 0)}</td>
        <td class="td-mono">${g.cause ? esc(String(g.cause).replace(/_/g, ' ')) : 'not recorded'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

// ── Range switch ────────────────────────────────────────────────────────────────────────────

document.getElementById('coverage-hours-range').addEventListener('click', e => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  const days = Number(b.dataset.days);
  document.querySelectorAll('#coverage-hours-range [data-days]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  store.setHoursDays(days);
});

store.subscribe(S => { renderTotals(S); renderCatalogue(S); renderHours(S); renderInterruptions(S); }, ['meta']);
renderTotals(store.state); renderCatalogue(store.state); renderHours(store.state); renderInterruptions(store.state);
// No live market table on this page — only the health/coverage cadence, not the snapshot fan-out.
store.startMeta();
