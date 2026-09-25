// Hero slice fed by the v2 platform (api.debyko.com), the same source as the platform's /lab page.
//
// Nothing about venues or instruments is written into this file: the registry comes from
// GET /v1/markets (normalised markets and their listings) and GET /v1/segments (which segments are
// live), so a venue or market added on the platform appears here without a code change. Values come
// from GET /v1/snapshot.
//
// Polling, not the SSE stream: /v1/stream filters by venue only and carries every trade, book metric
// and instrument — about 110 KB/s per open tab. Ages are the service's own ageSeconds at response
// time, then counted up locally every 100 ms so a value that stops changing is seen getting older
// between polls. Polling stops while the tab is hidden.

import { esc } from './format.js';

export const V2_BASE = 'https://api.debyko.com';
const POLL_MS = 500;
const REGISTRY_MS = 5 * 60 * 1000;
const HERO_MARKETS = 3;

// Ticker freshness: the DQL default bound for the ticker layer is 30 s. LIVE is kept far tighter
// here because this panel exists to show what live means.
const kindOf = age => age == null ? 'missing' : age < 2 ? 'live' : age < 30 ? 'delayed' : 'stale';
const WORD = { live: 'LIVE', delayed: 'DELAYED', stale: 'STALE', missing: 'MISSING' };

const priceFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });

// Venues quote at their own price step and publish marks to their own precision, so the digits in a
// column differ from row to row and from poll to poll. Each number is split into sign, integer part
// and fraction; the column reserves the widest of each it has seen, so the decimal point of every
// figure in a column sits on one vertical line and nothing shifts when a venue gains or loses a
// decimal. Widths only grow within a page's life: a column that shrank back would jump once more.
// The digits themselves are never padded or rounded — the value is printed as the venue published it.
const widest = new Map();
const fixedFmt = dp => new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
// A venue's own price is printed exactly as published; a derived figure keeps the fixed number of
// decimals its definition states, trailing zeros and all, so the column reads as one number.
const format = (v, dp) => (dp == null ? priceFmt : fixedFmt(dp)).format(Math.abs(v));

function measure(col, v, dp) {
  if (v == null) return;
  const [i, f] = format(v, dp).split('.');
  const w = widest.get(col) || { sign: 0, int: 0, frac: 0 };
  widest.set(col, {
    sign: Math.max(w.sign, v < 0 ? 1 : 0),
    int: Math.max(w.int, i.length),
    frac: Math.max(w.frac, f ? f.length + 1 : 0)
  });
}
function figure(col, v, unit, dp) {
  const w = widest.get(col) || { sign: 0, int: 0, frac: 0 };
  const box = (cls, text, ch) => `<i class="num__${cls}" style="min-width:${ch}ch">${text}</i>`;
  if (v == null) return `<span class="num">${box('i', '—', w.sign + w.int)}${box('f', '', w.frac)}</span>`
    + (unit ? `<span class="fig__unit">${unit}</span>` : '');
  const [i, f] = format(v, dp).split('.');
  return `<span class="num">${box('i', (v < 0 ? '−' : '') + i, w.sign + w.int)}${box('f', f ? '.' + f : '', w.frac)}</span>`
    + (unit ? `<span class="fig__unit">${unit}</span>` : '');
}
const ageText = s => s == null ? '—' : s < 10 ? s.toFixed(1) + ' s' : Math.round(s) + ' s';
// The age column moves for the same reason the figures did: "0.4 s" and "1.1 s" and "12 s" are not
// the same width, and neither are LIVE and DELAYED, so the status word walked left and right on
// every poll. Both get a box as wide as the widest they have shown.
let ageW = 6;
const STATUS_W = Math.max(...Object.values(WORD).map(w => w.length));
// A chip's letters are spread — .14em on the word, .04em on the value — so a box of N ch is too
// narrow for N characters and the widest word still pushed the chip's edge out. The slot counts the
// spacing in.
const slot = (chars, spacing) => `calc(${chars}ch + ${chars} * ${spacing}em)`;
const since = ms => ms < 90_000 ? Math.round(ms / 1000) + ' s' : Math.round(ms / 60_000) + ' min';

// Kraken publishes funding as an absolute amount and as a relative rate; Hyperliquid as a rate. Both
// settle hourly, so the relative rates compare directly. A venue with neither field shows "—".
const fundingOf = r => r.fundingRelativeRate ?? r.fundingRate ?? null;

// Derived figures carry their own precision: a spread reads to a hundredth of a basis point and a
// funding rate to four decimals of a per cent. Venue-published prices are never rounded.
// Spread in basis points, from the venue's own bid and ask; null unless both are present.
const spreadOf = r => (r.bid != null && r.ask != null && r.bid + r.ask > 0)
  ? (r.ask - r.bid) / ((r.bid + r.ask) / 2) * 1e4 : null;

/** GET /v1/markets + /v1/segments. Listings the registry has not mapped to a market are dropped:
 *  a listing without a market cannot be compared with anything, so it has no row here. */
async function fetchRegistry() {
  const [markets, segments] = await Promise.all([
    fetch(V2_BASE + '/v1/markets', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('markets HTTP ' + r.status); return r.json(); }),
    fetch(V2_BASE + '/v1/segments', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('segments HTTP ' + r.status); return r.json(); })
  ]);
  const live = new Set(segments.filter(s => s.isLive && !s.synthetic).map(s => s.segment));
  const mapped = markets.map(m => ({
    code: m.code,
    listings: (m.listings || []).filter(l => l.mappingStatus === 'mapped' && live.has(l.segment))
  })).filter(m => m.listings.length);
  return { markets: mapped, segments: [...live], at: Date.now() };
}

/** Which markets the hero shows, as a rule rather than a list: a market earns a place by being
 *  quoted on at least two live venues — one venue proves nothing about comparison — and the ones
 *  with the most listings come first, because they show the most venues side by side. Ties are
 *  broken by market code so the order does not wander between loads. The first three are shown. */
function heroMarkets(registry) {
  return registry.markets
    .filter(m => m.listings.length >= 2)
    .sort((a, b) => b.listings.length - a.listings.length || a.code.localeCompare(b.code))
    .slice(0, HERO_MARKETS);
}

/** The registry line the DQL and API sections print: venues, markets and listings as the platform
 *  has them now, with the venue codes the API publishes — never a count typed into the markup. */
export function registryLine(registry) {
  const listings = registry.markets.reduce((n, m) => n + m.listings.length, 0);
  const venues = [...new Set(registry.markets.flatMap(m => m.listings.map(l => l.segment)))].sort();
  const n = (count, one, many) => count + ' ' + (count === 1 ? one : many);
  return `${n(venues.length, 'venue', 'venues')} · ${n(registry.markets.length, 'market', 'markets')} · ${n(listings, 'listing', 'listings')} · ${venues.map(v => v.toUpperCase()).join(', ')}`;
}

export function mountLiveV2(root, { onFullComparison, onRegistry } = {}) {
  root.innerHTML = `
    <div class="panel">
      <div class="panel__head panel__head--roomy">
        <span class="label label--accent" data-slot="title">Perpetuals · every venue that quotes them</span>
        <div class="row gap-10"><span class="source-tag" data-slot="tag">Requesting</span><span class="meta-xs" style="font-size:11px" data-slot="line"></span></div>
      </div>
      <div data-slot="body"><div class="meta-xs" style="padding:14px">Requesting the registry and the first values…</div></div>
      <div class="panel__foot"><span data-slot="foot">WebSocket from each venue · ages count up between polls</span><button class="text-btn text-btn--sm" data-slot="more">Full comparison →</button></div>
    </div>`;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  if (onFullComparison) $('more').addEventListener('click', onFullComparison);

  const rows = new Map();     // "segment/symbol" → snapshot row
  const seenAt = new Map();   // "segment/symbol" → local ms of receipt (now − ageSeconds)
  let registry = null, registryFailed = false, shown = '', selected = null;
  let lastOk = null, failed = false, timer = null, inFlight = false;
  const body = $('body');

  // The markets are tabs, not one long stack: with a dozen venues quoting each of them, three
  // stacked groups ran past the fold and the reader scrolled to compare what the panel exists to
  // show side by side.
  function drawTable() {
    const markets = heroMarkets(registry);
    // Rebuilding on every registry refresh would throw away the rows mid-tick; only a changed set
    // of listings is worth a rebuild.
    const key = markets.map(m => m.code + ':' + m.listings.map(l => l.segment + '/' + l.symbol).sort().join(',')).join('|');
    if (key === shown) return;
    shown = key;
    if (!markets.length) {
      body.innerHTML = `<div class="meta-xs" style="padding:14px">The registry lists no market quoted on two venues. Nothing is shown in its place.</div>`;
      return;
    }
    $('title').textContent = markets.map(m => m.code.replace(/-PERP$/, '')).join(' · ') + ' perpetual · every venue that quotes them';
    // A market the reader had open survives a registry refresh; one that left the registry does not.
    if (!markets.some(m => m.code === selected)) selected = markets[0].code;
    body.innerHTML = `<div class="lm-tabs segmented" role="tablist" aria-label="Market">${markets.map(m =>
        `<button role="tab" data-market="${esc(m.code)}" aria-selected="${m.code === selected}" aria-pressed="${m.code === selected}">${esc(m.code)}</button>`).join('')}</div>
      <div class="scroll-x"><table class="slice-table lm-table">
      <thead><tr><th class="l">Venue · symbol</th><th>Bid / Ask</th><th>Spread</th><th>Mark</th><th>Funding · 1 h</th><th>Age · status</th></tr></thead>
      <tbody data-slot="rows"></tbody></table></div>`;
    drawRows();
  }

  /** Only the open market's rows are in the document: a hidden row would still be measured, and the
   *  column widths are shared, so switching markets must not make the figures jump. */
  function drawRows() {
    const market = heroMarkets(registry).find(m => m.code === selected);
    const tbody = body.querySelector('[data-slot="rows"]');
    if (!market || !tbody) return;
    tbody.innerHTML = market.listings.map(l =>
      `<tr data-key="${esc(l.segment)}/${esc(l.symbol)}"><td class="venue-cell">${esc(l.segment.toUpperCase())}<small>${esc(l.symbol)}${l.quote ? ' · ' + esc(l.quote) : ''}</small></td>` +
      `<td><div class="fig-pair"><span class="fig" data-f="bid">—</span><span class="fig" data-f="ask">—</span></div></td>` +
      `<td><span class="fig" data-f="spread">—</span></td><td><span class="fig" data-f="mark">—</span></td>` +
      `<td><span class="fig" data-f="funding">—</span></td><td><span class="fig fig--chip" data-f="age">—</span></td></tr>`).join('');
    paintValues();
    paintAges();
  }

  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-market]');
    if (!tab) return;
    selected = tab.dataset.market;
    for (const b of root.querySelectorAll('[data-market]')) {
      const on = b === tab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
    }
    drawRows();
  });

  const setCell = (tr, f, html, title) => {
    const el = tr.querySelector(`[data-f="${f}"]`);
    if (!el) return;
    if (el.innerHTML !== html) el.innerHTML = html;
    if (title != null) el.title = title;
  };

  function paintValues() {
    const trs = [...body.querySelectorAll('tr[data-key]')];
    // Measure every figure on screen first: a column's width is set by the widest row in it, not by
    // the row being drawn.
    for (const tr of trs) {
      const r = rows.get(tr.dataset.key);
      if (!r) continue;
      measure('px', r.bid); measure('px', r.ask); measure('mark', r.markPrice);
      const fr = fundingOf(r);
      measure('spread', spreadOf(r), 2); measure('funding', fr == null ? null : fr * 100, 4);
    }
    for (const tr of trs) {
      const r = rows.get(tr.dataset.key);
      // No row in the snapshot is not a zero: the cells keep their dash and say why.
      if (!r) {
        const why = 'The snapshot carries no value for this listing yet';
        setCell(tr, 'bid', figure('px', null, 'bid'), why);
        setCell(tr, 'ask', figure('px', null, 'ask'), why);
        setCell(tr, 'spread', figure('spread', null, 'bps'), why);
        setCell(tr, 'mark', figure('mark', null), why);
        setCell(tr, 'funding', figure('funding', null, '%'), why);
        continue;
      }
      const spread = spreadOf(r), f = fundingOf(r);
      setCell(tr, 'bid', figure('px', r.bid, 'bid'), r.bid == null ? 'The venue published no bid' : null);
      setCell(tr, 'ask', figure('px', r.ask, 'ask'), r.ask == null ? 'The venue published no ask' : null);
      setCell(tr, 'spread', figure('spread', spread, 'bps', 2), spread == null ? 'Spread needs both a bid and an ask' : null);
      setCell(tr, 'mark', figure('mark', r.markPrice), r.markPrice == null ? 'The venue published no mark price' : null);
      setCell(tr, 'funding', figure('funding', f == null ? null : f * 100, '%', 4), f == null ? 'The venue published no funding rate' : null);
    }
  }

  function paintAges() {
    const now = Date.now();
    for (const tr of body.querySelectorAll('tr[data-key]')) {
      const at = seenAt.get(tr.dataset.key);
      const age = at == null ? null : Math.max(0, (now - at) / 1000);
      const kind = kindOf(age);
      const text = ageText(age);
      ageW = Math.max(ageW, text.length);
      setCell(tr, 'age', `<span class="ar-chip ar-chip--${kind === 'missing' ? 'stale' : kind}"><span class="ar-chip__val" style="min-width:${slot(ageW, 0.04)};text-align:right">${text}</span><span class="ar-chip__word" style="min-width:${slot(STATUS_W, 0.14)}">${WORD[kind]}</span></span>`,
        age == null ? 'No ticker received for this listing yet' : 'Age since DEBYKO received the ticker · transport ' + (rows.get(tr.dataset.key)?.transport || '—'));
    }
    if (lastOk) {
      const parts = [failed ? `No answer · last response ${since(now - lastOk)} ago` : `api.debyko.com · response ${((now - lastOk) / 1000).toFixed(1)} s ago`];
      // A registry that stopped answering leaves the rows it last listed on screen, with its age.
      if (registryFailed && registry) parts.push(`registry ${since(now - registry.at)} old`);
      $('line').textContent = parts.join(' · ');
    }
  }

  async function loadRegistry() {
    try {
      registry = await fetchRegistry();
      registryFailed = false;
      drawTable();
      $('foot').textContent = `Venues and markets from the registry · ${registry.segments.length} venues live`;
      if (onRegistry) onRegistry(registry);
    } catch (err) {
      registryFailed = true;
      if (!registry) {
        $('tag').textContent = 'No data';
        body.innerHTML = `<div class="meta-xs" style="padding:14px">The registry did not answer (${esc(err.message)}). Nothing is shown in its place.</div>`;
      }
    }
  }

  async function poll() {
    if (inFlight || !registry) return;
    inFlight = true;
    try {
      const res = await fetch(V2_BASE + '/v1/snapshot', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      const now = Date.now();
      for (const r of list) {
        const key = r.segment + '/' + r.symbol;
        rows.set(key, r);
        if (r.ageSeconds != null) seenAt.set(key, now - r.ageSeconds * 1000);
      }
      lastOk = now; failed = false;
      $('tag').textContent = 'Live · v2 platform';
      $('tag').className = 'source-tag';
      paintValues();
    } catch {
      failed = true;
    } finally {
      inFlight = false;
      paintAges();
    }
  }

  let registryTimer = null;
  const start = () => {
    if (timer) return;
    loadRegistry().then(poll);
    timer = setInterval(poll, POLL_MS);
    registryTimer = setInterval(loadRegistry, REGISTRY_MS);
  };
  const stop = () => { clearInterval(timer); clearInterval(registryTimer); timer = registryTimer = null; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  setInterval(paintAges, 100);
  start();
  // Returned so a caller — or a check of the "registry stopped answering" path — can ask for a
  // registry read without waiting out the five-minute timer.
  return { refreshRegistry: loadRegistry };
}
