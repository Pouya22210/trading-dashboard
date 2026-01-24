import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  TrendingUp, TrendingDown, Crown, Skull,
  BarChart3, Zap, Star, AlertTriangle, Trophy, Medal
} from 'lucide-react'
import { fetchTrades, subscribeToTrades } from '../lib/supabase'

// Color palette
const COLORS = {
  green: '#3fb950',
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
    <div className={`flex bg-dark-tertiary rounded-lg p-1 ${className}`}>
      {TIME_RANGES.map(option => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === option.key
              ? 'bg-accent-cyan text-dark-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ChartCard({ title, icon: Icon, children, headerRight, className = '' }) {
  return (
    <div className={`chart-card backdrop-blur-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-dark-tertiary/80 to-dark-secondary/60 border-b border-dark-border/50">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-accent-cyan/10">
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

function ChannelRankCard({ rank, channel, pnl, winRate, trades, wins, losses, trend, isTop, isOrphaned }) {
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
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.02] ${
      isTop 
        ? 'bg-gradient-to-r from-green-500/5 to-transparent border-green-500/20 hover:border-green-500/40'
        : 'bg-gradient-to-r from-red-500/5 to-transparent border-red-500/20 hover:border-red-500/40'
    }`}>
      {/* Rank */}
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-dark-tertiary">
        {getRankIcon(rank, isTop)}
      </div>
      
      {/* Channel Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-white font-semibold truncate ${isOrphaned ? 'italic' : ''}`} title={channel}>
            {channel.length > 30 ? channel.slice(0, 30) + '...' : channel}
          </span>
          {isOrphaned && <span className="text-xs text-red-400">🗑️</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{trades} trades</span>
          <span>•</span>
          <span className={winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
            {winRate.toFixed(1)}% win
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span className="text-green-400">{wins}</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400">{losses}</span>
          </span>
        </div>
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
      const data = await fetchTrades()
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
      const channelName = trade.display_channel_name || trade.channel_name || 'Unknown'
      const isOrphaned = trade.is_orphaned_channel || false
      
      if (!channelStats[channelId]) {
        channelStats[channelId] = {
          channelId,
          channelName,
          isOrphaned,
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
      ch.winRate = totalWL > 0 ? (ch.wins / totalWL * 100) : 0
    })
    
    const sorted = Object.values(channelStats).sort((a, b) => b.pnl - a.pnl)
    
    return {
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse(),
      all: sorted
    }
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  // Recent hot channels (most active in last 24h with good performance)
  const hotChannels = useMemo(() => {
    const last24h = new Date()
    last24h.setHours(last24h.getHours() - 24)
    
    const recentTrades = trades.filter(t => {
      const tradeDate = new Date(t.signal_time || t.close_time)
      return tradeDate >= last24h
    })
    
    const channelActivity = {}
    
    recentTrades.forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const channelName = trade.display_channel_name || trade.channel_name || 'Unknown'
      const isOrphaned = trade.is_orphaned_channel || false
      
      if (!channelActivity[channelId]) {
        channelActivity[channelId] = {
          channelId,
          name: channelName,
          isOrphaned,
          signals: 0,
          wins: 0,
          losses: 0,
          pnl: 0
        }
      }
      
      channelActivity[channelId].signals++
      if (trade.status === 'closed') {
        channelActivity[channelId].pnl += trade.profit_loss || 0
        if (trade.outcome === 'profit') channelActivity[channelId].wins++
        if (trade.outcome === 'loss') channelActivity[channelId].losses++
      }
    })
    
    return Object.values(channelActivity)
      .filter(ch => ch.signals >= 2)
      .sort((a, b) => b.signals - a.signals)
      .slice(0, 5)
  }, [trades])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  isOrphaned={channel.isOrphaned}
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
                  isOrphaned={channel.isOrphaned}
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
              <span className="text-xs text-gray-500 bg-dark-tertiary/50 px-3 py-1 rounded-full">
                Most active channels
              </span>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {hotChannels.map((channel, idx) => (
                <div 
                  key={channel.channelId}
                  className="bg-gradient-to-br from-dark-tertiary/70 to-dark-secondary/50 rounded-xl p-4 border border-dark-border/30"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className={`w-4 h-4 ${idx === 0 ? 'text-yellow-400' : 'text-gray-500'}`} />
                    <span className={`text-sm font-medium text-white truncate ${channel.isOrphaned ? 'italic' : ''}`} title={channel.name}>
                      {channel.name.length > 15 ? channel.name.slice(0, 15) + '...' : channel.name}
                    </span>
                    {channel.isOrphaned && <span className="text-xs text-red-400">🗑️</span>}
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
      <ChartCard title="All Channels Performance Summary" icon={BarChart3}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-dark-border">
                <th className="pb-3 pr-4">Rank</th>
                <th className="pb-3 pr-4">Channel</th>
                <th className="pb-3 pr-4 text-right">P&L</th>
                <th className="pb-3 pr-4 text-right">Win Rate</th>
                <th className="pb-3 pr-4 text-right">Trades</th>
                <th className="pb-3 pr-4 text-right">Wins</th>
                <th className="pb-3 text-right">Losses</th>
              </tr>
            </thead>
            <tbody>
              {channelPerformance.all.slice(0, 15).map((channel, idx) => (
                <tr 
                  key={channel.channelId}
                  className="border-b border-dark-border/30 hover:bg-dark-tertiary/30 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                      idx < 3 ? 'bg-green-500/20 text-green-400' : 
                      idx >= channelPerformance.all.length - 3 ? 'bg-red-500/20 text-red-400' :
                      'bg-dark-tertiary text-gray-400'
                    }`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-white font-medium truncate block max-w-[200px] ${channel.isOrphaned ? 'italic' : ''}`} title={channel.channelName}>
                        {channel.channelName}
                      </span>
                      {channel.isOrphaned && <span className="text-xs text-red-400">🗑️</span>}
                    </div>
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono font-semibold ${channel.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {channel.pnl >= 0 ? '+' : ''}${channel.pnl.toFixed(2)}
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono ${channel.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                    {channel.winRate.toFixed(1)}%
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-300">
                    {channel.trades}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-green-400">
                    {channel.wins}
                  </td>
                  <td className="py-3 text-right font-mono text-red-400">
                    {channel.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}
