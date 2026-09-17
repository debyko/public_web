// The live market blocks: hero slice, full comparison (chart + table) and the Arena table.
// Every figure is a button that opens its provenance: venue, instrument, clocks, age, method.

import { esc, fmt, age, utcTime, utcMinute, icon, stateBlock } from './format.js';
import { UNSUP, NOTCOL, METRICS, RANGES, normalise, loadSeries } from './api.js';
import { createArenaChart } from './arena-chart.js';

const RANK = { LIVE: 0, DELAYED: 1, STALE: 2, MISSING: 3 };
const STROKES = [
  { stroke: '#DE1A8C', dash: '' }, { stroke: '#05070C', dash: '' }, { stroke: '#5A6172', dash: '' }, { stroke: '#8A8E98', dash: '' },
  { stroke: '#05070C', dash: '4 3' }, { stroke: '#5A6172', dash: '4 3' }, { stroke: '#8A8E98', dash: '4 3' }
];
/** The status-layer chip class for a state: NOT_COLLECTED → ar-chip--notcollected. */
/** The same seven line styles for the Arena chart, as theme tokens rather than hex, so the lines
 *  follow a dark theme. Order matches STROKES. */
const ARENA_STYLES = [
  { color: 'accent', dash: false }, { color: 'ink', dash: false }, { color: 'muted', dash: false }, { color: 'faint', dash: false },
  { color: 'ink', dash: true }, { color: 'muted', dash: true }, { color: 'faint', dash: true }
];
const STYLE_VAR = { accent: 'var(--dk-accent)', ink: 'var(--dk-text-primary)', muted: 'var(--dk-text-muted)', faint: 'var(--dk-text-faint)' };

/** In-row sparkline: 72 × 20, one 1px neutral stroke, no axis, label or fill. x follows time, so a
 *  gap is empty space, and a step over three times the usual one breaks the line. Fewer than two
 *  points is an empty cell — never a flat line. */
function sparkSvg(points) {
  if (!points || points.length < 2) return '';
  const t0 = points[0].t, t1 = points[points.length - 1].t, span = t1 - t0 || 1;
  const vals = points.map(p => p.v), lo = Math.min(...vals), hi = Math.max(...vals), vs = hi - lo || 1;
  const steps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  const usual = steps[Math.floor(steps.length / 2)] || Infinity;
  const d = points.map((p, i) => ((i === 0 || p.t - points[i - 1].t > usual * 3) ? 'M' : 'L') +
    ((p.t - t0) / span * 72).toFixed(1) + ' ' + (19.5 - (p.v - lo) / vs * 19).toFixed(1)).join(' ');
  return `<svg class="ar-spark" width="72" height="20" viewBox="0 0 72 20" aria-hidden="true"><path d="${d}"/></svg>`;
}

const kindClass = kind => 'ar-chip ar-chip--' + kind.toLowerCase().replace(/_/g, '');
/** The word a chip prints: NOT_COLLECTED reads as two words. */
const kindWord = kind => kind.replace(/_/g, ' ');
/** States that describe what exists, not how fresh it is — they never set a row's status. */
const NOT_FRESHNESS = new Set(['UNSUPPORTED', 'NOT_COLLECTED']);

// The shareable URL spells metric and range as short lowercase slugs (?metric=funding&range=24h),
// not the internal METRICS/RANGES keys, which are the display labels ("Funding", "24 h") — a
// label with a space is an ugly, easy-to-mistype query value. One map serves both directions.
const METRIC_SLUGS = { trade: 'Trade price', mark: 'Mark', index: 'Index', spread: 'Spread', funding: 'Funding', oi: 'Open interest', depth: 'Depth' };
const RANGE_SLUGS = { '1h': '1 h', '24h': '24 h', '7d': '7 d', '30d': '30 d' };
const METRIC_TO_SLUG = Object.fromEntries(Object.entries(METRIC_SLUGS).map(([slug, key]) => [key, slug]));
const RANGE_TO_SLUG = Object.fromEntries(Object.entries(RANGE_SLUGS).map(([slug, key]) => [key, slug]));

// ── Rows and cells ──────────────────────────────────────────────────────────────────────────

/** A provenance registry per render: cells carry an index, a click looks the lines up. */
function createRegistry() {
  const items = [];
  return { add: entry => items.push(entry) - 1, get: i => items[i] };
}

function cell(reg, r, key, val, unit, group, opts = {}) {
  const kind = val === UNSUP ? 'UNSUPPORTED' : val === NOTCOL ? 'NOT_COLLECTED' : val == null ? 'MISSING' : r.st[group];
  const empty = kind === 'UNSUPPORTED' || kind === 'MISSING' || kind === 'NOT_COLLECTED';
  const ag = r.ag[group];
  const received = group === 't' ? r.rt : group === 'o' ? r.rto : r.rtd;
  const lines = [
    { k: 'Venue', v: r.venue },
    { k: 'Venue instrument', v: r.sym + ' · ' + r.model },
    { k: 'Venue timestamp', v: r.vt ? r.vt + ' UTC' : 'venue sends none' },
    { k: 'Received', v: received ? received + ' UTC' : '—' },
    { k: 'Age', v: age(ag) },
    { k: 'Status', v: kindWord(kind) + (NOT_FRESHNESS.has(kind) ? '' : ' · provisional threshold for this call group') }
  ];
  if (opts.formula) lines.push({ k: 'Derived', v: opts.formula });
  if (kind === 'MISSING') lines.push({ k: 'Note', v: 'This snapshot carries no value for the field. Shown as empty, not as zero.' });
  if (kind === 'NOT_COLLECTED') lines.push({ k: 'Note', v: 'This service does not collect the order book on this venue — GET /v1/coverage lists no depth dataset for it. Not a freshness problem, and not a statement that the venue has no book.' });
  if (kind === 'UNSUPPORTED') lines.push({ k: 'Note', v: r.model === 'oracle_vault' ? 'Oracle/vault market: no order book, so bid, ask, spread and depth are not published.' : 'The venue publishes no such field.' });
  const prov = reg.add({ title: key, lines });
  return {
    kind, prov, lines, hatch: kind === 'UNSUPPORTED',
    text: opts.chip ? (NOT_FRESHNESS.has(kind) ? '—' : age(ag)) : empty ? '—' : (typeof val === 'number' ? fmt(val, opts.decimals ?? 8) : val),
    unit: empty ? '' : unit,
    state: kind === 'STALE' ? 'is-stale' : empty ? 'is-empty' : ''
  };
}

/** @param {{ limit?: number, byQuote?: boolean }} opts limit: only the first n venues are kept, and
 *  ranked among themselves — a preview's marks are about the rows it shows. byQuote: rank inside each
 *  quote-currency group, as the grouped table shows them. */
function buildRows(targets, now, reg, { limit = Infinity, byQuote = false } = {}) {
  const rows = targets.map(t => normalise(t, now)).filter(r => r.venue).map(r => {
    const mid = typeof r.bid === 'number' && typeof r.ask === 'number' ? (r.bid + r.ask) / 2 : null;
    const spreadVal = mid ? (r.ask - r.bid) / mid * 1e4 : r.bid === UNSUP ? UNSUP : null;
    const quote = r.quote || '';
    const depth = r.db === UNSUP ? UNSUP : r.db === NOTCOL ? NOTCOL : r.db == null || r.da == null ? null : compact(r.db) + ' / ' + compact(r.da);
    const oiInBase = r.mult === 1;
    const fund = cell(reg, r, 'Funding', r.fund, '%', 't', { decimals: 4 });
    if (fund.unit) fund.unit = '% / ' + (r.fint != null ? r.fint + ' h' : '— h');

    const c = {
      bid: cell(reg, r, 'Bid', r.bid, quote, 't', { decimals: r.pdec }),
      ask: cell(reg, r, 'Ask', r.ask, quote, 't', { decimals: r.pdec }),
      spread: cell(reg, r, 'Spread', spreadVal, 'bps', 't', { decimals: 2, formula: typeof spreadVal === 'number' ? 'spread = (ask − bid) / mid × 10,000 · inputs: bid ' + fmt(r.bid, 2) + ', ask ' + fmt(r.ask, 2) : null }),
      mark: cell(reg, r, 'Mark', r.mark, quote, 't', { decimals: r.pdec }),
      index: cell(reg, r, 'Index', r.index, quote, 't', { decimals: r.pdec }),
      fund,
      oi: cell(reg, r, 'Open interest', r.oi, oiInBase ? r.base : 'contracts', 'o', {
        decimals: oiInBase ? 3 : 0,
        formula: 'openInterestNotional = ' + (r.oiNotional != null ? fmt(r.oiNotional, 0) + ' ' + quote : '—') + (r.mult != null ? ' · contract multiplier ×' + r.mult : ' · contract multiplier not published')
      }),
      depth: cell(reg, r, 'Depth', depth, quote, 'd', { formula: 'quote notional resting within ±25 bps of depthRef ' + (r.depthRef != null ? fmt(r.depthRef, 2) : '—') + ' · bid ' + (typeof r.db === 'number' ? fmt(r.db, 0) : '—') + ' / ask ' + (typeof r.da === 'number' ? fmt(r.da, 0) : '—') }),
      venueTime: cell(reg, r, 'Venue time', r.vt, '', 't'),
      received: cell(reg, r, 'Received', r.rt, '', 't'),
      ageT: cell(reg, r, 'Age · ticker', 1, '', 't', { chip: true }),
      ageO: cell(reg, r, 'Age · open interest', 1, '', 'o', { chip: true }),
      ageD: cell(reg, r, 'Age · depth', r.model === 'oracle_vault' ? UNSUP : r.st.d === 'NOT_COLLECTED' ? NOTCOL : r.ag.d == null ? null : 1, '', 'd', { chip: true })
    };
    // A field the venue does not publish, or one this service does not collect there, is not a
    // freshness problem, so neither UNSUPPORTED nor NOT_COLLECTED ever sets the row status.
    const worst = [c.ageT, c.ageO, c.ageD].map(x => x.kind).filter(k => !NOT_FRESHNESS.has(k)).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'LIVE');
    c.status = { kind: worst, prov: reg.add({ title: 'Status', lines: [{ k: 'Venue', v: r.venue }, { k: 'Status', v: worst + ' · the worst of the three call groups in this row' }] }) };
    return { r, c, spreadVal };
  });
  const kept = rows.slice(0, limit);
  alignDecimals(kept);
  if (byQuote) groupByQuote(kept).forEach(g => rank(g.rows, g.quote));
  else rank(kept.filter(x => USD_LIKE.test(x.r.quote)), null);
  // Rows outside any ranking still say why.
  for (const x of kept) for (const col of RANKED) if (!x.c[col.key].lines.some(l => l.k === 'Rank')) x.c[col.key].lines.push({ k: 'Rank', v: 'not ranked · quoted in ' + (x.r.quote || 'an unknown currency') + ', not USD, USDT or USDC' });
  return kept;
}

/** 18,966,819 → 18.97M: depth is read as an order of magnitude; the exact figure is in the provenance. */
const compact = n => (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(2) + 'K' : fmt(n, 0));

/** Venues quote with different steps (79,283.2 beside 79,283). Short fractions are padded with blanks the
 *  width of a digit — the figures are monospaced — so the decimal points stand in one column. No zeros
 *  are added: a zero would claim a precision the venue did not publish. */
function alignDecimals(rows) {
  const FIG = '\u2007';
  for (const key of ['bid', 'ask', 'mark', 'index']) {
    const decimalsOf = text => (/\.(\d+)$/.exec(text) || [, ''])[1].length;
    const numeric = rows.map(x => x.c[key]).filter(c => c.state !== 'is-empty' && /\d/.test(c.text));
    const widest = Math.max(0, ...numeric.map(c => decimalsOf(c.text)));
    for (const c of numeric) {
      const d = decimalsOf(c.text);
      c.text += FIG.repeat(widest - d + (d === 0 && widest > 0 ? 1 : 0));
    }
  }
}

// ── Quote groups ────────────────────────────────────────────────────────────────────────────

/** The order quote currencies are listed in: the common ones first, the rest alphabetically. */
const QUOTE_ORDER = ['USDT', 'USDC', 'USD'];
const quoteRank = q => (QUOTE_ORDER.indexOf(q) >= 0 ? QUOTE_ORDER.indexOf(q) : QUOTE_ORDER.length);

/** Rows grouped by quote currency, venues alphabetical inside a group — so a column's BEST and WORST
 *  can be read against the currency each venue actually quotes in. Ranking itself still treats every
 *  USD-denominated quote as one currency (see rank()). */
function groupByQuote(rows) {
  const sorted = rows.slice().sort((a, b) =>
    quoteRank(a.r.quote) - quoteRank(b.r.quote)
    || String(a.r.quote).localeCompare(String(b.r.quote))
    || a.r.venue.localeCompare(b.r.venue));
  const groups = [];
  for (const x of sorted) {
    const q = x.r.quote || '—';
    if (!groups.length || groups[groups.length - 1].quote !== q) groups.push({ quote: q, rows: [] });
    groups[groups.length - 1].rows.push(x);
  }
  return groups;
}

// ── BEST / WORST ────────────────────────────────────────────────────────────────────────────

/** The columns where "better" has one meaning: a higher bid, a lower ask, a narrower spread, more depth. */
const RANKED = [
  { key: 'bid', word: 'bid', value: x => x.r.bid, better: 'max' },
  { key: 'ask', word: 'ask', value: x => x.r.ask, better: 'min' },
  // Compared as computed, not as printed: two venues one tick apart at 0.013 bps both print 0.01, and
  // rounding first handed BEST to every one of them.
  { key: 'spread', word: 'spread', value: x => (typeof x.spreadVal === 'number' ? x.spreadVal : null), better: 'min' },
  { key: 'depth', word: 'depth', value: x => (typeof x.r.db === 'number' && typeof x.r.da === 'number' ? x.r.db + x.r.da : null), better: 'max' }
];
/** The ungrouped previews compare USD, USDT and USDC (and USDT0) as one currency; the grouped table
 *  ranks inside each quote group. */
const USD_LIKE = /^USD/;
/** Only LIVE values are ranked. DELAYED ones were tried and dropped: a quote 20 s old sits away from
 *  the market and kept winning "best ask" precisely because it was old. The marks move between venues
 *  as tickers cross the threshold — that is the honest reading. */
const RANKABLE = new Set(['LIVE']);

/** @param rows the venues compared with each other  @param quote their shared quote currency, or null
 *  for the USD-like previews. Every group of two or more eligible venues with differing values gets
 *  its own BEST and WORST. */
function rank(rows, quote) {
  for (const col of RANKED) {
    const why = x => {
      const cellKind = x.c[col.key].kind;
      if (x.r.model !== 'orderbook') return 'oracle/vault market, not an order book';
      if (!RANKABLE.has(cellKind)) return 'value is ' + kindWord(cellKind).toLowerCase();
      if (typeof col.value(x) !== 'number') return 'no value in this snapshot';
      return null;
    };
    const eligible = rows.filter(x => !why(x));
    const values = eligible.map(col.value);
    const hi = Math.max(...values), lo = Math.min(...values);
    const bestValue = col.better === 'max' ? hi : lo, worstValue = col.better === 'max' ? lo : hi;
    // Every venue holding the best (or worst) value carries the mark; the count and the tooltip say
    // who shares it. A tie of everything is not a ranking, so hi === lo shows nothing at all.
    const scope = quote ? 'quoted in ' + quote : 'in this preview · USD, USDT and USDC compared as one';
    const holders = { best: eligible.filter(x => col.value(x) === bestValue), worst: eligible.filter(x => col.value(x) === worstValue) };
    for (const x of rows) {
      const cell = x.c[col.key], reason = why(x);
      if (reason) { cell.lines.push({ k: 'Rank', v: 'not ranked · ' + reason }); continue; }
      if (eligible.length < 2 || hi === lo) { cell.lines.push({ k: 'Rank', v: 'not ranked · fewer than two different values to compare ' + scope }); continue; }
      const v = col.value(x);
      cell.rank = v === bestValue ? 'best' : v === worstValue ? 'worst' : null;
      let shared = '';
      if (cell.rank && holders[cell.rank].length > 1) {
        const others = holders[cell.rank].filter(o => o !== x).map(o => o.r.venue);
        cell.tie = holders[cell.rank].length;
        cell.tip = (cell.rank === 'best' ? 'Best ' : 'Worst ') + col.word + ' shared with ' + listWords(others) + ' at ' + cell.text.trim() + (cell.unit ? ' ' + cell.unit : '');
        shared = ' · shared with ' + listWords(others);
      }
      cell.lines.push({ k: 'Rank', v: (cell.rank ? cell.rank.toUpperCase() + shared + ' · ' : '') + 'among ' + eligible.length + ' order-book venues ' + scope });
    }
  }
}

/** "OKX", "OKX and BYBIT-PERP", "OKX, BYBIT-PERP and GATE-PERP". */
const listWords = names => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);

/** The mark always takes the same room, present or not, so a mark coming or going moves nothing
 *  (a tie's count is the one exception: BEST ×2 is wider than the 56px slot). */
// Bid and ask share one cell, so their marks name the side: "Best bid" over "Worst ask" reads as two
// facts, "Best" over "Worst" read as a contradiction.
const SIDE_WORD = { bid: ' bid', ask: ' ask' };
const rankSlot = (x, col) => `<span class="ar-rank-slot${SIDE_WORD[col] ? ' ar-rank-slot--side' : ''}">${x.rank
  ? `<span class="ar-chip ar-chip--${x.tie && x.rank === 'best' ? 'tie' : x.rank}"${x.tip ? ` data-tip="${esc(x.tip)}"` : ''}>${x.rank === 'best' ? 'Best' : 'Worst'}${SIDE_WORD[col] || ''}${x.tie ? `<span class="ar-chip__x">×${x.tie}</span>` : ''}</span>`
  : ''}</span>`;

// ── Cell markup ─────────────────────────────────────────────────────────────────────────────

/** Two figures of one question in one cell, one above the other (bid over ask, mark over index). */
const pair = (c, top, bottom, ranked) => `<td class="${c[top].hatch ? 'dk-hatch' : ''}"><div class="fig-pair">${figure(c[top], top, ranked)}${figure(c[bottom], bottom, ranked)}</div></td>`;

/** Units get a fixed width per column (USD, USDT, USDT0 …), so the digits line up instead of waving. */
const UNIT_WIDTH = { bid: 'u5', ask: 'u5', mark: 'u5', index: 'u5', spread: 'u3', fund: 'u7', oi: 'u9' };
const figure = (x, col, ranked = false) => `<button class="fig ${x.state}" data-prov="${x.prov}">${esc(x.text)}<span class="fig__unit ${UNIT_WIDTH[col] || ''}">${esc(x.unit)}</span>${ranked ? rankSlot(x, col) : ''}</button>`;
const td = (x, inner) => `<td class="${x.hatch ? 'dk-hatch' : ''}">${inner}</td>`;
const freshChip = (x, value) => `<span class="${kindClass(x.kind)}"><span class="ar-chip__val">${esc(value)}</span>${kindWord(x.kind)}</span>`;
const chipCell = x => `<button class="fig fig--chip" data-prov="${x.prov}">${freshChip(x, x.text)}</button>`;
/** Age chips carry label and value only; the state is told by the chip's form (and named in the title). */
const smallChip = (x, lbl) => `<button class="${kindClass(x.kind)}" data-prov="${x.prov}" title="${kindWord(x.kind)}"><span class="ar-chip__lbl">${lbl}</span><span class="ar-chip__val">${esc(x.text)}</span></button>`;

/** Venues with a square mark in assets/venues (see SOURCES.md there). Lockups with no separable
 *  symbol — Bybit, Coinbase, dYdX, OKX, Synthetix — and Nado, which has no asset, get the name only. */
const VENUE_MARKS = new Set(['aster', 'avantis', 'binance', 'bitget', 'deribit', 'gate', 'gmx', 'hyperliquid', 'kraken', 'mexc', 'weex']);
// The table re-renders every second; an <img> recreated each time flickers while it reloads. Each mark
// is fetched once and inlined as SVG, which paints with the row. Until it arrives the slot is empty
// (same 18px, so nothing moves) and the next render fills it.
const markSvg = new Map();
function venueMark(r) {
  const code = r.exchange;
  if (!VENUE_MARKS.has(code)) return '';
  if (!markSvg.has(code)) {
    markSvg.set(code, '');
    fetch('/assets/venues/mark-' + code + '.svg')
      .then(res => (res.ok ? res.text() : ''))
      .then(svg => markSvg.set(code, svg.replace('<svg', '<svg class="venue__mark" aria-hidden="true" focusable="false"')))
      .catch(() => {});
  }
  return markSvg.get(code) || '<span class="venue__mark"></span>';
}

// ── Source line shared by every block ───────────────────────────────────────────────────────

function source(store, S) {
  const failed = S.log.filter(l => l.status === 0 || l.status >= 400);
  const lastFailure = failed[failed.length - 1];
  if (S.live) {
    const answered = S.live.targets.filter(t => t.row).length;
    const liveAge = Math.max(0, Math.round((S.now - Date.parse(S.live.at)) / 1000));
    return {
      mode: 'live', tag: 'Live · ' + store.env + ' · ' + utcTime(S.live.at), tagClass: 'source-tag--live',
      // "perp venues", not "venues": the instrument is a perpetual, so the spot venues that quote the
      // same asset are not in this comparison and the count must not read as the whole coverage.
      line: ('Last response ' + utcTime(S.live.at) + ' · age ' + age(liveAge) + ' · ' + answered + '/' + S.live.targets.length + ' perp venues answered').toUpperCase(),
      targets: S.live.targets
    };
  }
  if (S.savedMarket) {
    return { mode: 'saved', tag: 'Saved · ' + utcMinute(S.savedMarket.at), tagClass: 'source-tag--saved', line: ('Saved response · ' + utcMinute(S.savedMarket.at) + ' · live fetch failed').toUpperCase(), targets: S.savedMarket.targets };
  }
  if (S.loading) return { mode: 'loading', tag: 'No data', tagClass: 'source-tag--none', line: 'REQUESTING…' };
  return {
    mode: 'none', tag: 'No data', tagClass: 'source-tag--none', line: 'NO RESPONSE',
    body: lastFailure ? 'Last failure: ' + lastFailure.path + ' · ' + (lastFailure.error || 'HTTP ' + lastFailure.status) + '. Nothing is shown in its place.' : 'Nothing is shown in its place.'
  };
}

const blockFor = (src, compact) => src.mode === 'loading'
  ? stateBlock('loading', 'Requesting the latest snapshot', 'Nothing is shown until the service answers.', { compact })
  : stateBlock('error', 'The data service did not answer and no saved response is on disk', src.body, { compact });

// ── Provenance popover ──────────────────────────────────────────────────────────────────────

let openProv = null;
function showProvenance(anchor, entry) {
  closeProvenance();
  const rect = anchor.getBoundingClientRect();
  const sheet = window.innerWidth < 720;
  const scrim = document.createElement('button');
  scrim.className = 'prov-scrim';
  scrim.setAttribute('aria-label', 'Close provenance');
  const box = document.createElement('div');
  box.className = 'prov' + (sheet ? ' prov--sheet' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Provenance');
  if (!sheet) {
    box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 400)) + 'px';
    box.style.top = (rect.bottom + 6 > window.innerHeight - 260 ? rect.top - 250 : rect.bottom + 6) + 'px';
  }
  box.innerHTML = `<div class="prov__head"><span class="prov__title">Provenance · ${esc(entry.title)}</span><button class="prov__close">Close</button></div>` +
    `<div class="prov__lines">${entry.lines.map(l => `<span class="prov__k">${esc(l.k)}</span><span class="prov__v">${esc(l.v)}</span>`).join('')}</div>`;
  scrim.addEventListener('click', closeProvenance);
  box.querySelector('.prov__close').addEventListener('click', closeProvenance);
  document.body.append(scrim, box);
  openProv = [scrim, box];
}
export function closeProvenance() {
  if (openProv) openProv.forEach(el => el.remove());
  openProv = null;
}
function wireProvenance(root, getRegistry) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-prov]');
    if (!btn || !root.contains(btn)) return;
    const entry = getRegistry() && getRegistry().get(Number(btn.dataset.prov));
    if (entry) showProvenance(btn, entry);
  });
}

// ── Tie tooltip ─────────────────────────────────────────────────────────────────────────────

// One fixed element for the whole page: a tooltip inside the table's own scroll box would be clipped
// by it. The tables re-render every second, so the tip is re-resolved from the pointer after each
// render rather than trusting the element it was opened on.
let tipEl = null, tipAnchorText = null;
const pointer = { x: -1, y: -1 };
function showTip(anchor) {
  const text = anchor.dataset.tip;
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ar-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.append(tipEl); }
  if (tipAnchorText !== text) { tipEl.textContent = text; tipAnchorText = text; }
  tipEl.hidden = false;
  const a = anchor.getBoundingClientRect(), w = 236;
  const left = Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8));
  const below = a.bottom + 6 + tipEl.offsetHeight < window.innerHeight;
  tipEl.style.left = left + 'px';
  tipEl.style.top = (below ? a.bottom + 6 : a.top - 6 - tipEl.offsetHeight) + 'px';
}
function hideTip() { if (tipEl) tipEl.hidden = true; tipAnchorText = null; }
function refreshTip() {
  if (!tipEl || tipEl.hidden) return;
  const under = document.elementFromPoint(pointer.x, pointer.y);
  const anchor = under && under.closest('[data-tip]');
  if (anchor) showTip(anchor); else hideTip();
}
function wireTips(root) {
  root.addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    const anchor = e.target.closest('[data-tip]');
    if (anchor) showTip(anchor); else hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', e => {
    const anchor = e.target.closest('[data-tip]') || (e.target.querySelector && e.target.querySelector('[data-tip]'));
    if (anchor) showTip(anchor); else hideTip();
  });
  root.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true, capture: true });
}

// ── Hero slice ──────────────────────────────────────────────────────────────────────────────

export function mountSlice(root, store, onFullComparison) {
  let registry = null;
  root.innerHTML = `
    <div class="panel">
      <div class="panel__head panel__head--roomy">
        <span class="label label--accent" data-slot="title"></span>
        <div class="row gap-10"><span class="source-tag" data-slot="tag"></span><span class="meta-xs" style="font-size:11px" data-slot="line"></span></div>
      </div>
      <div data-slot="body"></div>
      <div class="panel__foot"><span>Click any figure for its source, timestamps and age</span><button class="text-btn text-btn--sm" data-slot="more">Full comparison ↓</button></div>
    </div>`;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  $('more').addEventListener('click', onFullComparison);
  wireProvenance(root, () => registry);
  wireTips(root);

  const render = () => {
    const S = store.state, src = source(store, S);
    $('title').textContent = S.asset + ' perpetual · ticker call';
    $('tag').textContent = src.tag;
    $('tag').className = 'source-tag ' + src.tagClass;
    $('line').textContent = src.line;
    if (!src.targets) { $('body').innerHTML = `<div style="padding:14px">${blockFor(src, true)}</div>`; return; }
    registry = createRegistry();
    const rows = buildRows(src.targets, S.now, registry, { limit: 5 });
    $('body').innerHTML = `<div class="scroll-x"><table class="slice-table lm-table">
      <thead><tr><th class="l">Venue · instrument</th><th>Bid / Ask</th><th>Spread</th><th>Funding · interval</th><th>Age · status</th></tr></thead>
      <tbody>${rows.map(({ r, c }) => `<tr><td class="venue-cell">${esc(r.venue)}<small>${esc(r.sym)}</small></td>` +
        pair(c, 'bid', 'ask', true) + td(c.spread, figure(c.spread, 'spread', true)) + td(c.fund, figure(c.fund, 'fund')) + td(c.ageT, chipCell(c.ageT)) + '</tr>').join('')}</tbody>
    </table></div>`;
    refreshTip();
  };
  store.subscribe(render, ['market', 'snapshot', 'tick']);
  render();
}

// ── Arena table ─────────────────────────────────────────────────────────────────────────────

export function mountArena(root, store) {
  let registry = null;
  root.innerHTML = `
    <div class="panel">
      <div class="panel__head"><span class="label label--accent">Ticker call · one response</span><span class="source-tag" data-slot="tag"></span></div>
      <div data-slot="body"></div>
    </div>`;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  wireProvenance(root, () => registry);
  wireTips(root);
  let sparks = { key: null, list: null };

  const loadSparks = async () => {
    const S = store.state;
    const key = S.asset + '|' + (S.plan ? S.plan.length : 0);
    if (!S.plan || sparks.key === key) return;
    sparks = { key, list: null };
    const list = await loadSeries(store.base, S.plan, 'Trade price', '24 h', []);
    if (sparks.key === key) { sparks.list = list; render(); }
  };

  const sparkline = points => {
    const vals = points.map(p => p.v);
    if (vals.length < 2) return '<span class="meta">—</span>';
    const w = 72, h = 18, min = Math.min(...vals), span = Math.max(...vals) - min || 1, step = w / (vals.length - 1);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(2) + ' ' + (h - 1 - (v - min) / span * (h - 2)).toFixed(2)).join(' ');
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:inline-block;overflow:visible" aria-hidden="true"><path d="${d}"/></svg>`;
  };

  const render = () => {
    const S = store.state, src = source(store, S);
    $('tag').textContent = src.tag;
    $('tag').className = 'source-tag ' + src.tagClass;
    if (!src.targets) { $('body').innerHTML = `<div style="padding:14px">${blockFor(src, true)}</div>`; return; }
    registry = createRegistry();
    const rows = buildRows(src.targets, S.now, registry, { limit: 6 });
    const byVenue = new Map((sparks.list || []).map(s => [s.venue, s]));
    $('body').innerHTML = `<div class="scroll-x"><table class="tbl arena-table min-640">
      <thead><tr><th>Venue</th><th class="r">Mark</th><th class="r">Spread</th><th class="r">24 h</th><th class="r">Funding</th><th class="r">Age · P / D</th></tr></thead>
      <tbody>${rows.map(({ r, c }) => {
        const s = byVenue.get(r.venue);
        const spark = !sparks.list ? '<span class="spark-note">requesting</span>' : !s ? '' : s.failed ? '<span class="spark-note">no answer</span>' : s.points.length > 1 ? sparkline(s.points.slice(-24)) : '<span class="spark-note">no bars</span>';
        return `<tr><td class="venue-cell">${esc(r.venue)}<small>${esc(r.sym)}</small></td>` +
          `<td class="td-num ${c.mark.hatch ? 'dk-hatch' : ''}">${esc(c.mark.text)}<span class="unit u5">${esc(c.mark.unit)}</span></td>` +
          `<td class="td-num ${c.spread.hatch ? 'dk-hatch' : ''}">${esc(c.spread.text)}<span class="unit u3">${esc(c.spread.unit)}</span>${rankSlot(c.spread)}</td>` +
          `<td class="r">${spark}</td>` +
          `<td class="td-num ${c.fund.hatch ? 'dk-hatch' : ''}">${esc(c.fund.text)}<span class="unit u7">${esc(c.fund.unit)}</span></td>` +
          `<td class="age">${esc(c.ageT.text)} <span class="faint">/</span> <span class="${kindClass(c.ageD.kind)}" title="${kindWord(c.ageD.kind)}"><span class="ar-chip__val">${esc(c.ageD.text)}</span></span></td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
    refreshTip();
  };
  store.subscribe(() => { render(); loadSparks(); }, ['market', 'snapshot']);
  store.subscribe(render, ['tick']);
  render();
}

// ── Full comparison ─────────────────────────────────────────────────────────────────────────

/** Column groups of the full table. Identity and Age are locked on: without them a figure has no
 *  source and no clock. `cols` is how many body columns the group spans; the Columns control counts
 *  the seven columns between the two locked groups. */
const COLUMN_GROUPS = [
  { key: 'identity', name: 'Identity', head: 'Identity', note: 'locked', locked: true, cols: 1 },
  { key: 'quote', name: 'Quote', head: 'Quote · ticker call', note: 'bid, ask, trace, spread', cols: 3 },
  { key: 'reference', name: 'Reference', head: 'Reference', note: 'mark, index', cols: 1 },
  { key: 'funding', name: 'Funding', head: 'Funding', note: 'rate and interval', cols: 1 },
  { key: 'oi', name: 'OI', head: 'OI · own call', note: 'own call', cols: 1 },
  { key: 'depth', name: 'Depth', head: 'Depth · own call', note: '±25 bps', cols: 1 },
  { key: 'time', name: 'Time', head: 'Time · ticker', note: 'venue, received', cols: 1 },
  { key: 'age', name: 'Age', head: 'Age per call', note: 'locked', locked: true, cols: 1 }
];
const TOGGLEABLE = COLUMN_GROUPS.filter(g => !g.locked);
/** The homepage table has no sparkline column, so its Quote group spans two. */
const colsOf = (g, arena) => (g.key === 'quote' && !arena ? 2 : g.cols);
const TOGGLE_COLUMNS = TOGGLEABLE.reduce((n, g) => n + g.cols, 0);

/** Sortable columns. Missing, unsupported and uncollected values always sink to the bottom of their
 *  group, whichever way the column is sorted. Open interest sorts on its quote notional: the printed
 *  figure is in base units on some venues and contracts on others. */
const SORTS = {
  bid: { word: 'bid', value: x => x.r.bid },
  ask: { word: 'ask', value: x => x.r.ask },
  spread: { word: 'spread', value: x => x.spreadVal },
  fund: { word: 'funding', value: x => x.r.fund },
  oi: { word: 'open interest (quote notional)', value: x => x.r.oiNotional },
  depth: { word: 'depth', value: x => (typeof x.r.db === 'number' && typeof x.r.da === 'number' ? x.r.db + x.r.da : null) }
};
const sortRows = (list, sort) => {
  if (!sort) return list;
  const f = SORTS[sort.key].value, sign = sort.dir === 'asc' ? 1 : -1;
  const num = x => { const v = f(x); return typeof v === 'number' && isFinite(v) ? v : null; };
  return list.slice().sort((a, b) => {
    const va = num(a), vb = num(b);
    if (va == null || vb == null) return (va == null) - (vb == null) || a.r.venue.localeCompare(b.r.venue);
    return (va - vb) * sign || a.r.venue.localeCompare(b.r.venue);
  });
};

/**
 * @param {{ syncUrl?: boolean, arena?: boolean }} opts
 *   syncUrl: read asset/metric/range (and, with arena, hidden groups and sort) from the page's own
 *   query string on mount, falling back to the defaults for anything missing or unknown, and write
 *   the resolved state back with history.replaceState on every change — a shareable view. Off by
 *   default, so the homepage's #live-full mount never touches the homepage's own URL.
 *   arena: the Arena page layout — table above a half-height chart, and the table's own head with
 *   the Columns control and sortable headers. The homepage mount keeps the plain table.
 */
export function mountFull(root, store, { syncUrl = false, arena = false } = {}) {
  let registry = null;
  const params = syncUrl ? new URLSearchParams(location.search) : null;
  let initialMetric = (params && METRIC_SLUGS[params.get('metric')]) || 'Trade price';
  let initialRange = (params && RANGE_SLUGS[params.get('range')]) || '24 h';
  // Same rule the metric selector's own change handler applies: a non-candle metric cannot show a
  // candles-only range, so an incompatible pair from the query string is corrected the same way.
  if (METRICS[initialMetric].kind !== 'candles' && RANGES[initialRange].candlesOnly) initialRange = '24 h';
  const hiddenFromUrl = new Set(((params && arena && params.get('hide')) || '').split(',').filter(k => TOGGLEABLE.some(g => g.key === k)));
  const sortMatch = params && arena && /^(bid|ask|spread|fund|oi|depth)-(asc|desc)$/.exec(params.get('sort') || '');
  const ui = {
    metric: initialMetric, range: initialRange, hidden: {},
    hiddenGroups: hiddenFromUrl,
    sort: sortMatch ? { key: sortMatch[1], dir: sortMatch[2] } : null,
    colsOpen: false,
    view: arena && params && params.get('view') === 'candles' ? 'candles' : 'lines',
    candleVenue: ((arena && params && params.get('venue')) || '').toUpperCase() || null
  };
  // Candles exist for trade price only; the view choice is kept but applies when that metric is on.
  const candlesActive = () => arena && ui.view === 'candles' && ui.metric === 'Trade price';
  const writeUrl = () => {
    if (!syncUrl) return;
    const p = new URLSearchParams(location.search);
    p.set('asset', store.state.asset);
    p.set('metric', METRIC_TO_SLUG[ui.metric] || ui.metric);
    p.set('range', RANGE_TO_SLUG[ui.range] || ui.range);
    if (arena) {
      const hide = TOGGLEABLE.filter(g => ui.hiddenGroups.has(g.key)).map(g => g.key).join(',');
      if (hide) p.set('hide', hide); else p.delete('hide');
      if (ui.sort) p.set('sort', ui.sort.key + '-' + ui.sort.dir); else p.delete('sort');
      if (candlesActive()) { p.set('view', 'candles'); if (ui.candleVenue) p.set('venue', ui.candleVenue.toLowerCase()); else p.delete('venue'); }
      else { p.delete('view'); p.delete('venue'); }
    }
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
  };
  const controlsHtml = `
    <div class="lm-controls">
      <label class="field"><span class="field__label">Instrument</span><span class="field__box field__box--select"><select data-slot="asset"></select>${icon('chevron-down', 14)}</span></label>
      <label class="field"><span class="field__label">Metric</span><span class="field__box field__box--select"><select data-slot="metric">${Object.keys(METRICS).map(m => `<option>${m}</option>`).join('')}</select>${icon('chevron-down', 14)}</span></label>
      ${arena ? `<div class="field"><span class="field__label">View</span><div class="segmented" data-slot="view"><button type="button" data-view="lines">Lines</button><button type="button" data-view="candles">Candles</button></div></div>` : ''}
      <div class="field"><span class="field__label">Range</span><div class="segmented" data-slot="range">${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}">${r}</button>`).join('')}</div></div>
      <div class="spacer"></div>
      <div class="lm-source"><span class="source-tag" data-slot="tag"></span><span class="meta-xs" style="font-size:11px;text-align:right" data-slot="line"></span></div>
    </div>`;
  const chartHtml = `
    <div class="lm-chart-area">
      <div class="lm-chart" data-slot="chart"></div>
      <div class="lm-legend"><div class="label" style="margin-bottom:6px" data-slot="legend-title">Venues · toggle</div><div class="stack gap-6" data-slot="legend"></div>
        <div class="meta" style="margin-top:auto;padding-top:10px">Unsupported: the venue publishes no such field. It is not drawn as a flat line.</div></div>
    </div>`;
  // The table head is built once and only its text is updated: the Columns popover must survive the
  // table's once-a-second re-render.
  const tableHeadHtml = arena ? `
    <div class="panel__head lm-table-head">
      <span class="label label--accent" data-slot="th-title"></span>
      <div class="row gap-10">
        <span class="meta-xs" data-slot="th-sort"></span>
        <div class="ar-cols" data-slot="cols">
          <button type="button" class="btn btn--sm" data-slot="cols-btn" aria-haspopup="true" aria-expanded="false">${icon('columns', 14)}<span data-slot="cols-count"></span></button>
          <div class="ar-pop" data-slot="cols-pop" hidden>
            ${COLUMN_GROUPS.map(g => `<button type="button" class="ar-pop__row" data-group="${g.key}" role="menuitemcheckbox"${g.locked ? ' aria-disabled="true"' : ''}><span class="ar-pop__box"></span><span>${g.name}</span><span class="ar-pop__note">${g.note}</span></button>`).join('')}
            <div class="ar-pop__foot"><span>Identity and Age always shown</span><button type="button" data-slot="cols-reset">Reset</button></div>
          </div>
        </div>
      </div>
    </div>` : '';
  const tableHtml = `${tableHeadHtml}<div data-slot="table"></div>`;
  const logHtml = `<details class="lm-log" data-slot="log-wrap" hidden><summary data-slot="log-title"></summary><div class="lm-log__grid" data-slot="log"></div></details>`;
  const obsHtml = `<div data-slot="observation"></div>`;
  root.classList.toggle('lm-compact', arena);
  root.innerHTML = arena
    ? controlsHtml + tableHtml + obsHtml + chartHtml + logHtml
    : controlsHtml + chartHtml + tableHtml + logHtml + obsHtml;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  wireProvenance(root, () => registry);
  wireTips(root);

  if (arena) {
    const pop = $('cols-pop'), btn = $('cols-btn');
    const setOpen = open => {
      ui.colsOpen = open; pop.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      // Right-aligned to the trigger; on a narrow screen the trigger may wrap left, so keep the popover on screen.
      pop.style.transform = '';
      if (open) { const r = pop.getBoundingClientRect(); if (r.left < 8) pop.style.transform = `translateX(${8 - r.left}px)`; }
    };
    btn.addEventListener('click', () => setOpen(!ui.colsOpen));
    pop.addEventListener('click', e => {
      const row = e.target.closest('[data-group]');
      if (!row || row.getAttribute('aria-disabled') === 'true') return;
      const k = row.dataset.group;
      if (ui.hiddenGroups.has(k)) ui.hiddenGroups.delete(k); else ui.hiddenGroups.add(k);
      // Hiding the column a sort rests on clears the sort: rows ordered by something not on screen mislead.
      if (ui.sort && !visibleSortKeys().has(ui.sort.key)) ui.sort = null;
      writeUrl(); renderTableHead(); renderTable();
    });
    $('cols-reset').addEventListener('click', () => { ui.hiddenGroups.clear(); writeUrl(); renderTableHead(); renderTable(); });
    document.addEventListener('click', e => { if (ui.colsOpen && !$('cols').contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (ui.colsOpen && e.key === 'Escape') { setOpen(false); btn.focus(); } });
    $('table').addEventListener('click', e => {
      const b = e.target.closest('[data-sort]');
      if (!b) return;
      const k = b.dataset.sort, cur = ui.sort && ui.sort.key === k ? ui.sort.dir : null;
      // ascending → descending → cleared
      ui.sort = cur === null ? { key: k, dir: 'asc' } : cur === 'asc' ? { key: k, dir: 'desc' } : null;
      writeUrl(); renderTableHead(); renderTable();
      const again = $('table').querySelector(`[data-sort="${k}"]`);
      if (again) again.focus();
    });
  }
  const shown = key => !ui.hiddenGroups.has(key);
  const visibleSortKeys = () => new Set([...(shown('quote') ? ['bid', 'ask', 'spread'] : []), ...(shown('funding') ? ['fund'] : []), ...(shown('oi') ? ['oi'] : []), ...(shown('depth') ? ['depth'] : [])]);

  function renderTableHead() {
    if (!arena) return;
    const S = store.state;
    $('th-title').textContent = S.asset + ' · perpetual' + (S.live ? ' · ' + utcTime(S.live.at) : '');
    $('th-sort').textContent = ui.sort ? 'Sorted by ' + SORTS[ui.sort.key].word + ', ' + (ui.sort.dir === 'asc' ? 'ascending' : 'descending') + ', inside each quote group' : 'Venues A–Z inside each quote group';
    const shownCols = TOGGLEABLE.filter(g => shown(g.key)).reduce((n, g) => n + colsOf(g, arena), 0);
    $('cols-count').textContent = 'Columns · ' + shownCols + ' of ' + TOGGLE_COLUMNS;
    $('cols-btn').classList.toggle('btn--active', shownCols < TOGGLE_COLUMNS);
    root.querySelectorAll('[data-group]').forEach(row => {
      const on = shown(row.dataset.group);
      row.setAttribute('aria-checked', String(on));
      const box = row.querySelector('.ar-pop__box');
      box.className = 'ar-pop__box' + (on ? ' ar-pop__box--on' : '');
      box.textContent = on ? '✕' : '';
    });
  }

  $('asset').addEventListener('change', e => store.setAsset(e.target.value));
  $('metric').addEventListener('change', e => {
    ui.metric = e.target.value;
    if (METRICS[ui.metric].kind !== 'candles' && RANGES[ui.range].candlesOnly) ui.range = '24 h';
    requestSeries();
  });
  $('range').addEventListener('click', e => {
    const b = e.target.closest('[data-range]');
    if (!b || b.disabled) return;
    ui.range = b.dataset.range;
    requestSeries();
  });
  $('legend').addEventListener('click', e => {
    const b = e.target.closest('[data-venue]');
    if (!b || b.disabled) return;
    if (candlesActive()) { ui.candleVenue = b.dataset.venue; writeUrl(); renderChart(); return; }
    ui.hidden[b.dataset.venue] = !ui.hidden[b.dataset.venue];
    renderChart();
  });
  if (arena) {
    $('view').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (!b || b.disabled) return;
      ui.view = b.dataset.view;
      writeUrl(); renderControls(); renderChart();
    });
    // The history on screen is re-read once a minute and applied with series.update().
    setInterval(() => { if (!document.hidden && store.state.plan) store.loadSeries(ui.metric, ui.range, { quiet: true }); }, 60000);
  }

  const seriesKey = () => store.state.asset + '|' + ui.metric + '|' + ui.range;
  function requestSeries() {
    renderControls();
    writeUrl();
    if (store.state.plan && (!store.state.series || store.state.series.key !== seriesKey())) store.loadSeries(ui.metric, ui.range);
    renderChart();
  }

  function renderControls() {
    const S = store.state, src = source(store, S);
    const assets = S.universe ? S.universe.assets : [{ asset: S.asset, venues: null }];
    const optionsHtml = assets.map(a => `<option value="${esc(a.asset)}"${a.asset === S.asset ? ' selected' : ''}>${esc(a.asset)} perpetual${a.venues ? ' · ' + a.venues + ' venues' : ''}</option>`).join('');
    // This runs once a second, and writing to a <select> — even the value it already has — shuts an
    // open dropdown. Touch a select only when it is not the one the reader is using, and only when
    // what it holds is actually out of date.
    const idle = el => document.activeElement !== el;
    if ($('asset').dataset.html !== optionsHtml && idle($('asset'))) { $('asset').innerHTML = optionsHtml; $('asset').dataset.html = optionsHtml; }
    if ($('metric').value !== ui.metric && idle($('metric'))) $('metric').value = ui.metric;
    const candles = METRICS[ui.metric].kind === 'candles';
    if (arena) root.querySelectorAll('[data-view]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.view === (candlesActive() ? 'candles' : 'lines')));
      b.disabled = b.dataset.view === 'candles' && ui.metric !== 'Trade price';
      b.title = b.disabled ? 'Candles are drawn for trade price' : '';
    });
    root.querySelectorAll('[data-range]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.range === ui.range));
      b.disabled = !candles && !!RANGES[b.dataset.range].candlesOnly;
      b.title = b.disabled ? 'History beyond 48 h is served in pages; this page does not page it' : '';
    });
    $('tag').textContent = src.tag;
    $('tag').className = 'source-tag ' + src.tagClass;
    $('line').textContent = src.line;
  }

  let lw = null;
  function renderArenaChart() {
    const S = store.state, src = source(store, S), m = METRICS[ui.metric];
    const quote = (S.live && S.live.targets.find(t => t.row) || {}).row?.quoteAsset;
    const unit = m.unit === 'quote' ? 'quote currency' : m.unit;
    const ser = S.series && S.series.key === seriesKey() ? S.series : null;
    const dropChart = () => { if (lw) { lw.destroy(); lw = null; } };

    if (!S.plan || !ser || ser.loading) {
      dropChart();
      const block = !S.plan ? blockFor(src, false)
        : stateBlock('loading', 'Requesting ' + ui.metric.toLowerCase() + ' history per venue', (m.kind === 'candles' ? 'GET /candles' : 'GET ' + m.path) + ' · one call per venue.');
      $('chart').innerHTML = block;
      $('legend').innerHTML = '<div class="meta">Venues are listed from the response. None yet.</div>';
      return;
    }

    const list = ser.list;
    const drawable = list.filter(s => !s.unsupported && !s.notCollected && s.points.length);
    const candles = candlesActive();
    if (candles && !drawable.some(s => s.venue === ui.candleVenue)) { ui.candleVenue = drawable.length ? drawable[0].venue : null; writeUrl(); }
    const styles = new Map(list.map((s, i) => [s.venue, ARENA_STYLES[i % ARENA_STYLES.length]]));

    $('legend-title').textContent = candles ? 'Venues · candles for' : 'Venues · toggle';
    $('legend').innerHTML = list.map(s => {
      const off = s.unsupported || s.notCollected || !s.points.length;
      const tag = s.unsupported ? 'Unsupported' : s.notCollected ? 'Not collected' : s.failed ? 'No answer' : !s.points.length ? 'No data' : '';
      const st = styles.get(s.venue);
      const pressed = candles ? s.venue === ui.candleVenue : !off && !ui.hidden[s.venue];
      return `<button class="lm-legend__item" data-venue="${esc(s.venue)}" aria-pressed="${pressed}"${off ? ' disabled' : ''}>` +
        `<span class="lm-legend__box"></span><svg width="18" height="8" style="flex:none;color:${STYLE_VAR[st.color]}"><line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" stroke-dasharray="${st.dash ? '4 3' : ''}" stroke-width="2"/></svg>` +
        `<span class="lm-legend__venue">${esc(s.venue)}</span>${tag ? `<span class="unsup-tag">${tag}</span>` : ''}</button>`;
    }).join('');

    if (!drawable.length) {
      dropChart();
      $('chart').innerHTML = stateBlock('unmeasured', 'No venue returned ' + ui.metric.toLowerCase() + ' in this range', 'The chart is absent rather than flat.');
      return;
    }
    if (!lw) {
      $('chart').innerHTML = `
        <div class="lm-chart__head"><span class="label" data-slot="chart-label"></span>
          <span class="meta-xs" style="font-size:11px">Lines never bridge a gap · x axis UTC<span data-slot="chart-note"></span></span></div>
        <div class="lm-lw" data-slot="lw"></div>`;
      lw = createArenaChart($('lw'));
    }
    $('chart-label').textContent = ui.metric + ' · ' + unit + (quote && m.unit !== 'bps' && !m.unit.startsWith('%') ? ' (' + quote + ' where quoted)' : '') +
      (candles && ui.candleVenue ? ' · candles: ' + ui.candleVenue + ', other venues dimmed' : '');
    $('chart-note').textContent = list.some(s => s.truncated) ? ' · some venues capped at 5,000 rows' : '';
    lw.update({ key: seriesKey(), list, view: candles ? 'candles' : 'lines', candleVenue: ui.candleVenue, hidden: ui.hidden, styles, decimals: m.decimals })
      .catch(err => console.warn('[arena chart]', err));
  }

  function renderChart() {
    if (arena) { renderArenaChart(); return; }
    const S = store.state, src = source(store, S), m = METRICS[ui.metric];
    const quote = (S.live && S.live.targets.find(t => t.row) || {}).row?.quoteAsset;
    const unit = m.unit === 'quote' ? 'quote currency' : m.unit;
    const ser = S.series && S.series.key === seriesKey() ? S.series : null;

    if (!S.plan || !ser || ser.loading) {
      const block = !S.plan ? blockFor(src, false)
        : stateBlock('loading', 'Requesting ' + ui.metric.toLowerCase() + ' history per venue', (m.kind === 'candles' ? 'GET /candles' : 'GET ' + m.path) + ' · one call per venue.');
      $('chart').innerHTML = block.replace('class="state-block', 'class="state-block state-block--tall');
      $('legend').innerHTML = '<div class="meta">Venues are listed from the response. None yet.</div>';
      return;
    }

    const list = ser.list.map((s, i) => ({ ...s, style: STROKES[i % STROKES.length] }));
    const drawable = list.filter(s => !s.unsupported && !s.notCollected && s.points.length && !ui.hidden[s.venue]);
    const all = drawable.flatMap(s => s.points.map(p => p.v));
    const now = Date.now(), x0 = now - RANGES[ui.range].ms;

    $('legend').innerHTML = list.map(s => {
      const off = s.unsupported || s.notCollected || !s.points.length;
      const tag = s.unsupported ? 'Unsupported' : s.notCollected ? 'Not collected' : s.failed ? 'No answer' : !s.points.length ? 'No data' : '';
      return `<button class="lm-legend__item" data-venue="${esc(s.venue)}" aria-pressed="${!off && !ui.hidden[s.venue]}"${off ? ' disabled' : ''}>` +
        `<span class="lm-legend__box"></span><svg width="18" height="8" style="flex:none"><line x1="0" y1="4" x2="18" y2="4" stroke="${s.style.stroke}" stroke-dasharray="${s.style.dash}" stroke-width="2"/></svg>` +
        `<span class="lm-legend__venue">${esc(s.venue)}</span>${tag ? `<span class="unsup-tag">${tag}</span>` : ''}</button>`;
    }).join('');

    if (!all.length) {
      $('chart').innerHTML = stateBlock('unmeasured', 'No venue returned ' + ui.metric.toLowerCase() + ' in this range', 'The chart is absent rather than flat.', { tall: true });
      return;
    }

    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
    // A metric that cannot be negative is not padded below zero: an axis label of −0.34 bps would be invented.
    const y0 = lo >= 0 ? Math.max(0, lo - pad) : lo - pad, y1 = hi + pad;
    const sx = t => ((t - x0) / (now - x0)) * 800, sy = v => 240 - ((v - y0) / (y1 - y0)) * 240;
    const paths = drawable.map(s => {
      // A line never bridges a gap: a step more than three times this series' usual step breaks it.
      const steps = s.points.slice(1).map((p, i) => p.t - s.points[i].t).sort((a, b) => a - b);
      const usual = steps.length ? steps[Math.floor(steps.length / 2)] : Infinity;
      let d = '';
      s.points.forEach((p, i) => {
        const breaks = i === 0 || p.t - s.points[i - 1].t > usual * 3;
        d += (breaks ? 'M' : 'L') + sx(p.t).toFixed(1) + ' ' + sy(p.v).toFixed(1) + ' ';
      });
      return `<path d="${d}" stroke="${s.style.stroke}" stroke-dasharray="${s.style.dash}"/>`;
    }).join('');
    const grid = [y1 - pad, (y0 + y1) / 2, y0 + pad];
    const long = now - x0 > 2 * 864e5;
    const xs = [0, 1, 2, 3, 4, 5].map(i => { const t = new Date(x0 + i * (now - x0) / 5); return long ? t.toISOString().slice(5, 10) : t.toISOString().slice(11, 16); });
    const truncated = list.some(s => s.truncated);

    $('chart').innerHTML = `
      <div class="lm-chart__head"><span class="label">${esc(ui.metric)} · ${esc(unit)}${quote && m.unit !== 'bps' && !m.unit.startsWith('%') ? ' (' + esc(quote) + ' where quoted)' : ''}</span>
        <span class="meta-xs" style="font-size:11px">Lines never bridge a gap · x axis UTC${truncated ? ' · some venues capped at 5,000 rows' : ''}</span></div>
      <div class="lm-chart__plot">
        <svg viewBox="0 0 800 240" preserveAspectRatio="none">${grid.map(v => `<line class="grid" x1="0" x2="800" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`).join('')}${paths}</svg>
        <div class="lm-chart__ylabels">${grid.map(v => `<span>${fmt(v, m.decimals)}</span>`).join('')}</div>
      </div>
      <div class="lm-chart__x">${xs.map(x => `<span>${x}</span>`).join('')}</div>`;
  }

  // Sparklines: trade price over the table's range (7 d and 30 d fall back to 24 h). When the chart
  // already holds that exact history it is reused; otherwise each venue is fetched once, and only when
  // its row scrolls into view. Answers are kept for five minutes.
  const sparkCache = new Map();
  const sparkRange = () => (RANGES[ui.range].candlesOnly ? '24 h' : ui.range);
  const chartSeriesFor = range => {
    const ser = store.state.series;
    return ser && !ser.loading && ser.key === store.state.asset + '|Trade price|' + range ? ser : null;
  };
  const sparkKey = code => store.state.asset + '|' + sparkRange() + '|' + code;
  function requestSpark(code) {
    const range = sparkRange(), key = sparkKey(code), hit = sparkCache.get(key);
    if (chartSeriesFor(range) || (hit && (hit.loading || Date.now() - hit.at < 300e3))) return;
    sparkCache.set(key, { loading: true, points: hit ? hit.points : null });
    store.loadVenueSeries(code, range)
      .then(sv => sparkCache.set(key, { at: Date.now(), points: sv && !sv.failed ? sv.points : [] }))
      .catch(() => sparkCache.set(key, { at: Date.now(), points: [] }));
  }
  const sparkPoints = venue => {
    const ser = chartSeriesFor(sparkRange());
    if (ser) { const s = ser.list.find(x => x.venue === venue); return s ? s.points : []; }
    const hit = sparkCache.get(sparkKey(venue.toLowerCase()));
    return hit ? hit.points : null;
  };
  const sparkObserver = arena && 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) requestSpark(en.target.dataset.spark); }), { rootMargin: '120px' })
    : null;

  function renderTable() {
    const S = store.state, src = source(store, S);
    renderTableHead();
    if (!src.targets) {
      $('table').innerHTML = `<div style="padding:14px">${blockFor(src, false)}</div>`;
      $('observation').innerHTML = '';
      return;
    }
    registry = createRegistry();
    const rows = buildRows(src.targets, S.now, registry, { byQuote: true });
    const groups = COLUMN_GROUPS.filter(g => shown(g.key));
    const span = groups.reduce((n, g) => n + colsOf(g, arena), 0);
    const sort = arena ? ui.sort : null;
    const head = (key, label) => {
      if (!arena) return label;
      const dir = sort && sort.key === key ? sort.dir : null;
      return `<button type="button" class="ar-sort" data-sort="${key}" aria-sort="${dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="Sort by ${SORTS[key].word}">${label}<span class="ar-sort__ind" aria-hidden="true">${dir === 'desc' ? '▼' : '▲'}</span></button>`;
    };
    const thSort = keys => (sort && keys.includes(sort.key) ? ` aria-sort="${sort.dir === 'asc' ? 'ascending' : 'descending'}"` : '');
    const heads = {
      identity: '<th class="l sticky">Venue · status</th>',
      quote: `<th${thSort(['bid', 'ask'])}>${head('bid', 'Bid')} / ${head('ask', 'Ask')}</th>${arena ? `<th class="l">${sparkRange()}</th>` : ''}<th${thSort(['spread'])}>${head('spread', 'Spread')}</th>`,
      reference: '<th>Mark / Index</th>',
      funding: `<th${thSort(['fund'])}>${head('fund', 'Funding')}</th>`,
      oi: `<th${thSort(['oi'])}>${head('oi', 'Open interest')}</th>`,
      depth: `<th${thSort(['depth'])}>${head('depth', 'Depth ±25 bps')}</th>`,
      time: '<th>Venue / received</th>',
      age: '<th>Age · T / OI / D</th>'
    };
    const cells = ({ r, c }) => ({
      identity: `<td class="venue"><span class="venue__id">${venueMark(r)}<span>${esc(r.venue)}<small>${esc(r.sym)}${r.model === 'oracle_vault' ? ' · vault' : ''}</small><button class="${kindClass(c.status.kind)} row-status" data-prov="${c.status.prov}">${kindWord(c.status.kind)}</button></span></span></td>`,
      quote: pair(c, 'bid', 'ask', true) + (arena ? `<td class="spark-cell" data-spark="${esc(r.venue.toLowerCase())}">${sparkSvg(sparkPoints(r.venue))}</td>` : '') + td(c.spread, figure(c.spread, 'spread', true)),
      reference: pair(c, 'mark', 'index', false),
      funding: td(c.fund, figure(c.fund, 'fund')),
      oi: td(c.oi, figure(c.oi, 'oi')),
      depth: td(c.depth, figure({ ...c.depth, unit: '' }, 'depth', true)),
      time: `<td><button class="fig fig--stack" data-prov="${c.received.prov}"><span class="${c.venueTime.kind === 'MISSING' ? 'faint' : 'muted'}">${esc(c.venueTime.kind === 'MISSING' ? 'venue sends none' : c.venueTime.text)}</span><span>${esc(c.received.text)}</span></button></td>`,
      age: `<td><div class="fig-chips">${smallChip(c.ageT, 'T')}${smallChip(c.ageO, 'OI')}${smallChip(c.ageD, 'D')}</div></td>`
    });
    const hiddenNames = TOGGLEABLE.filter(g => !shown(g.key)).map(g => g.name.toUpperCase());
    $('table').innerHTML = `<div class="scroll-x" style="position:relative"><table class="lm-table">
      <thead>
        <tr>${groups.map(g => `<th colspan="${colsOf(g, arena)}" class="group${g.key === 'age' ? ' group--age' : ''}">${g.head}</th>`).join('')}</tr>
        <tr>${groups.map(g => heads[g.key]).join('')}</tr>
      </thead>
      <tbody>${groupByQuote(rows).map(g => `<tr class="quote-row"><th colspan="${span}"><span>Quoted in ${esc(g.quote)} · ${g.rows.length} venue${g.rows.length === 1 ? '' : 's'}</span></th></tr>` + sortRows(g.rows, sort).map(x => {
        const cx = cells(x);
        return `<tr>${groups.map(gr => cx[gr.key]).join('')}</tr>`;
      }).join('')).join('')}</tbody>
    </table></div>
    <div class="panel__foot">${hiddenNames.length ? `<span>${esc(hiddenNames.join(', '))} HIDDEN</span>` : ''}<span>Perpetual venues only · grouped by quote currency · BEST and WORST inside each quote group · table scrolls sideways</span><span>— missing this snapshot · hatched: not published by the venue · dimmed: stale</span></div>`;
    refreshTip();
    if (sparkObserver) { sparkObserver.disconnect(); $('table').querySelectorAll('[data-spark]').forEach(el => sparkObserver.observe(el)); }

    const published = rows.filter(x => x.c.fund.kind !== 'MISSING' && x.c.fund.kind !== 'UNSUPPORTED');
    const positive = published.filter(x => x.r.fund > 0).length;
    const depthStale = rows.filter(x => x.c.ageD.kind === 'STALE').length, depthDelayed = rows.filter(x => x.c.ageD.kind === 'DELAYED').length;
    let observation = '';
    if (published.length) {
      observation = 'Funding is positive on ' + positive + ' of ' + published.length + ' venues that published it in this response.';
      const depthNotes = [depthStale ? depthStale + ' depth feed' + (depthStale > 1 ? 's are' : ' is') + ' stale' : null, depthDelayed ? depthDelayed + ' delayed' : null].filter(Boolean);
      if (depthNotes.length) observation += ' ' + depthNotes.join(', ') + '.';
    }
    $('observation').innerHTML = observation
      ? `<div class="lm-observation"><span class="label label--accent" style="white-space:nowrap">Observation</span><span class="lm-observation__text">${esc(observation)}</span><span class="meta-xs" style="font-size:11px">computed from this response</span></div>`
      : '';
  }

  function renderLog() {
    const S = store.state;
    const entries = S.log.slice(-40);
    $('log-wrap').hidden = !entries.length;
    const last = S.log.filter(l => l.path.startsWith('/snapshot') && l.status === 200).pop();
    $('log-title').textContent = 'Request log' + (last ? ' · ' + last.ms + ' ms · ' + last.kb + ' KB' : '');
    $('log').innerHTML = entries.map(l => `<span class="path">${esc(l.path.length > 70 ? l.path.slice(0, 70) + '…' : l.path)}</span>` +
      `<span class="${l.status === 200 ? 'muted' : 'is-alert'}">${l.status ? 'HTTP ' + l.status : esc(l.error)}</span><span class="faint">${l.ms} ms</span><span class="faint">${l.kb ? l.kb + ' KB' : ''}</span>`).join('');
  }

  store.subscribe((S, kind) => {
    if (kind === 'market') { requestSeries(); renderTable(); renderLog(); return; }
    if (kind === 'series') { renderChart(); renderLog(); return; }
    if (kind === 'snapshot') {
      renderControls(); renderTable(); renderLog();
      if (!S.series && S.plan) requestSeries(); else renderChart();
      return;
    }
    if (kind === 'tick') { renderControls(); renderTable(); }
  });
  renderControls(); renderChart(); renderTable();
}
