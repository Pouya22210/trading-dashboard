import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  TrendingUp, TrendingDown, Crown, Skull,
  BarChart3, Zap, Star, AlertTriangle, Trophy, Medal
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
    <div className={`tab-nav ${className}`} style={{ padding: '4px', gap: '2px', flexWrap: 'wrap' }}>
      {TIME_RANGES.map(option => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`tab-btn ${value === option.key ? 'active' : ''}`}
          style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '9px' }}
        >
          {option.label}
        </button>
      ))}
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

function ChannelRankCard({ rank, channel, pnl, winRate, trades, wins, losses, trend, isTop }) {
  const getRankIcon = (rank, isTop) => {
    if (isTop) {
      if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />
      if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />
      if (rank === 3) return <Medal className="w-5 h-5 text-orange-400" />
      return <Star className="w-4 h-4 text-gray-500" />
    } else {
      return <Skull className="w-4 h-4 text-red-400" />
    }
  }

  return (
    <div
      className="flex items-center gap-4 p-4 transition-all"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '18px',
        boxShadow: 'var(--neu-raised-sm)',
      }}
    >
      {/* Rank */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '12px',
          background: 'var(--neu-bg)',
          boxShadow: isTop ? 'var(--neu-pressed-sm)' : 'var(--neu-pressed-sm)',
        }}
      >
        {getRankIcon(rank, isTop)}
      </div>
      
      {/* Channel name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate" title={channel}>
          {channel}
        </p>
        <p className="text-xs text-gray-500">
          {trades} trades • {winRate.toFixed(1)}% <span className="font-mono">(<span className="text-green-400">{wins}</span>/<span className="text-red-400">{losses}</span>)</span>
        </p>
      </div>
      
      {/* P&L */}
      <div className="text-right">
        <div className={`text-lg font-bold font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
        </div>
        {trend && (
          <div className="flex items-center justify-end gap-1 text-xs text-gray-500">
            {trend > 0 ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
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
            <div className="flex items-center justify-end mb-6">
              <TimeRangeSelector
                value={leaderboardTimeRange}
                onChange={setLeaderboardTimeRange}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 5 */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-white">Top 5 Performers</h3>
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
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-white">Bottom 5 Performers</h3>
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
                  <span
                    className="text-xs text-gray-500 px-3 py-1"
                    style={{
                      background: 'var(--neu-bg)',
                      borderRadius: '9999px',
                      boxShadow: 'var(--neu-pressed-sm)',
                    }}
                  >
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
