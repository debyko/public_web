# debyko.com

The public site of DEBYKO, operated by MB Debyko (company code 308157191, Girulių g. 10-201,
LT-12112 Vilnius, Lithuania). Static site. No build step, no framework. At run time it loads two Google Fonts and nothing else from another origin; the one third-party library (Lightweight Charts, Apache 2.0) is self-hosted — see THIRD_PARTY_NOTICES.md.

## Layout

```
index.html            the homepage: all copy and structure live here
css/tokens.css        DEBYKO design-system tokens (colours, type, spacing, …)
css/site.css          page styles; one class per thing the page shows
js/home.js            entry point: navigation, dialogs, health and coverage blocks
js/live-market.js     live blocks: hero slice, full comparison with chart, Arena table
js/api.js             data layer for the CryptoSmith X API, shared poller
js/format.js          number, age and time formatting; icons; state blocks
js/arena-chart.js     Arena history chart on Lightweight Charts
js/vendor/            third-party code, self-hosted (see THIRD_PARTY_NOTICES.md)
assets/               logo lock-ups (SVG)
data/saved/           optional saved API responses, shown only when a live call fails
data/plans.json       the five plans: prices, trials, limits — one source for debyko.com and studio.debyko.com
tools/                render-plans.mjs, check-links.mjs, stamp-assets.mjs, sitemap.mjs
```

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/. The page reads the production API by default; add `?api=test` to read the test contour.

## Before committing changes to css/ or js/

```bash
node tools/stamp-assets.mjs
```

Cloudflare serves `css/` and `js/` with a four-hour browser cache, so a changed file needs a new URL. The script appends `?v=<content hash>` to every stylesheet and script a page links, and rewrites the import map in each page so modules imported by other modules get the new URL too. Running it twice changes nothing.

## Plans and prices

`data/plans.json` is the only place a price, a trial or a plan limit is written. It is published at
https://debyko.com/data/plans.json, and three blocks are generated from it by `tools/render-plans.mjs`
(Node, no dependencies):

| Page | Region | What |
|---|---|---|
| `index.html` | `<!-- plans-grid:begin -->` … `<!-- plans-grid:end -->` | the price list in #studio |
| `index.html` | `<!-- plans-cards:begin -->` … `<!-- plans-cards:end -->` | the plan cards in #pricing |
| `index.html` | `<!-- plans-table:begin -->` … `<!-- plans-table:end -->` | the comparison table in #plans |
| platform `deploy/studio-stub/index.html` | `<!-- plans:begin -->` … `<!-- plans:end -->` | the table in the studio.debyko.com landing's #plans |

Each region starts with `<!-- plans:sha256=… -->`, the sha256 of the plans.json it was rendered from; the
platform's CI compares the studio stub's with the published file.

To change a price or a limit:

1. Edit `data/plans.json` **and**, in the same change, the `plan` table in the platform's database (an SQL
   migration in `debyko/platform`) — the pages and the limits the API enforces must say the same thing.
2. Render both pages:
   ```bash
   node tools/render-plans.mjs --studio ../platform/deploy/studio-stub/index.html
   ```
3. Check, then commit both repositories:
   ```bash
   node tools/render-plans.mjs --check --studio ../platform/deploy/studio-stub/index.html
   ```
   `--check` writes nothing and exits 1 if any region differs from what plans.json renders.

`checkout_open` in plans.json switches every paid-plan button at once: `false` renders a disabled
"Checkout opens soon" with "Join the waitlist" under it (the Free plan's "Get a key" always works); `true`
renders the checkout links (`checkout_url`). Refunds: https://debyko.com/legal/refund/ — 14 days on any
payment, no conditions; the same URL is set as the refund policy in the Paddle dashboard.

## Links

```bash
node tools/check-links.mjs            # every href/src on every published page, #fragments, identical footers
node tools/check-links.mjs --online   # … and fetches the links to studio.debyko.com, docs.debyko.com
```

Every page carries the same footer, byte for byte (root-relative links); the checker fails if one differs
from index.html's. `?open=sales` and `?open=wait` on the homepage open the dialogs on load — studio, docs and
agent link there; `?open=wait&product=studio` preselects the paid-plan checkout.

## Data

Every live figure comes from the public CryptoSmith X API (`https://cryptosmithx.blynai.eu/v1`, reference at `/scalar/v1`):

| Block | Calls |
|---|---|
| Instrument selector | `/exchanges`, one `/snapshot?status=trading&maxAgeSeconds=120`, `/instruments?exchange=…` per venue |
| Live tables | `/snapshot?exchange=…&symbols=…` per venue, every 5 s |
| Chart | `/candles` (trade, mark, index); `/tickers/history`, `/funding`, `/open-interest`, `/depth` (up to 24 h) |
| Coverage | `/coverage`, `/coverage/hours?days=7` |
| Status | `/health` |

Nothing is filled in when a call fails: the block says what failed. Freshness thresholds in `js/api.js` are provisional until the backend publishes its own.

That API is run by a separate company, MB „Blynai“, whose public service the pages read; it is not the
operator of DEBYKO. API documentation for customers is https://docs.debyko.com.

The waitlist and sales forms post to `/api/contact` (functions/api/contact.js), which mails hello@debyko.com.
