import React, { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Legend,
} from 'recharts'

// Profitability trend for one strategy at the selected threshold, counted in
// TRADES, not money: every win is +1, every loss −1, so the line is the
// running "wins − losses" in close order. Holds for any risk:reward or size.
//
// Two lines on one shared time axis (every judged trade is a point):
//   selected = trades in the chosen set (`inSet`), e.g. regime confidence band
//   baseline = every judged trade (what taking everything did)
// Breakeven trades never reach here (the RPC drops them).
//
// Props
//   trades    [{ closedAt, channelName, won, ... }] oldest first
//   inSet     trade => bool
//   setLabel  legend / stats name of the selected set, e.g. "Regime ≥40%"
//   loading

const GREEN = '#ADFF2F'
const RED = '#f85149'
const CYAN = '#39d5ff'
const GRAY = '#6e7681'

const fmtNet = (v) => (v > 0 ? `+${v}` : `${v}`)
const fmtDate = (iso, withYear) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, withYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' })
}

function TrendTooltip({ active, payload, setLabel }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-300 font-medium mb-1">{fmtDate(d.t, true)} · trade #{d.i + 1}</div>
      <div className="text-gray-400 mb-1">
        {d.channel}: <span style={{ color: d.won ? GREEN : RED }}>{d.won ? 'win' : 'loss'}</span>
        {d.inSet ? ` · in ${setLabel}` : ` · outside ${setLabel}`}
      </div>
      <div className="text-gray-400">{setLabel}: <span className="font-mono" style={{ color: CYAN }}>{fmtNet(d.sel)}</span>
        <span className="text-gray-600"> ({d.selW}W − {d.selL}L)</span></div>
      <div className="text-gray-400">All trades: <span className="font-mono text-gray-200">{fmtNet(d.base)}</span>
        <span className="text-gray-600"> ({d.baseW}W − {d.baseL}L)</span></div>
    </div>
  )
}

export default function StrategyTrendPanel({ trades, inSet, setLabel, loading }) {
  const view = useMemo(() => {
    const rows = trades || []
    let selW = 0, selL = 0, baseW = 0, baseL = 0
    const points = rows.map((tr, i) => {
      const on = inSet(tr)
      if (tr.won) baseW++; else baseL++
      if (on) { if (tr.won) selW++; else selL++ }
      return {
        i, t: tr.closedAt, channel: tr.channelName, won: tr.won, inSet: on,
        sel: selW - selL, base: baseW - baseL, selW, selL, baseW, baseL,
      }
    })
    return { points, selW, selL, baseW, baseL }
  }, [trades, inSet])

  if (loading || trades == null) {
    return <div className="flex items-center justify-center h-72 text-gray-500 text-sm">Loading…</div>
  }
  if (view.points.length === 0) {
    return (
      <div className="flex items-center justify-center h-72 text-gray-500 text-sm text-center px-6">
        No closed, judged trades match these filters yet.
      </div>
    )
  }

  const { points, selW, selL, baseW, baseL } = view
  const selN = selW + selL
  const selNet = selW - selL
  const baseNet = baseW - baseL
  const selWr = selN > 0 ? (selW / selN) * 100 : null
  const baseWr = (baseW / (baseW + baseL)) * 100
  const n = points.length
  // ~6 evenly spaced date ticks.
  const ticks = n <= 6 ? points.map(p => p.i)
    : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round((k * (n - 1)) / 5)))]
  const color = (v) => (v > 0 ? GREEN : v < 0 ? RED : '#e5e7eb')

  const stats = [
    { label: `Net · ${setLabel}`, value: fmtNet(selNet), sub: `${selW}W − ${selL}L`, color: color(selNet) },
    { label: `Win rate · ${setLabel}`, value: selWr != null ? `${selWr.toFixed(1)}%` : '—', sub: `${selN} trades` },
    { label: 'Net · all trades', value: fmtNet(baseNet), sub: `${baseW}W − ${baseL}L`, color: color(baseNet) },
    { label: 'Win rate · all trades', value: `${baseWr.toFixed(1)}%`, sub: `${n} trades` },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map(s => (
          <div key={s.label} className="px-3 py-2" style={{ background: 'var(--card-flat)', borderRadius: '10px' }}>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 truncate" title={s.label}>{s.label}</div>
            <div className="text-lg font-semibold font-mono" style={{ color: s.color || '#e5e7eb' }}>
              {s.value}
              {s.sub && <span className="ml-1.5 text-[11px] font-normal text-gray-500 font-sans">{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={points} margin={{ left: 0, right: 10, top: 10, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="i" type="number" domain={[0, Math.max(1, n - 1)]} ticks={ticks}
            tickFormatter={(i) => fmtDate(points[i]?.t)} stroke={GRAY} fontSize={11} tickLine={false} />
          <YAxis stroke={GRAY} fontSize={11} allowDecimals={false} width={38} tickFormatter={fmtNet} />
          <Tooltip content={<TrendTooltip setLabel={setLabel} />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
          <ReferenceLine y={0} stroke={GRAY} />
          <Legend wrapperStyle={{ paddingTop: 12 }} formatter={(value) => <span className="text-gray-300 text-xs">{value}</span>} />
          <Line type="linear" dataKey="sel" name={`${setLabel} · wins − losses`} stroke={CYAN}
            strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="base" name="All trades · wins − losses" stroke={GRAY}
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
