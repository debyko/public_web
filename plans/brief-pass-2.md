# Design brief — debyko.com, pass 2: the data pages

Pass 1 (the homepage) is built and live at https://debyko.com. Its brief is `plans/brief-homepage.md`;
everything it says about data, honesty and states still applies. This pass designs **four pages**.
Products, sales and company pages come later (see §8) — in this pass they exist only as link targets.

Language: English. No lorem ipsum.

**Before designing, return A–D for the four pages and stop:**
A. section order per page, one line of purpose each;
B. which existing components you reuse and which new ones you need (names usable in code);
C. the data each live block reads, mapped to the endpoints in §4;
D. every sentence that states a fact about the product, so it can be checked.

After approval: desktop and mobile layouts for the four pages, the changes to the homepage (§3), and
page metadata (§7).

---

## 1. How to deliver — this matters more than the look

The pass 1 export arrived as a design-tool template rendered by React at runtime. It had to be
rewritten by hand. This time:

- **Plain HTML and CSS.** One `.html` file per page. No framework, no runtime template, no build step.
- **Use the existing styles.** `css/tokens.css` (design-system tokens) and `css/site.css` (page
  classes) are in the repository. Reuse their classes — `.section`, `.split`, `.panel`, `.panel__head`,
  `.tbl`, `.btn`, `.label`, `.h2`, `.prose`, `.ruled`, `.state-block`, `.fresh`, `.rank` …. New
  classes go in a separate `css/pages.css`; say which you added and why.
- **Do not draw live data.** Live blocks already exist as scripts. Put an empty mount element where a
  live block goes and name it (e.g. `<div id="arena-table"></div>` — "full comparison table"). The
  developer wires it. Static example values in a mock-up must be marked SAMPLE and must not name a
  venue we do not collect (no Deribit — see §4).
- Header and footer are the homepage's, unchanged except for the navigation targets (§6).

Repository: `github.com/debyko/public_web`. Look at the live page before designing; it is the
reference for density, type and states.

## 2. Pages in this pass

| URL | Page | Why now |
|---|---|---|
| `/arena/` | Arena — live venue comparison | the free product; every "Explore Arena" button needs it |
| `/data/coverage/` | Coverage | what is collected, where, since when, with the gaps |
| `/data/status/` | Data status | collector health per venue, public |
| `/data/methodology/` | Methodology | the rules behind every figure |

Clean URLs: each page is a folder with `index.html` (Cloudflare Pages serves `/arena/` from
`arena/index.html`).

## 3. Homepage vs pages — move, do not duplicate

The homepage is 13,600 px tall with 14 sections. Each page in this pass becomes the full version of a
homepage section; the homepage keeps a short teaser that links to it. Nothing is maintained twice.

| Homepage section today | After pass 2 |
|---|---|
| Hero with live slice | stays |
| Live market proof (chart + full table, 2,100 px) | **moves to `/arena/`**; homepage keeps nothing of it — the hero slice and the Arena teaser already show the live data |
| 01 Arena (compact table) | stays as the teaser; "Explore Arena" → `/arena/` |
| 02 Studio Pro workstation (catalogue, coverage strip, candles, API) | stays in this pass; the catalogue and strip also appear in full on `/data/coverage/` (the homepage versions become a 5-row preview + link) |
| Methodology (9 items) | homepage keeps a lead and 3 items; "Read the methodology" → `/data/methodology/` |
| Status (full collector table) | homepage keeps one summary line computed from the same response (shape: "N venues · N collecting · N degraded · N instruments stale") + "View data status" → `/data/status/` |
| Other sections | unchanged in this pass |

Live blocks are shared scripts, so a table on a page and its preview on the homepage are the same
code with a different row limit — not a copy.

## 4. Data — what exists (measured 2026-09-16)

API: `https://cryptosmithx.blynai.eu/v1`, public, read-only, no key, any origin. Reference:
`/scalar/v1`.

| Endpoint | What it gives |
|---|---|
| `/exchanges` | 18 enabled segments: **15 perp, 3 spot** (Binance, Bybit, OKX spot) |
| `/instruments?exchange=` | listings per venue: symbol, base/quote, contract multiplier, price step, funding interval |
| `/snapshot?exchange=&symbols=&include=quote,depth,instrument` | latest row per listing: bid/ask/sizes, mark, index, funding, OI, depth 10/25/50 bps, three clocks |
| `/candles` | trade bars on all venues; **mark bars on 6 of 15 perp venues, index bars on 7** |
| `/tickers/history`, `/funding`, `/open-interest`, `/depth` | raw history, **max 48 h per request**; OI history exists on **1–2 venues**; funding over the last hour is usually empty (settlements are hourly or 8-hourly) |
| `/as-of?exchange=&symbol=&at=` | the stored state at an instant, ~0.2 s |
| `/coverage` | per venue: datasets, instruments collected / trading / listed, since; `totals`: 18 venues, 724 collected, 8,911 trading, 9,833 listed, since 2026-09-05 |
| `/coverage/hours?days=1..31` | per venue × hour: `not_collected_yet` / `not_observed` / `observed` + completeness; recorded interruptions with cause. **Ticker snapshots only** — candles, trades, liquidations, books are not measured and the response says so |
| `/health` | per venue × collector: last attempt, last success + age, consecutive failures, last error + age; stale instruments; overall `ok`/`degraded`. Includes an internal service segment the page must hide (only venues listed by `/coverage` are shown) |

Instruments offered in the selector: base assets with a fresh snapshot on at least half the perp
venues — **25 today** (BTC, ETH, SOL … TRX), computed on load, never written into markup.

Freshness thresholds are **provisional** and owned by the backend: ticker LIVE ≤ 15 s, DELAYED ≤ 60 s;
open interest 2 min / 10 min; depth 5 min / 15 min. Show them as provisional where they are stated.

Does not exist: incident history, per-page auth, waitlist and sales endpoints, spot funding/OI
(spot has none), any venue we do not collect (Deribit is not collected).

## 5. The four pages

### 5.1 `/arena/` — Arena

Goal: compare one instrument across the venues that quote it, and let the reader share what they see.

- Controls: instrument (25 assets), metric (trade, mark, index, spread, funding, OI, depth), range
  (1 h, 24 h, 7 d, 30 d — the last two for candle metrics only, as now), venue toggles.
- **Shareable state:** instrument, metric and range in the URL (`/arena/?asset=ETH&metric=funding&range=24h`).
- Chart, full table (as on the homepage today: bid/ask pair, spread, mark/index pair, funding,
  OI, depth, venue/received time, age chips T/OI/D, row status under the venue name), BEST/WORST rules,
  observation line, request log.
- **Contract type — decide in A:** today only perpetuals are compared (15 venues). Spot (3 venues)
  exists in the API. Either a Perpetual / Spot switch, or a stated "Perpetuals only" with a link to
  Coverage. Do not mix perp and spot rows in one ranking.
- States: requesting, partial (some venues did not answer), stale, unsupported metric, no data in
  range, service unreachable, saved response. Each already exists as a component.
- Explanatory strip: what BEST/WORST means, why USD/USDT/USDC are compared as one, what hatching means.
  Link to Methodology for the rest.

### 5.2 `/data/coverage/` — Coverage

Goal: what is collected, on which venue, since when, and where the holes are.

- Totals line from `/coverage.totals`.
- Catalogue: **all 18 venues, perp and spot**, grouped by kind; datasets per venue as chips;
  instruments collected / trading / listed; since.
- Hour strip from `/coverage/hours`: range switch 2 d / 7 d / 31 d; one row per venue; legend for the
  three states; interruptions marked, cause on hover and **also as a list below** (tooltips are not
  enough on touch screens): venue, collector, start, end, cause.
- A plain statement of what is not measured (candles, trades, liquidations, books) and that a hole
  without a recorded interruption has an unknown cause.
- Per-venue anchor (`/data/coverage/#okx-perp`) so a table row elsewhere can link to its venue.

### 5.3 `/data/status/` — Data status

Goal: collector health as public state, never a single green badge.

- Overall as the API states it, next to the counts it summarises.
- Table per venue with an expandable row per collector (candles, depth, funding, trades, snapshot …):
  last success + age, consecutive failures, last error + age. Error text is shortened; never show a
  stack trace or an internal URL.
- Stale instruments from `health.staleInstruments`, grouped by venue.
- Refresh every 30 s with the time of the last response visible.
- "Incident history" is shown as **not available yet**, not as an empty list.

### 5.4 `/data/methodology/` — Methodology

Goal: the rules, written once, linkable by section. Long-form, readable, no live data except where a
rule is illustrated by a real response.

Sections (each with an anchor): what is collected and by which call · instruments and how they are
grouped across venues · venue time, received time, age (the three clocks) · freshness thresholds
(provisional, with values) · gaps vs not collected yet · derived values with formulas (spread, OI
notional, depth bands, funding per interval) · when a comparison is valid: BEST/WORST, USD/USDT/USDC
as one, order-book venues only, live values only · number display: venue price step, aligned decimals,
no invented zeros · what the platform cannot know · venue-reported vs derived · a dated
"Methodology updates" list (first entry: this page's publication).

## 6. Navigation after pass 2

Point these at the new pages: Products → Arena; Data → Coverage, Methodology, Data Status; top-level
Methodology and Status; footer Data column; homepage buttons "Open full Arena", "Explore Arena",
"See coverage", "Inspect data coverage", "Read the methodology", "View data status".
Still inert until later passes: Explore Trader, Explore Agent, Incident history, Privacy, Terms.

## 7. Metadata per page

Title (≤ 60), description (≤ 155), canonical, Open Graph title/description, OG image — the existing
`/og/debyko-og-1200x630.png` unless you propose a page card (then follow the same rules: no numbers,
no venues we do not collect). Add each page to `sitemap.xml`.

## 8. Later passes — do not design now

| Pass | Pages | Blocked on |
|---|---|---|
| 3 | `/studio-pro/`, `/studio-trader/`, `/agent/`, `/api/`, `/pricing/` | nothing |
| 4 | `/solutions/execution-evidence/`, `/solutions/data-research/`, `/solutions/venues-platforms/`, `/contact-sales/`, `/waitlist/` | form endpoints do not exist yet |
| 5 | `/company/`, `/legal/privacy/`, `/legal/terms/` | the owner's texts; privacy needs the real list of processors (Cloudflare, Google Fonts, email) |

## 9. Rules carried over from pass 1 (all still apply)

- Nothing is filled in when a call fails; the block says which call failed. Placeholders read
  "Requesting", never "No data".
- Text runs to the edge of its column; nothing is truncated with an ellipsis.
- Tables fit their container at 1440 px; below that they scroll inside the panel, never the page.
- Units sit in fixed-width slots so the digits of a column share a right edge; prices use the venue's
  price step; short fractions are padded with figure spaces, not zeros.
- BEST (green #1F9D5B) and WORST (red #D23B3B) are the only green and red; their slot is always
  reserved so rows never jump.
- Status is never colour alone; every chip carries its word.
- The page must not claim a number the page itself does not compute.
