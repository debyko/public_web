// The live market blocks: hero slice, full comparison (chart + table) and the Arena table.
// Every figure is a button that opens its provenance: venue, instrument, clocks, age, method.

import { esc, fmt, age, utcTime, utcMinute, icon, stateBlock } from './format.js';
import { UNSUP, METRICS, RANGES, normalise, loadSeries } from './api.js';

const RANK = { LIVE: 0, DELAYED: 1, STALE: 2, MISSING: 3 };
const STROKES = [
  { stroke: '#DE1A8C', dash: '' }, { stroke: '#05070C', dash: '' }, { stroke: '#5A6172', dash: '' }, { stroke: '#8A8E98', dash: '' },
  { stroke: '#05070C', dash: '4 3' }, { stroke: '#5A6172', dash: '4 3' }, { stroke: '#8A8E98', dash: '4 3' }
];
const kindClass = kind => 'st-' + kind.toLowerCase();

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
  const kind = val === UNSUP ? 'UNSUPPORTED' : val == null ? 'MISSING' : r.st[group];
  const empty = kind === 'UNSUPPORTED' || kind === 'MISSING';
  const ag = r.ag[group];
  const received = group === 't' ? r.rt : group === 'o' ? r.rto : r.rtd;
  const lines = [
    { k: 'Venue', v: r.venue },
    { k: 'Venue instrument', v: r.sym + ' · ' + r.model },
    { k: 'Venue timestamp', v: r.vt ? r.vt + ' UTC' : 'venue sends none' },
    { k: 'Received', v: received ? received + ' UTC' : '—' },
    { k: 'Age', v: age(ag) },
    { k: 'Status', v: kind + ' · provisional threshold for this call group' }
  ];
  if (opts.formula) lines.push({ k: 'Derived', v: opts.formula });
  if (kind === 'MISSING') lines.push({ k: 'Note', v: 'This snapshot carries no value for the field. Shown as empty, not as zero.' });
  if (kind === 'UNSUPPORTED') lines.push({ k: 'Note', v: r.model === 'oracle_vault' ? 'Oracle/vault market: no order book, so bid, ask, spread and depth are not published.' : 'The venue publishes no such field.' });
  const prov = reg.add({ title: key, lines });
  return {
    kind, prov, lines, hatch: kind === 'UNSUPPORTED',
    text: opts.chip ? (kind === 'UNSUPPORTED' ? '—' : age(ag)) : empty ? '—' : (typeof val === 'number' ? fmt(val, opts.decimals ?? 8) : val),
    unit: empty ? '' : unit,
    state: kind === 'STALE' ? 'is-stale' : empty ? 'is-empty' : ''
  };
}

function buildRows(targets, now, reg) {
  const rows = targets.map(t => normalise(t, now)).filter(r => r.venue).map(r => {
    const mid = typeof r.bid === 'number' && typeof r.ask === 'number' ? (r.bid + r.ask) / 2 : null;
    const spreadVal = mid ? (r.ask - r.bid) / mid * 1e4 : r.bid === UNSUP ? UNSUP : null;
    const quote = r.quote || '';
    const depth = r.db === UNSUP ? UNSUP : r.db == null || r.da == null ? null : compact(r.db) + ' / ' + compact(r.da);
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
      ageD: cell(reg, r, 'Age · depth', r.model === 'oracle_vault' ? UNSUP : r.ag.d == null ? null : 1, '', 'd', { chip: true })
    };
    // A field the venue does not publish is not a freshness problem, so UNSUPPORTED never sets the row status.
    const worst = [c.ageT, c.ageO, c.ageD].map(x => x.kind).filter(k => k !== 'UNSUPPORTED').reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'LIVE');
    c.status = { kind: worst, prov: reg.add({ title: 'Status', lines: [{ k: 'Venue', v: r.venue }, { k: 'Status', v: worst + ' · the worst of the three call groups in this row' }] }) };
    return { r, c, spreadVal };
  });
  alignDecimals(rows);
  rank(rows);
  return rows;
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

// ── BEST / WORST ────────────────────────────────────────────────────────────────────────────

/** The columns where "better" has one meaning: a higher bid, a lower ask, a narrower spread, more depth. */
const RANKED = [
  { key: 'bid', value: x => x.r.bid, better: 'max' },
  { key: 'ask', value: x => x.r.ask, better: 'min' },
  { key: 'spread', value: x => (typeof x.spreadVal === 'number' ? Math.round(x.spreadVal * 100) / 100 : null), better: 'min' },
  { key: 'depth', value: x => (typeof x.r.db === 'number' && typeof x.r.da === 'number' ? x.r.db + x.r.da : null), better: 'max' }
];
/** USD, USDT and USDC (and USDT0) are compared as one currency; any other quote is not ranked. */
const USD_LIKE = /^USD/;

function rank(rows) {
  for (const col of RANKED) {
    const why = x => {
      const cellKind = x.c[col.key].kind;
      if (x.r.model !== 'orderbook') return 'oracle/vault market, not an order book';
      if (!USD_LIKE.test(x.r.quote)) return 'quoted in ' + (x.r.quote || 'an unknown currency') + ', not USD, USDT or USDC';
      if (cellKind !== 'LIVE') return 'value is ' + cellKind.toLowerCase();
      if (typeof col.value(x) !== 'number') return 'no value in this snapshot';
      return null;
    };
    const eligible = rows.filter(x => !why(x));
    const values = eligible.map(col.value);
    const hi = Math.max(...values), lo = Math.min(...values);
    const bestValue = col.better === 'max' ? hi : lo, worstValue = col.better === 'max' ? lo : hi;
    for (const x of rows) {
      const cell = x.c[col.key], reason = why(x);
      if (reason) { cell.lines.push({ k: 'Rank', v: 'not ranked · ' + reason }); continue; }
      if (eligible.length < 2 || hi === lo) { cell.lines.push({ k: 'Rank', v: 'not ranked · fewer than two different live values to compare' }); continue; }
      const v = col.value(x);
      cell.rank = v === bestValue ? 'best' : v === worstValue ? 'worst' : null;
      cell.lines.push({ k: 'Rank', v: (cell.rank ? cell.rank.toUpperCase() + ' · ' : '') + 'among ' + eligible.length + ' live order-book venues · USD, USDT and USDC compared as one' });
    }
  }
}

/** The mark always takes the same room, present or not, so a mark coming or going moves nothing. */
const rankSlot = x => `<span class="rank-slot">${x.rank ? `<span class="rank rank--${x.rank}">${x.rank === 'best' ? 'BEST' : 'WORST'}</span>` : ''}</span>`;

// ── Cell markup ─────────────────────────────────────────────────────────────────────────────

/** Two figures of one question in one cell, one above the other (bid over ask, mark over index). */
const pair = (c, top, bottom, ranked) => `<td class="${c[top].hatch ? 'dk-hatch' : ''}"><div class="fig-pair">${figure(c[top], top, ranked)}${figure(c[bottom], bottom, ranked)}</div></td>`;

/** Units get a fixed width per column (USD, USDT, USDT0 …), so the digits line up instead of waving. */
const UNIT_WIDTH = { bid: 'u5', ask: 'u5', mark: 'u5', index: 'u5', spread: 'u3', fund: 'u7', oi: 'u9' };
const figure = (x, col, ranked = false) => `<button class="fig ${x.state}" data-prov="${x.prov}">${esc(x.text)}<span class="fig__unit ${UNIT_WIDTH[col] || ''}">${esc(x.unit)}</span>${ranked ? rankSlot(x) : ''}</button>`;
const td = (x, inner) => `<td class="${x.hatch ? 'dk-hatch' : ''}">${inner}</td>`;
const freshChip = (x, value) => `<span class="fresh ${kindClass(x.kind)}"><span class="fresh__value">${esc(value)}</span>${x.kind}</span>`;
const chipCell = x => `<button class="fig fig--chip" data-prov="${x.prov}">${freshChip(x, x.text)}</button>`;
const smallChip = (x, lbl) => `<button class="fresh fresh--small ${kindClass(x.kind)}" data-prov="${x.prov}"><span class="fresh__lbl">${lbl}</span><span class="fresh__value">${esc(x.text)}</span>${x.kind}</button>`;

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

  const render = () => {
    const S = store.state, src = source(store, S);
    $('title').textContent = S.asset + ' perpetual · ticker call';
    $('tag').textContent = src.tag;
    $('tag').className = 'source-tag ' + src.tagClass;
    $('line').textContent = src.line;
    if (!src.targets) { $('body').innerHTML = `<div style="padding:14px">${blockFor(src, true)}</div>`; return; }
    registry = createRegistry();
    const rows = buildRows(src.targets, S.now, registry).slice(0, 5);
    $('body').innerHTML = `<div class="scroll-x"><table class="slice-table lm-table">
      <thead><tr><th class="l">Venue · instrument</th><th>Bid / Ask</th><th>Spread</th><th>Funding · interval</th><th>Age · status</th></tr></thead>
      <tbody>${rows.map(({ r, c }) => `<tr><td class="venue-cell">${esc(r.venue)}<small>${esc(r.sym)}</small></td>` +
        pair(c, 'bid', 'ask', true) + td(c.spread, figure(c.spread, 'spread', true)) + td(c.fund, figure(c.fund, 'fund')) + td(c.ageT, chipCell(c.ageT)) + '</tr>').join('')}</tbody>
    </table></div>`;
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
    const rows = buildRows(src.targets, S.now, registry);
    const byVenue = new Map((sparks.list || []).map(s => [s.venue, s]));
    $('body').innerHTML = `<div class="scroll-x"><table class="tbl arena-table min-640">
      <thead><tr><th>Venue</th><th class="r">Mark</th><th class="r">Spread</th><th class="r">24 h</th><th class="r">Funding</th><th class="r">Age · P / D</th></tr></thead>
      <tbody>${rows.slice(0, 6).map(({ r, c }) => {
        const s = byVenue.get(r.venue);
        const spark = !sparks.list ? '<span class="spark-note">requesting</span>' : !s ? '' : s.failed ? '<span class="spark-note">no answer</span>' : s.points.length > 1 ? sparkline(s.points.slice(-24)) : '<span class="spark-note">no bars</span>';
        return `<tr><td class="venue-cell">${esc(r.venue)}<small>${esc(r.sym)}</small></td>` +
          `<td class="td-num ${c.mark.hatch ? 'dk-hatch' : ''}">${esc(c.mark.text)}<span class="unit u5">${esc(c.mark.unit)}</span></td>` +
          `<td class="td-num ${c.spread.hatch ? 'dk-hatch' : ''}">${esc(c.spread.text)}<span class="unit u3">${esc(c.spread.unit)}</span>${rankSlot(c.spread)}</td>` +
          `<td class="r">${spark}</td>` +
          `<td class="td-num ${c.fund.hatch ? 'dk-hatch' : ''}">${esc(c.fund.text)}<span class="unit u7">${esc(c.fund.unit)}</span></td>` +
          `<td class="age">${esc(c.ageT.text)} <span class="faint">/</span> <span class="fg-${c.ageD.kind === 'UNSUPPORTED' ? 'missing' : c.ageD.kind.toLowerCase()}">${esc(c.ageD.text)}</span></td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
  };
  store.subscribe(() => { render(); loadSparks(); }, ['market', 'snapshot']);
  store.subscribe(render, ['tick']);
  render();
}

// ── Full comparison ─────────────────────────────────────────────────────────────────────────

/**
 * @param {{ syncUrl?: boolean }} opts syncUrl: read asset/metric/range from the page's own query
 *   string on mount (falling back to the same defaults as always for anything missing or not a
 *   real METRICS/RANGES key), and write the resolved state back with history.replaceState on every
 *   change — what Arena needs for a shareable view. Off by default, so the homepage's #live-full
 *   mount behaves exactly as it always has and never touches the homepage's own URL.
 */
export function mountFull(root, store, { syncUrl = false } = {}) {
  let registry = null;
  const params = syncUrl ? new URLSearchParams(location.search) : null;
  let initialMetric = (params && METRIC_SLUGS[params.get('metric')]) || 'Trade price';
  let initialRange = (params && RANGE_SLUGS[params.get('range')]) || '24 h';
  // Same rule the metric selector's own change handler applies: a non-candle metric cannot show a
  // candles-only range, so an incompatible pair from the query string is corrected the same way.
  if (METRICS[initialMetric].kind !== 'candles' && RANGES[initialRange].candlesOnly) initialRange = '24 h';
  const ui = { metric: initialMetric, range: initialRange, hidden: {} };
  const writeUrl = () => {
    if (!syncUrl) return;
    const p = new URLSearchParams(location.search);
    p.set('asset', store.state.asset);
    p.set('metric', METRIC_TO_SLUG[ui.metric] || ui.metric);
    p.set('range', RANGE_TO_SLUG[ui.range] || ui.range);
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
  };
  root.innerHTML = `
    <div class="lm-controls">
      <label class="field"><span class="field__label">Instrument</span><span class="field__box field__box--select"><select data-slot="asset"></select>${icon('chevron-down', 14)}</span></label>
      <label class="field"><span class="field__label">Metric</span><span class="field__box field__box--select"><select data-slot="metric">${Object.keys(METRICS).map(m => `<option>${m}</option>`).join('')}</select>${icon('chevron-down', 14)}</span></label>
      <div class="field"><span class="field__label">Range</span><div class="segmented" data-slot="range">${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}">${r}</button>`).join('')}</div></div>
      <div class="spacer"></div>
      <div class="lm-source"><span class="source-tag" data-slot="tag"></span><span class="meta-xs" style="font-size:11px;text-align:right" data-slot="line"></span></div>
    </div>
    <div class="lm-chart-area">
      <div class="lm-chart" data-slot="chart"></div>
      <div class="lm-legend"><div class="label" style="margin-bottom:6px">Venues · toggle</div><div class="stack gap-6" data-slot="legend"></div>
        <div class="meta" style="margin-top:auto;padding-top:10px">Unsupported: the venue publishes no such field. It is not drawn as a flat line.</div></div>
    </div>
    <div data-slot="table"></div>
    <details class="lm-log" data-slot="log-wrap" hidden><summary data-slot="log-title"></summary><div class="lm-log__grid" data-slot="log"></div></details>
    <div data-slot="observation"></div>`;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  wireProvenance(root, () => registry);

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
    ui.hidden[b.dataset.venue] = !ui.hidden[b.dataset.venue];
    renderChart();
  });

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
    root.querySelectorAll('[data-range]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.range === ui.range));
      b.disabled = !candles && !!RANGES[b.dataset.range].candlesOnly;
      b.title = b.disabled ? 'History beyond 48 h is served in pages; this page does not page it' : '';
    });
    $('tag').textContent = src.tag;
    $('tag').className = 'source-tag ' + src.tagClass;
    $('line').textContent = src.line;
  }

  function renderChart() {
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
    const drawable = list.filter(s => !s.unsupported && s.points.length && !ui.hidden[s.venue]);
    const all = drawable.flatMap(s => s.points.map(p => p.v));
    const now = Date.now(), x0 = now - RANGES[ui.range].ms;

    $('legend').innerHTML = list.map(s => {
      const off = s.unsupported || !s.points.length;
      const tag = s.unsupported ? 'Unsupported' : s.failed ? 'No answer' : !s.points.length ? 'No data' : '';
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

  function renderTable() {
    const S = store.state, src = source(store, S);
    if (!src.targets) {
      $('table').innerHTML = `<div style="padding:14px">${blockFor(src, false)}</div>`;
      $('observation').innerHTML = '';
      return;
    }
    registry = createRegistry();
    const rows = buildRows(src.targets, S.now, registry);
    const groups = [['Identity', 1], ['Quote · ticker call', 2], ['Reference', 1], ['Funding', 1], ['OI · own call', 1], ['Depth · own call', 1], ['Time · ticker', 1], ['Age per call', 1]];
    $('table').innerHTML = `<div class="scroll-x" style="position:relative"><table class="lm-table">
      <thead>
        <tr>${groups.map(([label, span], i) => `<th colspan="${span}" class="group${i === 7 ? ' group--age' : ''}">${label}</th>`).join('')}</tr>
        <tr><th class="l sticky">Venue · status</th><th>Bid / Ask</th><th>Spread</th><th>Mark / Index</th><th>Funding</th><th>Open interest</th><th>Depth ±25 bps</th><th>Venue / received</th><th>Age · T / OI / D</th></tr>
      </thead>
      <tbody>${rows.map(({ r, c }) => `<tr>
        <td class="venue">${esc(r.venue)}<small>${esc(r.sym)}${r.model === 'oracle_vault' ? ' · vault' : ''}</small><button class="fresh fresh--small row-status ${kindClass(c.status.kind)}" data-prov="${c.status.prov}">${c.status.kind}</button></td>
        ${pair(c, 'bid', 'ask', true)}${td(c.spread, figure(c.spread, 'spread', true))}${pair(c, 'mark', 'index', false)}
        ${td(c.fund, figure(c.fund, 'fund'))}${td(c.oi, figure(c.oi, 'oi'))}${td(c.depth, figure({ ...c.depth, unit: '' }, 'depth', true))}
        <td><button class="fig fig--stack" data-prov="${c.received.prov}"><span class="${c.venueTime.kind === 'MISSING' ? 'faint' : 'muted'}">${esc(c.venueTime.kind === 'MISSING' ? 'venue sends none' : c.venueTime.text)}</span><span>${esc(c.received.text)}</span></button></td>
        <td><div class="fig-chips">${smallChip(c.ageT, 'T')}${smallChip(c.ageO, 'OI')}${smallChip(c.ageD, 'D')}</div></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="panel__foot"><span>Perpetual venues only · table scrolls sideways · venue column stays</span><span>— missing this snapshot · hatched: not published by the venue · dimmed: stale</span></div>`;

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
      `<span class="${l.status === 200 ? 'muted' : 'fg-stale'}">${l.status ? 'HTTP ' + l.status : esc(l.error)}</span><span class="faint">${l.ms} ms</span><span class="faint">${l.kb ? l.kb + ' KB' : ''}</span>`).join('');
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
