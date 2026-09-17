# debyko.com — OG card

- `debyko-og-1200x630.png` — the card, 1200 × 630, 70 KB
- `debyko-og-source.html` — source: static HTML, `#og` is exactly 1200 × 630 (Montserrat 600/700 · Helvetica/Arial · IBM Plex Mono from Google Fonts; logo is the on-dark lock-up, inlined)

Ground #050505, flat. Safe margins 60 px. Logo → proposition → proof block
(BTC perpetual, three venues, snapshot stamp, ages). The table is a sample, not live data.

Colour = meaning: figures #F0F0F2, units #A5A7AF, venue names #FFFFFF,
magenta #EE2F72 only for information about the data (BEST / MIN / MAX, age),
column heads and the stamp #5A6172 / #8A8E98. No green, no red.

The lock-up's `O` carries the optical overshoot (r 48, stroke 21); the design system
still has r 46 / stroke 20 until that change goes upstream.

Export:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
      --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
      --virtual-time-budget=5000 --screenshot="$PWD/og/debyko-og-1200x630.png" \
      "file://$PWD/og/debyko-og-source.html"

After changing the PNG, bump `?v=` on `og:image` and `twitter:image` in every page —
social networks cache the card by URL.
