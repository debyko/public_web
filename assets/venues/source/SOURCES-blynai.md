# Venue mark sources

Marks for the Venues block (`#infrastruktura`). Each file was normalised the
same way: editor cruft, `<title>`, `<desc>` and `<metadata>` stripped; the
`viewBox` cropped to the artwork's own bounding box, measured with `getBBox()`
rather than by eye, so no built-in padding shrinks the mark; and `width`/
`height` set so the intrinsic height is 40 px and the ratio is the artwork's
own. No file has a background plate, a white-only fill, or a `var()` colour.
Geometry and colour are otherwise untouched.

| File | Ratio | Source | Retrieved | Notes |
|---|---:|---|---|---|
| `kraken.svg` | 4.21:1 | `https://assets-cms.kraken.com/images/51n36hrp/facade/4d67f3f4eac6aa0702c6ae62b1e0b1abc41b10cd-650x155.svg`, the lockup kraken.com serves itself | 2026-09-06 | Official colour lockup, `#7132F5` + black. Includes the "by PAYWARD" endorsement line, which is only 35 % of the artwork height — see the per-mark CSS note below. |
| `binance.svg` | 1.00:1 | Wikimedia Commons, `File:Binance Logo.svg` | 2026-09-06 | Brand gold `#F3BA2F`. Glyph only — no wordmark — so the row sets the name beside it. |
| `okx.svg` | 3.56:1 | Wikimedia Commons, `File:OKX logo.svg` | 2026-09-06 | Black wordmark. |
| `coinbase.svg` | 5.60:1 | Wikimedia Commons, `File:Coinbase.svg` | 2026-09-06 | Blue wordmark, `#0052FF`. |
| `bitget.svg` | 3.32:1 | Wikimedia Commons, `File:Logo Bitget.svg` | 2026-09-06 | Teal `#03AAC1`, legible on paper. This replaces the white-on-cyan file in `assets/trust/logos/`, which is a dark-background variant. Had no `viewBox`; one was derived from its own `width`/`height`. |
| `weex.svg` | 4.79:1 | Carried over from `assets/logos/weex.svg` — see that folder's SOURCES.md | 2026-09-06 | Unchanged artwork, re-normalised. |
| `hyperliquid.svg` | 6.50:1 | Carried over from `assets/trust/logos/` | 2026-09-06 | Near-black `#03211C`. |
| `bybit.svg` | 2.89:1 | Carried over from `assets/trust/logos/` | 2026-09-06 | Gradients kept as authored. |
| `mexc.svg` | 5.39:1 | Carried over from `assets/trust/logos/` | 2026-09-06 | `#0057FF`. |
| `gate.svg` | 4.31:1 | Gate's brand kit, horizontal colour variant for light backgrounds (`gate-horizontal-color.svg`; the kit also ships `-on-dark`) | 2026-09-06 | Wordmark `#14141E`, glyph `#0068FF` + `#17E6A1`. Supplied by the client after I failed to find it. Its 447×251 canvas is mostly padding — the artwork is 310.55×72 in the middle — so the crop matters more here than anywhere else. |
| `avantis.svg` | 5.34:1 | The vector avantisfi.com serves (`/images/avantis-logo.svg`), recoloured to the black of the official brand kit at docs.avantisfi.com/brand/avantis-brand-kit | 2026-09-07 | The site's vector is filled `white` for a dark background and the brand kit publishes "Avantis Black Logo — Horizontal" as PNG only. Recolouring the vector to `#000000` reproduces a variant the brand itself publishes rather than inventing one; the black was sampled from their own PNG, and the recoloured vector's 5.34:1 matches that PNG's 5.35:1, confirming it is the same lockup. Geometry untouched. |
| `dydx.svg` | 3.21:1 | Supplied by the client (`dydx.svg`) | 2026-09-13 | The letterforms were filled `white` for a dark background; recoloured to `#000000`, the variant dYdX uses on light backgrounds. The gradient stroke of the X is the brand colour and is untouched. Unverified against an official kit, unlike Avantis. |
| `synthetix.svg` | 13.76:1 | Supplied by the client (`snx-logo-primary.svg`) | 2026-09-13 | Cyan `#00D1FF` wordmark, as authored. Its only `white` fills are clip-path rectangles, which are masks, not visible artwork — no recolouring. The wordmark is so wide that it takes its own width override (see below). The icon-only variant was also supplied and not used, because the wordmark spells the name. |
| `drift.svg` | 1.00:1 | Supplied by the client (`Drift_idgJ1I6vn9_0.svg`, a filename typical of a logo-CDN download) | 2026-09-13 | Glyph only, so the row sets the name beside it. Gradient fills as authored; its `white` is a clip-path rectangle. |
| `gmx.svg` | 1.38:1 | Supplied by the client, from **svgstack.com**, a third-party icon collection (`gmx-token-logo_svgstack_com_…svg`) | 2026-09-13 | Glyph only, name set beside it. Had no `viewBox`; one was derived from its own 40×40. **Provenance is not first-party** — this is the file on the page least backed by its owner, and the first to replace with an official GMX asset. |
| `aster.svg` | 3.78:1 | Supplied by the client (`aster-logo-black.svg`, beside `aster-logo.svg`, `aster-mini.svg` and `aster-mini-light.svg`) | 2026-09-16 | The light-background lockup as authored: gradient mark, black `ASTER` wordmark — no recolouring. `aster-logo.svg` is the same lockup with white letters for dark grounds, and the two minis are glyph-only. Its gradient ids were unprefixed, so they carry an `_aster` suffix to stay unique if marks are ever inlined together. |
| `deribit.svg` | 3.39:1 | The lockup deribit.com serves in its own header | 2026-09-06 | Authored dark-on-light: `#0A0B0D` wordmark, `#0052FF` glyph and "by coinbase". The site wraps it in `class="dark"` with an inline `<style>` that repaints every path white for its dark header; dropping that wrapper leaves the file's own colours untouched. No recolouring was done. |

## Rendered as text, no mark

| Venue | Reason |
|---|---|
| Vertex | The file supplied, `vertex-inc-logo-vector.svg`, is the logo of **Vertex Inc.**, the US tax-technology company (navy wordmark, green mark, dated 2021). `vertex-perp` is Vertex Protocol, a perpetuals exchange launched in 2023 with an unrelated identity. Shipping it would have put another company's trademark on the page. Vertex Protocol's own `vertexprotocol.com` and `app.vertexprotocol.com` both answer 404, so no first-party mark could be fetched either. |

| Nado | No mark was supplied, and none has been fetched and vetted. The Venues grid is rendered from the CryptoSmith X API, so a venue with no file here is set as its name by design — it appears on the page the day it starts collecting, without waiting for a logo. |
| Coinbase International | The API lists it as its own company (`coinbase-intx`), separate from Coinbase spot. `coinbase.svg` spells "Coinbase" alone, so reusing it would drop the "International" that tells the two apart. |

Vertex is no longer on the page at all: the API lists `vertex-perp` as disabled (closed in July 2025), and the grid shows only venues that collect or are queued. Drift is disabled for the same reason; its file stays for the day a successor needs it.

Binance, Drift and GMX set their name beside the glyph for a different reason:
their marks do not spell the name. That is a layout decision, not a missing
asset.

## On recolouring

The rule on this page is that a mark is never recoloured to suit the
background, because that invents a variant its owner never approved. Avantis is
the one exception, and only because it is not an exception in substance: the
brand kit publishes a black horizontal logo alongside the white one, so black
is a sanctioned variant. What was missing was a black *vector*, the kit having
only PNG. Turning the official white vector black therefore reproduces
something the brand already publishes. Verified rather than assumed — the
colour was sampled from their own black PNG and the two lockups measure the
same.

## The per-mark CSS rule

`.vn-mark img{max-height:19px}` gives every mark the same cap. Two are
exceptions, for the same reason: their official lockups set an endorsement line
under the wordmark — Kraken's "by PAYWARD" and Deribit's "by coinbase" — so the
name itself is only 65 % and 52 % of the file's height, measured rather than
estimated. At 19 px both read far smaller than their neighbours, so
`.vn-mark img[src*="kraken"], .vn-mark img[src*="deribit"]{max-height:26px}`.
Synthetix takes the opposite adjustment. Its wordmark runs 13.8:1, so the shared
`max-width:150px` would hold it to about 11 px tall; `.vn-mark
img[src*="synthetix"]{max-width:210px}` lets it reach 15 px.

26 px is the ceiling: `.vn-mark` is a 26 px row, and matching the others
exactly would need 29 px for Kraken and 36 px for Deribit. The endorsement
lines stay small either way; glyph-only marks with the name in text would
remove them, at the cost of breaking the rule that a mark spelling its own name
never repeats it.
