import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Maximize2, Loader2, Info } from 'lucide-react'
import { CHART_TIMEFRAMES } from '../lib/priceData'

// MT5-style price chart: candlestick background + every trade drawn from its
// entry point to its close point with a connecting line. Buy entries are blue,
// sell entries are red. Pure SVG so it needs no charting dependency.

const BUY_COLOR  = '#4DA8FF'
const SELL_COLOR = '#FF5C5C'
const UP_COLOR   = '#3fb950'
const DOWN_COLOR = '#f85149'
const GRID_COLOR = 'rgba(255,255,255,0.06)'
const AXIS_COLOR = '#6e7681'

const MARGIN = { top: 14, right: 64, bottom: 26, left: 10 }

const dirColor = (d) => (d === 'sell' ? SELL_COLOR : BUY_COLOR)

// ---- small numeric helpers ----------------------------------------------
function niceStep(rough) {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const n = rough / pow
  const step = n >= 5 ? 5 : n >= 2 ? 2 : 1
  return step * pow
}

function ticks(min, max, count) {
  if (!(max > min)) return { out: [min], step: 1 }
  const step = niceStep((max - min) / count)
  const start = Math.ceil(min / step) * step
  const out = []
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(v)
  return { out, step }
}

function priceFormatter(step) {
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step)) + 1))
  return (p) => p.toFixed(Number.isFinite(decimals) ? decimals : 2)
}

function fmtTime(ms, spanMs) {
  const d = new Date(ms)
  if (spanMs <= 2 * 24 * 3600_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (spanMs <= 120 * 24 * 3600_000) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

function fmtFull(ms) {
  return new Date(ms).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function TradePriceChart({
  trades = [],            // already filtered to the selected symbol
  candles = [],
  candlesLoading = false,
  candleNote = null,       // reason string when candles couldn't load
  providerEnabled = true,
  symbolOptions = [],      // [{ symbol, count }]
  selectedSymbol = '',
  onSelectSymbol = () => {},
  timeframe = '1h',
  onTimeframe = () => {},
  onVisibleRange = () => {},  // (t0, t1) debounced — lets the parent fetch candles for the view
}) {
  const wrapRef = useRef(null)
  const [dims, setDims] = useState({ w: 0, h: 460 })
  const [domain, setDomain] = useState(null) // { t0, t1 } visible time window in ms
  const [priceDomain, setPriceDomain] = useState(null) // { min, max } when the price scale is locked; null = auto-fit
  const [hover, setHover] = useState(null)
  const dragRef = useRef(null)
  const touchRef = useRef(null)

  // ---- responsive sizing (shorter on phones so it doesn't swallow the screen) ----
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = Math.max(0, entries[0].contentRect.width)
      setDims({ w, h: w < 640 ? 340 : 460 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- full data time range (entry..exit across all trades / candles) ----
  const dataRange = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (const t of trades) {
      lo = Math.min(lo, t.entryTime)
      hi = Math.max(hi, t.exitTime ?? t.entryTime)
    }
    for (const c of candles) { lo = Math.min(lo, c.t); hi = Math.max(hi, c.t) }
    if (!Number.isFinite(lo)) {
      const now = Date.now()
      return { lo: now - 7 * 24 * 3600_000, hi: now }
    }
    if (lo === hi) { lo -= 3600_000; hi += 3600_000 }
    const pad = (hi - lo) * 0.04
    return { lo: lo - pad, hi: hi + pad }
  }, [trades, candles])

  const fit = useCallback(() => {
    setDomain({ t0: dataRange.lo, t1: dataRange.hi })
    setPriceDomain(null) // back to auto price-fit
  }, [dataRange])

  // Reset the view whenever the symbol changes (new price scale & range).
  useEffect(() => { setDomain({ t0: dataRange.lo, t1: dataRange.hi }); setPriceDomain(null) }, [selectedSymbol]) // eslint-disable-line
  // First mount / when a window doesn't exist yet.
  useEffect(() => { if (!domain) setDomain({ t0: dataRange.lo, t1: dataRange.hi }) }, [domain, dataRange])

  // Report the visible time window to the parent (debounced) so it can fetch
  // candles that cover exactly what's on screen — essential for M1/M5 where the
  // provider's 5000-bar cap can't span the whole history at once.
  const rangeCbRef = useRef(onVisibleRange)
  rangeCbRef.current = onVisibleRange
  useEffect(() => {
    if (!domain) return
    const id = setTimeout(() => rangeCbRef.current(domain.t0, domain.t1), 450)
    return () => clearTimeout(id)
  }, [domain])

  const plot = useMemo(() => ({
    x: MARGIN.left,
    y: MARGIN.top,
    w: Math.max(0, dims.w - MARGIN.left - MARGIN.right),
    h: Math.max(0, dims.h - MARGIN.top - MARGIN.bottom),
  }), [dims])

  // ---- scales (price domain derived from what's visible) ----
  const view = useMemo(() => {
    if (!domain || plot.w <= 0) return null
    const { t0, t1 } = domain
    const span = t1 - t0

    const visCandles = candles.filter(c => c.t >= t0 && c.t <= t1)
    let pMin = Infinity, pMax = -Infinity
    for (const c of visCandles) { pMin = Math.min(pMin, c.l); pMax = Math.max(pMax, c.h) }
    for (const tr of trades) {
      const overlaps = (tr.entryTime <= t1) && ((tr.exitTime ?? tr.entryTime) >= t0)
      if (!overlaps) continue
      pMin = Math.min(pMin, tr.entryPrice)
      pMax = Math.max(pMax, tr.entryPrice)
      if (tr.exitPrice != null) { pMin = Math.min(pMin, tr.exitPrice); pMax = Math.max(pMax, tr.exitPrice) }
    }
    if (!Number.isFinite(pMin)) { pMin = 0; pMax = 1 }
    if (pMin === pMax) { pMin -= 1; pMax += 1 }
    const pPad = (pMax - pMin) * 0.08
    pMin -= pPad; pMax += pPad

    // Locked (manually dragged) price scale overrides the auto-fit.
    if (priceDomain) { pMin = priceDomain.min; pMax = priceDomain.max }

    const xOf = (t) => plot.x + ((t - t0) / span) * plot.w
    const yOf = (p) => plot.y + (1 - (p - pMin) / (pMax - pMin)) * plot.h
    const tOf = (px) => t0 + ((px - plot.x) / plot.w) * span
    const pOf = (py) => pMin + (1 - (py - plot.y) / plot.h) * (pMax - pMin)

    return { t0, t1, span, pMin, pMax, visCandles, xOf, yOf, tOf, pOf }
  }, [domain, plot, candles, trades, priceDomain])

  // ---- interaction: wheel zoom (native listener so we can preventDefault) ----
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!domain || plot.w <= 0) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const span = domain.t1 - domain.t0
      const center = domain.t0 + ((px - plot.x) / plot.w) * span
      const factor = e.deltaY < 0 ? 0.82 : 1.22
      const minSpan = (CHART_TIMEFRAMES.find(t => t.key === timeframe)?.ms || 3600_000) * 6
      const maxSpan = Math.max((dataRange.hi - dataRange.lo) * 4, minSpan * 10)
      const newSpan = Math.min(maxSpan, Math.max(minSpan, span * factor))
      const left = (center - domain.t0) / span
      setDomain({ t0: center - left * newSpan, t1: center + (1 - left) * newSpan })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [domain, plot, timeframe, dataRange])

  // crosshair + nearest trade point for a pixel position (shared by mouse & touch)
  const hoverAt = (px, py, hitRadius) => {
    if (!view) return null
    const r2 = hitRadius * hitRadius
    let nearest = null, nearestDist = r2
    for (const tr of trades) {
      const points = [
        { kind: 'entry', t: tr.entryTime, p: tr.entryPrice },
        tr.exitTime != null && tr.exitPrice != null ? { kind: 'exit', t: tr.exitTime, p: tr.exitPrice } : null,
      ].filter(Boolean)
      for (const pt of points) {
        const dxp = view.xOf(pt.t) - px
        const dyp = view.yOf(pt.p) - py
        const d = dxp * dxp + dyp * dyp
        if (d < nearestDist) { nearestDist = d; nearest = { tr, ...pt } }
      }
    }
    return { px, py, time: view.tOf(px), price: view.pOf(py), nearest }
  }

  const localPos = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect()
    return { px: clientX - rect.left, py: clientY - rect.top }
  }

  const spanClamp = (span) => {
    const minSpan = (CHART_TIMEFRAMES.find(t => t.key === timeframe)?.ms || 3600_000) * 6
    const maxSpan = Math.max((dataRange.hi - dataRange.lo) * 4, minSpan * 10)
    return Math.min(maxSpan, Math.max(minSpan, span))
  }

  // Pointer is over the right-hand price-axis strip (drag here to rescale price).
  const inPriceAxis = (px) => px >= plot.x + plot.w

  // Vertical drag distance -> new locked price scale, centered on the old range.
  const scalePrice = (startMin, startMax, dy) => {
    const factor = Math.max(0.1, 1 + dy * 0.005) // drag down = zoom out, up = zoom in
    const center = (startMin + startMax) / 2
    const half = ((startMax - startMin) / 2) * factor
    if (half > 0) setPriceDomain({ min: center - half, max: center + half })
  }

  // Vertical body drag -> pan the price view up/down (locks the scale while panning).
  const panPrice = (startMin, startMax, dy) => {
    const span = startMax - startMin
    const shift = (dy / plot.h) * span
    setPriceDomain({ min: startMin + shift, max: startMax + shift })
  }

  // ---- mouse ----
  const onMouseDown = (e) => {
    if (!view) return
    const { px } = localPos(e.clientX, e.clientY)
    if (inPriceAxis(px)) {
      dragRef.current = { mode: 'price', y: e.clientY, min: view.pMin, max: view.pMax }
    } else {
      dragRef.current = { mode: 'time', x: e.clientX, y: e.clientY, t0: domain?.t0, t1: domain?.t1, pMin: view.pMin, pMax: view.pMax }
    }
  }
  const onMouseUp = () => { dragRef.current = null }
  const onMouseLeave = () => { dragRef.current = null; setHover(null) }

  const onMouseMove = (e) => {
    if (!wrapRef.current || !view) return
    const d = dragRef.current
    if (d && (e.buttons & 1)) {
      if (d.mode === 'price') { scalePrice(d.min, d.max, e.clientY - d.y); return }
      const span = d.t1 - d.t0
      const shift = ((e.clientX - d.x) / plot.w) * span
      setDomain({ t0: d.t0 - shift, t1: d.t1 - shift })
      const dy = e.clientY - d.y
      if (priceDomain || Math.abs(dy) > 6) panPrice(d.pMin, d.pMax, dy)
      return
    }
    const { px, py } = localPos(e.clientX, e.clientY)
    setHover(hoverAt(px, py, 12))
  }

  // Double-click the price axis resets it to auto-fit; elsewhere fits everything.
  const onDoubleClick = (e) => {
    const { px } = localPos(e.clientX, e.clientY)
    if (inPriceAxis(px)) setPriceDomain(null)
    else fit()
  }

  // ---- touch (one finger = pan + crosshair, two fingers = pinch zoom) ----
  const onTouchStart = (e) => {
    if (!domain || !wrapRef.current || !view) return
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const { px, py } = localPos(t.clientX, t.clientY)
      if (inPriceAxis(px)) {
        touchRef.current = { mode: 'price', y: t.clientY, min: view.pMin, max: view.pMax }
        setHover(null)
        return
      }
      touchRef.current = { mode: 'pan', x: t.clientX, y: t.clientY, t0: domain.t0, t1: domain.t1, pMin: view.pMin, pMax: view.pMax }
      setHover(hoverAt(px, py, 18))
    } else if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.max(1, Math.abs(a.clientX - b.clientX))
      const { px } = localPos((a.clientX + b.clientX) / 2, 0)
      const span = domain.t1 - domain.t0
      const centerTime = domain.t0 + ((px - plot.x) / plot.w) * span
      touchRef.current = { mode: 'pinch', dist, span, centerTime, leftFrac: (centerTime - domain.t0) / span }
      setHover(null)
    }
  }

  const onTouchMove = (e) => {
    const st = touchRef.current
    if (!st || !view) return
    if (st.mode === 'price' && e.touches.length === 1) {
      scalePrice(st.min, st.max, e.touches[0].clientY - st.y)
      return
    }
    if (st.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0]
      const span = st.t1 - st.t0
      const shift = ((t.clientX - st.x) / plot.w) * span
      setDomain({ t0: st.t0 - shift, t1: st.t1 - shift })
      const dy = t.clientY - st.y
      if (priceDomain || Math.abs(dy) > 6) panPrice(st.pMin, st.pMax, dy)
      const { px, py } = localPos(t.clientX, t.clientY)
      setHover(hoverAt(px, py, 18))
    } else if (st.mode === 'pinch' && e.touches.length >= 2) {
      const dist = Math.max(1, Math.abs(e.touches[0].clientX - e.touches[1].clientX))
      const newSpan = spanClamp(st.span * (st.dist / dist))
      setDomain({ t0: st.centerTime - st.leftFrac * newSpan, t1: st.centerTime + (1 - st.leftFrac) * newSpan })
    }
  }

  const onTouchEnd = (e) => {
    if (e.touches.length === 0) { touchRef.current = null; return }
    // dropped from two fingers to one → continue panning from the remaining touch
    if (e.touches.length === 1 && domain && view) {
      const t = e.touches[0]
      touchRef.current = { mode: 'pan', x: t.clientX, y: t.clientY, t0: domain.t0, t1: domain.t1, pMin: view.pMin, pMax: view.pMax }
    }
  }

  // ---- axis ticks ----
  const priceTicks = useMemo(() => {
    if (!view) return { out: [], step: 1 }
    return ticks(view.pMin, view.pMax, 5)
  }, [view])
  const timeTickVals = useMemo(() => {
    if (!view) return []
    const approx = 6
    const step = niceStep(view.span / approx)
    const start = Math.ceil(view.t0 / step) * step
    const out = []
    for (let v = start; v <= view.t1; v += step) out.push(v)
    return out
  }, [view])

  const pFmt = priceFormatter(priceTicks.step || 1)

  // candle body width in px
  const candleW = useMemo(() => {
    if (!view) return 2
    const tf = CHART_TIMEFRAMES.find(t => t.key === timeframe)?.ms || 3600_000
    const px = (tf / view.span) * plot.w
    return Math.max(1, Math.min(px * 0.7, 18))
  }, [view, timeframe, plot])

  const noData = trades.length === 0
  const tradeLineDash = '4 3'

  return (
    <div className="w-full">
      {/* ---- controls ---- */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 px-3 sm:px-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] sm:text-xs text-gray-400">Symbol</span>
          <select
            value={selectedSymbol}
            onChange={e => onSelectSymbol(e.target.value)}
            className="flat-input text-[11px] sm:text-xs py-1.5 px-2 rounded-lg bg-dark-secondary border border-dark-border text-white"
            style={{ minWidth: 120 }}
          >
            {symbolOptions.length === 0 && <option value="">No symbols</option>}
            {symbolOptions.map(s => (
              <option key={s.symbol} value={s.symbol}>{s.symbol} ({s.count})</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] sm:text-xs text-gray-400 hidden sm:inline">Timeframe</span>
          <div className="flex bg-dark-tertiary rounded-lg p-1">
            {CHART_TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                onClick={() => onTimeframe(tf.key)}
                className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-medium rounded-md transition-all ${
                  timeframe === tf.key ? 'bg-accent-cyan text-dark-primary' : 'text-gray-400 hover:text-white'
                }`}
                style={timeframe === tf.key ? { background: '#ADFF2F', color: '#0d1117' } : undefined}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fit}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs rounded-lg bg-dark-tertiary text-gray-300 hover:text-white transition-colors"
          title="Fit all trades into view"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Fit
        </button>

        {/* legend */}
        <div className="ml-auto flex items-center gap-3 text-[10px] sm:text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: BUY_COLOR }} /> Buy</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: SELL_COLOR }} /> Sell</span>
          {candlesLoading && <span className="flex items-center gap-1 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> candles</span>}
        </div>
      </div>

      {/* ---- chart surface ---- */}
      <div
        ref={wrapRef}
        className="relative w-full select-none"
        style={{
          height: dims.h,
          cursor: dragRef.current?.mode === 'price' ? 'ns-resize' : dragRef.current ? 'grabbing' : 'crosshair',
          touchAction: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {dims.w > 0 && view && (
          <svg width={dims.w} height={dims.h} style={{ display: 'block' }}>
            {/* grid + price axis (right) */}
            {priceTicks.out.map((p, i) => {
              const y = view.yOf(p)
              if (y < plot.y - 1 || y > plot.y + plot.h + 1) return null
              return (
                <g key={`py-${i}`}>
                  <line x1={plot.x} x2={plot.x + plot.w} y1={y} y2={y} stroke={GRID_COLOR} />
                  <text x={plot.x + plot.w + 6} y={y + 3} fontSize={10} fill={AXIS_COLOR}>{pFmt(p)}</text>
                </g>
              )
            })}

            {/* time axis (bottom) */}
            {timeTickVals.map((t, i) => {
              const x = view.xOf(t)
              if (x < plot.x - 1 || x > plot.x + plot.w + 1) return null
              return (
                <g key={`tx-${i}`}>
                  <line x1={x} x2={x} y1={plot.y} y2={plot.y + plot.h} stroke={GRID_COLOR} />
                  <text x={x} y={plot.y + plot.h + 16} fontSize={10} fill={AXIS_COLOR} textAnchor="middle">
                    {fmtTime(t, view.span)}
                  </text>
                </g>
              )
            })}

            {/* candlesticks */}
            {view.visCandles.map((c, i) => {
              const x = view.xOf(c.t)
              const up = c.c >= c.o
              const col = up ? UP_COLOR : DOWN_COLOR
              const yO = view.yOf(c.o), yC = view.yOf(c.c)
              const bodyTop = Math.min(yO, yC)
              const bodyH = Math.max(1, Math.abs(yC - yO))
              return (
                <g key={`c-${i}`}>
                  <line x1={x} x2={x} y1={view.yOf(c.h)} y2={view.yOf(c.l)} stroke={col} strokeWidth={1} opacity={0.55} />
                  <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={col} opacity={0.45} />
                </g>
              )
            })}

            {/* trades: entry -> exit line + endpoint dots */}
            {trades.map((tr) => {
              const ex = view.xOf(tr.entryTime)
              const ey = view.yOf(tr.entryPrice)
              const col = dirColor(tr.direction)
              const hasExit = tr.exitTime != null && tr.exitPrice != null
              // skip if entirely off-screen
              const onScreen = (tr.entryTime <= view.t1 && (tr.exitTime ?? tr.entryTime) >= view.t0)
              if (!onScreen) return null
              const xx = hasExit ? view.xOf(tr.exitTime) : null
              const yy = hasExit ? view.yOf(tr.exitPrice) : null
              const isHover = hover?.nearest?.tr?.id === tr.id
              return (
                <g key={tr.id}>
                  {hasExit && (
                    <line
                      x1={ex} y1={ey} x2={xx} y2={yy}
                      stroke={col} strokeWidth={isHover ? 2 : 1.25}
                      strokeDasharray={tradeLineDash} opacity={isHover ? 1 : 0.8}
                    />
                  )}
                  {hasExit && (
                    <circle cx={xx} cy={yy} r={isHover ? 5 : 4} fill="var(--neu-bg, #1b1f24)" stroke={col} strokeWidth={2} />
                  )}
                  <circle cx={ex} cy={ey} r={isHover ? 5.5 : 4.5} fill={col} stroke="#0d1117" strokeWidth={1} />
                </g>
              )
            })}

            {/* crosshair */}
            {hover && (
              <g pointerEvents="none">
                <line x1={hover.px} x2={hover.px} y1={plot.y} y2={plot.y + plot.h} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <line x1={plot.x} x2={plot.x + plot.w} y1={hover.py} y2={hover.py} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <rect x={plot.x + plot.w} y={hover.py - 8} width={MARGIN.right} height={16} fill="#0d1117" />
                <text x={plot.x + plot.w + 6} y={hover.py + 3} fontSize={10} fill="#fff">{pFmt(hover.price)}</text>
              </g>
            )}
          </svg>
        )}

        {/* empty / no-symbol states */}
        {noData && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            {symbolOptions.length === 0 ? 'No trades match the current filters' : 'No trades for this symbol'}
          </div>
        )}

        {/* tooltip card for the nearest trade */}
        {hover?.nearest && (() => {
          const tr = hover.nearest.tr
          const left = Math.min(hover.px + 14, dims.w - 190)
          const top = Math.max(8, Math.min(hover.py + 12, dims.h - 130))
          const pnl = tr.profitLoss
          return (
            <div
              className="absolute pointer-events-none z-10 text-xs rounded-lg p-2.5"
              style={{ left, top, width: 178, background: '#10141a', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold uppercase tracking-wide" style={{ color: dirColor(tr.direction) }}>
                  {tr.direction} · {tr.symbol}
                </span>
                {pnl != null && (
                  <span style={{ color: pnl >= 0 ? UP_COLOR : DOWN_COLOR }} className="font-mono">
                    {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                <span className="text-gray-500">Entry</span>
                <span className="text-gray-200 font-mono text-right">{tr.entryPrice} · {fmtFull(tr.entryTime)}</span>
                {tr.exitPrice != null ? (
                  <>
                    <span className="text-gray-500">Exit</span>
                    <span className="text-gray-200 font-mono text-right">{tr.exitPrice} · {fmtFull(tr.exitTime)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-500">Status</span>
                    <span className="text-gray-300 text-right">{tr.status || 'open'}</span>
                  </>
                )}
                {tr.outcome && <><span className="text-gray-500">Outcome</span><span className="text-gray-300 text-right capitalize">{tr.outcome}</span></>}
              </div>
            </div>
          )
        })()}
      </div>

      {/* candle provider hint */}
      {!providerEnabled && (
        <div className="mt-2 px-3 sm:px-0 flex items-center gap-1.5 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5" />
          Background candles are off — set <code className="text-gray-400">VITE_TWELVEDATA_API_KEY</code> to enable them. Trades are still plotted by exact time &amp; price.
        </div>
      )}
      {providerEnabled && candleNote && !candlesLoading && trades.length > 0 && (
        <div className="mt-2 px-3 sm:px-0 flex items-center gap-1.5 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5" />
          {candleNote === 'rate-limit'
            ? 'Twelve Data rate limit reached (8 calls/min on the free plan) — candles will load in a moment. Trades are still shown.'
            : `No candles for this symbol/timeframe (${candleNote}). Trades are shown on a price grid.`}
        </div>
      )}
    </div>
  )
}
