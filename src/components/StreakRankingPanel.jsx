import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine, CartesianGrid, LabelList,
} from 'recharts'

// Max drawdown (in TRADES) per confidence level + best/worst 10 channels at
// the selected level, for one strategy on the Trades page "AI Grades" tab.
//
// Drawdown = the longest run of consecutive losses among the trades the
// strategy would have allowed, in close order. It is counted in trades, not
// money, so it holds for any risk:reward and account size. Breakeven trades
// never reach this panel (the RPC drops them), so they neither extend nor
// break a streak.
//
// Props
//   trades   [{ closedAt, channelId, channelName, won, ... }] oldest first
//   levels   [{ t, label }]  the strategy's threshold steps (slider values)
//   allowed  (trade, t) => bool
//   selected current t (shared with the card's slider), onSelect(t)
//   levelName  word for the axis, e.g. "Min confidence"
//   colorFor   channelId => colour dot
//   loading

const GREEN = '#ADFF2F'
const RED = '#f85149'
const CYAN = '#39d5ff'
const GRAY = '#6e7681'
const TOP_N = 10

function streakStats(trades) {
  let wins = 0, losses = 0, run = 0, max = 0, maxEnd = null
  for (const tr of trades) {
    if (tr.won) { wins++; run = 0 }
    else {
      losses++; run++
      if (run > max) { max = run; maxEnd = tr.closedAt }
    }
  }
  return { wins, losses, n: wins + losses, maxStreak: max, maxEnd }
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function SweepTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="px-3 py-2 text-xs" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
      <div className="font-semibold text-gray-200 mb-1">{d.label}</div>
      <div className="text-gray-300">Max losing streak: <span className="font-mono" style={{ color: RED }}>{d.maxStreak}</span></div>
      {d.maxEnd && <div className="text-gray-500">ended {fmtDate(d.maxEnd)}</div>}
      <div className="text-gray-300">Allowed trades: <span className="font-mono">{d.n}</span> ({d.wins}W − {d.losses}L)</div>
      <div className="text-gray-300">Win rate: <span className="font-mono">{d.n > 0 ? `${((d.wins / d.n) * 100).toFixed(1)}%` : '—'}</span></div>
    </div>
  )
}

function RankTable({ title, rows, color, colorFor }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] mb-1 font-semibold uppercase tracking-wider" style={{ color }}>{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-gray-500 px-2 py-3">No channels with enough trades.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="min-w-[140px]">Channel</th>
                <th>Trades</th>
                <th>W − L</th>
                <th>Win rate</th>
                <th title="Longest run of consecutive losses for this channel at this level">Max DD (trades)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.channelId} className="transition-colors hover:bg-dark-tertiary/50">
                  <td className="font-mono text-gray-500">{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorFor(r.channelId) }} />
                      <span className="truncate max-w-[200px]" title={r.channelName}>{r.channelName}</span>
                    </span>
                  </td>
                  <td className="font-mono">{r.n}</td>
                  <td className="font-mono">
                    <span style={{ color: GREEN }}>{r.wins}</span>
                    <span className="text-gray-500"> − </span>
                    <span style={{ color: RED }}>{r.losses}</span>
                  </td>
                  <td className="font-mono" style={{ color }}>{r.winRate.toFixed(1)}%</td>
                  <td className="font-mono" style={{ color: r.maxStreak > 0 ? RED : undefined }}>{r.maxStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function StreakRankingPanel({
  trades, levels, allowed, selected, onSelect, levelName = 'Level', colorFor = () => GRAY, loading,
}) {
  const [minTrades, setMinTrades] = useState(5)

  const sweep = useMemo(() => levels.map(({ t, label }) => {
    const s = streakStats((trades || []).filter(tr => allowed(tr, t)))
    return { t, label, ...s }
  }), [trades, levels, allowed])

  const baseline = useMemo(() => streakStats(trades || []), [trades])

  // Channels ranked by win rate among the trades allowed at the selected level.
  const { best, worst, eligible, totalChannels } = useMemo(() => {
    const byCh = new Map()
    for (const tr of (trades || [])) {
      if (!allowed(tr, selected)) continue
      let c = byCh.get(tr.channelId)
      if (!c) { c = { channelId: tr.channelId, channelName: tr.channelName, list: [] }; byCh.set(tr.channelId, c) }
      c.list.push(tr)
    }
    const rows = [...byCh.values()].map(c => {
      const s = streakStats(c.list)
      return { channelId: c.channelId, channelName: c.channelName, ...s, winRate: s.n > 0 ? (s.wins / s.n) * 100 : 0 }
    })
    const ok = rows.filter(r => r.n >= minTrades)
    // Ties: more trades first (a 60% over 40 trades beats 60% over 5).
    const bestRows = [...ok].sort((a, b) => b.winRate - a.winRate || b.n - a.n).slice(0, TOP_N)
    const bestIds = new Set(bestRows.map(r => r.channelId))
    const worstRows = [...ok]
      .filter(r => !bestIds.has(r.channelId))
      .sort((a, b) => a.winRate - b.winRate || b.n - a.n)
      .slice(0, TOP_N)
    return { best: bestRows, worst: worstRows, eligible: ok.length, totalChannels: rows.length }
  }, [trades, allowed, selected, minTrades])

  const pending = loading || trades === null
  const cur = sweep.find(s => s.t === selected) || sweep[0]
  const selectedLabel = cur?.label ?? ''

  if (pending) {
    return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading…</div>
  }
  if (!trades.length) {
    return <div className="flex items-center justify-center h-24 text-gray-500 text-sm">No judged trades match these filters.</div>
  }

  const chip = (label, value, color) => (
    <div key={label} className="px-2.5 py-1.5" style={{ background: 'var(--card-flat)', borderRadius: '10px' }}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold font-mono" style={{ color: color || '#e5e7eb' }}>{value}</div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {chip(`Max drawdown @ ${selectedLabel}`, `${cur.maxStreak} losses in a row`, RED)}
        {cur.maxEnd && chip('Worst streak ended', fmtDate(cur.maxEnd))}
        {chip('Baseline (all trades) max drawdown', `${baseline.maxStreak} losses`, GRAY)}
        {chip(`Allowed trades @ ${selectedLabel}`, `${cur.n} (${cur.wins}W − ${cur.losses}L)`)}
      </div>
      <div className="text-[11px] text-gray-500 -mt-2">
        Drawdown = most consecutive losses, in close order across all channels. Counted in trades, so it holds for any risk:reward or balance. Breakeven trades are skipped.
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-1">Max drawdown (consecutive losses) by {levelName.toLowerCase()} · click a bar to select</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={sweep} margin={{ left: 0, right: 10, top: 18, bottom: 4 }} barCategoryGap="25%">
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" stroke={GRAY} fontSize={11} tickLine={false} interval={levels.length > 12 ? 1 : 0} />
            <YAxis stroke={GRAY} fontSize={11} allowDecimals={false} width={30} />
            <Tooltip content={<SweepTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <ReferenceLine y={baseline.maxStreak} stroke={GRAY} strokeDasharray="4 4"
              label={{ value: `baseline ${baseline.maxStreak}`, position: 'insideTopRight', fill: '#9ca3af', fontSize: 10 }} />
            <Bar dataKey="maxStreak" name="Max losing streak" radius={[4, 4, 0, 0]} maxBarSize={26}
              cursor="pointer" onClick={(_, i) => sweep[i] && onSelect(sweep[i].t)}>
              {sweep.map(d => (
                <Cell key={d.t} fill={d.t === selected ? CYAN : RED} fillOpacity={d.t === selected ? 1 : 0.6} />
              ))}
              <LabelList dataKey="maxStreak" position="top" fill="#d1d5db" fontSize={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <div className="text-[11px] text-gray-400">
            Channel ranking @ <span className="font-mono text-gray-200">{selectedLabel}</span> · by win rate of allowed trades
            · {eligible} of {totalChannels} channel(s) qualify
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            Min trades
            <input
              type="number" min={1} max={500} value={minTrades}
              onChange={e => setMinTrades(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 font-mono text-xs text-gray-200"
              style={{ background: 'var(--card-flat)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}
              aria-label="Minimum trades for a channel to be ranked"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <RankTable title={`Best ${TOP_N}`} rows={best} color={GREEN} colorFor={colorFor} />
          <RankTable title={`Worst ${TOP_N}`} rows={worst} color={RED} colorFor={colorFor} />
        </div>
      </div>
    </div>
  )
}
