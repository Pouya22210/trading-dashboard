import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Zap, AlertTriangle, Trophy
} from 'lucide-react'
import { fetchTrades, subscribeToTrades } from '../lib/supabase'
import ActivityLogPanel from '../components/ActivityLogPanel'

// Color palette
const COLORS = {
  green: '#ADFF2F',
  red: '#f85149',
  blue: '#58a6ff',
  cyan: '#39d5ff',
  purple: '#a371f7',
  orange: '#f0883e',
  pink: '#db61a2',
  yellow: '#d29922',
  gray: '#6e7681',
}

// Time range options
const TIME_RANGES = [
  { key: '1d', label: '1D', days: 1 },
  { key: '1w', label: '1W', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
]

// Reusable Components
function TimeRangeSelector({ value, onChange, className = '' }) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        background: 'var(--neu-bg)',
        boxShadow: 'var(--neu-pressed-sm)',
        borderRadius: '999px',
        padding: '4px',
        gap: '2px',
      }}
    >
      {TIME_RANGES.map(option => {
        const isActive = value === option.key
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: isActive ? 'var(--accent-green)' : 'transparent',
              color: isActive ? '#0d1117' : 'var(--text-secondary)',
              boxShadow: isActive
                ? '0 0 12px rgba(173,255,47,0.45), 0 2px 6px rgba(0,0,0,0.35)'
                : 'none',
              transition: 'background 0.15s, color 0.15s, box-shadow 0.18s',
              fontFamily: 'inherit',
              letterSpacing: '0.02em',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ChartCard({ title, icon: Icon, children, headerRight, className = '' }) {
  return (
    <div className={`chart-card ${className}`}>
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{
          background: 'var(--neu-bg)',
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.35), inset 0 -2px 0 rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2"
            style={{
              borderRadius: '10px',
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-pressed-sm)',
            }}
          >
            <Icon className="w-4 h-4 text-accent-cyan" />
          </div>
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
        </div>
        {headerRight}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ChannelRankCard({ rank, channel, pnl, winRate, trades, wins, losses, isTop }) {
  const isProfit = pnl >= 0
  const pnlColor = isProfit ? 'var(--accent-green)' : 'var(--red)'
  const barColor = isTop ? 'var(--accent-green)' : 'var(--red)'
  // Highlight rank #1 in top  with a warm/yellow tone, otherwise neutral.
  const rankColor = (isTop && rank === 1) ? '#FFC857' : 'var(--text-secondary)'
  const clampedWinRate = Math.max(0, Math.min(100, winRate || 0))

  return (
    <div
      className="transition-all"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        background: 'var(--neu-bg)',
        borderRadius: '20px',
        boxShadow: 'var(--neu-raised-sm)',
      }}
    >
      {/* Rank pill */}
      <div
        style={{
          flexShrink: 0,
          width: '36px',
          height: '36px',
          borderRadius: '12px',
          background: 'var(--neu-bg)',
          boxShadow: 'var(--neu-pressed-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: rankColor,
          fontWeight: 700,
          fontSize: '14px',
          fontFamily: 'inherit',
        }}
      >
        {rank}
      </div>

      {/* Channel info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="truncate"
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
          title={channel}
        >
          {channel}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '4px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {trades} trades • {winRate.toFixed(1)}%
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '8px',
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-pressed-sm)',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'var(--accent-green)' }}>{wins}</span>
            <span style={{ color: 'var(--text-tertiary)' }}> / </span>
            <span style={{ color: 'var(--red)' }}>{losses}</span>
          </span>
        </div>
      </div>

      {/* P&L + Winrate bar */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '88px' }}>
        <div
          style={{
            fontSize: '17px',
            fontWeight: 800,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: pnlColor,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          {isProfit ? '+' : '−'}${Math.abs(pnl).toFixed(2)}
        </div>
        <div
          aria-hidden
          style={{
            marginTop: '8px',
            marginLeft: 'auto',
            width: '72px',
            height: '3px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.05)',
            overflow: 'hidden',
            position: 'relative',
          }}
          title={`Win rate ${winRate.toFixed(1)}%`}
        >
          <div
            style={{
              width: `${clampedWinRate}%`,
              height: '100%',
              background: barColor,
              boxShadow: `0 0 6px ${barColor}`,
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  
  // State for filters
  const [leaderboardTimeRange, setLeaderboardTimeRange] = useState('1w')

  useEffect(() => {
    loadTrades()
    
    const subscription = subscribeToTrades(() => {
      loadTrades()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadTrades() {
    try {
      const data = await fetchTrades({ limit: 50000 })
      setTrades(data)
    } catch (err) {
      console.error('Failed to load trades:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter trades by time range
  const filterByTimeRange = useCallback((tradesArray, timeRange) => {
    const range = TIME_RANGES.find(r => r.key === timeRange)
    if (!range || !range.days) return tradesArray
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - range.days)
    
    return tradesArray.filter(t => {
      const tradeDate = new Date(t.signal_time || t.close_time)
      return tradeDate >= cutoffDate
    })
  }, [])

  // Channel performance data for leaderboard
  const channelPerformance = useMemo(() => {
    const filteredTrades = filterByTimeRange(trades, leaderboardTimeRange)
    const channelStats = {}
    
    filteredTrades.filter(t => t.status === 'closed').forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const channelName = trade.channel_name || 'Unknown'
      
      if (!channelStats[channelId]) {
        channelStats[channelId] = {
          channelId,
          channelName,
          pnl: 0,
          wins: 0,
          losses: 0,
          trades: 0,
        }
      }
      
      channelStats[channelId].pnl += trade.profit_loss || 0
      channelStats[channelId].trades++
      if (trade.outcome === 'profit') channelStats[channelId].wins++
      if (trade.outcome === 'loss') channelStats[channelId].losses++
    })
    
    // Calculate win rates
    Object.values(channelStats).forEach(ch => {
      const totalWL = ch.wins + ch.losses
      ch.winRate = totalWL > 0 ? (ch.wins / totalWL) * 100 : 0
    })
    
    // Sort by wins - losses
    const sorted = Object.values(channelStats).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
    
    return {
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse(),
      all: sorted
    }
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  // Hot channels (last 24h activity)
  const hotChannels = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 1)
    
    const recentTrades = trades.filter(t => new Date(t.signal_time) >= cutoff)
    const channelActivity = {}
    
    recentTrades.forEach(trade => {
      const name = trade.channel_name || 'Unknown'
      if (!channelActivity[name]) {
        channelActivity[name] = { name, signals: 0, wins: 0, losses: 0, pnl: 0 }
      }
      channelActivity[name].signals++
      if (trade.outcome === 'profit') channelActivity[name].wins++
      if (trade.outcome === 'loss') channelActivity[name].losses++
      channelActivity[name].pnl += trade.profit_loss || 0
    })
    
    return Object.values(channelActivity)
      .sort((a, b) => b.signals - a.signals)
      .slice(0, 5)
  }, [trades])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        Loading dashboard...
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Main layout: Content + Activity Log */}
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Left side: Main dashboard content */}
        <div className="flex-1 min-w-0">
          {/* Top/Bottom Channels Leaderboard */}
          <div className="mb-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 5 */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    rowGap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'var(--neu-bg)',
                        boxShadow: 'var(--neu-raised-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Trophy style={{ width: '16px', height: '16px', color: '#FFC857' }} />
                    </div>
                    <h3
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Top 5
                    </h3>
                  </div>
                  <TimeRangeSelector
                    value={leaderboardTimeRange}
                    onChange={setLeaderboardTimeRange}
                  />
                </div>
                <div className="space-y-3">
                  {channelPerformance.top5.map((channel, idx) => (
                    <ChannelRankCard
                      key={channel.channelId}
                      rank={idx + 1}
                      channel={channel.channelName}
                      pnl={channel.pnl}
                      winRate={channel.winRate}
                      trades={channel.trades}
                      wins={channel.wins}
                      losses={channel.losses}
                      isTop={true}
                    />
                  ))}
                  {channelPerformance.top5.length === 0 && (
                    <div className="text-center text-gray-500 py-8">No data for selected period</div>
                  )}
                </div>
              </div>

              {/* Bottom 5 */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: 'var(--neu-bg)',
                      boxShadow: 'var(--neu-raised-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertTriangle style={{ width: '16px', height: '16px', color: 'var(--red)' }} />
                  </div>
                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Bottom 5
                  </h3>
                </div>
                <div className="space-y-3">
                  {channelPerformance.bottom5.map((channel, idx) => (
                    <ChannelRankCard
                      key={channel.channelId}
                      rank={idx + 1}
                      channel={channel.channelName}
                      pnl={channel.pnl}
                      winRate={channel.winRate}
                      trades={channel.trades}
                      wins={channel.wins}
                      losses={channel.losses}
                      isTop={false}
                    />
                  ))}
                  {channelPerformance.bottom5.length === 0 && (
                    <div className="text-center text-gray-500 py-8">No data for selected period</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Hot Channels - 24h Activity */}
          {hotChannels.length > 0 && (
            <div className="mb-8">
              <ChartCard 
                title="Hot Channels (Last 24h)"
                icon={Zap}
                headerRight={
                  <span className="text-xs text-gray-500">
                    Most active channels
                  </span>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {hotChannels.map((channel, idx) => (
                    <div
                      key={channel.name}
                      className="p-4"
                      style={{
                        background: 'var(--neu-bg)',
                        borderRadius: '18px',
                        boxShadow: 'var(--neu-raised-sm)',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className={`w-4 h-4 ${idx === 0 ? 'text-yellow-400' : 'text-gray-500'}`} />
                        <span className="text-sm font-medium text-white truncate" title={channel.name}>
                          {channel.name.length > 15 ? channel.name.slice(0, 15) + '...' : channel.name}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Signals</span>
                          <span className="text-white font-mono">{channel.signals}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">W/L</span>
                          <span className="font-mono">
                            <span className="text-green-400">{channel.wins}</span>
                            <span className="text-gray-600">/</span>
                            <span className="text-red-400">{channel.losses}</span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">P&L</span>
                          <span className={`font-mono font-semibold ${channel.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {channel.pnl >= 0 ? '+' : ''}${channel.pnl.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          )}

          {/* Channel Performance Summary Table */}
          {/* Bottom spacing */}
          <div className="pb-8" />
        </div>

        {/* Right side: Activity Log Panel */}
        <div className="xl:w-[380px] flex-shrink-0">
          <div className="xl:sticky xl:top-24">
            <ActivityLogPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
