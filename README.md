# debyko.com

Static site. No build step, no framework, no runtime dependencies beyond two Google Fonts.

## Layout

```
index.html            the homepage: all copy and structure live here
css/tokens.css        DEBYKO design-system tokens (colours, type, spacing, …)
css/site.css          page styles; one class per thing the page shows
js/home.js            entry point: navigation, dialogs, health and coverage blocks
js/live-market.js     live blocks: hero slice, full comparison with chart, Arena table
js/api.js             data layer for the CryptoSmith X API, shared poller
js/format.js          number, age and time formatting; icons; state blocks
assets/               logo lock-ups (SVG)
data/saved/           optional saved API responses, shown only when a live call fails
```

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/. The page reads the production API by default; add `?api=test` to read the test contour.

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

The waitlist and sales forms have no endpoint yet; submitting says that nothing was sent.

## Deploy

Cloudflare Pages project `debyko` (direct upload), served at https://debyko.com and https://debyko.pages.dev.
`.github/workflows/deploy.yml` publishes every push: `main` to production, other branches to preview URLs.

Repository secrets it needs:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare account id (set) |
| `CLOUDFLARE_API_TOKEN` | a Cloudflare API token with **Account · Cloudflare Pages · Edit** |

Manual deploy from a clean checkout:

```bash
git archive HEAD | tar -x -C /tmp/debyko-site && npx wrangler pages deploy /tmp/debyko-site --project-name debyko --branch main
```
