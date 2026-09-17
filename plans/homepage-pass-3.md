# Plan — debyko.com pass 3: the homepage after the data pages

Status: **proposal, for audit**. Nothing here is built yet. Written 2026-09-17 against `main` at
`9ec85c7`.

## 1. What changed underneath the homepage

Pass 2 gave four pages their own addresses: `/arena/`, `/data/coverage/`, `/data/methodology/`,
`/data/status/`. The homepage was left exactly as it was, so the site now says the same things
twice — and the homepage is the slower of the two copies, because it says all of them at once.

Measured on the live site, 30 s after load, 1440 px, cold cache (2026-09-17):

| | homepage | /arena/ |
|---|---:|---:|
| API calls in the first 30 s | 150 | 143 |
| of which `/snapshot` (one per venue, every 5 s) | 97 | 97 |
| `/instruments` (one per venue) | 16 | 16 |
| `/candles` | 32 | 25 |
| `/coverage`, `/coverage/hours`, `/health` | 4 | 4 |
| DOM nodes | **5,100** | 1,448 |
| own assets transferred | 76 KB | 192 KB |

The homepage mounts **three** live market blocks (`#live-slice`, `#live-full`, `#live-arena`), the
coverage catalogue, the 48-hour coverage strip and the collector status table. It is not a landing
page with a live proof on it; it is Arena, Coverage and Status stacked, plus the product copy.

Source: `index.html` is 749 lines over 14 sections; `js/home.js` mounts all six live blocks.

## 2. The rule this plan applies

A homepage answers three questions — *what is this, is it real, what does it cost* — and then sends
the reader to the page that owns the answer. Anything that a dedicated page now owns stays there in
full and appears on the homepage only as much as is needed to make the claim credible.

Concretely:

- **One live proof, not three.** The hero slice already proves "live, with ages". A second full
  table and a third mini table prove nothing new and triple the page's cost.
- **A claim plus a link beats a copy.** "Coverage is public" is a sentence and a link; the
  catalogue itself belongs on `/data/coverage/`.
- **Numbers on the homepage come from the API, never typed.** Where a section is reduced to a
  claim, the claim keeps one live number (venues collecting, degraded collectors) so it cannot go
  stale silently. That is one cheap call (`/coverage`, `/health`), not a table.

## 3. Section by section

| # | Section today | Proposal | Why |
|---|---|---|---|
| 1 | Hero + `#live-slice` | **Keep**, unchanged | The one live proof. Five rows, one call group. |
| 2 | Live market proof + `#live-full` | **Delete the table**, keep the paragraph about three clocks, move the two buttons up | Same table as `/arena/`. It is the single biggest cost on the page: the full comparison, its chart and its history calls. |
| 3 | Principles | **Keep** | Positioning; costs nothing. |
| 4 | Arena product card + `#live-arena` | **Keep the card, drop the mini table and the three notes under it** | A product card next to the hero's live table does not need a third live table between them. |
| 5 | Studio Pro + workstation | **Keep the card. Drop the catalogue and the coverage strip. Keep the candle illustration and the API snippet** | Catalogue and strip are `/data/coverage/`, live. The candle SVG is static and explains "a gap is not a zero"; the snippet is the API claim. |
| 6 | Studio Trader (concept) | **Keep** | Static mock, waitlist. No data. |
| 7 | Agent (prototype) | **Keep** | Same. |
| 8 | Execution evidence | **Keep** | Sales surface, no page of its own yet. Sample report is static. |
| 9 | Services | **Keep** | Sales surface, static. |
| 10 | Methodology grid (9 cards) + clock card | **Reduce to the clock card and three lines, link to `/data/methodology/`** | The nine cards are the methodology page's own content, shortened. Two copies drift apart; one already has. |
| 11 | Status + collector table | **Reduce to one live line — "N venues collecting · M collectors degraded · updated hh:mm UTC" — and the link** | The table is `/data/status/`. The claim "data quality is public system state" survives on one `/health` call. |
| 12 | Pricing rows | **Keep** | This is the third homepage question. |
| 12b | Compare plans table | **Keep for now**, flagged | Marked "temporary, until a pricing page exists". Moving it needs a `/pricing/` page, which is a separate pass. |
| 13 | Closing | **Keep** | Two calls to action. |

## 4. What that leaves

- Live blocks on the homepage: **one** (`#live-slice`), down from six mounts.
- Expected API calls in the first 30 s: `/exchanges` + `/coverage` + `/health` + one `/instruments`
  per venue + the snapshot fan-out for the hero's five rows. The `/candles` calls and the second and
  third tables disappear. Target: **under 60 calls**, from 150.
- DOM nodes: target **under 2,500**, from 5,100.
- `index.html`: roughly 749 → ~520 lines. `js/home.js` loses the catalogue, hours and status
  renderers (~90 lines) and keeps the snippet and the one status line.

## 5. Links, anchors and navigation

The homepage owns nine anchors that other pages link to: `#studio-pro`, `#trader`, `#agent`,
`#evidence`, `#services`, `#pricing`, `#company`, `#products`, `#top`. **None of the sections behind
them is removed by this plan**, so no inbound link breaks.

Two anchors do change meaning and must be re-pointed in the same commit:

- `#proof` — the section survives as copy, but the header nav item "Data" that points at it should
  point to `/arena/` instead.
- `#method` — the `data-scroll="method"` button in section 2 should become a link to
  `/data/methodology/`.

`#status` stays as the one-line section. `sitemap.xml` and the OG card need no change: no URL is
added or removed.

## 6. Acceptance

Measured on the built page, not by eye:

1. Exactly one element on the homepage mounts a market table (`#live-slice`).
2. API calls in the first 30 s under 60; no `/candles` call from the homepage.
3. DOM nodes under 2,500.
4. Every anchor listed in §5 resolves; `nav.js` menu items all lead somewhere that exists.
5. The status line shows live numbers from `/health` or says the call failed — never a typed number.
6. No text on the homepage restates a rule that `/data/methodology/` owns, except the three summary
   lines that link to it.
7. 390 px: no horizontal page scroll; the hero slice scrolls inside its own panel.
8. The four data pages are untouched by this pass; `git diff --stat` shows `index.html`,
   `js/home.js`, and at most the two files above.

## 7. Risks and open questions for the audit

1. **Is one live table enough proof?** The hero slice shows five venues and one call group. The
   deleted `#live-full` was the only place on the homepage that showed three ages per row — the
   product's signature. Option: keep the hero slice but add its third age chip, so the claim in
   section 2 has evidence on the same screen.
2. **Status line vs status table.** A single line is cheaper but weaker: "M collectors degraded" is
   a number a reader cannot check without leaving. Option: keep a three-row table of the worst
   collectors instead of the whole list.
3. **`/pricing/` page.** Section 12b is explicitly temporary. Leaving it keeps the homepage long;
   moving it means a new page in this pass, which widens the blast radius.
4. **SEO.** The homepage currently carries the methodology text that ranks for "crypto market data
   methodology"-shaped queries. Reducing it moves that weight to `/data/methodology/`, which is the
   page that should hold it — but the redirect of authority is not instant.
5. **Studio Trader and Agent** are two long static sections for products that do not exist. They are
   kept here because they carry the waitlist, but they are the next candidates for a `/products/`
   page.

## 8. Out of scope

Arena's own iteration 4 work, the four data pages, the chart, pricing changes, copywriting beyond
deleting duplicated text, and any change to `js/api.js`.
