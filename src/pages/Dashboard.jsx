import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Zap, AlertTriangle, Trophy
} from 'lucide-react'
import { fetchTrades, subscribeToTrades } from '../lib/supabase'

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
        background: 'var(--card-recess)',
        boxShadow: 'none',
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
        background: 'var(--card-flat)',
        borderRadius: '20px',
        boxShadow: 'none',
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
  // Mobile/tablet section selector: shows one of the three lists at a time
  const [mobileSection, setMobileSection] = useState('gainers')

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

  // Hot channels — most active in the selected time range
  const hotChannels = useMemo(() => {
    const filteredTrades = filterByTimeRange(trades, leaderboardTimeRange)
    const channelActivity = {}

    filteredTrades.forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const channelName = trade.channel_name || 'Unknown'
      if (!channelActivity[channelId]) {
        channelActivity[channelId] = {
          channelId,
          channelName,
          trades: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
        }
      }
      channelActivity[channelId].trades++
      if (trade.outcome === 'profit') channelActivity[channelId].wins++
      if (trade.outcome === 'loss') channelActivity[channelId].losses++
      channelActivity[channelId].pnl += trade.profit_loss || 0
    })

    Object.values(channelActivity).forEach(ch => {
      const totalWL = ch.wins + ch.losses
      ch.winRate = totalWL > 0 ? (ch.wins / totalWL) * 100 : 0
    })

    return Object.values(channelActivity)
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 5)
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        Loading dashboard...
      </div>
    )
  }

  const sectionHeader = (Icon, iconColor, title) => (
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
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: '16px', height: '16px', color: iconColor }} />
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
        {title}
      </h3>
    </div>
  )

  const mobileTabs = [
    { key: 'gainers', label: 'Gainers', icon: Trophy },
    { key: 'losers',  label: 'Losers',  icon: AlertTriangle },
    { key: 'hot',     label: 'Hot',     icon: Zap },
  ]

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Shared time range selector */}
      <div className="flex justify-end mb-4">
        <TimeRangeSelector
          value={leaderboardTimeRange}
          onChange={setLeaderboardTimeRange}
        />
      </div>

      {/* Mobile / tablet section selector (hidden on lg+) */}
      <div
        className="lg:hidden flex items-center gap-1.5 mb-4 p-1.5"
        style={{
          background: 'var(--neu-bg)',
          borderRadius: '14px',
          boxShadow: 'var(--neu-pressed-sm)',
        }}
      >
        {mobileTabs.map(tab => {
          const Icon = tab.icon
          const isActive = mobileSection === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setMobileSection(tab.key)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-all"
              style={{
                borderRadius: '10px',
                background: isActive ? 'var(--neu-bg)' : 'transparent',
                boxShadow: isActive ? 'var(--neu-raised-sm)' : 'none',
                color: isActive ? '#ADFF2F' : '#9ca3af',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Top 5 / Bottom 5 / Hot Channels — one row on PC, tab-switched on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Top 5 / Gainers */}
        <div className={mobileSection === 'gainers' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(Trophy, '#FFC857', 'Top 5')}
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

        {/* Bottom 5 / Losers */}
        <div className={mobileSection === 'losers' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(AlertTriangle, 'var(--red)', 'Bottom 5')}
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

        {/* Hot Channels */}
        <div className={mobileSection === 'hot' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(Zap, '#FFC857', 'Hot Channels')}
          </div>
          <div className="space-y-3">
            {hotChannels.map((channel, idx) => (
              <ChannelRankCard
                key={channel.channelId}
                rank={idx + 1}
                channel={channel.channelName}
                pnl={channel.pnl}
                winRate={channel.winRate}
                trades={channel.trades}
                wins={channel.wins}
                losses={channel.losses}
                isTop={channel.pnl >= 0}
              />
            ))}
            {hotChannels.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>
      </div>

      <div className="pb-8" />
    </div>
  )
}
