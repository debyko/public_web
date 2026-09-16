# Prompt for the developer — debyko.com pass 2

Paste this whole file as the task. It describes what the export contains, what changed since the
copy you already have, and what must not drift.

---

## What you are getting

Four static pages for debyko.com, plus one new stylesheet and one small script. No framework, no
build step, no runtime template. Files, as they land in `github.com/debyko/public_web`:

```
arena/index.html               → /arena/
data/coverage/index.html       → /data/coverage/
data/status/index.html         → /data/status/
data/methodology/index.html    → /data/methodology/
css/pages.css                  NEW — 15 classes, listed below
js/nav.js                      NEW — 28 lines: header dropdowns, Menu button, Escape
sitemap.xml                    REPLACES the existing one: homepage + the four pages
```

`css/tokens.css`, `css/site.css`, `assets/` and `og/` are in the export **unchanged**, only so the
export opens offline. Do not copy them over the repository versions.

The homepage is not touched in this pass, except that its links now have real targets (see
"Homepage links" at the end).

## Rules for this pass — these come from the owner and override convenience

1. **No live counter is ever written into markup.** Venue counts, instrument counts,
   trading/listed, "25 assets", any `since` date, anything from `/v1/coverage` → `totals`: those
   are printed by the live block from the response, never typed into HTML. The only counts allowed
   in static text are the ones that do not move: 15 perpetual segments, 3 spot segments, the 48-hour
   limit per history request.
2. **Nothing that does not exist is mentioned.** No Deribit, no incident history, no "spot has no
   funding or open interest", no claim about which datasets `/coverage/hours` does not measure, no
   statement about how many venues have open-interest history.
3. **Freshness thresholds are provisional and exactly these:** ticker 15 s / 60 s, open interest
   2 min / 10 min, depth 5 min / 15 min. They live in `js/api.js` (`THRESHOLDS`) and are repeated in
   the Methodology table. If the backend publishes its own, change both.
4. **Coverage is measured for ticker snapshots.** A hole with no recorded interruption has a cause
   the platform does not know — never "outage", never "continuity".
5. **Status is never colour alone.** Every chip carries its word.

## The live blocks — empty, named mounts

No page draws data. Each mount carries its `id` and, in `data-mount`, a full description of what
fills it, including column order. The `.mount` class is review-only: it draws the dashed box that
prints the id and the description. When you wire a block, remove the `class="mount …"` and the
`data-mount` attribute; keep the `id`.

| Page | Mount | Source |
|---|---|---|
| /arena/ | `#arena-live` | `js/live-market.js` — the same block the homepage mounts as `#live-full`; additionally read and write `asset`, `metric`, `range` in the query string |
| /data/coverage/ | `#coverage-totals` | `GET /v1/coverage` → `totals` |
| | `#coverage-catalogue` | `GET /v1/coverage` joined to `GET /v1/exchanges` by `code`; group rows per `kind`; `id` on each venue row = its segment code, so `/data/coverage/#okx-perp` works |
| | `#coverage-hours-range` | already in the markup as a static `segmented`; bind the three `data-days` buttons |
| | `#coverage-hours` | `GET /v1/coverage/hours?days=2\|7\|31` |
| | `#coverage-interruptions` | the same response — the recorded interruptions, as a table, because a mark's tooltip is unreachable on touch |
| /data/status/ | `#status-overall`, `#status-counts`, `#status-tag` | `GET /v1/health`, rows filtered to the venues `/v1/coverage` lists (hide internal service segments) |
| | `#status-collectors` | the same response, per venue × collector, venue row expandable |
| | `#status-stale` | the same response, `staleInstruments`, grouped by venue |
| /data/methodology/ | `#method-sample-row` | one `GET /v1/snapshot` on load, no refresh |

Refresh cadences, unchanged from the homepage: snapshot fan-out 5 s, health and coverage 30 s.

## Copy changes against the version you already have

These were corrected after checking `js/live-market.js`, `js/api.js` and the live API on
2026-09-16. Where your copy says the first thing, it is wrong.

| Was | Is now | Why |
|---|---|---|
| "Trade candles are collected on every venue" | "Trade, mark and index candles are collected where the venue publishes them; Coverage lists which, per venue." | GMX collects index candles only — `/v1/coverage` → `datasets` |
| "Sizes and open interest are shown in base units through the venue's multiplier" | "Open interest is shown as the venue reports it: in base units where the contract multiplier is 1, otherwise in contracts. The multiplier is printed beside it." | `buildRows` in live-market.js: `oiInBase = r.mult === 1`, otherwise the unit is `contracts`. The page does not convert |
| "OI notional = OI × mark" | "Open-interest notional is the value the service publishes, in the quote currency, printed with the contract multiplier beside it." | `openInterestNotional` is read from the response. The page computes nothing |
| "depth band = book size within …" | "quote notional resting within 10, 25 and 50 bps of the reference price"; the table shows the ±25 bps band | matches the provenance line in live-market.js |
| "funding per day = rate × 24 / interval" | struck. Only "Funding is shown as the venue publishes it, per the venue's own interval (% / n h)." | no per-day funding figure exists anywhere in the product |
| "BEST and WORST are computed for bid, ask, spread and depth" | plus the direction and the rounding: bid higher is better, ask lower, spread narrower **rounded to 0.01 bps**, depth = bid + ask, more is better | `RANKED` in live-market.js, and `Math.round(spreadVal * 100) / 100` |
| "no rank with fewer than two comparable venues" | "no rank when fewer than two values are eligible **or when every eligible value is equal**" | `rank()` in live-market.js: `if (eligible.length < 2 \|\| hi === lo)` |
| "USD, USDT and USDC as one currency" | add USDT0 | `USD_LIKE = /^USD/`; Nado quotes USDT0 |
| "Incident history is not available yet" | the section is **gone** from /data/status/ | rule 2. If the owner wants it back, it returns as a `state-block` |
| "Spot listings have no funding and no open interest" | struck; Coverage only groups venues by kind | rule 2 |
| "Candles, trades, liquidations and books are not measured here" | struck; the page says only "Coverage is measured for ticker snapshots." | rule 2 |

Also true, worth knowing while wiring: `data/saved/` currently holds no responses, so a failed call
shows the error state, not a SAVED one. The saved-response path in `js/api.js` still works the
moment a file is dropped in.

Verified against the live API on 2026-09-16, for your own sanity checks: `/v1/exchanges` reports 15
enabled perpetual segments and 3 enabled spot segments; `avantis-perp` and `gmx-perp` carry
`"marketModel":"oracle_vault"`, every other enabled segment is `"orderbook"`; both of those two
still collect `depth`, which is why no page states anything about their datasets — the catalogue
prints them.

## Slots to fill

`/data/methodology/` has two date slots, left as marked text rather than a guessed date:

- `Published [date set at publication]` in the page head
- `[publication date]` as the date of the first entry in "Methodology updates"

Fill both on the day the page goes live. Every later rule change gets its own dated entry in that
list.

## css/pages.css — what it adds, and what it must not do

`.page-head` · `.toc` · `.wrap--doc` · `.doc` · `.doc__rail` · `.article` · `.anchor` · `.formula` ·
`.group-row` · `.row-toggle` · `tr.is-detail` · `.sym-list` · `.ruled--dated` · `.mount` (+ its
`--tall`, `--chart`, `--line` sizes).

Everything else on these pages is existing `site.css` — `section`, `split--*`, `panel`,
`panel__head`, `panel__note`, `tbl`, `btn`, `label`, `h1`, `h2`, `prose`, `statement`, `ruled`,
`notes-3`, `segmented`, `legend-row`, `swatch--*`, `clock-card`, `closing`, `status-chip`, `rank`,
`fresh`. If you need a new element, name it plainly and put it in `pages.css`, not in `site.css`.

Two constraints that were violated once and should not be again:

- **Do not cap text width on the paragraph.** The column is the measure. On
  `/data/methodology/` the reading column is the `.doc` grid (216 px rail + one column inside
  `.wrap--doc`, 900 px), so headings, section rules, formulas, tables and panels all end exactly
  where the text ends. `site.css` says it outright: text runs to the edge of its column.
- **The em dash means an absent measurement and nothing else.** Not a bullet, not a placeholder
  label, not a section number.

## Homepage links

Point these at the new pages; nothing on the homepage is removed or shortened in this pass:
"Open full Arena", "Explore Arena" → `/arena/`; "See coverage", "Inspect data coverage" →
`/data/coverage/`; "Read the methodology" → `/data/methodology/`; "View data status" →
`/data/status/`; the Data menu and the footer Data column → the three data pages. Still inert:
Explore Trader, Explore Agent, Privacy, Terms.

`Contact sales` and `Join the waitlist` in the new pages' header and footer link to the homepage,
because the dialogs live in `index.html` with `js/home.js`. If they should open from the new pages,
the smallest change is a `?open=sales` parameter read by `home.js`.

## Check before you push

- No number in any static text that the page itself does not compute, apart from 15 perp, 3 spot,
  48 h, and the four threshold values.
- `/data/coverage/#okx-perp` scrolls to the OKX perpetual row.
- The table in `#arena-live` fits at 1440 px and scrolls inside its own panel below that; the page
  body never scrolls sideways.
- Every status chip carries its word; the BEST/WORST slot is reserved whether or not a mark is in it.
- A failed call leaves the block empty and names the call. No placeholder ever reads "No data" where
  "Requesting" is meant.
- `sitemap.xml` lists five URLs.
