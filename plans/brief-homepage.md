# Design brief — debyko.com homepage (pass 1 of 2)

You are a senior product designer, UX architect and conversion copywriter. Design the **homepage only**
for DEBYKO, a B2B crypto market-infrastructure company. Other pages (Arena, Studio Pro, Methodology,
Status, Pricing, Waitlist, Contact Sales, legal) come in a second pass — on this page they exist only
as link targets.

Language: English. No lorem ipsum.

**Before designing, return A–D and stop:**
A. homepage section order with one line of purpose per section;
B. component inventory (names usable in frontend code);
C. data each live component needs, mapped to the fields in §6;
D. every sentence in your copy that states a fact about the product, so it can be checked.

After approval, produce: desktop design, mobile design, the live-market component spec with all
states, and homepage SEO/Open Graph metadata.

---

## 1. The one rule this page lives by

The product's promise is that nothing is shown as more than it is. **The website must keep the same
promise about itself.** Concretely:

- No invented clients, logos, testimonials, counters, volumes, venue counts or performance claims.
- Any number on the page that describes the product (venues, instruments, history depth) is rendered
  from the backend at load time, never written into the design.
- A product that does not exist yet is shown as not existing yet — status badge, no "Buy" button.
- No claim of regulatory approval, MiCA compliance, certification, best-execution certification,
  institutional adoption or guaranteed point-in-time correctness.
- Demo data, if ever shown, carries a visible DEMO label. The default is no demo data.

## 2. Brand

- **DEBYKO** · debyko.com
- Category: verifiable crypto market infrastructure
- Footer note, small: *Built on the CryptoSmith X market data engine.*
- Legal company name: **not supplied — leave a marked slot, do not invent one.**

**Principles (may appear on the page as written):**
- Every value keeps its source venue and instrument.
- Every value shows when it was received, and its age.
- Missing data stays missing. It is never turned into zero.
- Stale data is never presented as live.
- Derived values say what they were computed from.
- Coverage limits stay visible.

(A seventh principle about history never being rewritten is **not** approved for publication yet — do
not use it.)

## 3. Audiences

One proposition must interest all of them; the four product sections then speak to each:

1. market-data researchers and quant teams → Studio Pro
2. developers building trading/analytics systems → Studio Pro API
3. manual derivatives traders → Arena now, Studio Trader later
4. operators of automated trading → Agent
5. EU CASPs, brokers, execution and compliance teams → Execution Evidence
6. exchanges, protocols, fintech platforms → data & engineering services

## 4. Visual direction

Editorial, close to a serious data publication crossed with a market terminal. Calm, factual,
engineered, independent. Premium without luxury; technical without looking unfinished.

- Warm off-white paper ground, near-black text, graphite panels, hairline grid and separators.
- One restrained accent colour. Green / amber / red **only** for data status.
- Headlines: strong editorial grotesk. Body: highly readable UI face. Values, timestamps, ages, IDs,
  API examples: monospace with **tabular numerals**.
- Generous space between narratives; compact density inside tables.
- Missing values: an explicit empty mark (e.g. "—") with a reason on hover, never a blank that could
  read as zero. Gaps in charts: hatched or empty regions, lines never bridge them.

**Do not use:** neon gradients, glowing coins, rockets, floating candlesticks, glassmorphism, 3D blobs,
casino or aggressive red/green styling, fake dashboards, giant empty hero areas, rows of identical
rounded cards, animations that carry no information, flashing prices.

## 5. Header and footer

**Header:** Debyko wordmark · Products · Solutions · Data · Pricing · Methodology · Status · Company
Primary action: **Explore live data** · Secondary: **Contact sales**

No "Sign in" — there are no customer accounts yet. Menus are compact dropdowns, not mega-menus:

- Products: Arena · Studio Pro · Studio Trader · Agent
- Solutions: Execution Evidence · Data & Research · Venues & Platforms · Trading & Automation
- Data: Coverage · Methodology · API Documentation · Data Status

**Footer:** Products · Solutions · Data (Coverage, Methodology, Status, API Documentation) ·
Company (About, Contact Sales, Join the Waitlist) · Legal (Privacy, Terms) · transition note ·
legal-name slot.

## 6. Where the data comes from (design to this, not beyond)

All live components read the **public CryptoSmith X market-data API**. It is read-only, needs no key,
and publishes an interactive reference.

| | Production | Test |
|---|---|---|
| Base URL | `https://cryptosmithx.blynai.eu/v1` | `https://cryptosmithx-test.blynai.eu/v1` |
| Reference | `https://cryptosmithx.blynai.eu/scalar/v1` | `https://cryptosmithx-test.blynai.eu/scalar/v1` |
| OpenAPI document | `/openapi/v1.json` | same |

**Browser access (CORS):** any origin may call it from a browser (GET, no credentials). If a request
fails, the cause is the network or the service — never name CORS or specific allowed domains in UI
copy.

### 6.1 Component → endpoint

| Component | Endpoint | What it gives | Measured (2026-09-14) |
|---|---|---|---|
| Instrument selector | `GET /v1/exchanges` | every segment: code, venue name, kind (`perp`/`spot`), market model (`orderbook`/`oracle_vault`) | 0.2 s, 2 KB |
| | `GET /v1/instruments?exchange={segment}` | per venue: symbol, base and quote asset, contract multiplier, price step, **funding interval (hours)**, status | 0.5 s per venue |
| Live comparison table + hero slice | `GET /v1/snapshot?exchange={segment}&symbols={symbol}&include=quote,depth,instrument` | one row per venue instrument — see 6.2 | ~0.2 s per venue |
| Chart: trade / mark / index price | `GET /v1/candles?exchange={segment}&symbols={symbol}&tf=60&limit=168&priceType=trade\|mark\|index` | OHLC bars; a venue without mark/index bars returns none plus a warning | per venue |
| Chart: spread, depth, OI, funding over time | `GET /v1/tickers/history`, `/v1/depth`, `/v1/open-interest`, `/v1/funding` | raw history, **max 48 h per request**, paged by cursor | per venue |
| Coverage strip (Studio Pro, Methodology) | `GET /v1/coverage/hours?days=7` (or `&segment={code}`, days 1–31) | per venue × hour: `not_collected_yet` / `not_observed` / `observed` + completeness, and recorded interruptions with cause | 1.0–1.3 s, 97 KB (7 d) / 133 KB (31 d), cached 5 min |
| Coverage summary | `GET /v1/coverage` | enabled venues, datasets each collects, instruments collected / trading / listed | 0.2 s, 1 KB |
| Status section | `GET /v1/health` | overall `ok`/`degraded`; per venue × collector: last attempt, last success and its age, consecutive failures, last error and its age; instruments whose latest snapshot is stale | 0.3 s, 9 KB |
| Point-in-time lookup (Execution Evidence sample) | `GET /v1/as-of?exchange=&symbol=&at=` | the latest stored state at or before an instant | **~11 s** per call on test — sample layout only, never on page load |

**There is no cross-venue call.** "BTC perpetual on every venue" is assembled by the frontend: list
instruments per venue, keep those with `baseAsset = BTC` on `kind = perp` segments, then call snapshot
once per venue in parallel (about 15 calls). `GET /v1/snapshot` without `exchange` returns every
instrument at once (~390 KB, ~2 s) — too heavy for a page that refreshes. Design the data layer so a
single aggregate endpoint can replace the fan-out later without touching components.

### 6.2 Snapshot row fields

| Group | Fields |
|---|---|
| Identity | `segmentCode`, `symbol`, `baseAsset`, `quoteAsset` |
| Quote | `bidPrice`, `askPrice`, `bidSize`, `askSize`, `lastPrice`, `spreadBps` (derived: (ask − bid) / mid × 10 000) |
| Reference prices | `markPrice`, `indexPrice` |
| Funding | `fundingRate` (per venue interval — interval comes from `/instruments`), `fundingRatePredicted`, `nextFundingAt` |
| Activity | `turnover24h`, `volume24hBase`, `lastTradeAt` |
| Open interest | `openInterest`, `openInterestNotional` (derived: OI × mark), `openInterestAt` |
| Depth | `depthBid/Ask10Bps`, `…25Bps`, `…50Bps`, `depthRef` (reference price used), `bookReachBid/Ask`, `depthAt` |
| Time | `receivedAt` + `ageSeconds` (ticker), `venueTs` (only where the venue sends one), `openInterestAt`, `depthAt` |

Real example, okx-perp BTC-USDT-SWAP on prod: ticker age 14 s, depth taken 45 s earlier than the
ticker, `fundingRatePredicted: null`. That is the normal shape: **three clocks per row**, and nulls
that mean "venue does not provide", not zero.

### 6.3 Rules the data imposes on the design

- **Three clocks, not one.** Ticker, open interest and depth arrive by different calls at different
  rates. Show age per group, not one age per row.
- **Timestamps that exist:** venue time (only where supplied) and received time. There is no stored
  "written" or "available" time — the timeline is **VENUE TIME (if supplied) → RECEIVED → AGE**.
- **LIVE / DELAYED / STALE thresholds are not in the API yet.** The API gives ages, not verdicts. Design
  the three states; the thresholds per data group are set by the backend before launch.
- **Stale rows are returned, not hidden.** A venue instrument no longer collected still appears in
  snapshot with an age of days. It must render as STALE, never as a live price.
- **Unsupported ≠ missing ≠ stale.** Oracle/vault venues (`marketModel = oracle_vault`) have no order
  book; some venues publish no mark/index bars; a null field is "not provided". Three different states.
- **History is short and uneven** — weeks, per venue and dataset. Anything before a venue's first
  hour in `/coverage/hours` is "not collected yet", visibly different from a gap.
- **Coverage is measured for ticker snapshots only.** `/coverage/hours` says so in `notMeasured`
  (candles, trades, liquidations, order books). Do not draw a coverage strip for those.
- **Recorded interruptions are not the whole truth.** A missing interruption means an unknown cause, not
  continuity. The API states this; the UI must too.
- **BEST / WORST** only where every compared value is present, fresh and of the same kind.
- **Not in the API at all:** waitlist, sales leads, billing, plans, incidents. Design forms and states;
  the endpoints come later.

## 7. Homepage sections

### 7.1 Hero

- Eyebrow: VERIFIABLE CRYPTO MARKET INFRASTRUCTURE
- H1: **Crypto markets, with the evidence attached.**
- Copy: Compare venues live, investigate market history, connect through an API, or run isolated
  execution agents — without hiding the source, age or absence of the underlying data.
- Buttons: **Explore live data** (primary) · **Explore products** (secondary) · Contact sales (text)
- Smaller, visible: Join the waitlist
- Directly under the copy: a real live component (a compact slice of §7.2), not an illustration.

### 7.2 Live market proof

Default: BTC perpetual.

Controls: instrument selector · metric selector · time range · venue visibility toggles · refresh
state and last-update time.

**Chart** — cross-venue time series. Modes: Trade price · Mark · Index · Spread · Funding ·
Open interest · Depth. A venue without the metric appears in the legend as UNSUPPORTED, not as a flat
line. Lines never cross a gap.

**Table** — Venue · Instrument · Bid · Ask · Spread · Mark · Index · Funding · Funding interval ·
Open interest · Depth · Venue time · Received · Age (per call group) · Status.

Statuses: LIVE · DELAYED · STALE · MISSING · UNSUPPORTED.

**Provenance on every number** (tooltip on desktop, bottom sheet on mobile): venue · venue instrument ·
venue timestamp or "venue sends none" · received timestamp · age · for derived values the formula and
inputs · coverage warning if any.

**Observation line** — one or two sentences generated from the current data, e.g. *"Funding is
positive on 11 of 14 comparable venues. Two depth feeds are stale."* Rendered only when every number
in it is computed from the response. If it cannot be computed, the line is absent — no placeholder.

Buttons: Open full Arena · View methodology

**States to design explicitly:** initial loading · partial data (some venues missing) · slow response
· stale data · unsupported metric for selected instrument · missing values · time range before
collection started · backend unavailable · rate limited. No state ever fills in fake values.

### 7.3 Four product sections — each a full-width editorial section, not a card

Each: label, product name, headline, copy, key points, status badge, price line, two buttons, and a
product visual built from real-looking structure of that product (not a decorative dashboard).
Alternate layouts so they do not read as four copies of one template.

**01 / LIVE VENUE COMPARISON — Arena**
- H: One market. Every available venue. Side by side.
- Copy: Compare the same instrument across the venues that quote it. Inspect price, spread, funding,
  open interest, depth and the age of every observation.
- Points: multi-venue comparison · age per data group · missing values stay visible · BEST/WORST only
  when comparable · source behind every number
- Status: LIVE · Price: FREE
- Buttons: Explore Arena · See coverage
- Visual: dense venue table with annotations, small sparklines, visible ages.

**02 / DATA AND HISTORY — Studio Pro**
- H: **Market history with its gaps left in.**
- Copy: Explore instruments and venues, see exactly what was collected and when, inspect historical
  candles, funding, open interest, trades, liquidations and order-book depth, and reach the same data
  through an API.
- Points: instrument and venue catalogue · trade, mark and index candles where the venue publishes
  them · funding with its interval · open interest · trades and liquidations · order-book snapshots
  and depth bands · coverage and gap view · API
- Statement: A missing observation is empty, not zero. The age and origin of every value stay visible.
- Price: Individual €99 / month · Team €399 / month
- Buttons: **Request access** · View API documentation
  *(Subscribe/checkout appears only after billing exists — do not design a checkout flow in this pass.)*
- Visual: research workstation — catalogue list, a venue × hour coverage strip shaped exactly like
  `GET /v1/coverage/hours` (three states, shade by completeness, interruption marks by cause, labelled
  "ticker snapshots"), a chart with a hatched gap, and a real request/response snippet from §6.

**03 / MANUAL EXECUTION — Studio Trader**
- H: Trade the market without losing sight of the source.
- Copy: A simpler interface for people who need to act rather than study: clear market state,
  deliberate buy and sell controls, and a connection to an exchange account the user controls.
- Principles: large readable values · few elements per screen · no flashing prices · no urgency
  pressure
- Status: IN DEVELOPMENT · Price: not available yet
- Buttons: Join the waitlist · Explore Trader
- Visual: a clearly labelled concept of the order panel. Must not look like a working live product.

**04 / AUTOMATED EXECUTION — Agent**
- H: Automated execution under the operator's control.
- Copy: One isolated bot for one exchange account. Every decision is written to a journal the operator
  can open and review.
- Capabilities: one account per agent · operational state · decision journal · strategy and risk
  parameters · pause by setting position size to zero
- Status: PROTOTYPE · Price: scoped pilot
- Buttons: Request early access · Explore Agent
- Visual: engineering, not trading — process state, event log lines with decision IDs and timestamps,
  a warning, a parameter panel. **No P&L figures, no profitability language.**
- (Claims about where exchange credentials live and what data reaches Debyko are withheld until
  verified — see §10.)

### 7.4 Execution Evidence — the main B2B section

- Label: FOR CASPS, BROKERS AND EXECUTION TEAMS
- H: Reconstruct what other venues showed when an order was executed.
- Copy: For a given execution time and instrument, Debyko assembles what it had observed on
  alternative venues: bid and ask, spread, depth bands, and the age of each observation at that
  moment — with coverage limits stated in the report.
- Sample report layout, clearly marked **SAMPLE LAYOUT — NOT A CLIENT REPORT**: execution time ·
  executed venue and instrument · alternative venues · observed bid/ask · spread · depth bands ·
  **age of each observation at execution time** (the key column — depth may be minutes old) ·
  coverage and gaps · method notes · report reference.
- No "evidence hash" (not implemented).
- Offers, each with Contact sales, each marked *typical scope*:
  - Execution Evidence Pilot — €500–€2,000
  - One-off Execution Audit — €1,000–€5,000
  - Continuous Execution Monitoring — €500–€3,000 / month
  - Venue Comparison Report — €1,000–€5,000
- Disclaimer: Scope and final price depend on venues, instruments, history, order volume and reporting
  requirements. Reconstruction covers only periods and venues Debyko was collecting at the time.
- Never state or imply that regulation requires buying this.

### 7.5 Data and engineering services

- H: Need a dataset, connector or analysis that does not fit a standard plan?
- Present as scoped engagements (a list or table), not subscription cards. Each: one-line description,
  typical scope, Contact sales.
  - Custom historical dataset or export — €500–€5,000
  - Market microstructure research — €1,000–€5,000
  - Exchange or protocol connector — €1,500–€10,000 + €200–€1,000 / month maintenance
  - White-label Arena widget or API — €2,000–€10,000 + €300–€2,000 / month
  - Enterprise API and infrastructure — custom

### 7.6 Methodology (primary section)

- H: The method is part of the product.
- Short blocks: what is collected · how instruments are grouped across venues · venue time vs received
  time · how age and status are computed · how gaps and "not collected yet" differ · how derived values
  are computed (spread, OI notional, depth bands, funding per day) · when a comparison is valid and why
  BEST/WORST may be absent · what the platform cannot know · venue-reported vs derived data.
- Timeline visual: VENUE TIME (if supplied) → RECEIVED → AGE.
- Buttons: Read the methodology · Inspect data coverage

### 7.7 Status and quality

- H: Data quality is public system state.
- Show per venue, from `GET /v1/health`: collector state · last success and its age · consecutive
  failures · last error age · instruments currently stale. Overall `ok` / `degraded` is shown as the
  API states it, next to the per-venue detail — never alone.
- No single green "All systems operational" badge; partial degradation must be visible.
- Buttons: View data status · View incident history
  *(incident history does not exist yet — show the button disabled with "coming", or omit.)*

### 7.8 Pricing overview (compact; full page in pass 2)

- Arena — €0 — Explore Arena
- Studio Pro Individual — €99 / month — Request access
- Studio Pro Team — €399 / month — Request access
- Studio Trader — in development — Join the waitlist
- Agent — prototype, scoped pilot — Request early access
- Sales-led engagements — typical scope ranges — Contact sales
- Monthly prices only. No annual toggle, no discounts.

### 7.9 Closing band

Two separate paths, never merged into one form:
- Join the waitlist (product interest)
- Contact sales (scoped work)

Both open reusable modals; full pages come in pass 2.

## 8. Responsive and accessibility

- Breakpoints: desktop, tablet, mobile (≥360 px).
- Market table on mobile: horizontal scroll inside its own container with a sticky venue column and a
  visible scroll cue; the page body never scrolls sideways. Provenance moves to a bottom sheet.
- Chart on mobile: legend becomes a toggle list; ranges become a segmented control.
- WCAG 2.2 AA contrast. Status never conveyed by colour alone — always a text label.
- All interactive values reachable by keyboard; tooltips open on focus, not only hover.
- Live updates announced politely (no per-tick screen-reader spam); respect prefers-reduced-motion.

## 9. SEO for the homepage

Provide: title (≤60), meta description (≤155), H1, OG title, OG description, OG image concept (static
editorial composition — no live numbers baked in), canonical `https://debyko.com/`, structured data
recommendation (Organization + WebSite; no Product/Offer markup with prices for products not on sale).

Topics to be discoverable for, without stuffing: crypto market data API · perpetual futures data ·
funding rate comparison · exchange spread comparison · order-book depth data · execution quality ·
market-data provenance · data freshness.

## 10. Claims withheld until verified (do not put in copy)

- Exchange terms permit redistributing their data publicly (Arena) and commercially (datasets,
  white-label). **Unverified — blocks public launch of data-bearing pages.**
- History is never silently rewritten / corrections are versioned.
- Agent: exchange credentials never leave the operator's infrastructure; exactly what Debyko receives.
- Studio Trader: OAuth / API-key connection model per exchange.
- Any count of venues, instruments or years of history in static copy.
- Response-time or availability promises for sales, support or the API.
- Ownership of debyko.com and the legal entity name.
