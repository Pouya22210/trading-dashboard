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

function formatCompact(n) {
  if (n >= 1000) {
    const v = n / 1000
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`
  }
  return n.toLocaleString()
}

function HeroSection({ channels }) {
  const navigate = useNavigate()

  const stats = useMemo(() => {
    let trades = 0
    for (const c of channels) trades += c.trades || 0
    return { count: channels.length, trades }
  }, [channels])

  const scrollToLeaderboard = () => {
    document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const statBoxes = [
    { value: stats.count.toLocaleString(), label: 'Providers tracked' },
    { value: formatCompact(stats.trades),  label: 'Trades verified' },
    { value: '24/7',                       label: 'Live updates' },
  ]

  return (
    <div
      className="relative overflow-hidden mb-6"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '28px',
        boxShadow: 'var(--neu-raised-lg)',
      }}
    >
      {/* Drifting glow orbs */}
      <div
        aria-hidden
        className="hero-orb absolute pointer-events-none"
        style={{
          width: '300px', height: '300px',
          right: '6%', top: '-40%',
          background: 'radial-gradient(circle, rgba(173,255,47,0.13) 0%, transparent 70%)',
          filter: 'blur(12px)',
        }}
      />
      <div
        aria-hidden
        className="hero-orb absolute pointer-events-none"
        style={{
          width: '260px', height: '260px',
          left: '38%', bottom: '-50%',
          background: 'radial-gradient(circle, rgba(197,137,242,0.10) 0%, transparent 70%)',
          filter: 'blur(12px)',
          animationDelay: '-8s',
        }}
      />

      {/* Animated market SVG */}
      <svg
        aria-hidden
        className="absolute inset-y-0 right-0 h-full w-full pointer-events-none opacity-50 lg:opacity-100 lg:w-[58%]"
        viewBox="0 0 640 260"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ADFF2F" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#ADFF2F" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="heroFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="35%" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="heroMask">
            <rect width="640" height="260" fill="url(#heroFade)" />
          </mask>
        </defs>

        <g mask="url(#heroMask)">
          {/* Faint grid */}
          {[52, 104, 156, 208].map(y => (
            <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="rgba(232,234,239,0.045)" strokeWidth="1" />
          ))}

          {/* Area under the main line */}
          <path
            d="M0,196 C50,186 80,150 120,148 C160,146 180,176 220,168 C260,160 280,104 320,100 C360,96 380,140 420,132 C460,124 490,70 530,66 C570,62 610,84 640,78 L640,260 L0,260 Z"
            fill="url(#heroArea)"
          />

          {/* Secondary (warm) line, flowing in reverse */}
          <path
            className="hero-line-2"
            d="M0,150 C60,158 100,120 150,126 C200,132 240,160 290,150 C340,140 370,110 420,116 C470,122 520,96 570,100 C610,103 630,92 640,94"
            fill="none"
            stroke="#FFC857"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.45"
          />

          {/* Main flowing line */}
          <path
            className="hero-line"
            d="M0,196 C50,186 80,150 120,148 C160,146 180,176 220,168 C260,160 280,104 320,100 C360,96 380,140 420,132 C460,124 490,70 530,66 C570,62 610,84 640,78"
            fill="none"
            stroke="#ADFF2F"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(173,255,47,0.55))' }}
          />

          {/* Pulsing nodes on the line */}
          {[[120, 148, '0s'], [220, 168, '-1.1s'], [320, 100, '-2.2s'], [420, 132, '-0.6s'], [530, 66, '-1.7s']].map(([cx, cy, delay]) => (
            <circle
              key={`${cx}-${cy}`}
              className="hero-node"
              cx={cx} cy={cy} r="4"
              fill="#ADFF2F"
              style={{ animationDelay: delay, filter: 'drop-shadow(0 0 5px rgba(173,255,47,0.8))' }}
            />
          ))}

          {/* Floating candlesticks */}
          <g className="hero-candle" opacity="0.55">
            <line x1="470" y1="160" x2="470" y2="200" stroke="#ADFF2F" strokeWidth="1.5" />
            <rect x="464" y="168" width="12" height="22" rx="2" fill="#ADFF2F" opacity="0.8" />
          </g>
          <g className="hero-candle" opacity="0.45" style={{ animationDelay: '-2s' }}>
            <line x1="560" y1="150" x2="560" y2="196" stroke="#FF5C5C" strokeWidth="1.5" />
            <rect x="554" y="158" width="12" height="26" rx="2" fill="#FF5C5C" opacity="0.8" />
          </g>
          <g className="hero-candle" opacity="0.5" style={{ animationDelay: '-4s' }}>
            <line x1="612" y1="140" x2="612" y2="184" stroke="#ADFF2F" strokeWidth="1.5" />
            <rect x="606" y="148" width="12" height="24" rx="2" fill="#ADFF2F" opacity="0.8" />
          </g>
        </g>
      </svg>

      {/* Content */}
      <div className="relative p-6 sm:p-10" style={{ zIndex: 1, maxWidth: '640px' }}>
        {/* Eyebrow pill */}
        <div
          className="inline-flex items-center gap-2 mb-5"
          style={{
            padding: '7px 14px',
            borderRadius: '999px',
            background: 'var(--card-recess)',
          }}
        >
          <span
            className="hero-blink"
            style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: 'var(--accent-green)',
              boxShadow: '0 0 8px rgba(173,255,47,0.8)',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            Live signal tracking
          </span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(28px, 4.5vw, 42px)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1.12,
          }}
        >
          Who's actually
          <br />
          <span style={{ color: 'var(--accent-green)' }}>winning</span> in forex?
        </h1>

        <p
          className="mt-4"
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            maxWidth: '460px',
          }}
        >
          Every signal provider, ranked by real verified trade results.
          No hype — just P&L, win rates, and streaks, updated live.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            onClick={scrollToLeaderboard}
            className="transition-all"
            style={{
              padding: '13px 26px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent-green)',
              color: '#0d1117',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              boxShadow: '0 0 18px rgba(173,255,47,0.35), 0 4px 12px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 28px rgba(173,255,47,0.55), 0 4px 12px rgba(0,0,0,0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 18px rgba(173,255,47,0.35), 0 4px 12px rgba(0,0,0,0.4)' }}
          >
            View Leaderboard
          </button>
          <button
            onClick={() => navigate('/trades')}
            className="transition-all"
            style={{
              padding: '13px 26px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: 'var(--card-flat)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
              boxShadow: 'var(--neu-raised-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--neu-raised-md)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--neu-raised-sm)' }}
          >
            How it works
          </button>
        </div>

        {/* Stat boxes */}
        <div className="flex flex-wrap gap-3 mt-7">
          {statBoxes.map(box => (
            <div
              key={box.label}
              className="text-center"
              style={{
                padding: '16px 22px',
                borderRadius: '18px',
                background: 'var(--card-recess)',
                minWidth: '118px',
              }}
            >
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                {box.value}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  lineHeight: 1.35,
                }}
              >
                {box.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChannelRankCard({ rank, channel, pnl, pnlPercent, winRate, trades, wins, losses, isTop, onClick }) {
  const isProfit = pnl >= 0
  const pnlColor = isProfit ? 'var(--accent-green)' : 'var(--red)'
  const barColor = isTop ? 'var(--accent-green)' : 'var(--red)'
  const rankColor = (isTop && rank === 1) ? 'var(--accent-warm)' : 'var(--text-secondary)'
  const clampedWinRate = Math.max(0, Math.min(100, winRate || 0))
  const pctValue = Number.isFinite(pnlPercent) ? pnlPercent : 0
  const pctSign = pctValue >= 0 ? '+' : '−'

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

      <div className="flex-shrink-0 text-right min-w-[80px] sm:min-w-[96px]">
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
          className="font-semibold text-[10px] sm:text-[12px] mt-0.5"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: pnlColor,
            opacity: 0.85,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
          title="Risk-based return: per-trade R-multiple × channel risk %"
        >
          {pctSign}{Math.abs(pctValue).toFixed(2)}%
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
  const [showScrollHint, setShowScrollHint] = useState(false)

  const goToChannel = useCallback((channelId) => {
    navigate(`/trades?channel=${encodeURIComponent(channelId)}`)
  }, [navigate])

  // Real-time trade events trigger a debounced refetch. We don't patch the
  // aggregate in JS — we just invalidate and let Postgres recompute.
  // Stable identity for the subscription: read the live time-range through a
  // ref so the subscription useEffect can run exactly once on mount.
  const refetchTimerRef     = useRef(null)
  const timeRangeRef        = useRef(leaderboardTimeRange)
  timeRangeRef.current      = leaderboardTimeRange

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

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => loadChannels(timeRangeRef.current), 1500)
  }, [])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show a bottom shadow whenever the page has more content below the fold.
  useEffect(() => {
    const update = () => {
      const doc = document.documentElement
      const hasOverflow = doc.scrollHeight - window.innerHeight > 4
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 20
      setShowScrollHint(hasOverflow && !atBottom)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [channels, loading, mobileSection])

  // Derive leaderboards from the server-side aggregate. These are O(n_channels),
  // not O(n_trades) — for any reasonable channel count it's free.
  const { top, bottom, hot } = useMemo(() => {
    const byScore = [...channels].sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
    const byActivity = [...channels].sort((a, b) => b.trades - a.trades)
    return {
      top:    byScore.slice(0, 10),
      bottom: byScore.slice(-10).reverse(),
      hot:    byActivity.slice(0, 10),
    }
  }, [channels])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        Loading home...
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
      <HeroSection channels={channels} />

      <div id="leaderboard" className="flex justify-end mb-4" style={{ scrollMarginTop: '84px' }}>
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
            {sectionHeader(Trophy, 'var(--accent-warm)', 'Top 10')}
          </div>
          <div className="space-y-3">
            {top.map((channel, idx) => (
              <ChannelRankCard
                key={channel.channelId}
                rank={idx + 1}
                channel={channel.channelName}
                pnl={channel.pnl}
                pnlPercent={channel.pnlPercent}
                winRate={channel.winRate}
                trades={channel.trades}
                wins={channel.wins}
                losses={channel.losses}
                isTop={true}
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {top.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>

        <div className={mobileSection === 'losers' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(AlertTriangle, 'var(--red)', 'Bottom 10')}
          </div>
          <div className="space-y-3">
            {bottom.map((channel, idx) => (
              <ChannelRankCard
                key={channel.channelId}
                rank={idx + 1}
                channel={channel.channelName}
                pnl={channel.pnl}
                pnlPercent={channel.pnlPercent}
                winRate={channel.winRate}
                trades={channel.trades}
                wins={channel.wins}
                losses={channel.losses}
                isTop={false}
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {bottom.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>

        <div className={mobileSection === 'hot' ? 'block' : 'hidden lg:block'}>
          <div className="hidden lg:block">
            {sectionHeader(Zap, 'var(--accent-warm)', 'Hot Channels')}
          </div>
          <div className="space-y-3">
            {hot.map((channel, idx) => (
              <ChannelRankCard
                key={channel.channelId}
                rank={idx + 1}
                channel={channel.channelName}
                pnl={channel.pnl}
                pnlPercent={channel.pnlPercent}
                winRate={channel.winRate}
                trades={channel.trades}
                wins={channel.wins}
                losses={channel.losses}
                isTop={channel.pnl >= 0}
                onClick={() => goToChannel(channel.channelId)}
              />
            ))}
            {hot.length === 0 && (
              <div className="text-center text-gray-500 py-8">No data for selected period</div>
            )}
          </div>
        </div>
      </div>

      <div className="pb-8" />

      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: '56px',
          pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 100%)',
          opacity: showScrollHint ? 1 : 0,
          transition: 'opacity 0.25s ease',
          zIndex: 40,
        }}
      />
    </div>
  )
}
