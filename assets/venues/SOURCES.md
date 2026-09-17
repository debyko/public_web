# Venue marks

`mark-<exchangeCode>.svg` — the symbol alone, square, for the 18 × 18 slot beside a venue name in the
Arena table (shown `grayscale(1)`, opacity .55; the name is always set as text beside it).

`source/` holds the lockups these were cut from, copied from the blynai.eu repo
(`blyn-ai/web`, `assets/venues/`) on 2026-09-17 — provenance of each is in `source/SOURCES-blynai.md`.
The site never loads anything from `source/`; nothing is hotlinked from another site.

How each mark was made: every visible shape of the lockup was measured with `getBoundingClientRect()`
in a browser; shapes right of the symbol (the wordmark, Kraken's "by PAYWARD", Deribit's "by coinbase")
were deleted, not clipped; the viewBox was set to a square around what was left, with 6 % padding on
each side of the longer edge; fixed `width`/`height` were dropped. Geometry and colour are untouched.
Bitget's lockup is one `<path>`: the symbol is its first two subpaths, kept, the rest removed.

| Mark | Cut from |
|---|---|
| aster, avantis, deribit, gate, hyperliquid, kraken, mexc, weex, bitget | the lockup, symbol only |
| binance, gmx | the source is already glyph-only |

## No mark — the row shows the name only

| Venue | Why |
|---|---|
| Bybit | Wordmark only; the orange bar is part of the letters. |
| Coinbase International | Wordmark only — and it spells "Coinbase", not the International venue. |
| dYdX | Wordmark only. |
| OKX | The logo is the letters themselves. |
| Synthetix | Wordmark only in the source set (an icon variant was supplied to blynai.eu but never committed). |
| Nado | No asset exists. |
| Drift | Glyph available, but the venue is disabled; not cut. |
