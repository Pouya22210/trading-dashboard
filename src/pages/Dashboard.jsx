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

function ChannelRankCard({ rank, channel, pnl, winRate, trades, trend, isTop }) {
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
        ? 'bg-gradient-to-r from-dark-tertiary to-dark-secondary border-dark-border hover:border-accent-cyan/50' 
        : 'bg-dark-secondary/50 border-red-500/20 hover:border-red-500/50'
    }`}>
      {/* Rank Icon */}
      <div className="flex-shrink-0">
        {getRankIcon(rank, isTop)}
      </div>

      {/* Channel Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{channel}</div>
        <div className="flex items-center gap-3 mt-1">
          <span className={`text-xs ${
            winRate >= 50 ? 'text-green-400' : 'text-red-400'
          }`}>
            {winRate.toFixed(1)}% win
          </span>
          <span className="text-xs text-gray-500">
            {trades} trade{trades !== 1 ? 's' : ''}
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
      const data = await fetchTrades()  // Fetches all trades
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

  // ✅ UPDATED: Channel performance using channel_id and display_channel_name
  const channelPerformance = useMemo(() => {
    const filteredTrades = filterByTimeRange(trades, leaderboardTimeRange)
    const channelStats = {}
    
    filteredTrades.filter(t => t.status === 'closed').forEach(trade => {
      const channelId = trade.channel_id
      if (!channelId) return  // Skip trades without channel_id
      
      // ✅ Use display_channel_name from the view
      const channelName = trade.display_channel_name || trade.channel_name || 'Unknown'
      
      if (!channelStats[channelId]) {
        channelStats[channelId] = {
          channelId,
          channelName,
          isOrphaned: trade.is_orphaned_channel || false,  // Track orphaned status
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
    
    return Object.values(channelStats)
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  // Sort channels by P&L
  const topPerformers = useMemo(() => {
    return [...channelPerformance]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5)
  }, [channelPerformance])

  const worstPerformers = useMemo(() => {
    return [...channelPerformance]
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 5)
  }, [channelPerformance])

  // ✅ UPDATED: Overall stats using channel_id grouping
  const overallStats = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === 'closed')
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
    const wins = closedTrades.filter(t => t.outcome === 'profit').length
    const losses = closedTrades.filter(t => t.outcome === 'loss').length
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100) : 0
    
    // Count active channels (using channel_id)
    const activeChannelIds = new Set()
    trades.forEach(t => {
      if (t.channel_id && !t.is_orphaned_channel) {
        activeChannelIds.add(t.channel_id)
      }
    })
    
    return {
      totalPnL,
      totalTrades: closedTrades.length,
      wins,
      losses,
      winRate,
      activeChannels: activeChannelIds.size,
      avgPnL: closedTrades.length > 0 ? totalPnL / closedTrades.length : 0
    }
  }, [trades])

  // ✅ UPDATED: Recent activity using display_channel_name
  const recentActivity = useMemo(() => {
    return trades
      .filter(t => t.status === 'closed')
      .sort((a, b) => new Date(b.close_time) - new Date(a.close_time))
      .slice(0, 10)
      .map(t => ({
        ...t,
        displayChannel: t.display_channel_name || t.channel_name || 'Unknown'  // ✅ Use display name
      }))
  }, [trades])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-accent-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total P&L */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total P&L</span>
            <Zap className="w-4 h-4 text-accent-cyan" />
          </div>
          <div className={`text-2xl font-bold font-mono ${
            overallStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {overallStats.totalPnL >= 0 ? '+' : ''}${overallStats.totalPnL.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {overallStats.totalTrades} closed trades
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</span>
            <Target className="w-4 h-4 text-accent-cyan" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {overallStats.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            <span className="text-green-400">{overallStats.wins}W</span>
            {' / '}
            <span className="text-red-400">{overallStats.losses}L</span>
          </div>
        </div>

        {/* Avg P&L per Trade */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Avg P&L</span>
            <BarChart3 className="w-4 h-4 text-accent-cyan" />
          </div>
          <div className={`text-2xl font-bold font-mono ${
            overallStats.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {overallStats.avgPnL >= 0 ? '+' : ''}${overallStats.avgPnL.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">per trade</div>
        </div>

        {/* Active Channels */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Active Channels</span>
            <Crown className="w-4 h-4 text-accent-cyan" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {overallStats.activeChannels}
          </div>
          <div className="text-xs text-gray-500 mt-1">channels trading</div>
        </div>
      </div>

      {/* Leaderboards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <ChartCard 
          title="Top Performers" 
          icon={Crown}
          headerRight={
            <TimeRangeSelector 
              value={leaderboardTimeRange} 
              onChange={setLeaderboardTimeRange}
            />
          }
        >
          <div className="space-y-3">
            {topPerformers.length > 0 ? (
              topPerformers.map((channel, index) => (
                <ChannelRankCard
                  key={channel.channelId}
                  rank={index + 1}
                  channel={channel.channelName}
                  pnl={channel.pnl}
                  winRate={channel.winRate}
                  trades={channel.trades}
                  isTop={true}
                />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No data for selected time range
              </div>
            )}
          </div>
        </ChartCard>

        {/* Worst Performers */}
        <ChartCard 
          title="Needs Improvement" 
          icon={AlertTriangle}
          headerRight={
            <TimeRangeSelector 
              value={leaderboardTimeRange} 
              onChange={setLeaderboardTimeRange}
            />
          }
        >
          <div className="space-y-3">
            {worstPerformers.length > 0 ? (
              worstPerformers.map((channel, index) => (
                <ChannelRankCard
                  key={channel.channelId}
                  rank={index + 1}
                  channel={channel.channelName}
                  pnl={channel.pnl}
                  winRate={channel.winRate}
                  trades={channel.trades}
                  isTop={false}
                />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No data for selected time range
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Recent Activity */}
      <ChartCard title="Recent Closed Trades" icon={BarChart3}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-dark-border">
                <th className="pb-3 font-semibold">Channel</th>
                <th className="pb-3 font-semibold">Symbol</th>
                <th className="pb-3 font-semibold">Side</th>
                <th className="pb-3 font-semibold">P&L</th>
                <th className="pb-3 font-semibold">Outcome</th>
                <th className="pb-3 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((trade) => (
                <tr key={trade.id} className="border-b border-dark-border/50 hover:bg-dark-tertiary/30 transition-colors">
                  <td className="py-3">
                    {/* ✅ Use displayChannel which contains display_channel_name */}
                    <div className={`text-sm ${
                      trade.is_orphaned_channel ? 'text-gray-500 italic' : 'text-white'
                    }`}>
                      {trade.displayChannel}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="text-sm font-semibold text-white">{trade.symbol}</div>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      trade.direction === 'buy' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {trade.direction?.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className={`text-sm font-mono font-semibold ${
                      trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss?.toFixed(2) || '0.00'}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      trade.outcome === 'profit' 
                        ? 'bg-green-500/20 text-green-400' 
                        : trade.outcome === 'loss'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {trade.outcome || 'unknown'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="text-xs text-gray-500">
                      {new Date(trade.close_time).toLocaleString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentActivity.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No recent trades
            </div>
          )}
        </div>
      </ChartCard>

      {/* All Channels Performance Table */}
      <ChartCard title="All Channels Performance" icon={BarChart3}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-dark-border">
                <th className="pb-3 font-semibold">Channel</th>
                <th className="pb-3 font-semibold text-right">Total P&L</th>
                <th className="pb-3 font-semibold text-right">Win Rate</th>
                <th className="pb-3 font-semibold text-right">Trades</th>
                <th className="pb-3 font-semibold text-right">Wins</th>
                <th className="pb-3 font-semibold text-right">Losses</th>
              </tr>
            </thead>
            <tbody>
              {/* ✅ Sorted by P&L, using channelId as key */}
              {[...channelPerformance]
                .sort((a, b) => b.pnl - a.pnl)
                .map((channel) => (
                  <tr key={channel.channelId} className="border-b border-dark-border/50 hover:bg-dark-tertiary/30 transition-colors">
                    <td className="py-3">
                      {/* ✅ Show orphaned indicator */}
                      <div className={`text-sm ${
                        channel.isOrphaned ? 'text-gray-500 italic' : 'text-white'
                      }`}>
                        {channel.channelName}
                        {channel.isOrphaned && (
                          <span className="ml-2 text-xs text-red-400">🗑️</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className={`text-sm font-mono font-semibold ${
                        channel.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {channel.pnl >= 0 ? '+' : ''}${channel.pnl.toFixed(2)}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className={`text-sm ${
                        channel.winRate >= 50 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {channel.winRate.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="text-sm text-white">{channel.trades}</div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="text-sm text-green-400">{channel.wins}</div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="text-sm text-red-400">{channel.losses}</div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {channelPerformance.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No channel data available
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  )
}
