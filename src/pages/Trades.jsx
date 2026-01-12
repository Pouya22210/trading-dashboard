import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  Calendar, Filter, Download, Plus, Trash2, Search, X, Wifi, WifiOff,
  BarChart3, Clock, TrendingUp, Target, ChevronLeft, ChevronRight, Layers,
  CheckSquare, Square, ChevronDown
} from 'lucide-react'
import { 
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Area
} from 'recharts'
import { fetchTrades, fetchChannels, subscribeToTrades } from '../lib/supabase'

// Color palette for channels
const CHANNEL_COLORS = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#f85149', // red
  '#a371f7', // purple
  '#39d5ff', // cyan
  '#f0883e', // orange
  '#db61a2', // pink
  '#7ee787', // light green
  '#ffa657', // light orange
  '#79c0ff', // light blue
]

const COLORS = {
  green: '#3fb950',
  red: '#f85149',
  blue: '#58a6ff',
  cyan: '#39d5ff',
  purple: '#a371f7',
  orange: '#f0883e',
  pink: '#db61a2',
  gray: '#6e7681',
  yellow: '#d29922',
}

// All possible outcome types
const OUTCOME_TYPES = [
  { key: 'profit', label: 'Profit', color: COLORS.green },
  { key: 'loss', label: 'Loss', color: COLORS.red },
  { key: 'breakeven', label: 'Breakeven', color: COLORS.gray },
  { key: 'manual', label: 'Manual', color: COLORS.orange },
  { key: 'canceled', label: 'Canceled', color: COLORS.purple },
  { key: 'blocked', label: 'Blocked', color: COLORS.pink },
  { key: 'unknown', label: 'Unknown/Null', color: COLORS.yellow },
]

const TRADES_PER_PAGE = 10

// Connection status indicator component
function ConnectionStatus({ status }) {
  const isConnected = status === 'SUBSCRIBED'
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
      isConnected 
        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
    }`}>
      {isConnected ? (
        <>
          <Wifi className="w-3 h-3" />
          <span>Live</span>
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>{status || 'Connecting...'}</span>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`chart-card ${className}`}>
      <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
        <Icon className="w-4 h-4 text-accent-cyan" />
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  const getPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 5
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      
      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)
      
      if (currentPage <= 3) {
        end = 4
      }
      
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3
      }
      
      if (start > 2) {
        pages.push('...')
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (end < totalPages - 1) {
        pages.push('...')
      }
      
      pages.push(totalPages)
    }
    
    return pages
  }

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 py-4 border-t border-dark-border">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          currentPage === 1
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-dark-tertiary'
        }`}
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>

      <div className="flex items-center gap-1">
        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-500">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[40px] h-10 rounded-lg text-sm font-semibold transition-all ${
                currentPage === page
                  ? 'bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary'
                  : 'text-gray-400 hover:text-white hover:bg-dark-tertiary'
              }`}
            >
              {page}
            </button>
          )
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          currentPage === totalPages
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-dark-tertiary'
        }`}
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// Toast notification for real-time updates
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = type === 'insert' ? 'bg-green-500/20 border-green-500/30' :
                  type === 'update' ? 'bg-blue-500/20 border-blue-500/30' :
                  'bg-red-500/20 border-red-500/30'
  
  const textColor = type === 'insert' ? 'text-green-400' :
                    type === 'update' ? 'text-blue-400' :
                    'text-red-400'

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg border ${bgColor} ${textColor} text-sm font-medium shadow-lg z-50`}>
      {message}
    </div>
  )
}

// Custom tooltip for outcome distribution chart
function OutcomeDistributionTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-2 font-semibold">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-300">{entry.name}:</span>
          <span className="text-white font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// Outcome checkbox component
function OutcomeCheckbox({ outcome, checked, onChange }) {
  return (
    <label 
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
        checked 
          ? 'bg-dark-tertiary border border-dark-border' 
          : 'bg-dark-secondary/50 border border-transparent hover:border-dark-border'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(outcome.key)}
        className="hidden"
      />
      {checked ? (
        <CheckSquare className="w-4 h-4" style={{ color: outcome.color }} />
      ) : (
        <Square className="w-4 h-4 text-gray-500" />
      )}
      <span 
        className="w-3 h-3 rounded-full" 
        style={{ backgroundColor: outcome.color }}
      />
      <span className={`text-sm ${checked ? 'text-white' : 'text-gray-500'}`}>
        {outcome.label}
      </span>
    </label>
  )
}

// ==================== NEW: Multi-Select Channel Filter Component ====================
// Uses channel_id for filtering (stable) but displays channel_name/key (user-friendly)
function ChannelMultiSelect({ channelList, selectedChannelIds, onChange, channelColorMap }) {
  const [isOpen, setIsOpen] = useState(false)
  
  // channelList is array of { id, name, color }
  const toggleChannel = (channelId) => {
    if (selectedChannelIds.includes(channelId)) {
      onChange(selectedChannelIds.filter(id => id !== channelId))
    } else {
      onChange([...selectedChannelIds, channelId])
    }
  }
  
  const selectAll = () => {
    onChange(channelList.map(ch => ch.id))
  }
  
  const deselectAll = () => {
    onChange([])
  }
  
  const getDisplayText = () => {
    if (selectedChannelIds.length === 0 || selectedChannelIds.length === channelList.length) {
      return 'All Channels'
    }
    if (selectedChannelIds.length === 1) {
      const channel = channelList.find(ch => ch.id === selectedChannelIds[0])
      const name = channel?.name || 'Unknown'
      return name.length > 25 ? name.slice(0, 25) + '...' : name
    }
    return `${selectedChannelIds.length} channels selected`
  }
  
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-dark-secondary border border-dark-border rounded-lg text-sm text-white hover:border-accent-cyan/50 transition-colors"
      >
        <span className="truncate">{getDisplayText()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown menu */}
          <div className="absolute z-20 mt-1 w-full min-w-[280px] max-h-[300px] overflow-y-auto bg-dark-secondary border border-dark-border rounded-lg shadow-xl">
            {/* Select/Deselect all buttons */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-tertiary/50">
              <button 
                onClick={selectAll}
                className="text-xs text-accent-cyan hover:text-accent-blue transition-colors"
              >
                Select All
              </button>
              <span className="text-gray-600">|</span>
              <button 
                onClick={deselectAll}
                className="text-xs text-accent-cyan hover:text-accent-blue transition-colors"
              >
                Deselect All
              </button>
            </div>
            
            {/* Channel list */}
            <div className="py-1">
              {channelList.map(channel => (
                <label
                  key={channel.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    selectedChannelIds.includes(channel.id)
                      ? 'bg-dark-tertiary'
                      : 'hover:bg-dark-tertiary/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedChannelIds.includes(channel.id)}
                    onChange={() => toggleChannel(channel.id)}
                    className="hidden"
                  />
                  {selectedChannelIds.includes(channel.id) ? (
                    <CheckSquare className="w-4 h-4 text-accent-cyan flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                  <span 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: channelColorMap[channel.id] || '#6e7681' }}
                  />
                  <span className={`text-sm truncate ${
                    selectedChannelIds.includes(channel.id) ? 'text-white' : 'text-gray-400'
                  }`}>
                    {channel.name}
                  </span>
                </label>
              ))}
              
              {channelList.length === 0 && (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">
                  No channels found
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
// ==================== END Multi-Select Channel Filter ====================

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRows, setSelectedRows] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [toast, setToast] = useState(null)
  
  // Outcome filter for the new visualization
  const [selectedOutcomes, setSelectedOutcomes] = useState(
    OUTCOME_TYPES.map(o => o.key) // All selected by default
  )
  
  // ==================== FIX #2: Multi-channel selection by ID ====================
  const [selectedChannelIds, setSelectedChannelIds] = useState([]) // Empty = all channels
  
  // Filters (removed single channel filter, using selectedChannels instead)
  const [filters, setFilters] = useState({
    orderType: '',
    side: '',
    status: '',
    startDate: '',
    endDate: '',
  })

  // Toggle outcome selection
  const toggleOutcome = useCallback((outcomeKey) => {
    setSelectedOutcomes(prev => {
      if (prev.includes(outcomeKey)) {
        return prev.filter(k => k !== outcomeKey)
      } else {
        return [...prev, outcomeKey]
      }
    })
  }, [])

  // Select/deselect all outcomes
  const selectAllOutcomes = useCallback(() => {
    setSelectedOutcomes(OUTCOME_TYPES.map(o => o.key))
  }, [])

  const deselectAllOutcomes = useCallback(() => {
    setSelectedOutcomes([])
  }, [])

  // Handle real-time INSERT - add new trade to the list
  const handleTradeInsert = useCallback((newTrade) => {
    setTrades(prev => {
      if (prev.some(t => t.id === newTrade.id)) {
        return prev
      }
      return [newTrade, ...prev]
    })
    
    setToast({
      message: `New trade: ${newTrade.symbol} ${newTrade.direction?.toUpperCase()}`,
      type: 'insert'
    })
  }, [])

  // Handle real-time UPDATE - update existing trade in place
  const handleTradeUpdate = useCallback((updatedTrade, oldTrade) => {
    setTrades(prev => prev.map(trade => 
      trade.id === updatedTrade.id ? updatedTrade : trade
    ))
    
    if (oldTrade?.status !== updatedTrade.status) {
      const statusEmoji = updatedTrade.status === 'closed' ? '✅' :
                          updatedTrade.status === 'canceled' ? '❌' :
                          updatedTrade.status === 'active' ? '🟢' : '🔄'
      setToast({
        message: `${statusEmoji} Trade ${updatedTrade.trade_id?.slice(0, 8)}: ${oldTrade?.status} → ${updatedTrade.status}`,
        type: 'update'
      })
    }
  }, [])

  // Handle real-time DELETE - remove trade from list
  const handleTradeDelete = useCallback((deletedTrade) => {
    setTrades(prev => prev.filter(trade => trade.id !== deletedTrade.id))
    
    setToast({
      message: `Trade removed: ${deletedTrade.trade_id?.slice(0, 8)}`,
      type: 'delete'
    })
  }, [])

  // Handle connection status changes
  const handleStatusChange = useCallback((status, error) => {
    setConnectionStatus(status)
    if (error) {
      console.error('WebSocket error:', error)
    }
  }, [])

  // Initial data load
  useEffect(() => {
    async function loadData() {
      try {
        const [tradesData, channelsData] = await Promise.all([
          fetchTrades({ limit: 50000 }),
          fetchChannels()
        ])
        setTrades(tradesData)
        setChannels(channelsData)
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Set up real-time subscription
  useEffect(() => {
    const subscription = subscribeToTrades({
      onInsert: handleTradeInsert,
      onUpdate: handleTradeUpdate,
      onDelete: handleTradeDelete,
      onStatus: handleStatusChange
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [handleTradeInsert, handleTradeUpdate, handleTradeDelete, handleStatusChange])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, selectedChannelIds])

  // ==================== FIX #1: Build channel list from trades using channel_id (stable) ====================
  // Creates a list of unique channels with their IDs and display names
  const channelList = useMemo(() => {
    const channelMap = new Map() // Use Map to dedupe by channel_id
    
    trades.forEach(trade => {
      const channelId = trade.channel_id
      if (channelId && !channelMap.has(channelId)) {
        // Get display name: prefer channel_name from trade, fallback to channel_id
        const displayName = trade.channel_name || channelId
        channelMap.set(channelId, {
          id: channelId,
          name: displayName
        })
      }
    })
    
    // Convert to array and sort by name
    return Array.from(channelMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    )
  }, [trades])

  // Create color mapping for channels by ID
  const channelColorMap = useMemo(() => {
    const map = {}
    channelList.forEach((channel, index) => {
      map[channel.id] = CHANNEL_COLORS[index % CHANNEL_COLORS.length]
    })
    return map
  }, [channelList])
  
  // Helper to get color by channel_id (for tables/charts that have channel_id)
  const getChannelColor = useCallback((channelId) => {
    return channelColorMap[channelId] || '#6e7681'
  }, [channelColorMap])
  
  // Helper to get channel name by ID
  const getChannelName = useCallback((channelId) => {
    const channel = channelList.find(ch => ch.id === channelId)
    return channel?.name || 'Unknown'
  }, [channelList])

  // ==================== FIX #1 & #2: Updated filter logic using channel_id ====================
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // Multi-channel filter by ID: if selectedChannelIds is empty, show all; otherwise filter
      if (selectedChannelIds.length > 0 && !selectedChannelIds.includes(trade.channel_id)) {
        return false
      }
      if (filters.orderType && trade.order_type !== filters.orderType) return false
      if (filters.side && trade.direction !== filters.side) return false
      if (filters.status && trade.status !== filters.status) return false
      if (filters.startDate && new Date(trade.signal_time) < new Date(filters.startDate)) return false
      if (filters.endDate && new Date(trade.signal_time) > new Date(filters.endDate)) return false
      return true
    })
  }, [trades, selectedChannelIds, filters])

  // Calculate channel statistics (grouped by channel_id)
  const channelStats = useMemo(() => {
    const stats = {}
    filteredTrades.filter(t => t.status === 'closed').forEach(trade => {
      const channelId = trade.channel_id
      if (!channelId) return
      
      if (!stats[channelId]) {
        stats[channelId] = {
          channelId,
          channelName: trade.channel_name || 'Unknown',
          totalPnL: 0,
          wins: 0,
          losses: 0,
          totalTrades: 0,
          avgPnL: 0
        }
      }
      
      stats[channelId].totalPnL += trade.profit_loss || 0
      stats[channelId].totalTrades++
      if (trade.outcome === 'profit') stats[channelId].wins++
      if (trade.outcome === 'loss') stats[channelId].losses++
    })
    
    // Calculate averages and win rates
    Object.keys(stats).forEach(channelId => {
      const s = stats[channelId]
      s.avgPnL = s.totalTrades > 0 ? s.totalPnL / s.totalTrades : 0
      s.winRate = s.totalTrades > 0 ? (s.wins / s.totalTrades * 100) : 0
    })
    
    return stats
  }, [filteredTrades])

  // Calculate cumulative P&L over time by channel (using channel_id for grouping)
  const cumulativePnLData = useMemo(() => {
    // Get closed trades sorted by time
    const closedTrades = filteredTrades
      .filter(t => t.status === 'closed' && t.close_time)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
    
    if (closedTrades.length === 0) return []

    // Group by date and channel_id
    const dataByDate = {}
    const runningTotals = {}
    
    closedTrades.forEach(trade => {
      const date = new Date(trade.close_time).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
      const channelId = trade.channel_id || 'unknown'
      
      if (!runningTotals[channelId]) {
        runningTotals[channelId] = 0
      }
      runningTotals[channelId] += trade.profit_loss || 0
      
      if (!dataByDate[date]) {
        dataByDate[date] = { date }
      }
      
      // Store the cumulative total for this channel at this date
      dataByDate[date][channelId] = runningTotals[channelId]
    })
    
    // Fill in gaps - carry forward last known value
    const dates = Object.keys(dataByDate)
    const allChannelIds = Object.keys(runningTotals)
    
    let lastValues = {}
    dates.forEach(date => {
      allChannelIds.forEach(channelId => {
        if (dataByDate[date][channelId] !== undefined) {
          lastValues[channelId] = dataByDate[date][channelId]
        } else if (lastValues[channelId] !== undefined) {
          dataByDate[date][channelId] = lastValues[channelId]
        }
      })
    })
    
    return Object.values(dataByDate)
  }, [filteredTrades])
  
  // Get list of channel IDs that appear in filtered trades (for chart lines)
  const activeChannelIds = useMemo(() => {
    const ids = new Set()
    filteredTrades.forEach(trade => {
      if (trade.channel_id) ids.add(trade.channel_id)
    })
    return Array.from(ids)
  }, [filteredTrades])

  // ==================== FIX #3: Outcome distribution sorted by (profit - loss) descending ====================
  // Groups by channel_id for consistency
  const outcomeByChannelData = useMemo(() => {
    const dataByChannel = {}
    
    filteredTrades.forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const channelName = trade.channel_name || 'Unknown'
      let outcome = trade.outcome || 'unknown'
      
      // Normalize null/undefined outcomes to 'unknown'
      if (!outcome || outcome === 'null') {
        outcome = 'unknown'
      }
      
      if (!dataByChannel[channelId]) {
        dataByChannel[channelId] = { 
          channelId,
          channel: channelName, // Display name (may be truncated later)
          fullName: channelName,
          profit: 0,
          loss: 0,
          breakeven: 0,
          manual: 0,
          canceled: 0,
          blocked: 0,
          unknown: 0,
        }
      }
      
      if (dataByChannel[channelId][outcome] !== undefined) {
        dataByChannel[channelId][outcome]++
      } else {
        dataByChannel[channelId].unknown++
      }
    })
    
    // Convert to array, add sort score, truncate channel names, and sort
    return Object.values(dataByChannel)
      .map(item => ({
        ...item,
        // Calculate sort score: profit - loss
        sortScore: item.profit - item.loss,
        channel: item.channel.length > 20 ? item.channel.slice(0, 20) + '...' : item.channel
      }))
      // Sort by (profit - loss) in DESCENDING order (best performers first)
      .sort((a, b) => b.sortScore - a.sortScore)
  }, [filteredTrades])

  // Channel comparison bar chart data
  const channelComparisonData = useMemo(() => {
    return Object.entries(channelStats).map(([channelId, stats]) => ({
      channelId,
      channel: stats.channelName.length > 15 ? stats.channelName.slice(0, 15) + '...' : stats.channelName,
      fullName: stats.channelName,
      totalPnL: stats.totalPnL,
      winRate: stats.winRate,
      avgPnL: stats.avgPnL,
      trades: stats.totalTrades,
      wins: stats.wins,
      losses: stats.losses,
      color: getChannelColor(channelId)
    })).sort((a, b) => b.totalPnL - a.totalPnL)
  }, [channelStats, getChannelColor])

  // Pagination calculations
  const totalPages = Math.ceil(filteredTrades.length / TRADES_PER_PAGE)
  const startIndex = (currentPage - 1) * TRADES_PER_PAGE
  const endIndex = startIndex + TRADES_PER_PAGE
  const paginatedTrades = filteredTrades.slice(startIndex, endIndex)

  // Calculate filtered stats
  const closedTrades = filteredTrades.filter(t => t.status === 'closed')
  const wins = closedTrades.filter(t => t.outcome === 'profit').length
  const losses = closedTrades.filter(t => t.outcome === 'loss').length
  const netPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : 0

  // Chart data: Outcome by Side
  const outcomeBySide = filteredTrades.reduce((acc, trade) => {
    if (trade.status !== 'closed') return acc
    const side = trade.direction || 'Unknown'
    const outcome = trade.outcome || 'unknown'
    if (!acc[side]) acc[side] = { side, profit: 0, loss: 0, breakeven: 0 }
    acc[side][outcome] = (acc[side][outcome] || 0) + 1
    return acc
  }, {})
  const outcomeBySideData = Object.values(outcomeBySide)

  // Hourly performance
  const hourlyData = filteredTrades.reduce((acc, trade) => {
    if (trade.status !== 'closed' || !trade.signal_time) return acc
    const hour = new Date(trade.signal_time).getHours()
    if (!acc[hour]) acc[hour] = { hour: `${hour}:00`, pnl: 0, count: 0 }
    acc[hour].pnl += trade.profit_loss || 0
    acc[hour].count++
    return acc
  }, {})
  const hourlyChartData = Object.values(hourlyData).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))

  // Day of week performance
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dowData = filteredTrades.reduce((acc, trade) => {
    if (trade.status !== 'closed' || !trade.signal_time) return acc
    const day = days[new Date(trade.signal_time).getDay()]
    if (!acc[day]) acc[day] = { day, pnl: 0, count: 0 }
    acc[day].pnl += trade.profit_loss || 0
    acc[day].count++
    return acc
  }, {})
  const dowChartData = days.map(day => dowData[day] || { day, pnl: 0, count: 0 })

  function clearFilters() {
    setFilters({ orderType: '', side: '', status: '', startDate: '', endDate: '' })
    setSelectedChannelIds([]) // Clear channel selection too
    setCurrentPage(1)
  }

  function handlePageChange(page) {
    setCurrentPage(page)
    document.getElementById('trades-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function exportCSV() {
    const headers = ['Trade ID', 'Channel', 'Symbol', 'Side', 'Order Type', 'Entry', 'TP', 'SL', 'P&L', 'Status', 'Outcome', 'Time']
    const rows = filteredTrades.map(t => [
      t.trade_id, t.channel_name, t.symbol, t.direction, t.order_type,
      t.executed_entry_price, t.executed_tp_price, t.executed_sl_price,
      t.profit_loss, t.status, t.outcome, t.signal_time
    ])
    
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Helper function to get status badge styling
  function getStatusBadgeClass(trade) {
    if (trade.status === 'closed') {
      // Different colors based on outcome
      if (trade.outcome === 'profit') return 'badge-success' // green
      if (trade.outcome === 'loss') return 'badge-danger'   // red
      if (trade.outcome === 'breakeven') return 'badge-neutral' // gray
      // For manual, canceled, blocked, unknown - use neutral
      return 'badge-neutral'
    }
    if (trade.status === 'active') return 'badge-warning'
    if (trade.status === 'pending') return 'badge-warning'
    if (trade.status === 'canceled') return 'badge-neutral'
    if (trade.status === 'blocked') return 'badge-neutral'
    return 'badge-neutral'
  }

  // Helper function to get status display text
  function getStatusDisplay(trade) {
    if (trade.status === 'closed' && trade.outcome) {
      return `${trade.status} (${trade.outcome})`
    }
    return trade.status || '-'
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-gray-500">Loading trades...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toast notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header with connection status */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Trade History</h1>
        <ConnectionStatus status={connectionStatus} />
      </div>

      {/* Filters */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Calendar className="w-3 h-3 text-accent-cyan" /> Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Calendar className="w-3 h-3 text-accent-cyan" /> End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          {/* ==================== FIX #2: Multi-select channel filter by ID ==================== */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Filter className="w-3 h-3 text-accent-cyan" /> Channels
            </label>
            <ChannelMultiSelect
              channelList={channelList}
              selectedChannelIds={selectedChannelIds}
              onChange={setSelectedChannelIds}
              channelColorMap={channelColorMap}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Order Type
            </label>
            <select
              value={filters.orderType}
              onChange={e => setFilters({ ...filters, orderType: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Side
            </label>
            <select
              value={filters.side}
              onChange={e => setFilters({ ...filters, side: e.target.value })}
            >
              <option value="">All Sides</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Status
            </label>
            <select
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>
        <button onClick={clearFilters} className="btn-secondary flex items-center gap-2">
          <X className="w-4 h-4" /> Clear Filters
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="kpi-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Filtered Trades</div>
          <div className="text-2xl font-bold font-mono text-white">{filteredTrades.length}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Net P&L</div>
          <div className={`text-2xl font-bold font-mono ${netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${netPnL.toFixed(2)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Win Rate</div>
          <div className="text-2xl font-bold font-mono text-white">{winRate}%</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide">W/L</div>
          <div className="text-2xl font-bold font-mono">
            <span className="text-green-400">{wins}</span>
            <span className="text-gray-500"> / </span>
            <span className="text-red-400">{losses}</span>
          </div>
        </div>
      </div>

      {/* ==================== CHANNEL COMPARISON SECTION ==================== */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-accent-cyan" />
          Channel Performance Comparison
        </h2>
        
        {/* Cumulative P&L Over Time - Full Width - TALLER, NO LEGEND, HOVER SHOWS CHANNEL */}
        <ChartCard title="Cumulative Profit/Loss by Channel Over Time" icon={TrendingUp} className="mb-6">
          {cumulativePnLData.length > 0 ? (
            <ResponsiveContainer width="100%" height={650}>
              <LineChart data={cumulativePnLData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <XAxis 
                  dataKey="date" 
                  stroke="#6e7681" 
                  fontSize={11}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#6e7681" 
                  fontSize={11}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    // Find the hovered line (the one with data at this point)
                    const hoveredItem = payload.find(p => p.value !== null && p.value !== undefined)
                    if (!hoveredItem) return null
                    
                    // Get display name from channelList using the channel_id (dataKey)
                    const channelId = hoveredItem.dataKey
                    const displayName = getChannelName(channelId)
                    
                    return (
                      <div className="bg-dark-secondary border border-dark-border rounded-lg px-4 py-3 shadow-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <span 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: hoveredItem.color }}
                          />
                          <span className="text-white font-semibold text-sm">{displayName}</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-1">{label}</p>
                        <p className={`text-lg font-mono font-bold ${hoveredItem.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${hoveredItem.value?.toFixed(2)}
                        </p>
                      </div>
                    )
                  }}
                />
                {activeChannelIds.map((channelId) => (
                  <Line
                    key={channelId}
                    type="monotone"
                    dataKey={channelId}
                    name={getChannelName(channelId)}
                    stroke={getChannelColor(channelId)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No closed trades with dates to display
            </div>
          )}
        </ChartCard>

        {/* Channel Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Total P&L by Channel */}
          <ChartCard title="Total P&L by Channel" icon={BarChart3}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={channelComparisonData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" stroke="#6e7681" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <YAxis 
                  type="category" 
                  dataKey="channel" 
                  stroke="#6e7681" 
                  fontSize={11}
                  width={120}
                />
                <Tooltip
                  contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                  formatter={(value, name, props) => [`$${value.toFixed(2)}`, props.payload.fullName]}
                />
                <Bar dataKey="totalPnL" radius={[0, 4, 4, 0]}>
                  {channelComparisonData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.totalPnL >= 0 ? COLORS.green : COLORS.red}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Win Rate by Channel */}
          <ChartCard title="Win Rate by Channel" icon={Target}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={channelComparisonData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis 
                  type="number" 
                  stroke="#6e7681" 
                  fontSize={11} 
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis 
                  type="category" 
                  dataKey="channel" 
                  stroke="#6e7681" 
                  fontSize={11}
                  width={120}
                />
                <Tooltip
                  contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                  formatter={(value, name, props) => [
                    `${value.toFixed(1)}% (${props.payload.wins}W / ${props.payload.losses}L)`,
                    props.payload.fullName
                  ]}
                />
                <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                  {channelComparisonData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ==================== FIX #3: OUTCOME DISTRIBUTION BY CHANNEL (sorted) ==================== */}
        <ChartCard title="Outcome Distribution by Channel (sorted by Profit - Loss)" icon={Target} className="mb-6">
          {/* Outcome checkboxes */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-gray-400">Filter outcomes:</span>
              <button 
                onClick={selectAllOutcomes}
                className="text-xs text-accent-cyan hover:text-accent-blue transition-colors"
              >
                Select All
              </button>
              <span className="text-gray-600">|</span>
              <button 
                onClick={deselectAllOutcomes}
                className="text-xs text-accent-cyan hover:text-accent-blue transition-colors"
              >
                Deselect All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {OUTCOME_TYPES.map(outcome => (
                <OutcomeCheckbox
                  key={outcome.key}
                  outcome={outcome}
                  checked={selectedOutcomes.includes(outcome.key)}
                  onChange={toggleOutcome}
                />
              ))}
            </div>
          </div>
          
          {/* Stacked bar chart - now sorted by (profit - loss) descending */}
          {outcomeByChannelData.length > 0 && selectedOutcomes.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={outcomeByChannelData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                <XAxis type="number" stroke="#6e7681" fontSize={11} />
                <YAxis 
                  type="category" 
                  dataKey="channel" 
                  stroke="#6e7681" 
                  fontSize={11}
                  width={150}
                />
                <Tooltip content={<OutcomeDistributionTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: 20 }}
                  formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
                />
                {OUTCOME_TYPES.filter(o => selectedOutcomes.includes(o.key)).map(outcome => (
                  <Bar
                    key={outcome.key}
                    dataKey={outcome.key}
                    name={outcome.label}
                    fill={outcome.color}
                    stackId="outcomes"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              {selectedOutcomes.length === 0 
                ? 'Select at least one outcome type to display'
                : 'No trades to display'
              }
            </div>
          )}
        </ChartCard>
        {/* ==================== END OUTCOME DISTRIBUTION ==================== */}
      </div>

      {/* ==================== END CHANNEL COMPARISON ==================== */}

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Trades Table */}
      <div id="trades-table" className="chart-card mb-6">
        <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
          <BarChart3 className="w-4 h-4 text-accent-cyan" />
          <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Trade History</span>
          <span className="ml-auto text-xs text-gray-500">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredTrades.length)} of {filteredTrades.length} trades
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Trade ID</th>
                <th>Channel</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Entry</th>
                <th>TP</th>
                <th>SL</th>
                <th>P&L</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.map(trade => (
                <tr key={trade.id} className="transition-colors hover:bg-dark-tertiary/50">
                  <td className="text-accent-cyan">{trade.trade_id?.slice(0, 12) || '-'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: getChannelColor(trade.channel_id) }}
                      />
                      {trade.channel_name?.slice(0, 20) || '-'}
                    </div>
                  </td>
                  <td className="font-semibold">{trade.symbol || '-'}</td>
                  <td>
                    <span className={`badge ${trade.direction === 'buy' ? 'badge-success' : 'badge-danger'}`}>
                      {trade.direction?.toUpperCase() || '-'}
                    </span>
                  </td>
                  <td>{trade.order_type || '-'}</td>
                  <td>{trade.executed_entry_price?.toFixed(2) || trade.signal_entry_price?.toFixed(2) || '-'}</td>
                  <td>{trade.executed_tp_price?.toFixed(2) || '-'}</td>
                  <td>{trade.executed_sl_price?.toFixed(2) || trade.signal_sl_price?.toFixed(2) || '-'}</td>
                  <td className={trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {trade.profit_loss ? `$${trade.profit_loss.toFixed(2)}` : '-'}
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(trade)}`}>
                      {getStatusDisplay(trade)}
                    </span>
                  </td>
                  <td className="text-gray-500">
                    {trade.signal_time ? new Date(trade.signal_time).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-gray-500 py-8">
                    No trades found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Analysis Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Outcomes by Side" icon={Target}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={outcomeBySideData}>
              <XAxis dataKey="side" stroke="#6e7681" fontSize={11} />
              <YAxis stroke="#6e7681" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
              <Bar dataKey="profit" fill={COLORS.green} name="Profit" stackId="a" />
              <Bar dataKey="loss" fill={COLORS.red} name="Loss" stackId="a" />
              <Bar dataKey="breakeven" fill={COLORS.gray} name="Breakeven" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Performance by Hour" icon={Clock}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyChartData}>
              <XAxis dataKey="hour" stroke="#6e7681" fontSize={10} />
              <YAxis stroke="#6e7681" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {hourlyChartData.map((entry, index) => (
                  <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Day of Week Analysis" icon={Calendar}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dowChartData}>
              <XAxis dataKey="day" stroke="#6e7681" fontSize={11} />
              <YAxis stroke="#6e7681" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {dowChartData.map((entry, index) => (
                  <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rolling Win Rate (20 trades)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={
              closedTrades.slice().reverse().map((_, idx, arr) => {
                const window = arr.slice(Math.max(0, idx - 19), idx + 1)
                const wins = window.filter(t => t.outcome === 'profit').length
                return { trade: idx + 1, winRate: (wins / window.length * 100).toFixed(1) }
              })
            }>
              <XAxis dataKey="trade" stroke="#6e7681" fontSize={11} />
              <YAxis stroke="#6e7681" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
              <Line type="monotone" dataKey="winRate" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
