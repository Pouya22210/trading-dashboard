import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  TrendingUp, TrendingDown, Activity, Target, Award, Crown, Skull,
  BarChart3, Calendar, Clock, ChevronDown, LineChart as LineChartIcon,
  CandlestickChart, Zap, Star, AlertTriangle, Trophy, Medal
} from 'lucide-react'
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Cell, ComposedChart, Area
} from 'recharts'
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

const CHANNEL_COLORS = [
  '#58a6ff', '#3fb950', '#f85149', '#a371f7', '#39d5ff',
  '#f0883e', '#db61a2', '#7ee787', '#ffa657', '#79c0ff',
]

// Time range options
const TIME_RANGES = [
  { key: '1d', label: '1D', days: 1 },
  { key: '1w', label: '1W', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
]

// Chart types
const CHART_TYPES = [
  { key: 'line', label: 'Line', icon: LineChartIcon },
  { key: 'candle', label: 'Candle', icon: CandlestickChart },
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
          <span className="text-white font-semibold truncate" title={channel}>
            {channel.length > 30 ? channel.slice(0, 30) + '...' : channel}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{trades} trades</span>
          <span>•</span>
          <span className={winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
            {winRate.toFixed(1)}% win
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

// Custom Candlestick component for Recharts
function CandlestickBar({ x, y, width, height, payload }) {
  const { open, close, high, low } = payload
  const isUp = close >= open
  const color = isUp ? COLORS.green : COLORS.red
  const bodyTop = Math.min(open, close)
  const bodyHeight = Math.abs(close - open) || 1
  
  return (
    <g>
      {/* Wick */}
      <line
        x1={x + width / 2}
        y1={y}
        x2={x + width / 2}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={x + 2}
        y={y + (height * (high - Math.max(open, close)) / (high - low))}
        width={width - 4}
        height={Math.max((height * bodyHeight / (high - low)), 2)}
        fill={isUp ? color : color}
        stroke={color}
        rx={1}
      />
    </g>
  )
}

export default function Dashboard() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  
  // State for filters
  const [leaderboardTimeRange, setLeaderboardTimeRange] = useState('1w')
  const [priceChartTimeRange, setPriceChartTimeRange] = useState('1m')
  const [selectedInstrument, setSelectedInstrument] = useState('')
  const [chartType, setChartType] = useState('line')
  const [instrumentDropdownOpen, setInstrumentDropdownOpen] = useState(false)

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
      
      // Set default instrument if not set
      if (!selectedInstrument && data.length > 0) {
        const instruments = [...new Set(data.filter(t => t.symbol).map(t => t.symbol))]
        if (instruments.length > 0) {
          setSelectedInstrument(instruments[0])
        }
      }
    } catch (err) {
      console.error('Failed to load trades:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get unique instruments
  const instruments = useMemo(() => {
    const symbolCounts = {}
    trades.forEach(t => {
      if (t.symbol) {
        symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1
      }
    })
    return Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol]) => symbol)
  }, [trades])

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
      ch.winRate = totalWL > 0 ? (ch.wins / totalWL * 100) : 0
    })
    
    const sorted = Object.values(channelStats).sort((a, b) => b.pnl - a.pnl)
    
    return {
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse(),
      all: sorted
    }
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  // Instrument price data for chart
  const instrumentChartData = useMemo(() => {
    if (!selectedInstrument) return []
    
    const filteredTrades = filterByTimeRange(
      trades.filter(t => t.symbol === selectedInstrument && t.signal_time),
      priceChartTimeRange
    )
    
    // Group by date and create OHLC-like data from trade prices
    const priceByDate = {}
    
    filteredTrades.forEach(trade => {
      const date = new Date(trade.signal_time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      
      const price = trade.executed_entry_price || trade.signal_entry_price
      if (!price) return
      
      if (!priceByDate[date]) {
        priceByDate[date] = {
          date,
          prices: [],
          outcomes: [],
          timestamp: new Date(trade.signal_time).getTime()
        }
      }
      
      priceByDate[date].prices.push(price)
      priceByDate[date].outcomes.push(trade.outcome)
    })
    
    // Convert to chart data
    return Object.values(priceByDate)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(day => {
        const prices = day.prices
        const wins = day.outcomes.filter(o => o === 'profit').length
        const losses = day.outcomes.filter(o => o === 'loss').length
        
        return {
          date: day.date,
          open: prices[0],
          close: prices[prices.length - 1],
          high: Math.max(...prices),
          low: Math.min(...prices),
          price: prices[prices.length - 1], // For line chart
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          trades: prices.length,
          wins,
          losses,
          winRate: (wins + losses) > 0 ? (wins / (wins + losses) * 100) : 0
        }
      })
  }, [trades, selectedInstrument, priceChartTimeRange, filterByTimeRange])

  // Channel win rate comparison
  const channelWinRateData = useMemo(() => {
    const filteredTrades = filterByTimeRange(trades, leaderboardTimeRange)
    const channelStats = {}
    
    filteredTrades.filter(t => t.status === 'closed').forEach(trade => {
      const channelName = trade.channel_name || 'Unknown'
      
      if (!channelStats[channelName]) {
        channelStats[channelName] = { wins: 0, losses: 0, trades: 0 }
      }
      
      channelStats[channelName].trades++
      if (trade.outcome === 'profit') channelStats[channelName].wins++
      if (trade.outcome === 'loss') channelStats[channelName].losses++
    })
    
    return Object.entries(channelStats)
      .filter(([_, stats]) => stats.trades >= 5) // Minimum 5 trades
      .map(([name, stats]) => {
        const totalWL = stats.wins + stats.losses
        return {
          name: name.length > 20 ? name.slice(0, 20) + '...' : name,
          fullName: name,
          winRate: totalWL > 0 ? (stats.wins / totalWL * 100) : 0,
          trades: stats.trades,
          wins: stats.wins,
          losses: stats.losses
        }
      })
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10)
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
      const channelName = trade.channel_name || 'Unknown'
      
      if (!channelActivity[channelName]) {
        channelActivity[channelName] = {
          name: channelName,
          signals: 0,
          wins: 0,
          losses: 0,
          pnl: 0
        }
      }
      
      channelActivity[channelName].signals++
      if (trade.status === 'closed') {
        channelActivity[channelName].pnl += trade.profit_loss || 0
        if (trade.outcome === 'profit') channelActivity[channelName].wins++
        if (trade.outcome === 'loss') channelActivity[channelName].losses++
      }
    })
    
    return Object.values(channelActivity)
      .filter(ch => ch.signals >= 2)
      .sort((a, b) => b.signals - a.signals)
      .slice(0, 5)
  }, [trades])

  // Instrument performance summary
  const instrumentPerformance = useMemo(() => {
    const filteredTrades = filterByTimeRange(trades, leaderboardTimeRange)
    const instrumentStats = {}
    
    filteredTrades.filter(t => t.status === 'closed' && t.symbol).forEach(trade => {
      const symbol = trade.symbol
      
      if (!instrumentStats[symbol]) {
        instrumentStats[symbol] = {
          symbol,
          pnl: 0,
          wins: 0,
          losses: 0,
          trades: 0
        }
      }
      
      instrumentStats[symbol].pnl += trade.profit_loss || 0
      instrumentStats[symbol].trades++
      if (trade.outcome === 'profit') instrumentStats[symbol].wins++
      if (trade.outcome === 'loss') instrumentStats[symbol].losses++
    })
    
    return Object.values(instrumentStats)
      .map(inst => ({
        ...inst,
        winRate: (inst.wins + inst.losses) > 0 ? (inst.wins / (inst.wins + inst.losses) * 100) : 0
      }))
      .sort((a, b) => b.pnl - a.pnl)
  }, [trades, leaderboardTimeRange, filterByTimeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Channel Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Compare and analyze signal provider performance</p>
      </div>

      {/* Top/Bottom Channels Leaderboard */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-cyan/10">
              <Crown className="w-5 h-5 text-accent-cyan" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Channel Leaderboard</h2>
              <p className="text-sm text-gray-500">Top and bottom performing channels by P&L</p>
            </div>
          </div>
          <TimeRangeSelector value={leaderboardTimeRange} onChange={setLeaderboardTimeRange} />
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

      {/* Instrument Price Chart */}
      <div className="mb-8">
        <ChartCard 
          title="Instrument Price Action" 
          icon={BarChart3}
          headerRight={
            <div className="flex items-center gap-3">
              {/* Instrument Selector */}
              <div className="relative">
                <button
                  onClick={() => setInstrumentDropdownOpen(!instrumentDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-dark-tertiary rounded-lg text-sm text-white hover:bg-dark-tertiary/80 transition-colors"
                >
                  <span>{selectedInstrument || 'Select Instrument'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${instrumentDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {instrumentDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setInstrumentDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1 w-48 max-h-64 overflow-y-auto bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-20">
                      {instruments.map(symbol => (
                        <button
                          key={symbol}
                          onClick={() => {
                            setSelectedInstrument(symbol)
                            setInstrumentDropdownOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedInstrument === symbol 
                              ? 'bg-accent-cyan/20 text-accent-cyan' 
                              : 'text-gray-300 hover:bg-dark-tertiary'
                          }`}
                        >
                          {symbol}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              {/* Chart Type Toggle */}
              <div className="flex bg-dark-tertiary rounded-lg p-1">
                {CHART_TYPES.map(type => (
                  <button
                    key={type.key}
                    onClick={() => setChartType(type.key)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                      chartType === type.key
                        ? 'bg-accent-cyan text-dark-primary'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <type.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              
              {/* Time Range */}
              <TimeRangeSelector value={priceChartTimeRange} onChange={setPriceChartTimeRange} />
            </div>
          }
        >
          {instrumentChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              {chartType === 'line' ? (
                <ComposedChart data={instrumentChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#6e7681" fontSize={11} tickMargin={10} />
                  <YAxis stroke="#6e7681" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0].payload
                      return (
                        <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl">
                          <p className="text-white font-semibold mb-2">{label}</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Price:</span>
                              <span className="text-white font-mono">${data.price?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">High:</span>
                              <span className="text-green-400 font-mono">${data.high?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Low:</span>
                              <span className="text-red-400 font-mono">${data.low?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Trades:</span>
                              <span className="text-white font-mono">{data.trades}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Win Rate:</span>
                              <span className={`font-mono ${data.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {data.winRate.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke={COLORS.cyan} 
                    strokeWidth={2}
                    fill="url(#priceGradient)"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="high" 
                    stroke={COLORS.green} 
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="low" 
                    stroke={COLORS.red} 
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </ComposedChart>
              ) : (
                <ComposedChart data={instrumentChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <XAxis dataKey="date" stroke="#6e7681" fontSize={11} tickMargin={10} />
                  <YAxis stroke="#6e7681" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0]?.payload
                      if (!data) return null
                      return (
                        <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl">
                          <p className="text-white font-semibold mb-2">{label}</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Open:</span>
                              <span className="text-white font-mono">${data.open?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">High:</span>
                              <span className="text-green-400 font-mono">${data.high?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Low:</span>
                              <span className="text-red-400 font-mono">${data.low?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Close:</span>
                              <span className="text-white font-mono">${data.close?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-gray-400">Trades:</span>
                              <span className="text-white font-mono">{data.trades}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar 
                    dataKey="high"
                    shape={(props) => <CandlestickBar {...props} />}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              {selectedInstrument ? 'No price data for selected instrument and time range' : 'Select an instrument to view price action'}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Channel Win Rate Comparison & Instrument Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Win Rate Comparison */}
        <ChartCard title="Channel Win Rate Comparison" icon={Target}>
          {channelWinRateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={channelWinRateData} layout="vertical" margin={{ left: 20, right: 20 }} barSize={16}>
                <XAxis type="number" stroke="#6e7681" fontSize={11} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#6e7681" 
                  fontSize={10}
                  width={140}
                  interval={0}
                />
                <Tooltip
                  contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                  formatter={(value, name, props) => [
                    `${value.toFixed(1)}% (${props.payload.wins}W / ${props.payload.losses}L)`,
                    props.payload.fullName
                  ]}
                />
                <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                  {channelWinRateData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.winRate >= 50 ? COLORS.green : COLORS.red}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No channel data (min 5 trades required)
            </div>
          )}
        </ChartCard>

        {/* Instrument Performance */}
        <ChartCard title="Instrument Performance" icon={Activity}>
          {instrumentPerformance.length > 0 ? (
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
              {instrumentPerformance.slice(0, 10).map((inst, idx) => (
                <div 
                  key={inst.symbol}
                  className="flex items-center gap-4 p-3 rounded-lg bg-dark-tertiary/30 border border-dark-border/30"
                >
                  <div className="w-16 text-center">
                    <span className="text-lg font-bold text-white">{inst.symbol}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{inst.trades} trades</span>
                      <span className={`text-xs font-medium ${inst.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {inst.winRate.toFixed(1)}% win
                      </span>
                    </div>
                    <div className="w-full bg-dark-tertiary rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${inst.winRate >= 50 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(inst.winRate, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className={`text-right min-w-[80px] font-mono font-semibold ${inst.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {inst.pnl >= 0 ? '+' : ''}${inst.pnl.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No instrument data
            </div>
          )}
        </ChartCard>
      </div>

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
  )
}
