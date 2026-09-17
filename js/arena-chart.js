// The Arena history chart on TradingView Lightweight Charts (Apache 2.0, js/vendor/, see
// THIRD_PARTY_NOTICES.md). One chart instance for the page; lines per venue, or one venue as candles
// with the others as dimmed lines behind it.
//
// Product rules the engine must keep:
//  - a line never bridges a gap: across a step over three times the series' usual step the segment
//    is drawn transparent, and a whitespace point keeps the empty time on the axis; nothing is
//    interpolated. (Whitespace alone does NOT break a line in v5.2.1 — checked 2026-09-17: the
//    series joins the points either side of it. A point's colour paints the segment that starts at
//    it, so the last point before a gap carries colour: transparent.) Candles get the whitespace,
//    so an empty interval shows as empty time, not as two candles pushed together;
//  - candles are hollow when close is above open and filled when below, one neutral ink for body,
//    border and wick — no green or red;
//  - no zoom and no pan: the range control is the only way to change the window;
//  - a refresh of the same view goes through series.update(), never a rebuilt chart.

import { esc, fmt } from './format.js';

const LIB = './vendor/lightweight-charts-5.2.1.js';
let libPromise = null;
const loadLib = () => (libPromise ||= import(LIB));

const sec = ms => Math.floor(ms / 1000);
const utcLabel = s => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** The median step between points, in seconds. */
function usualStep(points) {
  const steps = points.slice(1).map((p, i) => sec(p.t) - sec(points[i].t)).filter(x => x > 0).sort((a, b) => a - b);
  return steps.length ? steps[Math.floor(steps.length / 2)] : Infinity;
}

/** Time-ordered, de-duplicated data with a whitespace point in every gap. */
function withGaps(points, toItem) {
  const usual = usualStep(points);
  const out = [];
  let last = null;
  for (const p of points) {
    const t = sec(p.t);
    if (last != null && t <= last) continue;
    const item = toItem(p, t);
    if (!item) continue;
    if (last != null && t - last > usual * 3) {
      const before = out[out.length - 1];
      if (before && before.value != null) before.color = 'transparent';
      out.push({ time: last + usual });
    }
    out.push(item);
    last = t;
  }
  return { data: out, usual, last, lastItem: out[out.length - 1] };
}
const lineItem = (p, t) => (typeof p.v === 'number' ? { time: t, value: p.v } : null);
const candleItem = (p, t) => ([p.o, p.h, p.l, p.v].every(x => typeof x === 'number') ? { time: t, open: p.o, high: p.h, low: p.l, close: p.v } : null);

function cssVar(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
function dim(color, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}

/**
 * @param {HTMLElement} el the element the chart fills (its CSS sets the height)
 * @returns {{ update(view: object): Promise<void>, destroy(): void }}
 */
export function createArenaChart(el) {
  let chart = null, lib = null, destroyed = false;
  let dataKey = null, lastList = null, themeSig = null, decimals = 2;
  const lines = new Map(); // venue -> { api, last, usual, hidden }
  let candle = null;        // { api, venue, last, usual }
  const nameOf = new Map(); // series api -> venue
  let tip = null;

  const colors = () => ({
    bg: cssVar(el, '--dk-surface-panel', '#FFFFFF'),
    ink: cssVar(el, '--dk-text-primary', '#05070C'),
    muted: cssVar(el, '--dk-text-muted', '#5A6172'),
    faint: cssVar(el, '--dk-text-faint', '#8A8E98'),
    hairline: cssVar(el, '--dk-border-hairline', '#E6E6E9'),
    accent: cssVar(el, '--dk-accent', '#DE1A8C'),
    mono: cssVar(el, '--dk-font-mono', 'monospace')
  });

  function themeOptions(c) {
    return {
      layout: { background: { type: 'solid', color: c.bg }, textColor: c.muted, fontFamily: c.mono, fontSize: 10, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: c.hairline } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: c.hairline },
      crosshair: {
        mode: 0,
        vertLine: { color: c.faint, labelBackgroundColor: c.ink },
        horzLine: { color: c.faint, labelBackgroundColor: c.ink }
      }
    };
  }

  function hideTip() { if (tip) tip.hidden = true; }
  function onCrosshair(param) {
    if (!param || param.time == null || !param.point || param.point.x < 0 || param.point.y < 0) { hideTip(); return; }
    const rows = [];
    for (const [api, d] of param.seriesData) {
      const venue = nameOf.get(api);
      if (!venue) continue;
      if (candle && api === candle.api && d.open != null) {
        rows.unshift(`<span class="lm-tip__k">${esc(venue)}</span><span></span>` +
          ['O', 'H', 'L', 'C'].map((k, i) => `<span class="lm-tip__k">${k}</span><span class="lm-tip__v">${fmt([d.open, d.high, d.low, d.close][i], decimals)}</span>`).join(''));
      } else if (d.value != null && (!candle)) {
        rows.push(`<span class="lm-tip__k">${esc(venue)}</span><span class="lm-tip__v">${fmt(d.value, decimals)}</span>`);
      }
    }
    if (!rows.length) { hideTip(); return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'lm-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
    tip.innerHTML = `<div class="lm-tip__t">${utcLabel(param.time)}</div><div class="lm-tip__grid">${rows.join('')}</div>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + param.point.x + 16;
    if (x + w > window.innerWidth - 8) x = r.left + param.point.x - 16 - w;
    const y = Math.max(8, Math.min(r.top + param.point.y - 12, window.innerHeight - h - 8));
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = y + 'px';
  }

  // Renders arrive faster than the library loads; one pending creation serves them all, or two charts
  // would be stacked in the same element.
  let creating = null;
  function ensure() { return (creating ||= create()); }
  async function create() {
    lib = await loadLib();
    if (destroyed) return false;
    const c = colors();
    chart = lib.createChart(el, {
      autoSize: true,
      ...themeOptions(c),
      timeScale: { borderColor: c.hairline, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      localization: { timeFormatter: t => utcLabel(t), priceFormatter: v => fmt(v, decimals) },
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false }
    });
    themeSig = JSON.stringify(c);
    // Attribution twice over, by design: the library's own logo (bottom left) satisfies its licence,
    // and this line (bottom right) rides inside the canvas so it survives a screenshot.
    lib.createTextWatermark(chart.panes()[0], {
      horzAlign: 'right',
      vertAlign: 'bottom',
      lines: [{ text: 'DEBYKO · debyko.com · UTC', color: c.faint, fontSize: 10, fontFamily: c.mono }]
    });
    chart.subscribeCrosshairMove(onCrosshair);
    el.addEventListener('mouseleave', hideTip);
    return true;
  }

  function clearSeries() {
    for (const s of lines.values()) chart.removeSeries(s.api);
    lines.clear();
    if (candle) chart.removeSeries(candle.api);
    candle = null;
    nameOf.clear();
  }

  /**
   * @param {{ key: string, list: object[], view: 'lines'|'candles', candleVenue: string|null,
   *   hidden: object, styles: Map<string, {color: string, dash: boolean}>, decimals: number,
   *   refreshed: boolean }} v
   */
  async function update(v) {
    if (!(await ensure())) return;
    if (destroyed) return;
    const c = colors();
    const sig = JSON.stringify(c);
    if (sig !== themeSig) { chart.applyOptions(themeOptions(c)); themeSig = sig; dataKey = null; }
    if (v.decimals !== decimals) { decimals = v.decimals; chart.applyOptions({ localization: { priceFormatter: x => fmt(x, decimals) } }); }

    const drawable = v.list.filter(s => !s.unsupported && !s.notCollected && s.points.length);
    const isCandles = v.view === 'candles';
    const fullKey = v.key + '|' + v.view + '|' + (isCandles ? v.candleVenue : '');
    const colorOf = s => {
      const st = v.styles.get(s.venue) || { color: 'ink', dash: false };
      const base = st.color === 'accent' ? c.accent : st.color === 'muted' ? c.muted : st.color === 'faint' ? c.faint : c.ink;
      return { color: isCandles ? dim(base, 0.3) : base, lineStyle: st.dash ? 2 : 0 };
    };

    if (fullKey !== dataKey) {
      clearSeries();
      for (const s of drawable) {
        if (isCandles && s.venue === v.candleVenue) {
          const api = chart.addSeries(lib.CandlestickSeries, {
            upColor: 'rgba(0,0,0,0)', downColor: c.ink, borderUpColor: c.ink, borderDownColor: c.ink,
            wickUpColor: c.ink, wickDownColor: c.ink, priceLineVisible: false, lastValueVisible: false
          });
          const d = withGaps(s.points, candleItem);
          api.setData(d.data);
          candle = { api, venue: s.venue, last: d.last, usual: d.usual, lastItem: d.lastItem };
          nameOf.set(api, s.venue);
          continue;
        }
        const api = chart.addSeries(lib.LineSeries, {
          ...colorOf(s), lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        const d = withGaps(s.points, lineItem);
        api.setData(d.data);
        lines.set(s.venue, { api, last: d.last, usual: d.usual, lastItem: d.lastItem, hidden: false });
        nameOf.set(api, s.venue);
      }
      chart.timeScale().fitContent();
      dataKey = fullKey;
      lastList = v.list;
    } else if (v.list !== lastList) {
      // Same view, newer history: append what is new, rewrite the last bar, touch nothing else.
      for (const s of drawable) {
        const target = candle && candle.venue === s.venue ? candle : lines.get(s.venue);
        if (!target) continue;
        const toItem = target === candle ? candleItem : lineItem;
        for (const p of s.points) {
          const t = sec(p.t);
          if (target.last != null && t < target.last) continue;
          const item = toItem(p, t);
          if (!item) continue;
          if (target.last != null && t - target.last > target.usual * 3) {
            if (target.lastItem && target.lastItem.value != null) target.api.update({ ...target.lastItem, color: 'transparent' });
            target.api.update({ time: target.last + target.usual });
          }
          target.api.update(item);
          target.last = t;
          target.lastItem = item;
        }
      }
      lastList = v.list;
    }

    for (const [venue, s] of lines) {
      const hide = !isCandles && !!v.hidden[venue];
      if (hide !== s.hidden) { s.api.applyOptions({ visible: !hide }); s.hidden = hide; }
    }
  }

  function destroy() {
    destroyed = true;
    hideTip();
    if (tip) tip.remove();
    if (chart) chart.remove();
    chart = null;
  }

  return { update, destroy, hasData: () => dataKey != null };
}
