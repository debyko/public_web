// /arena/ — the full live comparison block, plus the one number on this page that is not
// asset/metric/range: how many perpetual venues the note beside it refers to.

import { createStore } from '../api.js';
import { mountFull } from '../live-market.js';

const store = createStore();
const params = new URLSearchParams(location.search);

mountFull(document.getElementById('arena-live'), store, { syncUrl: true, arena: true });

// The note reads "Requesting" (set in the markup) until the same universe load mountFull's own
// asset selector uses resolves — one /v1/exchanges call, not a second one of our own.
const countEl = document.querySelector('[data-perp-count]');
if (countEl) {
  store.subscribe(S => {
    if (S.universe) countEl.textContent = String(S.universe.perpCount);
  }, ['market']);
}

store.start(params.get('asset'));
