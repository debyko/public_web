// Rendering helpers the homepage and the pass-2 data pages both need. Kept here rather than
// duplicated: home.js imports the same functions the new pages do.

import { fmt, utcTime, utcMinute, stateBlock } from '../format.js';

/** The dataset groups a catalogue row shows as chips, in this order. Mirrors api.js's own
 *  DATASET_GROUPS labels, which stay the data-layer source of truth for the regex per group. */
export const DATASET_SETS = ['ticker', 'candles', 'funding', 'oi', 'trades', 'liq', 'depth'];

/** "Live · production · what" or "Saved · <time>" — the tag beside a meta panel's head, where the
 *  panel names what it holds rather than when it last answered. */
export const sourceText = (block, env, what) => block.src === 'live'
  ? 'Live · ' + env + (what ? ' · ' + what : '')
  : 'Saved · ' + utcMinute(block.at);

/** Same choice, but the live branch prints the response time instead of a "what" phrase — what
 *  /health's overall tag and status.js's tag both want. */
export const sourceTimeText = (block, env) => block.src === 'live'
  ? 'Live · ' + env + ' · ' + utcTime(block.at)
  : 'Saved · ' + utcMinute(block.at);

/** The loading/error block a meta panel (coverage, health) shows before its first response. */
export const metaStateBlock = (metaLoaded, path) => stateBlock(
  metaLoaded ? 'error' : 'loading',
  metaLoaded ? 'The service did not answer and no saved response is on disk' : 'Requesting',
  path + ' · nothing is shown in its place.', { compact: true });

/** GET /v1/coverage → totals, in the one line the homepage strip and the coverage page both print. */
export function coverageTotalsLine(t) {
  if (!t) return null;
  return 'All venues · ' + fmt(t.venues, 0) + ' collecting · ' + fmt(t.instruments, 0) + ' instruments collected · '
    + fmt(t.trading, 0) + ' trading · ' + fmt(t.listed, 0) + ' listed' + (t.since ? ' · since ' + String(t.since).slice(0, 10) : '');
}

/** The dataset-chip row for one normaliseCoverage() row, shared by the homepage catalogue and the
 *  coverage page's full catalogue. */
export function datasetChips(v) {
  return DATASET_SETS.map(n => `<span class="dataset-chip${v.groups.includes(n) ? ' dataset-chip--on' : ''}">${n}</span>`).join('')
    + (v.other.length ? `<span class="dataset-chip dataset-chip--more">+${v.other.length}</span>` : '');
}

/** /v1/health also reports internal service segments (the rollup runs under one); only venues
 *  /v1/coverage lists are shown, once that list is known. Returns H unchanged if either input is
 *  not ready yet, so a caller can pass through-state before both responses have landed. */
export function filterHealthToCoverage(H, covData) {
  if (!H || !covData || !Array.isArray(covData.venues)) return H;
  const venues = new Set(covData.venues.map(v => v.code.toUpperCase()));
  return { ...H, rows: H.rows.filter(r => venues.has(r.code)) };
}

/** The lowercase segment codes /v1/coverage lists — the same "known venue" test used to filter
 *  /v1/health's rows, exposed for callers that need to filter the raw collectors or staleInstruments
 *  arrays rather than normaliseHealth's rolled-up rows. */
export function knownSegmentCodes(covData) {
  return new Set(covData && Array.isArray(covData.venues) ? covData.venues.map(v => v.code) : []);
}
