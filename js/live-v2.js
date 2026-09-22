// Hero slice fed by the v2 platform (api.debyko.com), the same source as the platform's /lab page.
//
// Polls GET /v1/snapshot twice a second rather than holding /v1/stream open: the stream filters by
// venue only and carries every trade, book metric and instrument — about 110 KB/s per open tab.
// Ages are the service's own ageSeconds at response time, then counted up locally every 100 ms so a
// value that stops changing is seen getting older between polls. Polling stops while the tab is hidden.

import { esc } from './format.js';

export const V2_BASE = 'https://api.debyko.com';
const POLL_MS = 500;

// Three markets on the two venues the v2 registry holds. Symbols are the venues' own.
const MARKETS = [
  { market: 'BTC-PERP', rows: [['hyperliquid', 'BTC'], ['kraken-futures', 'PF_XBTUSD']] },
  { market: 'ETH-PERP', rows: [['hyperliquid', 'ETH'], ['kraken-futures', 'PF_ETHUSD']] },
  { market: 'SOL-PERP', rows: [['hyperliquid', 'SOL'], ['kraken-futures', 'PF_SOLUSD']] }
];

// Ticker freshness, the DQL default bound for the ticker layer is 30 s; LIVE is kept far tighter here
// because this panel exists to show what live means.
const kindOf = age => age == null ? 'missing' : age < 2 ? 'live' : age < 30 ? 'delayed' : 'stale';
const WORD = { live: 'LIVE', delayed: 'DELAYED', stale: 'STALE', missing: 'MISSING' };

const priceFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const price = v => v == null ? '—' : priceFmt.format(v);
const ageText = s => s == null ? '—' : s < 10 ? s.toFixed(1) + ' s' : Math.round(s) + ' s';

// Kraken publishes funding as an absolute amount and as a relative rate; Hyperliquid as a rate. Both
// settle hourly, so the relative rates compare directly.
const fundingOf = r => r.segment === 'kraken-futures' ? r.fundingRelativeRate : r.fundingRate;

export function mountLiveV2(root, { onFullComparison } = {}) {
  root.innerHTML = `
    <div class="panel">
      <div class="panel__head panel__head--roomy">
        <span class="label label--accent">BTC · ETH · SOL perpetual · Kraken Futures and Hyperliquid</span>
        <div class="row gap-10"><span class="source-tag" data-slot="tag">Requesting</span><span class="meta-xs" style="font-size:11px" data-slot="line"></span></div>
      </div>
      <div data-slot="body"></div>
      <div class="panel__foot"><span>WebSocket from each venue · ages count up between polls</span><button class="text-btn text-btn--sm" data-slot="more">16 venues in the full comparison →</button></div>
    </div>`;
  const $ = s => root.querySelector(`[data-slot="${s}"]`);
  if (onFullComparison) $('more').addEventListener('click', onFullComparison);

  const rows = new Map();     // "segment/symbol" → snapshot row
  const seenAt = new Map();   // "segment/symbol" → local ms when received (now − ageSeconds)
  let lastOk = null, failed = false, timer = null, inFlight = false;

  const body = $('body');
  body.innerHTML = `<div class="scroll-x"><table class="slice-table lm-table">
    <thead><tr><th class="l">Venue · symbol</th><th>Bid / Ask</th><th>Spread</th><th>Mark</th><th>Funding · 1 h</th><th>Age · status</th></tr></thead>
    <tbody>${MARKETS.map(m => `<tr><td class="group" colspan="6">${m.market}</td></tr>` + m.rows.map(([seg, sym]) =>
      `<tr data-key="${seg}/${sym}"><td class="venue-cell">${seg.toUpperCase()}<small>${esc(sym)}</small></td>` +
      `<td><div class="fig-pair"><span class="fig" data-f="bid">—</span><span class="fig" data-f="ask">—</span></div></td>` +
      `<td><span class="fig" data-f="spread">—</span></td><td><span class="fig" data-f="mark">—</span></td>` +
      `<td><span class="fig" data-f="funding">—</span></td><td><span class="fig fig--chip" data-f="age">—</span></td></tr>`).join('')).join('')}
    </tbody></table></div><div data-slot="state"></div>`;

  const setCell = (tr, f, html, title) => { const el = tr.querySelector(`[data-f="${f}"]`); if (el.innerHTML !== html) el.innerHTML = html; if (title != null) el.title = title; };

  function paintValues() {
    for (const tr of body.querySelectorAll('tr[data-key]')) {
      const r = rows.get(tr.dataset.key);
      if (!r) continue;
      const mid = r.bid != null && r.ask != null ? (r.bid + r.ask) / 2 : null;
      const spread = mid ? (r.ask - r.bid) / mid * 1e4 : null;
      const f = fundingOf(r);
      setCell(tr, 'bid', `${price(r.bid)}<span class="fig__unit">bid</span>`);
      setCell(tr, 'ask', `${price(r.ask)}<span class="fig__unit">ask</span>`);
      setCell(tr, 'spread', spread == null ? '—' : `${spread.toFixed(2)}<span class="fig__unit">bps</span>`);
      setCell(tr, 'mark', price(r.markPrice));
      setCell(tr, 'funding', f == null ? '—' : `${(f * 100).toFixed(4)}<span class="fig__unit">%</span>`);
    }
  }

  function paintAges() {
    const now = Date.now();
    for (const tr of body.querySelectorAll('tr[data-key]')) {
      const at = seenAt.get(tr.dataset.key);
      const age = at == null ? null : Math.max(0, (now - at) / 1000);
      const kind = kindOf(age);
      setCell(tr, 'age', `<span class="ar-chip ar-chip--${kind === 'missing' ? 'stale' : kind}"><span class="ar-chip__val">${ageText(age)}</span>${WORD[kind]}</span>`,
        age == null ? 'No ticker received for this listing' : 'Age since DEBYKO received the ticker · transport ' + (rows.get(tr.dataset.key)?.transport || '—'));
    }
    if (lastOk) {
      const since = (now - lastOk) / 1000;
      $('line').textContent = failed ? `No answer · last response ${since.toFixed(0)} s ago` : `api.debyko.com · response ${since.toFixed(1)} s ago`;
    }
  }

  async function poll() {
    if (inFlight) return;
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
      $('state').innerHTML = '';
      paintValues();
    } catch (err) {
      failed = true;
      if (!lastOk) {
        $('tag').textContent = 'No data';
        $('state').innerHTML = `<div class="meta-xs" style="padding:10px 14px">api.debyko.com did not answer (${esc(err.message)}). Nothing is shown in its place.</div>`;
      }
    } finally {
      inFlight = false;
      paintAges();
    }
  }

  const start = () => { if (!timer) { poll(); timer = setInterval(poll, POLL_MS); } };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  setInterval(paintAges, 100);
  start();
}
