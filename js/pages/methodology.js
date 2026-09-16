// /data/methodology/ — one real snapshot row, illustrating the three clocks section 01 describes.
// A single call on load; nothing here refreshes, per the brief.

import { API, apiEnv, get } from '../api.js';
import { esc, fmt, age, utcMinute, stateBlock } from '../format.js';

const EXCHANGE = 'okx-perp';
const SYMBOL = 'BTC-USDT-SWAP';
const PATH = '/snapshot?exchange=' + EXCHANGE + '&symbols=' + SYMBOL + '&include=quote,depth,instrument';

// No decimal is invented (section 08): the price step isn't fetched for one illustrative row, so
// the decimals shown are exactly what the response's own number carries, not a guessed precision.
const decimalsOf = v => {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

async function load() {
  const el = document.getElementById('method-sample-row');
  const base = API[apiEnv()];
  const r = await get(base, PATH, []);
  if (!r.ok) {
    el.innerHTML = stateBlock('error', 'GET ' + PATH + ' did not answer', 'Nothing is shown in its place.', { compact: true });
    return;
  }
  const row = (r.data.tickers || [])[0];
  if (!row) {
    el.innerHTML = stateBlock('error', 'GET ' + PATH + ' answered with no row for this instrument', 'Nothing is shown in its place.', { compact: true });
    return;
  }

  el.innerHTML = `<div class="facts">
    <div class="fact"><span class="fact__k">Venue · instrument</span><span class="fact__v">${esc(EXCHANGE.toUpperCase())} · ${esc(row.symbol || SYMBOL)}</span></div>
    <div class="fact"><span class="fact__k">Bid / Ask</span><span class="fact__v">${row.bidPrice != null ? esc(fmt(row.bidPrice, decimalsOf(row.bidPrice))) : '—'} / ${row.askPrice != null ? esc(fmt(row.askPrice, decimalsOf(row.askPrice))) : '—'}</span></div>
    <div class="fact"><span class="fact__k">Venue time</span><span class="fact__v">${row.venueTs ? esc(utcMinute(row.venueTs)) : 'venue sends none'}</span></div>
    <div class="fact"><span class="fact__k">Received</span><span class="fact__v">${row.receivedAt ? esc(utcMinute(row.receivedAt)) : '—'}</span></div>
    <div class="fact"><span class="fact__k">Age</span><span class="fact__v">${row.ageSeconds != null ? esc(age(Math.round(row.ageSeconds))) : '—'}</span></div>
    <div class="fact"><span class="fact__k">Open interest at</span><span class="fact__v">${row.openInterestAt ? esc(utcMinute(row.openInterestAt)) : '—'}</span></div>
    <div class="fact"><span class="fact__k">Depth at</span><span class="fact__v">${row.depthAt ? esc(utcMinute(row.depthAt)) : '—'}</span></div>
  </div>`;
}

load();
