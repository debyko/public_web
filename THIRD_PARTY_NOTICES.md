# Third-party notices

debyko.com ships one third-party library. Nothing else is loaded from another origin at run time
except the two Google Fonts named in the README.

## TradingView Lightweight Charts™

- Version 5.2.1, file `js/vendor/lightweight-charts-5.2.1.js` — the package's
  `dist/lightweight-charts.standalone.production.mjs`, unmodified.
- Source: npm package `lightweight-charts@5.2.1`
  (tarball integrity `sha512-IVwoK1RLFiLPubaKIjNbtjWLnpPMqiABSrTay6whmNa8L1+19292VtHJ+BWyPUuLCwF0tcQlhEWd1CLB2a1nsQ==`,
  checked on download 2026-09-17), https://github.com/tradingview/lightweight-charts
- Copyright (c) 2026 TradingView, Inc.
- Licence: Apache License 2.0 — full text in `js/vendor/lightweight-charts-5.2.1.LICENSE.txt`.
- NOTICE (from the project repository): "TradingView Lightweight Charts™ — Copyright (с) 2025
  TradingView, Inc. https://www.tradingview.com/"
- Attribution: the chart shows the library's own TradingView attribution logo
  (`layout.attributionLogo: true`), as the licence's NOTICE requirement asks.
- Used on: /arena/ (history chart). The page self-hosts the file: the package is not on cdnjs.
