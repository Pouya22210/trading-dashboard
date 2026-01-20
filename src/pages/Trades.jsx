import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  Calendar, Filter, Download, Plus, Trash2, Search, X, Wifi, WifiOff,
  BarChart3, Clock, TrendingUp, Target, ChevronLeft, ChevronRight,
  CheckSquare, Square, ChevronDown, Globe
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
    color: '#39d5ff',  // cyan
    crossesMidnight: true 
  },
  { 
    key: 'tokyo', 
    label: 'Tokyo', 
    startHour: 0, 
    endHour: 9, 
    color: '#f85149',  // red
    crossesMidnight: false 
  },
  { 
    key: 'london', 
    label: 'London', 
    startHour: 8, 
    endHour: 17, 
    color: '#3fb950',  // green
    crossesMidnight: false 
  },
  { 
    key: 'newyork', 
    label: 'New York', 
    startHour: 13, 
    endHour: 22, 
    color: '#a371f7',  // purple
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
    <div className={`chart-card backdrop-blur-sm overflow-hidden ${className}`} style={{ willChange: 'transform' }}>
      <div className="flex items-center gap-3 px-3 sm:px-5 py-4 bg-gradient-to-r from-dark-tertiary/80 to-dark-secondary/60 border-b border-dark-border/50">
        <div className="p-1.5 rounded-md bg-accent-cyan/10 flex-shrink-0">
          <Icon className="w-4 h-4 text-accent-cyan" />
        </div>
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider truncate">{title}</span>
      </div>
      <div className="p-3 sm:p-5 overflow-x-auto">{children}</div>
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
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg border ${bgColor} ${textColor} text-sm font-medium shadow-lg z-50`}>
      {message}
    </div>
  )
}

// Custom tooltip for outcome distribution chart
function OutcomeDistributionTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  // Get full channel name from payload
  const fullName = payload[0]?.payload?.fullName || label

  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-2 font-semibold">{fullName}</p>
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

// Custom tooltip for market sessions chart
function MarketSessionsTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  const session = MARKET_SESSIONS.find(s => s.label === label)
  
  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl min-w-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <span 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: session?.color || '#6e7681' }}
        />
        <p className="text-white font-semibold">{label} Session</p>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {session?.crossesMidnight 
          ? `${session.startHour}:00 - ${session.endHour}:00 UTC (next day)`
          : `${session?.startHour}:00 - ${session?.endHour}:00 UTC`
        }
      </div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-300">{entry.name}:</span>
          <span className="text-white font-mono font-semibold">{entry.value}</span>
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

// ==================== Multi-Select Channel Filter Component ====================
function ChannelMultiSelect({ channelList, selectedChannelIds, onChange, channelColorMap }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Filter channels based on search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channelList
    const query = searchQuery.toLowerCase()
    return channelList.filter(ch => ch.name.toLowerCase().includes(query))
  }, [channelList, searchQuery])
  
  const toggleChannel = (channelId) => {
    if (selectedChannelIds.includes(channelId)) {
      onChange(selectedChannelIds.filter(id => id !== channelId))
    } else {
      onChange([...selectedChannelIds, channelId])
    }
  }
  
  const selectAll = () => {
    // Select all filtered channels
    const filteredIds = filteredChannels.map(ch => ch.id)
    const newSelection = [...new Set([...selectedChannelIds, ...filteredIds])]
    onChange(newSelection)
  }
  
  const deselectAll = () => {
    // Deselect all filtered channels
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
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => {
              setIsOpen(false)
              setSearchQuery('')
            }}
          />
          
          <div className="absolute z-20 mt-1 w-full min-w-[300px] max-h-[350px] bg-dark-secondary border border-dark-border rounded-lg shadow-xl flex flex-col">
            {/* Select/Deselect buttons */}
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
            
            {/* Search bar */}
            <div className="px-3 py-2 border-b border-dark-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 bg-dark-tertiary border border-dark-border rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-cyan/50"
                  onClick={(e) => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSearchQuery('')
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Channel list */}
            <div className="py-1 overflow-y-auto flex-1">
              {filteredChannels.map(channel => (
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
  const [sidebarOpen, setSidebarOpen] = useState(false) // Mobile sidebar state
  
  // Outcome filter for the new visualization
  const [selectedOutcomes, setSelectedOutcomes] = useState(
    OUTCOME_TYPES.map(o => o.key)
  )
  
  const [selectedChannelIds, setSelectedChannelIds] = useState([])
  
  // Gantt chart time range filter
  const [ganttTimeRange, setGanttTimeRange] = useState('all')
  
  // Logarithmic scale toggle for cumulative P&L
  const [useLogScale, setUseLogScale] = useState(false)
  
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

  // Build channel list from trades using channel_id
  const channelList = useMemo(() => {
    const channelMap = new Map()
    
    trades.forEach(trade => {
      const channelId = trade.channel_id
      if (channelId && !channelMap.has(channelId)) {
        const displayName = trade.channel_name || channelId
        channelMap.set(channelId, {
          id: channelId,
          name: displayName
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
  
  const getChannelName = useCallback((channelId) => {
    const channel = channelList.find(ch => ch.id === channelId)
    return channel?.name || 'Unknown'
  }, [channelList])

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
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

  const sortedFilteredTrades = useMemo(() => {
    return [...filteredTrades].sort((a, b) => {
      const isActiveOrPendingA = a.status === 'pending' || a.status === 'active'
      const isActiveOrPendingB = b.status === 'pending' || b.status === 'active'
      
      if (isActiveOrPendingA && !isActiveOrPendingB) return -1
      if (!isActiveOrPendingA && isActiveOrPendingB) return 1
      
      return new Date(b.signal_time) - new Date(a.signal_time)
    })
  }, [filteredTrades])

  // ==================== Market Sessions Analysis ====================
  const marketSessionsData = useMemo(() => {
    const sessionStats = {}
    
    MARKET_SESSIONS.forEach(session => {
      sessionStats[session.key] = {
        session: session.label,
        profit: 0,
        loss: 0,
        breakeven: 0,
        total: 0,
        color: session.color,
        startHour: session.startHour,
        endHour: session.endHour
      }
    })
    
    const getSessionForHour = (hour) => {
      const sessions = []
      
      MARKET_SESSIONS.forEach(session => {
        if (session.crossesMidnight) {
          if (hour >= session.startHour || hour < session.endHour) {
            sessions.push(session.key)
          }
        } else {
          if (hour >= session.startHour && hour < session.endHour) {
            sessions.push(session.key)
          }
        }
      })
      
      return sessions
    }
    
    filteredTrades
      .filter(t => t.status === 'closed' && t.signal_time)
      .forEach(trade => {
        const hour = new Date(trade.signal_time).getUTCHours()
        const sessions = getSessionForHour(hour)
        const outcome = trade.outcome || 'unknown'
        
        sessions.forEach(sessionKey => {
          if (sessionStats[sessionKey]) {
            sessionStats[sessionKey].total++
            
            if (outcome === 'profit') {
              sessionStats[sessionKey].profit++
            } else if (outcome === 'loss') {
              sessionStats[sessionKey].loss++
            } else if (outcome === 'breakeven') {
              sessionStats[sessionKey].breakeven++
            }
          }
        })
      })
    
    return MARKET_SESSIONS.map(session => ({
      ...sessionStats[session.key],
      winRate: sessionStats[session.key].total > 0 
        ? ((sessionStats[session.key].profit / sessionStats[session.key].total) * 100).toFixed(1)
        : '0.0'
    }))
  }, [filteredTrades])

  // Gantt chart data
  const ganttChartData = useMemo(() => {
    const now = new Date()
    let startDate = null
    
    switch (ganttTimeRange) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '1w':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '1m':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = null
    }
    
    const ganttFilteredTrades = filteredTrades.filter(trade => {
      if (!trade.signal_time) return false
      if (startDate && new Date(trade.signal_time) < startDate) return false
      return true
    })
    
    if (ganttFilteredTrades.length === 0) {
      return { channels: [], minDate: now, maxDate: now, trades: [] }
    }
    
    let minDate = new Date(ganttFilteredTrades[0].signal_time)
    let maxDate = new Date(ganttFilteredTrades[0].signal_time)
    
    const channelActivity = {}
    
    ganttFilteredTrades.forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const tradeDate = new Date(trade.signal_time)
      
      if (tradeDate < minDate) minDate = tradeDate
      if (tradeDate > maxDate) maxDate = tradeDate
      
      if (!channelActivity[channelId]) {
        channelActivity[channelId] = {
          channelId,
          channelName: getChannelName(channelId),
          trades: [],
          firstTrade: tradeDate,
          lastTrade: tradeDate,
          totalTrades: 0
        }
      }
      
      channelActivity[channelId].trades.push({
        date: tradeDate,
        outcome: trade.outcome,
        symbol: trade.symbol
      })
      channelActivity[channelId].totalTrades++
      
      if (tradeDate < channelActivity[channelId].firstTrade) {
        channelActivity[channelId].firstTrade = tradeDate
      }
      if (tradeDate > channelActivity[channelId].lastTrade) {
        channelActivity[channelId].lastTrade = tradeDate
      }
    })
    
    const channels = Object.values(channelActivity)
      .sort((a, b) => a.firstTrade - b.firstTrade)
    
    return {
      channels,
      minDate,
      maxDate,
      totalRange: maxDate.getTime() - minDate.getTime()
    }
  }, [filteredTrades, ganttTimeRange, getChannelName])

  // Calculate channel statistics
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
    
    Object.keys(stats).forEach(channelId => {
      const s = stats[channelId]
      s.avgPnL = s.totalTrades > 0 ? s.totalPnL / s.totalTrades : 0
      s.winRate = (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses) * 100) : 0
    })
    
    return stats
  }, [filteredTrades])

  // Cumulative P&L over time by channel
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
      const channelId = trade.channel_id || 'unknown'
      
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

  const outcomeByChannelData = useMemo(() => {
    const dataByChannel = {}
    
    filteredTrades.forEach(trade => {
      const channelId = trade.channel_id || 'unknown'
      const channelName = getChannelName(channelId)
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
  }, [filteredTrades, getChannelName])

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
  const totalPages = Math.ceil(sortedFilteredTrades.length / TRADES_PER_PAGE)
  const startIndex = (currentPage - 1) * TRADES_PER_PAGE
  const endIndex = startIndex + TRADES_PER_PAGE
  const paginatedTrades = sortedFilteredTrades.slice(startIndex, endIndex)

  // Calculate filtered stats
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

  function exportCSV() {
    const headers = ['Trade ID', 'Channel', 'Symbol', 'Side', 'Order Type', 'Entry', 'TP', 'SL', 'P&L', 'Status', 'Outcome', 'Time']
    const rows = sortedFilteredTrades.map(t => [
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

      {/* Left Sidebar - Sticky on desktop, slide-out on mobile */}
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

          {/* Stats Summary in Sidebar */}
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

      {/* Main Content Area - Improved scrolling */}
      <main className="flex-1 min-w-0 overflow-x-hidden" style={{ 
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'smooth'
      }}>
        {/* Mobile Filter Button - Floating */}
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
                      <td>
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: getChannelColor(trade.channel_id) }}
                          />
                          <span className="truncate max-w-[180px]" title={getChannelName(trade.channel_id)}>
                            {getChannelName(trade.channel_id)}
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
                  {sortedFilteredTrades.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center text-gray-500 py-8">
                        No trades found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>

          {/* CHANNEL COMPARISON SECTION */}
          <div className="mb-8">
            {/* Cumulative P&L Over Time */}
            <ChartCard title="Cumulative Profit/Loss by Channel Over Time" icon={TrendingUp} className="mb-6">
              {/* Log Scale Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-dark-border/50">
                <div className="text-sm text-gray-400">
                  Track each channel's cumulative performance over time
                </div>
                <button
                  onClick={() => setUseLogScale(!useLogScale)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    useLogScale 
                      ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30' 
                      : 'bg-dark-tertiary text-gray-400 border border-dark-border hover:border-accent-cyan/50'
                  }`}
                >
                  <span>{useLogScale ? '📊 Logarithmic Scale' : '📈 Linear Scale'}</span>
                </button>
              </div>
              
              {cumulativePnLData.length > 0 ? (
                <div className="w-full min-w-[300px]">
                  <ResponsiveContainer width="100%" height={800}>
                    <LineChart data={cumulativePnLData} margin={{ top: 20, right: 30, left: 50, bottom: 60 }}>
                    <XAxis 
                      dataKey="date" 
                      stroke="#6e7681" 
                      fontSize={11}
                      tickMargin={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      stroke="#6e7681" 
                      fontSize={11}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                      scale={useLogScale ? "log" : "linear"}
                      domain={useLogScale ? ['auto', 'auto'] : ['auto', 'auto']}
                      allowDataOverflow={false}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null
                        const hoveredItem = payload.find(p => p.value !== null && p.value !== undefined)
                        if (!hoveredItem) return null
                        
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
                    <Legend 
                      wrapperStyle={{ paddingTop: 20, paddingBottom: 10 }}
                      formatter={(value) => {
                        const name = getChannelName(value)
                        return <span className="text-gray-300 text-xs">{name.length > 20 ? name.slice(0, 20) + '...' : name}</span>
                      }}
                    />
                    {activeChannelIds.map((channelId) => (
                      <Line
                        key={channelId}
                        type="monotone"
                        dataKey={channelId}
                        name={channelId}
                        stroke={getChannelColor(channelId)}
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No closed trades with dates to display
                </div>
              )}
            </ChartCard>

            {/* Channel Activity Timeline (Gantt Chart) */}
            <ChartCard title="Channel Activity Timeline" icon={Calendar} className="mb-6">
              {/* Time Range Filter */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-sm text-gray-400">Time Range:</span>
                <div className="flex bg-dark-tertiary rounded-lg p-1">
                  {[
                    { key: '1d', label: '1D' },
                    { key: '1w', label: '1W' },
                    { key: '1m', label: '1M' },
                    { key: '1y', label: '1Y' },
                    { key: 'all', label: 'All' },
                  ].map(option => (
                    <button
                      key={option.key}
                      onClick={() => setGanttTimeRange(option.key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        ganttTimeRange === option.key
                          ? 'bg-accent-cyan text-dark-primary'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xs text-gray-500">
                  {ganttChartData.channels.length} channels active
                </span>
              </div>
              
              {/* Gantt Chart */}
              {ganttChartData.channels.length > 0 ? (
                <div className="relative overflow-x-auto">
                  {/* Timeline header */}
                  <div className="flex items-center mb-2 pl-[200px] min-w-[600px]">
                    <div className="flex-1 flex justify-between text-xs text-gray-500">
                      <span>{ganttChartData.minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                      <span>{ganttChartData.maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                    </div>
                  </div>
                  
                  {/* Channel rows */}
                  <div className="space-y-2 min-w-[600px]">
                    {ganttChartData.channels.map((channel, idx) => {
                      const startPercent = ganttChartData.totalRange > 0 
                        ? ((channel.firstTrade.getTime() - ganttChartData.minDate.getTime()) / ganttChartData.totalRange) * 100 
                        : 0
                      const widthPercent = ganttChartData.totalRange > 0 
                        ? ((channel.lastTrade.getTime() - channel.firstTrade.getTime()) / ganttChartData.totalRange) * 100 
                        : 100
                      const minWidth = Math.max(widthPercent, 1)
                      
                      return (
                        <div key={channel.channelId} className="flex items-center gap-3 group">
                          {/* Channel name */}
                          <div className="w-[200px] flex-shrink-0 flex items-center gap-2">
                            <span 
                              className="w-2 h-2 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: getChannelColor(channel.channelId) }}
                            />
                            <span className="text-sm text-gray-300 truncate" title={channel.channelName}>
                              {channel.channelName.length > 25 ? channel.channelName.slice(0, 25) + '...' : channel.channelName}
                            </span>
                          </div>
                          
                          {/* Timeline bar */}
                          <div className="flex-1 h-6 bg-dark-tertiary/50 rounded relative overflow-hidden">
                            <div
                              className="absolute h-full rounded transition-all group-hover:opacity-80"
                              style={{
                                left: `${startPercent}%`,
                                width: `${minWidth}%`,
                                backgroundColor: getChannelColor(channel.channelId),
                                minWidth: '4px'
                              }}
                              title={`${channel.totalTrades} trades from ${channel.firstTrade.toLocaleDateString()} to ${channel.lastTrade.toLocaleDateString()}`}
                            >
                              {/* Trade dots within the bar */}
                              {channel.trades.slice(0, 50).map((trade, tIdx) => {
                                const tradePercent = ganttChartData.totalRange > 0 && widthPercent > 5
                                  ? ((trade.date.getTime() - channel.firstTrade.getTime()) / (channel.lastTrade.getTime() - channel.firstTrade.getTime())) * 100
                                  : 50
                                return (
                                  <div
                                    key={tIdx}
                                    className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/30"
                                    style={{ left: `${Math.min(Math.max(tradePercent, 2), 98)}%` }}
                                  />
                                )
                              })}
                            </div>
                          </div>
                          
                          {/* Trade count */}
                          <div className="w-[60px] text-right text-xs text-gray-500">
                            {channel.totalTrades} <span className="hidden sm:inline">trades</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-dark-border/50 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <div className="w-8 h-2 bg-accent-cyan rounded" />
                      <span>Active period</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-white/50 rounded-full" />
                      <span>Individual trade</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No trades in selected time range
                </div>
              )}
            </ChartCard>

            {/* Channel Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <ChartCard title="Total P&L by Channel" icon={BarChart3}>
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

              <ChartCard title="Win Rate by Channel" icon={Target}>
                <div className="w-full min-w-[280px]">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={channelComparisonData} layout="vertical" margin={{ left: 10, right: 10 }} barSize={18}>
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
                </div>
              </ChartCard>
            </div>

            {/* Market Sessions Chart */}
            <ChartCard title="Performance by Market Session" icon={Globe} className="mb-6">
              <div className="mb-4 text-sm text-gray-400">
                Trade outcomes grouped by forex market sessions (based on signal time UTC)
              </div>
              {marketSessionsData.some(s => s.total > 0) ? (
                <div className="w-full min-w-[300px]">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={marketSessionsData} layout="vertical" margin={{ top: 10, right: 10, left: 60, bottom: 10 }} barSize={20}>
                    <XAxis 
                      type="number"
                      stroke="#6e7681" 
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <YAxis 
                      type="category"
                      dataKey="session" 
                      stroke="#6e7681" 
                      fontSize={12}
                      width={70}
                    />
                    <Tooltip content={<MarketSessionsTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: 10 }}
                      formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
                    />
                    <Bar dataKey="profit" name="Profit" fill={COLORS.green} stackId="outcomes" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="loss" name="Loss" fill={COLORS.red} stackId="outcomes" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="breakeven" name="Breakeven" fill={COLORS.gray} stackId="outcomes" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No closed trades to display
                </div>
              )}
              
              {/* Session Stats Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-dark-border/50">
                {marketSessionsData.map(session => {
                  const sessionColor = MARKET_SESSIONS.find(s => s.label === session.session)?.color
                  return (
                    <div 
                      key={session.session}
                      className="bg-gradient-to-br from-dark-tertiary/70 to-dark-secondary/50 rounded-xl p-4 border border-dark-border/30 hover:border-dark-border/60 transition-all"
                      style={{ borderLeftColor: sessionColor, borderLeftWidth: '3px' }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shadow-lg" 
                          style={{ backgroundColor: sessionColor, boxShadow: `0 0 8px ${sessionColor}40` }}
                        />
                        <span className="text-sm font-semibold text-white">{session.session}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Total</span>
                          <span className="text-white font-mono text-base font-semibold">{session.total}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Win Rate</span>
                          <span className="text-white font-mono text-base font-semibold">{session.winRate}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Wins</span>
                          <span className="text-green-400 font-mono text-base font-semibold">{session.profit}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Losses</span>
                          <span className="text-red-400 font-mono text-base font-semibold">{session.loss}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChartCard>

            {/* Outcome Distribution */}
            <ChartCard title="Outcome Distribution by Channel (sorted by Profit - Loss)" icon={Target} className="mb-6">
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
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
              
              {outcomeByChannelData.length > 0 && selectedOutcomes.length > 0 ? (
                <div className="w-full min-w-[300px]">
                  <ResponsiveContainer width="100%" height={Math.max(400, outcomeByChannelData.length * 32)}>
                    <BarChart 
                      data={outcomeByChannelData} 
                      layout="vertical" 
                      margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                      barSize={16}
                    >
                    <XAxis type="number" stroke="#6e7681" fontSize={11} />
                    <YAxis 
                      type="category" 
                      dataKey="fullName"
                      stroke="#6e7681" 
                      fontSize={10}
                      width={280}
                      interval={0}
                      tick={({ x, y, payload }) => (
                        <text 
                          x={x} 
                          y={y} 
                          dy={4} 
                          textAnchor="end" 
                          fill="#9ca3af" 
                          fontSize={10}
                        >
                          {payload.value.length > 45 ? payload.value.slice(0, 45) + '...' : payload.value}
                        </text>
                      )}
                    />
                    <Tooltip content={<OutcomeDistributionTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: 20 }}
                      formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
                    />
                    {OUTCOME_TYPES.filter(o => selectedOutcomes.includes(o.key)).map((outcome, index, arr) => (
                      <Bar
                        key={outcome.key}
                        dataKey={outcome.key}
                        name={outcome.label}
                        fill={outcome.color}
                        stackId="outcomes"
                        radius={index === arr.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  {selectedOutcomes.length === 0 
                    ? 'Select at least one outcome type to display'
                    : 'No trades to display'
                  }
                </div>
              )}
            </ChartCard>
          </div>

          {/* Analysis Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Outcomes by Side" icon={Target}>
              <div className="w-full min-w-[280px]">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={outcomeBySideData} barSize={40} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <XAxis dataKey="side" stroke="#6e7681" fontSize={11} tickMargin={8} />
                  <YAxis stroke="#6e7681" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  <Bar dataKey="profit" fill={COLORS.green} name="Profit" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="loss" fill={COLORS.red} name="Loss" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="breakeven" fill={COLORS.gray} name="Breakeven" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Performance by Hour" icon={Clock}>
              <div className="w-full min-w-[280px]">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hourlyChartData} barSize={12} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <XAxis dataKey="hour" stroke="#6e7681" fontSize={10} tickMargin={8} />
                  <YAxis stroke="#6e7681" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {hourlyChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Day of Week Analysis" icon={Calendar}>
              <div className="w-full min-w-[280px]">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dowChartData} barSize={32} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <XAxis dataKey="day" stroke="#6e7681" fontSize={11} tickMargin={8} />
                  <YAxis stroke="#6e7681" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {dowChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Rolling Win Rate (20 trades)" icon={TrendingUp}>
              <div className="w-full min-w-[280px]">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={
                  closedTrades.slice().reverse().map((_, idx, arr) => {
                    const window = arr.slice(Math.max(0, idx - 19), idx + 1)
                    const windowWins = window.filter(t => t.outcome === 'profit').length
                    const windowLosses = window.filter(t => t.outcome === 'loss').length
                    const totalWL = windowWins + windowLosses
                    return { trade: idx + 1, winRate: totalWL > 0 ? (windowWins / totalWL * 100).toFixed(1) : '0.0' }
                  })
                }>
                  <XAxis dataKey="trade" stroke="#6e7681" fontSize={11} />
                  <YAxis stroke="#6e7681" fontSize={11} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="winRate" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
      
          {/* Bottom spacing */}
          <div className="pb-8" />
        </div>
      </main>
    </div>
  )
}
