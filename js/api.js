// Data layer for the CryptoSmith X public market-data API (read-only, no key).
// Reference: https://cryptosmithx.blynai.eu/scalar/v1
//
// Everything a block shows is read here. Nothing is invented: a failed call leaves the block empty
// with its reason, or shows a saved response from data/saved/ labelled with the time it was saved.

import { utcMillis } from './format.js';

export const API = {
  production: 'https://cryptosmithx.blynai.eu/v1',
  test: 'https://cryptosmithx-test.blynai.eu/v1'
};

/** ?api=test switches the whole page to the test contour; otherwise <html data-api> decides. */
export function apiEnv() {
  const fromQuery = new URLSearchParams(location.search).get('api');
  if (fromQuery && API[fromQuery]) return fromQuery;
  const fromPage = document.documentElement.dataset.api;
  return API[fromPage] ? fromPage : 'production';
}

/** How often the snapshot fan-out repeats. Venues are polled by the collectors every 1–15 s,
 *  so a faster page only re-reads the same rows; each cycle is one call per venue. */
export const REFRESH_MS = 5000;
/** Health and coverage change slowly; they are re-read on this cadence. */
export const META_REFRESH_MS = 30000;

/** PROVISIONAL freshness thresholds in seconds, [LIVE ≤, DELAYED ≤], per call group:
 *  t = ticker, o = open interest, d = depth. The API returns ages, not verdicts; the backend
 *  owns the real thresholds before launch. */
export const THRESHOLDS = { t: [15, 60], o: [120, 600], d: [300, 900] };

/** Marker for "the venue publishes no such field" — different from a missing value. */
export const UNSUP = 'UNSUP';
/** A field the venue may well publish but this service does not collect on that venue — read from
 *  GET /v1/coverage datasets. Not a freshness problem and not the venue's absence either. */
export const NOTCOL = 'NOTCOL';

/** An asset is offered in the selector when at least this share of perp venues has a fresh
 *  snapshot for it. Measured 2026-09-14: 25 assets on 11–15 of 15 venues, then 2 of 15. */
const POPULAR_SHARE = 0.5;
const FRESH_SECONDS = 120;
const ALIASES = { XBT: 'BTC' };
const QUOTE_PREFERENCE = ['USDT', 'USD', 'USDC'];

const num = v => (v == null || v === '' ? null : Number(v));
const baseOf = asset => ALIASES[String(asset || '').toUpperCase()] || String(asset || '').toUpperCase();

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────

/** GET with a timeout. Every call is appended to `log` so the page can show what it asked. */
export async function get(base, path, log, timeout = 9000) {
  const started = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(base + path, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    const entry = { path, status: res.status, ms: Math.round(performance.now() - started), kb: (text.length / 1024).toFixed(1), at: new Date().toISOString() };
    log.push(entry);
    if (!res.ok) return { ok: false, entry };
    return { ok: true, data: JSON.parse(text), entry };
  } catch (e) {
    const entry = { path, status: 0, ms: Math.round(performance.now() - started), error: e.name === 'AbortError' ? 'timeout' : 'network error', at: new Date().toISOString() };
    log.push(entry);
    return { ok: false, entry };
  } finally {
    clearTimeout(timer);
  }
}

/** A saved response: data/saved/<name>.json holding { savedAt, request, data }. Resolved against
 *  this module's own URL, not the page's — 'data/saved/…' is relative to whatever page imported
 *  it, so a page one or more folders deep (/arena/, /data/coverage/) asked its own, nonexistent
 *  data/saved/ instead of the site's, and every failed call logged a spurious 404. */
export async function saved(name) {
  try {
    const res = await fetch(new URL('../data/saved/' + name + '.json', import.meta.url), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.data ? json : null;
  } catch {
    return null;
  }
}

export function tier(group, seconds) {
  if (seconds == null) return null;
  const [live, delayed] = THRESHOLDS[group];
  return seconds <= live ? 'LIVE' : seconds <= delayed ? 'DELAYED' : 'STALE';
}

// ── Which instruments exist ─────────────────────────────────────────────────────────────────

/** Perp segments, and the base assets quoted with a fresh snapshot on most of them. */
export async function loadUniverse(base, log) {
  const ex = await get(base, '/exchanges', log);
  if (!ex.ok) return null;
  const segments = ex.data.filter(s => s.kind === 'perp' && s.status === 'enabled');
  const perpCodes = new Set(segments.map(s => s.code));

  // Which datasets each venue actually collects. Without it a venue whose book is not collected
  // (coinbase-perp today) shows depth as MISSING on every row, and that MISSING becomes the row's
  // status. If the call fails, datasets stay unknown and the old reading applies.
  const cov = await get(base, '/coverage', log);
  if (cov.ok && Array.isArray(cov.data.venues)) {
    const byCode = new Map(cov.data.venues.map(v => [v.code, v.datasets || []]));
    for (const s of segments) if (byCode.has(s.code)) s.datasets = byCode.get(s.code);
  }

  const snap = await get(base, '/snapshot?status=trading&maxAgeSeconds=' + FRESH_SECONDS, log, 15000);
  const fresh = new Map(); // asset -> Map(segment -> [rows])
  if (snap.ok) {
    for (const row of snap.data.tickers || []) {
      if (!perpCodes.has(row.segmentCode)) continue;
      const asset = baseOf(row.baseAsset);
      if (!fresh.has(asset)) fresh.set(asset, new Map());
      const byVenue = fresh.get(asset);
      if (!byVenue.has(row.segmentCode)) byVenue.set(row.segmentCode, []);
      byVenue.get(row.segmentCode).push(row);
    }
  }
  const minVenues = Math.ceil(segments.length * POPULAR_SHARE);
  const assets = [...fresh.entries()]
    .map(([asset, byVenue]) => ({ asset, venues: byVenue.size }))
    .filter(a => a.venues >= minVenues)
    .sort((a, b) => b.venues - a.venues || a.asset.localeCompare(b.asset));

  return { segments, assets, fresh, perpCount: segments.length };
}

const instrumentCache = new Map();
async function instrumentsOf(base, code, log) {
  if (!instrumentCache.has(code)) {
    instrumentCache.set(code, get(base, '/instruments?exchange=' + encodeURIComponent(code), log)
      .then(r => (r.ok && Array.isArray(r.data) ? r.data : [])));
  }
  return instrumentCache.get(code);
}

/** One listing per venue for "<asset> perpetual": a fresh one, USDT before USD before USDC, or by the
 *  same preference among all listings when none is fresh (so a venue whose feed stopped still appears — as STALE, not as absent). */
export async function loadPlan(base, universe, asset, log) {
  const freshByVenue = universe.fresh.get(asset) || new Map();
  const perVenue = await Promise.all(universe.segments.map(async seg => {
    const listed = (await instrumentsOf(base, seg.code, log))
      .filter(i => baseOf(i.baseAsset) === asset && i.status === 'trading');
    if (!listed.length) return null;
    const freshRows = (freshByVenue.get(seg.code) || []).slice()
      .sort((a, b) => rank({ quoteAsset: a.quoteAsset }) - rank({ quoteAsset: b.quoteAsset }) || a.ageSeconds - b.ageSeconds);
    const bySymbol = new Map(listed.map(i => [i.symbol, i]));
    const pick = freshRows.map(r => bySymbol.get(r.symbol)).find(Boolean)
      || listed.slice().sort((a, b) => rank(a) - rank(b) || a.symbol.length - b.symbol.length)[0];
    return { seg, code: seg.code, inst: pick };
  }));
  return perVenue.filter(Boolean);
}
const rank = inst => { const i = QUOTE_PREFERENCE.indexOf(inst.quoteAsset); return i < 0 ? 9 : i; };

// ── Live snapshot ───────────────────────────────────────────────────────────────────────────

export async function loadSnapshots(base, plan, log) {
  const targets = await Promise.all(plan.map(async t => {
    const path = '/snapshot?exchange=' + encodeURIComponent(t.code) + '&symbols=' + encodeURIComponent(t.inst.symbol) + '&include=quote,depth,instrument';
    const r = await get(base, path, log);
    if (!r.ok) return { ...t, row: null, failed: true, fetchedAt: Date.now() };
    return { ...t, row: (r.data.tickers || [])[0] || null, fetchedAt: Date.now(), warnings: r.data.warnings };
  }));
  return { targets, at: new Date().toISOString() };
}

/**
 * One venue row in the shape the tables draw. Ages are computed without trusting this
 * browser's clock: the server's "now" is receivedAt + ageSeconds at the moment of the response,
 * and the time since that response is added on top.
 */
export function normalise(t, now) {
  const r = t.row || {}, seg = t.seg || {}, inst = t.inst || {};
  const oracle = seg.marketModel === 'oracle_vault';
  const quoteOrUnsup = v => (oracle && v == null ? UNSUP : num(v));
  const noDepth = !oracle && Array.isArray(seg.datasets) && !seg.datasets.includes('depth');

  const elapsed = Math.max(0, (now - (t.fetchedAt || now)) / 1000);
  const serverNow = r.receivedAt != null && r.ageSeconds != null ? Date.parse(r.receivedAt) + r.ageSeconds * 1000 : null;
  const ageAt = iso => (iso && serverNow != null ? Math.max(0, Math.round((serverNow - Date.parse(iso)) / 1000 + elapsed)) : null);
  const ageT = r.ageSeconds != null ? Math.round(r.ageSeconds + elapsed) : null;
  const ageO = ageAt(r.openInterestAt);
  const ageD = oracle ? null : ageAt(r.depthAt);

  return {
    venue: String(t.code || '').toUpperCase(),
    exchange: seg.exchangeCode || '',
    sym: r.symbol || inst.symbol || '—',
    model: oracle ? 'oracle_vault' : 'orderbook',
    base: r.baseAsset || inst.baseAsset || '',
    quote: r.quoteAsset || inst.quoteAsset || '',
    bid: quoteOrUnsup(r.bidPrice), ask: quoteOrUnsup(r.askPrice),
    mark: num(r.markPrice), index: num(r.indexPrice),
    fund: r.fundingRate == null ? null : Number(r.fundingRate) * 100,
    pred: r.fundingRatePredicted == null ? null : Number(r.fundingRatePredicted) * 100,
    fint: num(inst.fundingIntervalHours),
    // Price decimals follow the venue's own price step (0.1 → 1, 1 → 0); a venue that publishes no step gets 2.
    step: num(inst.priceStep),
    pdec: inst.priceStep ? Math.min(8, Math.max(0, Math.ceil(-Math.log10(Number(inst.priceStep)) - 1e-9))) : 2,
    oi: num(r.openInterest), oiNotional: num(r.openInterestNotional), mult: num(inst.contractMultiplier),
    db: oracle ? UNSUP : noDepth ? NOTCOL : num(r.depthBid25Bps), da: oracle ? UNSUP : noDepth ? NOTCOL : num(r.depthAsk25Bps), depthRef: num(r.depthRef),
    vt: utcMillis(r.venueTs), rt: utcMillis(r.receivedAt), rto: utcMillis(r.openInterestAt), rtd: utcMillis(r.depthAt),
    ag: { t: ageT, o: ageO, d: ageD },
    st: {
      t: tier('t', ageT) || 'MISSING',
      o: tier('o', ageO) || 'MISSING',
      d: oracle ? 'UNSUPPORTED' : noDepth ? 'NOT_COLLECTED' : (tier('d', ageD) || 'MISSING')
    },
    failed: !!t.failed
  };
}

// ── History for the chart ───────────────────────────────────────────────────────────────────

export const METRICS = {
  'Trade price': { kind: 'candles', priceType: 'trade', unit: 'quote', decimals: 2 },
  Mark: { kind: 'candles', priceType: 'mark', unit: 'quote', decimals: 2 },
  Index: { kind: 'candles', priceType: 'index', unit: 'quote', decimals: 2 },
  Spread: { kind: 'history', path: '/tickers/history', unit: 'bps', decimals: 2, bookOnly: true },
  Funding: { kind: 'history', path: '/funding', unit: '% per venue interval', decimals: 4 },
  'Open interest': { kind: 'history', path: '/open-interest', unit: 'notional, quote', decimals: 0 },
  Depth: { kind: 'history', path: '/depth', unit: 'bid + ask within ±25 bps, quote', decimals: 0, bookOnly: true }
};

/** Candle timeframe and bar count per range. Raw history endpoints serve at most 48 h a call,
 *  so their longer ranges are not offered on this page. */
export const RANGES = {
  '1 h': { ms: 3600e3, tf: 1, bars: 60 },
  '24 h': { ms: 864e5, tf: 15, bars: 96 },
  '7 d': { ms: 7 * 864e5, tf: 60, bars: 168, candlesOnly: true },
  '30 d': { ms: 30 * 864e5, tf: 240, bars: 180, candlesOnly: true }
};

const HISTORY_VALUE = {
  Spread: i => (i.bidPrice != null && i.askPrice != null && i.bidPrice + i.askPrice > 0
    ? (i.askPrice - i.bidPrice) / ((i.askPrice + i.bidPrice) / 2) * 1e4 : null),
  Funding: i => (i.fundingRate == null ? null : i.fundingRate * 100),
  'Open interest': i => num(i.openInterestNotional),
  Depth: i => (i.bidDepth && i.askDepth && i.bidDepth['25'] != null && i.askDepth['25'] != null
    ? i.bidDepth['25'] + i.askDepth['25'] : null)
};

/** One series per venue: points [{ t, v }] in time order, plus why a series may be empty. */
export async function loadSeries(base, targets, metric, range, log) {
  const m = METRICS[metric], rg = RANGES[range];
  const now = Date.now();
  return Promise.all(targets.map(async t => {
    const venue = String(t.code).toUpperCase();
    const enc = '?exchange=' + encodeURIComponent(t.code) + '&symbols=' + encodeURIComponent(t.inst.symbol);
    if (m.bookOnly && t.seg.marketModel === 'oracle_vault') return { venue, points: [], unsupported: true };
    if (m.path === '/depth' && Array.isArray(t.seg.datasets) && !t.seg.datasets.includes('depth')) return { venue, points: [], notCollected: true };

    if (m.kind === 'candles') {
      const r = await get(base, '/candles' + enc + '&tf=' + rg.tf + '&limit=' + rg.bars + '&priceType=' + m.priceType, log);
      if (!r.ok) return { venue, points: [], failed: true };
      const bars = (r.data.series && (r.data.series[t.inst.symbol] || Object.values(r.data.series)[0])) || [];
      const warning = (r.data.warnings || [])[0];
      const points = bars
        .map(b => ({ t: Date.parse(b.openTime), v: num(b.close), o: num(b.open), h: num(b.high), l: num(b.low) }))
        .filter(p => !isNaN(p.t) && p.v != null && p.t >= now - rg.ms);
      return { venue, points, unsupported: !points.length && /publish/i.test(String(warning || '')), warning };
    }

    const from = new Date(now - rg.ms).toISOString(), to = new Date(now).toISOString();
    const r = await get(base, m.path + enc + '&from=' + from + '&to=' + to + '&limit=5000', log, 15000);
    if (!r.ok) return { venue, points: [], failed: true };
    const points = (r.data.items || [])
      .map(i => ({ t: Date.parse(i.utc), v: HISTORY_VALUE[metric](i) }))
      .filter(p => !isNaN(p.t) && p.v != null)
      .sort((a, b) => a.t - b.t);
    return { venue, points, truncated: !!r.data.nextCursor };
  }));
}

// ── Health and coverage ─────────────────────────────────────────────────────────────────────

/** Strips the exception-class prefix, then any URL or host:port the collector's own error text
 *  carries — several venues' errors include the request URL verbatim — before cutting to 48
 *  characters. The status page promises no internal address is shown; this is where that holds. */
export function scrubError(raw) {
  if (!raw) return null;
  const text = String(raw)
    .replace(/^[A-Za-z.]+(Exception|Error):\s*/, '')
    .replace(/https?:\/\/\S+/gi, '[address]')
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}:\d{2,5}\b/gi, '[address]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/g, '[address]');
  // Cut at a word boundary and say it was cut, rather than stopping mid-word ("does not ind").
  if (text.length <= 48) return text;
  const cut = text.slice(0, 48);
  const space = cut.lastIndexOf(' ');
  return (space > 24 ? cut.slice(0, space) : cut).replace(/[\s,.;:·-]+$/, '') + ' …';
}

/** GET /v1/health summarised per venue: worst failure streak, latest success, latest error. */
export function normaliseHealth(d) {
  if (!d || !Array.isArray(d.collectors)) return null;
  const staleBy = new Map();
  for (const s of d.staleInstruments || []) staleBy.set(s.segmentCode, (staleBy.get(s.segmentCode) || 0) + 1);
  const byVenue = new Map();
  for (const c of d.collectors) {
    if (!byVenue.has(c.segmentCode)) byVenue.set(c.segmentCode, []);
    byVenue.get(c.segmentCode).push(c);
  }
  const rows = [...byVenue.entries()].map(([code, cols]) => {
    const fails = Math.max(0, ...cols.map(c => c.consecutiveFailures || 0));
    const lastSuccessAt = cols.map(c => c.lastSuccessAt).filter(Boolean).sort().pop() || null;
    const successAges = cols.map(c => c.lastSuccessAgeSeconds).filter(x => x != null);
    const lastSuccessAge = successAges.length ? Math.round(Math.min(...successAges)) : null;
    const withError = cols.filter(c => c.lastError).sort((a, b) => (a.lastErrorAgeSeconds ?? 1e12) - (b.lastErrorAgeSeconds ?? 1e12))[0];
    const failing = cols.filter(c => (c.consecutiveFailures || 0) > 0).map(c => c.collector);
    return {
      code: code.toUpperCase(), fails, lastSuccessAt, lastSuccessAge,
      lastError: withError ? scrubError(withError.lastError) : null,
      lastErrorAge: withError && withError.lastErrorAgeSeconds != null ? Math.round(withError.lastErrorAgeSeconds) : null,
      stale: staleBy.get(code) || 0,
      note: failing.length ? failing.join(' · ') + ' failing' : cols.length + ' collectors'
    };
  }).sort((a, b) => b.fails - a.fails || a.code.localeCompare(b.code));
  return { overall: String(d.status || '').toLowerCase() || null, rows };
}

/** GET /v1/coverage: enabled venues with the dataset groups each collects. Perp only by default,
 *  which is what the homepage catalogue and Arena's venue count read; pass { allKinds: true } for
 *  the coverage page's full catalogue (perp and spot together). */
export const DATASET_GROUPS = [
  ['ticker', /ticker|snapshot|quote/], ['candles', /^candles/], ['funding', /funding/],
  ['oi', /open.?interest|^oi/], ['trades', /trade/], ['liq', /liquidation/], ['depth', /depth|book|order/]
];
export function normaliseCoverage(d, { allKinds = false } = {}) {
  return (d && Array.isArray(d.venues) ? d.venues : []).filter(v => allKinds || v.kind === 'perp').map(v => {
    const raw = v.datasets || [];
    return {
      venue: v.code.toUpperCase(), code: v.code, name: v.name || v.code, kind: v.kind,
      groups: DATASET_GROUPS.filter(([, re]) => raw.some(n => re.test(n))).map(([g]) => g),
      other: raw.filter(n => !DATASET_GROUPS.some(([, re]) => re.test(n))),
      collected: num(v.instruments), trading: num(v.trading), listed: num(v.listed), since: v.since || null
    };
  });
}

/** GET /v1/coverage/hours: the last `hours` cells per segment, with recorded interruptions. */
export function normaliseCoverageHours(d, hours = 48) {
  if (!d || !Array.isArray(d.segments)) return null;
  const gapsBy = new Map();
  for (const g of d.gaps || []) {
    if (!gapsBy.has(g.segment)) gapsBy.set(g.segment, []);
    gapsBy.get(g.segment).push(g);
  }
  return d.segments.map(s => {
    const gaps = gapsBy.get(s.code) || [];
    return {
      code: s.code.toUpperCase(),
      cells: (s.hours || []).slice(-hours).map(h => {
        const start = Date.parse(h.hour), end = start + 3600e3;
        const hit = gaps.find(g => Date.parse(g.start) < end && (g.end ? Date.parse(g.end) : Date.now()) > start);
        return { hour: h.hour, state: h.state, completeness: h.completeness, cause: hit ? hit.cause : null };
      })
    };
  });
}

// ── Forms ───────────────────────────────────────────────────────────────────────────────────

/** Waitlist and sales requests. No endpoint exists yet, so nothing is sent and the caller is told so. */
export async function submitLead(/* kind, fields */) {
  return { ok: false, reason: 'No endpoint is connected yet. Nothing was sent.' };
}

// ── Shared store ────────────────────────────────────────────────────────────────────────────

/**
 * One poller for the whole page. Subscribers name the events they redraw on:
 *  'meta'     health and coverage (every META_REFRESH_MS)
 *  'market'   instrument list or selected instrument changed
 *  'snapshot' a new fan-out landed
 *  'series'   chart history landed
 *  'tick'     one second passed (ages count up between responses)
 */
export function createStore() {
  const env = apiEnv(), base = API[env];
  const subs = new Set();
  let generation = 0;
  const store = {
    env, base,
    // covHoursDays: the /coverage/hours range the meta poll reads, 7 by default — what the homepage
    // strip has always requested. Coverage.js is the only caller that changes it, and it does so on
    // its own store instance, so the homepage's own poll is never affected.
    state: { loading: true, metaLoaded: false, universe: null, asset: 'BTC', plan: null, live: null, savedMarket: null, health: null, cov: null, covHours: null, covHoursDays: 7, series: null, log: [], now: Date.now() },
    subscribe(fn, kinds) { const s = { fn, kinds }; subs.add(s); return () => subs.delete(s); }
  };
  const emit = kind => subs.forEach(s => { if (!s.kinds || s.kinds.includes(kind)) { try { s.fn(store.state, kind); } catch (e) { console.warn('[store] subscriber failed', e); } } });
  const set = (patch, kind) => { store.state = { ...store.state, ...patch }; emit(kind); };
  const keepLog = (entries, dropPrefix) => store.state.log.filter(l => !dropPrefix || !l.path.startsWith(dropPrefix)).concat(entries).slice(-80);

  let metaTimer = null, metaGen = 0;
  async function loadMeta() {
    const gen = ++metaGen;
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; }
    const log = [];
    const days = store.state.covHoursDays;
    const [health, cov, hours] = await Promise.all([get(base, '/health', log), get(base, '/coverage', log), get(base, '/coverage/hours?days=' + days, log, 20000)]);
    if (gen !== metaGen) return; // superseded by a later call — e.g. the range control changed again mid-flight
    const pick = async (r, name) => (r.ok ? { data: r.data, at: r.entry.at, src: 'live' } : (await saved(name).then(s => (s ? { data: s.data, at: s.savedAt, src: 'saved' } : null))));
    const hoursPicked = await pick(hours, 'coverage-hours');
    // forDays: what covHoursDays this response actually answers — coverage.js compares it to the
    // then-current state.covHoursDays so a range switch shows loading rather than a stale response
    // sliced to a range it was never fetched for.
    set({ metaLoaded: true, health: await pick(health, 'health'), cov: await pick(cov, 'coverage'), covHours: hoursPicked ? { ...hoursPicked, forDays: days } : null, log: keepLog(log) }, 'meta');
    metaTimer = setTimeout(loadMeta, META_REFRESH_MS);
  }

  /** Coverage.js's range switch: re-reads /coverage/hours at a different span, immediately rather
   *  than waiting for the next 30 s cycle. Only the store this was called on is affected. */
  store.setHoursDays = days => {
    if (store.state.covHoursDays === days) return;
    set({ covHoursDays: days }, 'meta');
    loadMeta();
  };

  /** Starts only the health/coverage/coverage-hours cadence — no universe load, no asset selection,
   *  no snapshot fan-out. What coverage.js and status.js need: neither mounts a live market table.
   *  A page that does (the homepage, Arena) uses the full store.start() instead. */
  store.startMeta = () => { loadMeta(); };

  async function poll(gen) {
    if (gen !== generation || !store.state.plan) return;
    const log = [];
    const snap = await loadSnapshots(base, store.state.plan, log);
    if (gen !== generation) return;
    if (snap.targets.some(t => t.row)) set({ live: snap, loading: false, log: keepLog(log, '/snapshot'), now: Date.now() }, 'snapshot');
    else {
      const fallback = store.state.asset === 'BTC' && !store.state.live ? await saved('market') : null;
      set({ loading: false, savedMarket: fallback ? { targets: fallback.data, at: fallback.savedAt } : store.state.savedMarket, log: keepLog(log, '/snapshot') }, 'snapshot');
    }
    setTimeout(() => poll(gen), REFRESH_MS);
  }

  store.setAsset = async asset => {
    const gen = ++generation;
    set({ asset, plan: null, live: null, series: null, loading: true }, 'market');
    const log = [];
    const plan = store.state.universe ? await loadPlan(base, store.state.universe, asset, log) : null;
    if (gen !== generation) return;
    set({ plan, log: keepLog(log) }, 'market');
    if (plan && plan.length) poll(gen);
    else set({ loading: false }, 'snapshot');
  };

  /** quiet: a refresh of the series already on screen — no loading state, so the chart keeps
   *  drawing and applies only what changed. */
  store.loadSeries = async (metric, range, { quiet = false } = {}) => {
    const key = store.state.asset + '|' + metric + '|' + range;
    const plan = store.state.plan;
    if (!plan) return;
    if (quiet && (!store.state.series || store.state.series.key !== key || store.state.series.loading)) return;
    if (!quiet) set({ series: { key, loading: true } }, 'series');
    const log = [];
    const series = await loadSeries(base, plan, metric, range, log);
    if (!store.state.series || store.state.series.key !== key) return;
    set({ series: { key, loading: false, list: series, refreshed: quiet }, log: keepLog(log) }, 'series');
  };

  /** Trade-price history for one venue, for the in-row sparkline. Not part of state: the table asks
   *  for the rows it can see and caches the answers itself. */
  store.loadVenueSeries = async (code, range) => {
    const target = (store.state.plan || []).find(t => t.code === code);
    if (!target) return null;
    const log = [];
    const [s] = await loadSeries(base, [target], 'Trade price', range, log);
    store.state = { ...store.state, log: keepLog(log) };
    return s;
  };

  /** initialAsset: what Arena's ?asset= asked for, unvalidated. Used only if the loaded universe
   *  actually offers it; otherwise the existing BTC-or-first default applies, exactly as before —
   *  callers that pass nothing (the homepage) see no change in behaviour. */
  store.start = async initialAsset => {
    loadMeta();
    setInterval(() => set({ now: Date.now() }, 'tick'), 1000);
    const log = [];
    const universe = await loadUniverse(base, log);
    set({ universe, log: keepLog(log) }, 'market');
    if (universe) {
      const wanted = String(initialAsset || '').toUpperCase();
      const known = wanted && universe.assets.some(a => a.asset === wanted) ? wanted : null;
      store.setAsset(known || (universe.assets.some(a => a.asset === 'BTC') ? 'BTC' : (universe.assets[0] || {}).asset || 'BTC'));
    } else {
      const fallback = await saved('market');
      set({ loading: false, savedMarket: fallback ? { targets: fallback.data, at: fallback.savedAt } : null }, 'snapshot');
    }
  };

  return store;
}
