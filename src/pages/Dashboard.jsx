import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  TrendingUp, TrendingDown, Crown, Skull,
  BarChart3, Zap, Star, AlertTriangle, Trophy, Medal
} from 'lucide-react'
import { fetchTrades, subscribeToTrades } from '../lib/supabase'
import ActivityLogPanel from '../components/ActivityLogPanel'

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
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.02] ${
      isTop 
        ? 'bg-gradient-to-r from-green-500/5 to-transparent border-green-500/20'
        : 'bg-gradient-to-r from-red-500/5 to-transparent border-red-500/20'
    }`}>
      {/* Rank */}
      <div className="flex-shrink-0">
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
    
    // Sort by P&L
    const sorted = Object.values(channelStats).sort((a, b) => b.pnl - a.pnl)
    
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
                  <span className="text-xs text-gray-500 bg-dark-tertiary/50 px-3 py-1 rounded-full">
                    Most active channels
                  </span>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {hotChannels.map((channel, idx) => (
                    <div 
                      key={channel.name}
                      className="bg-gradient-to-br from-dark-tertiary/70 to-dark-secondary/50 rounded-xl p-4 border border-dark-border/30"
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
                        <span className="text-white font-medium truncate block max-w-[200px]" title={channel.channelName}>
                          {channel.channelName}
                        </span>
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono font-semibold ${channel.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {channel.pnl >= 0 ? '+' : ''}${channel.pnl.toFixed(2)}
                      </td>
                      <td className={`py-3 pr-4 text-right font-mono ${channel.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {channel.winRate.toFixed(1)}%
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-400 font-mono">
                        {channel.trades}
                      </td>
                      <td className="py-3 pr-4 text-right text-green-400 font-mono">
                        {channel.wins}
                      </td>
                      <td className="py-3 text-right text-red-400 font-mono">
                        {channel.losses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
          
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
