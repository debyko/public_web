# debyko.com — pass 2 export

Four static pages. No framework, no build step, no runtime template. The only script is
`js/nav.js` (28 lines: header dropdowns, the Menu button, Escape to close) — the same behaviour
`js/home.js` gives the homepage header.

```
arena/index.html               /arena/
data/coverage/index.html       /data/coverage/
data/status/index.html         /data/status/
data/methodology/index.html    /data/methodology/
css/tokens.css                 unchanged, copied from the repository
css/site.css                   unchanged, copied from the repository
css/pages.css                  NEW — the eleven classes below
js/nav.js                      NEW — header behaviour for pages without home.js
sitemap.xml                    the homepage plus the four new pages
assets/, og/                   copies of what the pages reference
```

Drop `arena/`, `data/`, `css/pages.css`, `js/nav.js` and `sitemap.xml` into the repository root.
`css/tokens.css`, `css/site.css`, `assets/` and `og/` are already there and are unchanged — the
copies here exist only so the export opens offline.

## Live blocks — empty mounts, named

No page draws data. Each mount carries its id and, in `data-mount`, what fills it. `.mount` is a
review-only class: it prints the id and that description as a dashed box. Remove the class (or leave
it — the script replaces the contents) and the attribute when you wire the block.

| Page | Mount | Fed by |
|---|---|---|
| /arena/ | `#arena-live` | `js/live-market.js` — the same block the homepage mounts as `#live-full`, plus instrument / metric / range read from and written to the URL |
| /data/coverage/ | `#coverage-totals` | `GET /v1/coverage` → `totals` |
| | `#coverage-catalogue` | `GET /v1/coverage` joined to `GET /v1/exchanges` by code |
| | `#coverage-hours-range` | static `segmented`, already in the markup; bind `data-days` |
| | `#coverage-hours` | `GET /v1/coverage/hours?days=2\|7\|31` |
| | `#coverage-interruptions` | the same response, `interruptions` |
| /data/status/ | `#status-overall`, `#status-counts`, `#status-tag` | `GET /v1/health`, rows filtered to the venues `/v1/coverage` lists |
| | `#status-collectors` | the same response, per venue × collector |
| | `#status-stale` | the same response, `staleInstruments` |
| /data/methodology/ | `#method-sample-row` | one `GET /v1/snapshot` on load, no refresh |

## css/pages.css — what was added and why

`.page-head` inner-page top block (`.section--hero` is built for the homepage hero with the live
slice) · `.toc` in-page anchor list (the site had none) · `.article` long-form reading column capped
at 68 ch (`.method-grid` is a nine-card teaser grid) · `.anchor` the `#` beside a heading ·
`.formula` one-line mono inset (`.snippet` is a whole code panel) · `.group-row` group row in a
table, the `.lm-table .group` treatment lifted out of `.lm-table` · `.row-toggle` and `tr.is-detail`
expandable venue rows (`.tbl` has no nested rows) · `.sym-list` venue symbols in their own casing ·
`.ruled--dated` `.ruled` with a fixed date column · `.mount` the review box described above.

Everything else on these pages is existing `site.css`: `section`, `split--*`, `panel`, `panel__head`,
`panel__note`, `tbl`, `btn`, `label`, `h1`, `h2`, `prose`, `statement`, `ruled`, `notes-3`,
`segmented`, `legend-row`, `swatch--*`, `clock-card`, `closing`, `status-chip`, `rank`, `fresh`.

## Mobile

One breakpoint set, inherited from `site.css` (1160 px folds the menus into Menu, 960 px collapses
`.split` to one column). `pages.css` adds the narrow rules for the new classes: `.toc` to one column,
`.article` type down a step, anchors always visible, `.ruled--dated` stacked. Tables scroll inside
their own panel; the page body never scrolls sideways.

## Metadata

| Page | Title | Description |
|---|---|---|
| /arena/ | Arena — compare perpetual venues live \| DEBYKO | Compare one perpetual instrument across the venues that quote it: price, spread, funding, open interest, depth, and the age of every observation. |
| /data/coverage/ | Coverage — what is collected, and since when \| DEBYKO | What DEBYKO collects, on which venue and since when, with the hours where nothing was observed and the recorded interruptions left visible. |
| /data/status/ | Data status — collector health per venue \| DEBYKO | Collector state per venue: last success and its age, consecutive failures, the last error, and the instruments whose latest snapshot is stale. |
| /data/methodology/ | Methodology — how every figure is made \| DEBYKO | The rules behind every figure: what is collected, the three clocks, freshness thresholds, gaps, derived values, and when a comparison is valid. |

Each has a canonical URL, Open Graph title and description, and the existing
`/og/debyko-og-1200x630.png`. No page card carries numbers or a venue name.

## Two things to know

- **Incident history is not on /data/status/.** The brief asked for it as "not available yet"; the
  approved copy rule forbids mentioning what does not exist. The section is absent. Say the word and
  it comes back as a state block.
- **Contact sales and Join the waitlist link to the homepage.** The dialogs live in `index.html`
  with `js/home.js`; these pages have neither. If you want them to open from here, an `?open=sales`
  parameter read by `home.js` is the smallest change.
