import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar, Filter, Download, Plus, Trash2, Search, X, Wifi, WifiOff,
  BarChart3, Clock, TrendingUp, Target, ChevronLeft, ChevronRight,
  CheckSquare, Square, ChevronDown, Globe, Eye, EyeOff
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

// ==================== MARKET SESSIONS DEFINITION ====================
// Times are in UTC
const MARKET_SESSIONS = [
  {
    key: 'sydney',
    label: 'Sydney',
    startHour: 22,
    endHour: 7,
    color: '#39d5ff', // cyan
    crossesMidnight: true
  },
  {
    key: 'tokyo',
    label: 'Tokyo',
    startHour: 0,
    endHour: 9,
    color: '#f85149', // red
    crossesMidnight: false
  },
  {
    key: 'london',
    label: 'London',
    startHour: 8,
    endHour: 17,
    color: '#3fb950', // green
    crossesMidnight: false
  },
  {
    key: 'newyork',
    label: 'New York',
    startHour: 13,
    endHour: 22,
    color: '#a371f7', // purple
    crossesMidnight: false
  },
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
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>Connecting...</span>
        </>
      )}
    </div>
  )
}

// Chart card wrapper component
function ChartCard({ title, icon: Icon, children, className = '', headerRight }) {
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

// Pagination component
function Pagination({ currentPage, totalPages, onPageChange }) {
  const getPageNumbers = () => {
    const delta = 2
    const range = []
    const rangeWithDots = []
    let l

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i)
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1)
        } else if (i - l !== 1) {
          rangeWithDots.push('...')
        }
      }
      rangeWithDots.push(i)
      l = i
    }

    return rangeWithDots
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
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
        <span className="hidden sm:inline">Prev</span>
      </button>

      <div className="flex items-center gap-1">
        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-500">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[36px] sm:min-w-[40px] h-9 sm:h-10 rounded-lg text-sm font-semibold transition-all ${
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
        <span className="hidden sm:inline">Next</span>
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
    <div className={`fixed top-20 right-4 z-50 ${bgColor} border rounded-lg px-4 py-3 shadow-lg max-w-sm animate-slide-in`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${textColor}`}>{message}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Outcome filter checkbox
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

// ==================== Multi-Select Channel Filter Component ====================
function ChannelMultiSelect({ channelList, selectedChannelIds, onChange, channelColorMap, showOrphaned, onToggleOrphaned }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter channels based on search query and orphaned status
  const filteredChannels = useMemo(() => {
    let filtered = channelList
    
    // Filter by orphaned status
    if (!showOrphaned) {
      filtered = filtered.filter(ch => !ch.isOrphaned)
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(ch => ch.name.toLowerCase().includes(query))
    }
    
    return filtered
  }, [channelList, searchQuery, showOrphaned])

  const toggleChannel = (channelId) => {
    if (selectedChannelIds.includes(channelId)) {
      onChange(selectedChannelIds.filter(id => id !== channelId))
    } else {
      onChange([...selectedChannelIds, channelId])
    }
  }

  const selectAll = () => {
    const filteredIds = filteredChannels.map(ch => ch.id)
    const newSelection = [...new Set([...selectedChannelIds, ...filteredIds])]
    onChange(newSelection)
  }

  const deselectAll = () => {
    const filteredIds = new Set(filteredChannels.map(ch => ch.id))
    onChange(selectedChannelIds.filter(id => !filteredIds.has(id)))
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
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-20 max-h-80 overflow-hidden flex flex-col">
            {/* Search and controls */}
            <div className="p-3 border-b border-dark-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search channels..."
                  className="w-full pl-9 pr-3 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:border-accent-cyan focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs text-accent-cyan hover:text-accent-blue transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <button
                  onClick={onToggleOrphaned}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {showOrphaned ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>{showOrphaned ? 'Hide' : 'Show'} Deleted</span>
                </button>
              </div>
            </div>

            {/* Channel list */}
            <div className="overflow-y-auto flex-1">
              {filteredChannels.map(channel => (
                <label
                  key={channel.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    selectedChannelIds.includes(channel.id)
                      ? 'bg-accent-cyan/20 border-l-2 border-accent-cyan'
                      : 'hover:bg-dark-tertiary/50'
                  } ${channel.isOrphaned ? 'opacity-60' : ''}`}
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
                  <span className={`text-sm truncate flex-1 ${
                    selectedChannelIds.includes(channel.id) ? 'text-white' : 'text-gray-400'
                  } ${channel.isOrphaned ? 'italic' : ''}`}>
                    {channel.name}
                  </span>
                  {channel.isOrphaned && (
                    <span className="text-xs text-red-400">🗑️</span>
                  )}
                </label>
              ))}

              {filteredChannels.length === 0 && (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">
                  {searchQuery ? 'No channels match your search' : 'No channels found'}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRows, setSelectedRows] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [toast, setToast] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Outcome filter
  const [selectedOutcomes, setSelectedOutcomes] = useState(
    OUTCOME_TYPES.map(o => o.key)
  )

  const [selectedChannelIds, setSelectedChannelIds] = useState([])
  const [ganttTimeRange, setGanttTimeRange] = useState('all')
  const [useLogScale, setUseLogScale] = useState(false)
  
  // ✅ NEW: Show/hide orphaned channels
  const [showOrphanedChannels, setShowOrphanedChannels] = useState(true)

  const [filters, setFilters] = useState({
    orderType: '',
    side: '',
    status: '',
    startDate: '',
    endDate: '',
  })

  const toggleOutcome = useCallback((outcomeKey) => {
    setSelectedOutcomes(prev => {
      if (prev.includes(outcomeKey)) {
        return prev.filter(k => k !== outcomeKey)
      } else {
        return [...prev, outcomeKey]
      }
    })
  }, [])

  const selectAllOutcomes = useCallback(() => {
    setSelectedOutcomes(OUTCOME_TYPES.map(o => o.key))
  }, [])

  const deselectAllOutcomes = useCallback(() => {
    setSelectedOutcomes([])
  }, [])

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

  const handleTradeDelete = useCallback((deletedTrade) => {
    setTrades(prev => prev.filter(trade => trade.id !== deletedTrade.id))

    setToast({
      message: `Trade removed: ${deletedTrade.trade_id?.slice(0, 8)}`,
      type: 'delete'
    })
  }, [])

  const handleStatusChange = useCallback((status, error) => {
    setConnectionStatus(status)
    if (error) {
      console.error('WebSocket error:', error)
    }
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const [tradesData, channelsData] = await Promise.all([
          fetchTrades(),  // No limit - will fetch all trades
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

  useEffect(() => {
    setCurrentPage(1)
  }, [filters, selectedChannelIds])

  // ✅ UPDATED: Build channel list using display_channel_name from view
  const channelList = useMemo(() => {
    const channelMap = new Map()

    trades.forEach(trade => {
      const channelId = trade.channel_id
      if (channelId && !channelMap.has(channelId)) {
        channelMap.set(channelId, {
          id: channelId,
          name: trade.display_channel_name || trade.channel_name || 'Unknown',  // ✅ Use display name from view
          telegramId: trade.current_telegram_id,
          isOrphaned: trade.is_orphaned_channel || false,  // ✅ From view
          isActive: trade.channel_is_active
        })
      }
    })

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

  const getChannelColor = useCallback((channelId) => {
    return channelColorMap[channelId] || '#6e7681'
  }, [channelColorMap])

  // ✅ UPDATED: Get channel name from channelList (which uses display_channel_name)
  const getChannelName = useCallback((channelId) => {
    const channel = channelList.find(ch => ch.id === channelId)
    return channel?.name || 'Unknown'
  }, [channelList])

  // ✅ UPDATED: Filter trades including orphaned channel filter
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // Filter orphaned channels
      if (!showOrphanedChannels && trade.is_orphaned_channel) {
        return false
      }
      
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
  }, [trades, selectedChannelIds, filters, showOrphanedChannels])

  const sortedFilteredTrades = useMemo(() => {
    return [...filteredTrades].sort((a, b) => {
      const isActiveOrPendingA = a.status === 'pending' || a.status === 'active'
      const isActiveOrPendingB = b.status === 'pending' || b.status === 'active'
      
      if (isActiveOrPendingA && !isActiveOrPendingB) return -1
      if (!isActiveOrPendingA && isActiveOrPendingB) return 1
      
      return new Date(b.signal_time || 0) - new Date(a.signal_time || 0)
    })
  }, [filteredTrades])

  // ✅ UPDATED: Channel stats using channel_id and display_channel_name
  const channelStats = useMemo(() => {
    const stats = {}
    
    filteredTrades.forEach(trade => {
      const channelId = trade.channel_id
      if (!channelId) return  // Skip trades without channel_id
      
      if (!stats[channelId]) {
        stats[channelId] = {
          channelId,
          channelName: trade.display_channel_name || trade.channel_name || 'Unknown',  // ✅ Use display name
          isOrphaned: trade.is_orphaned_channel || false,
          totalPnL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0,
        }
      }
      
      stats[channelId].totalTrades++
      if (trade.status === 'closed') {
        stats[channelId].totalPnL += trade.profit_loss || 0
        if (trade.outcome === 'profit') stats[channelId].wins++
        if (trade.outcome === 'loss') stats[channelId].losses++
      }
    })
    
    Object.values(stats).forEach(s => {
      s.avgPnL = s.totalTrades > 0 ? s.totalPnL / s.totalTrades : 0
      s.winRate = (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses) * 100) : 0
    })

    return stats
  }, [filteredTrades])

  // ✅ UPDATED: Cumulative P&L using channel_id
  const cumulativePnLData = useMemo(() => {
    const closedTrades = filteredTrades
      .filter(t => t.status === 'closed' && t.close_time)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time))

    if (closedTrades.length === 0) return []

    const dataByDate = {}
    const runningTotals = {}

    closedTrades.forEach(trade => {
      const date = new Date(trade.close_time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      const channelId = trade.channel_id
      
      if (!channelId) return  // Skip if no channel_id

      if (!runningTotals[channelId]) {
        runningTotals[channelId] = 0
      }
      runningTotals[channelId] += trade.profit_loss || 0

      if (!dataByDate[date]) {
        dataByDate[date] = { date }
      }

      dataByDate[date][channelId] = runningTotals[channelId]
    })

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

  const activeChannelIds = useMemo(() => {
    const ids = new Set()
    filteredTrades.forEach(trade => {
      if (trade.channel_id) ids.add(trade.channel_id)
    })
    return Array.from(ids)
  }, [filteredTrades])

  // ✅ UPDATED: Outcome by channel using channel_id
  const outcomeByChannelData = useMemo(() => {
    const dataByChannel = {}

    filteredTrades.forEach(trade => {
      const channelId = trade.channel_id
      if (!channelId) return
      
      const channelName = trade.display_channel_name || trade.channel_name || 'Unknown'  // ✅ Use display name
      let outcome = trade.outcome || 'unknown'

      if (!outcome || outcome === 'null') {
        outcome = 'unknown'
      }

      if (!dataByChannel[channelId]) {
        dataByChannel[channelId] = {
          channelId,
          channel: channelName,
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

    return Object.values(dataByChannel)
      .map(item => ({
        ...item,
        sortScore: item.profit - item.loss,
        channel: item.channel.length > 25 ? item.channel.slice(0, 25) + '...' : item.channel
      }))
      .sort((a, b) => b.sortScore - a.sortScore)
  }, [filteredTrades])

  // ✅ UPDATED: Channel comparison using channel_id
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

  // Pagination
  const totalPages = Math.ceil(sortedFilteredTrades.length / TRADES_PER_PAGE)
  const startIndex = (currentPage - 1) * TRADES_PER_PAGE
  const endIndex = startIndex + TRADES_PER_PAGE
  const paginatedTrades = sortedFilteredTrades.slice(startIndex, endIndex)

  // Calculate stats
  const closedTrades = filteredTrades.filter(t => t.status === 'closed')
  const wins = closedTrades.filter(t => t.outcome === 'profit').length
  const losses = closedTrades.filter(t => t.outcome === 'loss').length
  const netPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100).toFixed(1) : 0

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
    setSelectedChannelIds([])
    setCurrentPage(1)
  }

  function handlePageChange(page) {
    setCurrentPage(page)
    document.getElementById('trades-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ✅ UPDATED: Export CSV with display_channel_name
  function exportCSV() {
    const headers = ['Trade ID', 'Channel', 'Symbol', 'Side', 'Order Type', 'Entry', 'TP', 'SL', 'P&L', 'Status', 'Outcome', 'Time']
    const rows = sortedFilteredTrades.map(t => [
      t.trade_id, 
      t.display_channel_name || t.channel_name,  // ✅ Use display name
      t.symbol, 
      t.direction, 
      t.order_type,
      t.executed_entry_price, 
      t.executed_tp_price, 
      t.executed_sl_price,
      t.profit_loss, 
      t.status, 
      t.outcome, 
      t.signal_time
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  function getTradeEffectiveStatus(trade) {
    if (trade.order_type === 'STOP' && !trade.fill_time && trade.status !== 'closed' && trade.status !== 'canceled') {
      return 'pending'
    }
    return trade.status
  }

  function getStatusBadgeClass(trade) {
    const effectiveStatus = getTradeEffectiveStatus(trade)

    if (effectiveStatus === 'closed') {
      if (trade.outcome === 'profit') return 'badge-success'
      if (trade.outcome === 'loss') return 'badge-danger'
      if (trade.outcome === 'breakeven') return 'badge-neutral'
      return 'badge-neutral'
    }
    if (effectiveStatus === 'active') return 'badge-warning'
    if (effectiveStatus === 'pending') return 'badge-warning'
    if (effectiveStatus === 'canceled') return 'badge-neutral'
    if (effectiveStatus === 'blocked') return 'badge-neutral'
    return 'badge-neutral'
  }

  function getStatusDisplay(trade) {
    const effectiveStatus = getTradeEffectiveStatus(trade)

    if (effectiveStatus === 'closed' && trade.outcome) {
      return `${effectiveStatus} (${trade.outcome})`
    }
    if (effectiveStatus === 'pending' && trade.order_type) {
      return `pending (${trade.order_type})`
    }
    return effectiveStatus || '-'
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-gray-500">Loading trades...</div>
  }

  return (
    <div className="flex min-h-screen relative max-w-full">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside className={`
        fixed lg:sticky
        top-0
        left-0
        h-screen
        w-80 lg:w-72
        flex-shrink-0
        bg-dark-secondary border-r border-dark-border
        overflow-y-auto overflow-x-hidden
        transition-transform duration-300 ease-in-out
        z-40
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-5">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Trade History</h1>
              <p className="text-gray-500 text-xs mt-1">Filter and analyze trades</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 hover:bg-dark-tertiary rounded"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Connection Status */}
          <div className="mb-6">
            <ConnectionStatus status={connectionStatus} />
          </div>

          {/* Filters */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <Calendar className="w-3 h-3 text-accent-cyan" /> Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full"
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
                className="w-full"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <Filter className="w-3 h-3 text-accent-cyan" /> Channels
              </label>
              {/* ✅ UPDATED: Added showOrphaned props */}
              <ChannelMultiSelect
                channelList={channelList}
                selectedChannelIds={selectedChannelIds}
                onChange={setSelectedChannelIds}
                channelColorMap={channelColorMap}
                showOrphaned={showOrphanedChannels}
                onToggleOrphaned={() => setShowOrphanedChannels(!showOrphanedChannels)}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Order Type
              </label>
              <select
                value={filters.orderType}
                onChange={e => setFilters({ ...filters, orderType: e.target.value })}
                className="w-full"
              >
                <option value="">All Types</option>
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
                <option value="STOP">Stop</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Side
              </label>
              <select
                value={filters.side}
                onChange={e => setFilters({ ...filters, side: e.target.value })}
                className="w-full"
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
                className="w-full"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <button onClick={clearFilters} className="btn-secondary w-full flex items-center justify-center gap-2 hover:bg-dark-tertiary transition-colors">
              <X className="w-4 h-4" /> Clear Filters
            </button>
          </div>

          {/* Stats Summary */}
          <div className="space-y-3 mb-6 pt-4 border-t border-dark-border">
            <div className="bg-dark-tertiary/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Filtered Trades</div>
              <div className="text-2xl font-bold font-mono text-white">{filteredTrades.length}</div>
            </div>
            <div className="bg-dark-tertiary/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net P&L</div>
              <div className={`text-2xl font-bold font-mono ${netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)}
              </div>
            </div>
            <div className="bg-dark-tertiary/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Win Rate</div>
              <div className="text-2xl font-bold font-mono text-white">{winRate}%</div>
            </div>
            <div className="bg-dark-tertiary/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">W / L</div>
              <div className="text-xl font-bold font-mono">
                <span className="text-green-400">{wins}</span>
                <span className="text-gray-600 mx-1">/</span>
                <span className="text-red-400">{losses}</span>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button onClick={exportCSV} className="btn-secondary w-full flex items-center justify-center gap-2 px-4 py-2.5 hover:bg-dark-tertiary transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden" style={{
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'smooth'
      }}>
        {/* Mobile Filter Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed bottom-6 right-6 z-30 p-4 bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary rounded-full shadow-xl hover:shadow-2xl transition-all"
        >
          <Filter className="w-6 h-6" />
        </button>

        <div className="p-4 sm:p-6 lg:p-8 max-w-full">
          {/* Trades Table */}
          <div id="trades-table" className="chart-card mb-8 overflow-hidden">
            <div className="flex items-center gap-3 px-3 sm:px-5 py-4 bg-gradient-to-r from-dark-tertiary/80 to-dark-secondary/60 border-b border-dark-border/50">
              <div className="p-1.5 rounded-md bg-accent-cyan/10">
                <BarChart3 className="w-4 h-4 text-accent-cyan" />
              </div>
              <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Trade History</span>
              <span className="ml-auto text-xs text-gray-500 bg-dark-tertiary/50 px-2 sm:px-3 py-1 rounded-full">
                <span className="hidden sm:inline">Showing </span>{startIndex + 1}-{Math.min(endIndex, sortedFilteredTrades.length)} of {sortedFilteredTrades.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="min-w-[150px]">Channel</th>
                    <th className="min-w-[80px]">Symbol</th>
                    <th className="min-w-[70px]">Side</th>
                    <th className="min-w-[80px]">Type</th>
                    <th className="min-w-[80px]">Entry</th>
                    <th className="min-w-[70px]">TP</th>
                    <th className="min-w-[70px]">SL</th>
                    <th className="min-w-[80px]">P&L</th>
                    <th className="min-w-[120px]">Status</th>
                    <th className="min-w-[150px]">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.map(trade => (
                    <tr key={trade.id} className="transition-colors hover:bg-dark-tertiary/50">
                      {/* ✅ UPDATED: Display with orphaned indicator */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getChannelColor(trade.channel_id) }}
                          />
                          <span 
                            className={`truncate max-w-[180px] ${
                              trade.is_orphaned_channel ? 'text-gray-500 italic' : ''
                            }`} 
                            title={trade.display_channel_name || trade.channel_name}
                          >
                            {trade.display_channel_name || trade.channel_name || 'Unknown'}
                          </span>
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
                      <td className="text-gray-500 text-xs sm:text-sm">
                        {trade.signal_time ? new Date(trade.signal_time).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>

          {/* Charts and analytics would continue here... */}
          {/* I'll include the key chart sections that use channel data */}

          {/* Channel Performance Chart */}
          <ChartCard title="Total P&L by Channel" icon={BarChart3} className="mb-6">
            <div className="w-full min-w-[280px]">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={channelComparisonData} layout="vertical" margin={{ left: 10, right: 10 }} barSize={18}>
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
            </div>
          </ChartCard>

          {/* Cumulative P&L Chart */}
          <ChartCard title="Cumulative P&L Over Time" icon={TrendingUp} className="mb-6">
            <div className="w-full min-w-[280px]">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={cumulativePnLData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="date" stroke="#6e7681" fontSize={10} />
                  <YAxis stroke="#6e7681" fontSize={10} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                    formatter={(value) => `$${value?.toFixed(2) || 0}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {activeChannelIds.map((channelId, index) => (
                    <Line
                      key={channelId}
                      type="monotone"
                      dataKey={channelId}
                      stroke={getChannelColor(channelId)}
                      strokeWidth={2}
                      dot={false}
                      name={getChannelName(channelId)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Outcome by Channel Chart */}
          <ChartCard title="Outcome by Channel" icon={Target} className="mb-6">
            <div className="w-full min-w-[280px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={outcomeByChannelData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" stroke="#6e7681" fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="channel"
                    stroke="#6e7681"
                    fontSize={11}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="profit" stackId="a" fill={COLORS.green} name="Profit" />
                  <Bar dataKey="loss" stackId="a" fill={COLORS.red} name="Loss" />
                  <Bar dataKey="breakeven" stackId="a" fill={COLORS.gray} name="Breakeven" />
                  <Bar dataKey="canceled" stackId="a" fill={COLORS.purple} name="Canceled" />
                  <Bar dataKey="blocked" stackId="a" fill={COLORS.pink} name="Blocked" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

        </div>
      </main>
    </div>
  )
}
