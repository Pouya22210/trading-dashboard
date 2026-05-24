import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, AlertTriangle, Trophy
} from 'lucide-react'
import { fetchChannelPerformance } from '../lib/queries'
import { subscribeToTrades } from '../lib/supabase'

const TIME_RANGES = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
]

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

function ChannelRankCard({ rank, channel, pnl, winRate, trades, wins, losses, isTop, onClick }) {
  const isProfit = pnl >= 0
  const pnlColor = isProfit ? 'var(--accent-green)' : 'var(--red)'
  const barColor = isTop ? 'var(--accent-green)' : 'var(--red)'
  const rankColor = (isTop && rank === 1) ? 'var(--accent-warm)' : 'var(--text-secondary)'
  const clampedWinRate = Math.max(0, Math.min(100, winRate || 0))

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      className="transition-all flex items-center gap-2.5 sm:gap-3.5 p-2.5 sm:p-[14px_16px]"
      style={{
        background: 'var(--card-flat)',
        borderRadius: '20px',
        boxShadow: 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.boxShadow = 'var(--neu-raised-sm)' } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.boxShadow = 'none' } : undefined}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center font-bold w-7 h-7 sm:w-9 sm:h-9 text-[12px] sm:text-[14px]"
        style={{
          borderRadius: '12px',
          background: 'var(--neu-bg)',
          boxShadow: 'var(--neu-pressed-sm)',
          color: rankColor,
          fontFamily: 'inherit',
        }}
      >
        {rank}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="truncate font-semibold text-[12px] sm:text-[14px]"
          style={{
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
          title={channel}
        >
          {channel}
        </p>
        <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
          <span
            className="text-[9px] sm:text-[11px]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {trades} trades • {winRate.toFixed(1)}%
          </span>
          <span
            className="font-bold whitespace-nowrap text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5"
            style={{
              borderRadius: '8px',
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-pressed-sm)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ color: 'var(--accent-green)' }}>{wins}</span>
            <span style={{ color: 'var(--text-tertiary)' }}> / </span>
            <span style={{ color: 'var(--red)' }}>{losses}</span>
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 text-right min-w-[72px] sm:min-w-[88px]">
        <div
          className="font-extrabold text-[14px] sm:text-[17px]"
          style={{
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
          className="ml-auto w-[60px] sm:w-[72px] h-[3px] mt-2 overflow-hidden relative"
          style={{
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.05)',
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
  const navigate = useNavigate()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [leaderboardTimeRange, setLeaderboardTimeRange] = useState('1w')
  const [mobileSection, setMobileSection] = useState('gainers')

  const goToChannel = useCallback((channelId) => {
    navigate(`/trades?channel=${encodeURIComponent(channelId)}`)
  }, [navigate])

  // Real-time trade events trigger a debounced refetch. We don't patch the
  // aggregate in JS — we just invalidate and let Postgres recompute. This is
  // cheaper than maintaining duplicate aggregation logic on the client.
  const refetchTimerRef = useRef(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => loadChannels(leaderboardTimeRange), 1500)
  }, [leaderboardTimeRange])

  async function loadChannels(timeRange) {
    try {
      const data = await fetchChannelPerformance(timeRange)
      setChannels(data)
    } catch (err) {
      console.error('Failed to load channel performance:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChannels(leaderboardTimeRange)
  }, [leaderboardTimeRange])

  useEffect(() => {
    const subscription = subscribeToTrades({
      onInsert: scheduleRefetch,
      onUpdate: scheduleRefetch,
      onDelete: scheduleRefetch,
    })
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      subscription.unsubscribe()
    }
  }, [scheduleRefetch])

  // Derive leaderboards from the server-side aggregate. These are O(n_channels),
  // not O(n_trades) — for any reasonable channel count it's free.
  const { top5, bottom5, hot5 } = useMemo(() => {
    const byScore = [...channels].sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
    const byActivity = [...channels].sort((a, b) => b.trades - a.trades)
    return {
      top5:    byScore.slice(0, 5),
      bottom5: byScore.slice(-5).reverse(),
      hot5:    byActivity.slice(0, 5),
    }
  }, [channels])

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
      <div className="flex justify-end mb-4">
        <TimeRangeSelector
          value={leaderboardTimeRange}
          onChange={setLeaderboardTimeRange}
        />
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className={mobileSection === 'gainers' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(Trophy, 'var(--accent-warm)', 'Top 5')}
          </div>
          <div className="space-y-3">
            {top5.map((channel, idx) => (
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
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {top5.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>

        <div className={mobileSection === 'losers' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(AlertTriangle, 'var(--red)', 'Bottom 5')}
          </div>
          <div className="space-y-3">
            {bottom5.map((channel, idx) => (
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
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {bottom5.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>

        <div className={mobileSection === 'hot' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(Zap, 'var(--accent-warm)', 'Hot Channels')}
          </div>
          <div className="space-y-3">
            {hot5.map((channel, idx) => (
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
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {hot5.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>
      </div>

      <div className="pb-8" />
    </div>
  )
}
