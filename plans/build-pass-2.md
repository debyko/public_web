# Build task — debyko.com pass 2: wire the four data pages

You are working in `/Users/bykovas/Sources/personal/debyko/public_web` (GitHub `debyko/public_web`),
on the branch **`pass-2`**. Stay on it. **Never commit to or push `main`**: every push to `main` goes
live on debyko.com through Cloudflare Pages. Pushing `pass-2` gives a preview at
`https://pass-2.debyko-public-web.pages.dev`. The owner reviews the pages there and merges.

The site is static HTML, CSS and ES-module JavaScript. There is no framework and no build step.
Cloudflare Pages publishes the repository root as it is.

## Read first

- `plans/brief-pass-2.md`: what the pages are for, the data that exists (§4) and the rules (§9).
- `plans/design/pass-2-export.md` and `plans/design/pass-2-prompt-for-developer.md`: the designer's
  notes. They list every mount and what feeds it. Where they conflict with this file, this file
  wins. In particular, the designer allows "15 perpetual / 3 spot" as static text; the owner does
  not. Take those counts from the API too.
- From the designer's prompt, keep:
  - text width is set by the column, never capped on the paragraph;
  - the em dash means an absent measurement and nothing else;
  - the two methodology date slots are filled on the day the page goes live.
- The four pages as the designer delivered them: `arena/index.html`, `data/coverage/index.html`,
  `data/status/index.html`, `data/methodology/index.html`. Also `css/pages.css` and `js/nav.js`.
- The live homepage code, which you will reuse and must not fork:
  - `js/api.js`: API base, `get`, `saved`, `tier`, `loadUniverse`, `loadPlan`, `loadSnapshots`,
    `normalise`, `METRICS`, `RANGES`, `loadSeries`, `normaliseHealth`, `normaliseCoverage`,
    `normaliseCoverageHours`, `createStore`.
  - `js/live-market.js`: `mountSlice`, `mountArena`, `mountFull`.
  - `js/home.js`: the homepage catalogue, coverage strip, status table and snippet. It is the
    reference for how the coverage and status blocks render today.
  - `js/format.js`: `esc`, `fmt`, `age`, `utcTime`, `utcMinute`, `stateBlock`, `icon`.
  - `css/tokens.css` and `css/site.css`.
- API: `https://cryptosmithx.blynai.eu/v1`. It is public and read-only, needs no key and allows any
  origin. The reference is at `/scalar/v1`. Call the endpoints with curl to see the real shapes
  before writing a normaliser.

## The job

Each page gets one entry module, `js/pages/<page>.js`, loaded with
`<script type="module" src="…">`. A module imports from `api.js`, `live-market.js` and `format.js`.
Anything that `home.js` and a new page both need moves into a shared module; `home.js` then imports
it. Do not copy code between files.

When a mount is wired, remove its `mount` class and its `data-mount` attribute. Its first content is
a `stateBlock('loading', 'Requesting …')` written into the HTML. When every mount is wired, delete
the `.mount*` rules from `css/pages.css`.

### 1. `/arena/`: `#arena-live`
- Mount the existing full block (`mountFull`) with its own store. The homepage behaviour must not
  change.
- Keep the state in the URL: `?asset=ETH&metric=funding&range=24h`. Read it on load and validate it
  against the loaded universe, `METRICS` and `RANGES`. On an invalid value, fall back to the
  default. On every change, write the state back with `history.replaceState`. `?api=` must keep
  working (`apiEnv`).
- The note "Perpetual contracts only — 15 perpetual venues" contains a hardcoded count. Render the
  count from `/exchanges` (`kind === 'perp' && status === 'enabled'`). The markup keeps
  "Requesting" until the response arrives.

### 2. `/data/coverage/`
- `#coverage-totals`: `/coverage` → `totals`, in the format of the homepage line.
- `#coverage-catalogue`: **all** enabled venues, perp and spot, grouped with `.group-row`
  ("Perpetual · n", "Spot · n", with n counted from the response).
  - `normaliseCoverage` keeps perps only today. Extend it with an option. Do not change what the
    homepage gets.
  - Columns: venue name and segment code · dataset chips (the homepage `DATASET_GROUPS` logic) ·
    collected / trading / listed · since.
  - Each row has `id="<segment code>"`. `/data/coverage/#okx-perp` must scroll to the row and
    highlight it.
- The prose sentence "Fifteen perpetual segments and three spot segments are collected" is a
  hardcoded count. Render both numbers from the response, or rewrite the sentence without numbers.
- `#coverage-hours`: `/coverage/hours?days=2|7|31`. The default is 7.
  - `#coverage-hours-range` switches the range and keeps `aria-pressed` in sync.
  - Reuse the homepage strip. Width must work for 31 days × 24 hours: the strip scrolls inside its
    panel, never the page.
  - Recorded interruptions get a mark with a tooltip.
- `#coverage-interruptions`: a table built from the same response, with columns venue · collector ·
  start · end · cause, in UTC. When the range holds none, write: "No interruption was recorded in
  this range." Never write "none".

### 3. `/data/status/`
- `#status-overall`: the word from `/health` as a `fresh` chip.
- `#status-counts`: venues reporting, collectors reporting, collectors with consecutive failures,
  and stale instruments, all computed from the same response.
- `#status-tag`: the time of the last response.
- Show only the venues that `/coverage` lists (same filter as `renderStatus` in `home.js`).
- `#status-collectors`: one row per venue with a `.row-toggle`, expanding into `tr.is-detail` rows,
  one per collector.
  - The venue row shows the worst state among its collectors.
  - Collector rows show last success + age, consecutive failures, last error + age.
  - Error text stays on one line.
- `#status-stale`: `staleInstruments` grouped by venue in `.sym-list`. The venue name links to
  `../coverage/#<code>`. When the list is empty, write: "The response lists no stale instruments."
- Refresh every 30 s (`META_REFRESH_MS`). Do not poll snapshots on this page.
- **Error scrub.** `normaliseHealth` strips the exception prefix and cuts the text at 48
  characters, but a URL can still leak. Before cutting, replace URLs and `host:port` with
  `[address]`. The page promises "No stack trace and no internal address is shown", so this must
  hold.
- There is no incident history section; the designer removed it on purpose. Leave it out.

### 4. `/data/methodology/`: `#method-sample-row`
- Make one call on load, with no refresh:
  `/snapshot?exchange=okx-perp&symbols=BTC-USDT-SWAP&include=quote,depth,instrument`.
- Show the symbol, bid/ask, and the timestamps: venue time, received time, age, `openInterestAt`,
  `depthAt`, each labelled.
- Use the `facts` / `fact__k` / `fact__v` layout. If the call fails, show the error `stateBlock`
  naming the call.

### 5. Links and dialogs (the only homepage change allowed)
- The header and footer on the new pages link to `../#company` for Contact sales and Join the
  waitlist.
  - Make `home.js` open the dialog on `/?open=sales` and `/?open=wait`.
  - Point those links on the four pages there.
- On the homepage, repoint links per brief §6:
  - the nav: Products → Arena; Data → Coverage, Methodology, Data Status; top-level Methodology and
    Status;
  - the footer Data column;
  - the buttons "Open full Arena", "Explore Arena", "See coverage", "Inspect data coverage",
    "Read the methodology" and "View data status";
  - "Explore live data" → `/arena/`.
- **Remove nothing from the homepage and shorten nothing. The homepage layout and content are frozen; only `href` targets and the `?open=` handler change.** Trimming the homepage is a separate,
  later pass.
- Header and footer markup must stay identical on all five pages, apart from relative path
  prefixes. If you change one, change all five.

## Rules (brief §9 — all apply)

- Nothing is filled in when a call fails; the block names the call that failed.
- Placeholders read "Requesting", never "No data".
- **No count, date or venue list in static markup.** Everything that changes comes from the
  response.
- Text runs to the edge of its column and is never truncated with an ellipsis. Tables fit at
  1440 px; below that they scroll inside their panel, never the page.
- Units sit in fixed-width slots; prices follow the venue price step; decimals are padded with
  figure spaces.
- BEST #1F9D5B and WORST #D23B3B are the only green and red. Status is never shown by colour alone.
- Do not compute open-interest notional. It is known to be wrong in the API for OKX (the multiplier
  is ignored); that is a backend bug and out of scope here.
- Escape every string from the API with `esc`.

## Verify before you push

- Start the local server from `.claude/launch.json` (`site`, port 4200).
- Check each of the five pages at 1440 px and at 375 px:
  - no console errors;
  - no horizontal scroll on the body;
  - every mount filled from live data.
- Check the failure path with `?api=` pointing at an environment that does not answer; every block
  must show its error state.
- Check the Arena URL state: change the controls, reload, and confirm the view comes back.
- Check `/data/coverage/#okx-perp` from a fresh load.
- Check `/?open=sales` on the homepage.

## Deliver

Commit on `pass-2` in small commits, each message saying what changed for the reader, and push
`pass-2`. Report:
- the preview URL;
- what you verified and how;
- anything you could not do and why;
- any place where you departed from this task.

Do not merge.
