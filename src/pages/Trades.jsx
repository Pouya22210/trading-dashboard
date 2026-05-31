import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  Calendar, Filter, Download, Plus, Trash2, Search, X, WifiOff,
  BarChart3, Clock, TrendingUp, TrendingDown, Target, ChevronLeft, ChevronRight,
  CheckSquare, Square, ChevronDown, Globe, Eye, EyeOff,
  Hash, DollarSign, Percent, AlertTriangle, LayoutGrid, CalendarDays, CandlestickChart
} from 'lucide-react'

import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Area,
  AreaChart, ReferenceLine, ReferenceDot, CartesianGrid
} from 'recharts'

import { subscribeToTrades } from '../lib/supabase'
import {
  fetchTradesPage,
  fetchTradesAnalytics,
  fetchDailyProfitCalendar,
  fetchMaxDrawdown,
  fetchTradeMarkers,
} from '../lib/queries'
import { fetchCandles, hasCandleProvider } from '../lib/priceData'
import TradePriceChart from '../components/TradePriceChart'


// Color palette for channels
const CHANNEL_COLORS = [
  '#58a6ff', '#ADFF2F', '#f85149', '#a371f7', '#39d5ff',
  '#f0883e', '#db61a2', '#7ee787', '#ffa657', '#79c0ff',
]

const COLORS = {
  green:  '#ADFF2F',
  red:    '#f85149',
  blue:   '#58a6ff',
  cyan:   '#39d5ff',
  purple: '#a371f7',
  orange: '#f0883e',
  pink:   '#db61a2',
  gray:   '#6e7681',
  yellow: '#d29922',
}

const OUTCOME_TYPES = [
  { key: 'profit',    label: 'Profit',       color: COLORS.green },
  { key: 'loss',      label: 'Loss',         color: COLORS.red },
  { key: 'breakeven', label: 'Breakeven',    color: COLORS.gray },
  { key: 'manual',    label: 'Manual',       color: COLORS.orange },
  { key: 'canceled',  label: 'Canceled',     color: COLORS.cyan },
  { key: 'blocked',   label: 'Blocked',      color: COLORS.pink },
  { key: 'unknown',   label: 'Unknown/Null', color: COLORS.yellow },
]

const WEEKDAYS = [
  { key: 0, label: 'Sun', short: 'S' },
  { key: 1, label: 'Mon', short: 'M' },
  { key: 2, label: 'Tue', short: 'T' },
  { key: 3, label: 'Wed', short: 'W' },
  { key: 4, label: 'Thu', short: 'T' },
  { key: 5, label: 'Fri', short: 'F' },
  { key: 6, label: 'Sat', short: 'S' },
]

const MARKET_SESSIONS = [
  { key: 'sydney',  label: 'Sydney',   startHour: 22, endHour: 7,  color: '#39d5ff', crossesMidnight: true  },
  { key: 'tokyo',   label: 'Tokyo',    startHour: 0,  endHour: 9,  color: '#f85149', crossesMidnight: false },
  { key: 'london',  label: 'London',   startHour: 8,  endHour: 17, color: '#ADFF2F', crossesMidnight: false },
  { key: 'newyork', label: 'New York', startHour: 13, endHour: 22, color: '#a371f7', crossesMidnight: false },
]

const SESSION_KEY_TO_LABEL = {
  sydney: 'Sydney', tokyo: 'Tokyo', london: 'London', newyork: 'New York',
}

const TRADES_PER_PAGE = 10


// Returns all currently active forex trading sessions, ordered by liquidity.
function getActiveTradingSessions() {
  const now = new Date()
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const within = (start, end) => {
    if (start <= end) return utcMins >= start && utcMins < end
    return utcMins >= start || utcMins < end
  }
  const active = []
  if (within(13 * 60, 22 * 60)) active.push({ name: 'New York', country: 'us' })
  if (within(8 * 60, 17 * 60))  active.push({ name: 'London',   country: 'gb' })
  if (within(0,        9 * 60)) active.push({ name: 'Tokyo',    country: 'jp' })
  if (within(22 * 60,  7 * 60)) active.push({ name: 'Sydney',   country: 'au' })
  return active
}

function CountryFlagCircle({ country, size = 16, title }) {
  const px = `${size}px`
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        borderRadius: '9999px',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.18), inset 0 0 0 1px rgba(0,0,0,0.25)',
        backgroundImage: `url(https://flagcdn.com/w40/${country}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  )
}

function ConnectionStatus({ status }) {
  const isConnected = status === 'SUBSCRIBED'
  const [sessions, setSessions] = useState(getActiveTradingSessions())

  useEffect(() => {
    const tick = () => setSessions(getActiveTradingSessions())
    const timer = setInterval(tick, 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const titleText = isConnected
    ? `Active session${sessions.length > 1 ? 's' : ''}: ${sessions.map(s => s.name).join(' + ')}`
    : (status || 'Connecting...')

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium flex-wrap"
      style={{
        background: 'transparent',
        borderRadius: '9999px',
        boxShadow: 'none',
        color: isConnected ? 'var(--accent-green)' : 'var(--orange)',
      }}
      title={titleText}
    >
      {isConnected ? (
        <>
          {sessions.map((s, i) => (
            <React.Fragment key={s.name}>
              {i > 0 && <span className="text-gray-600">+</span>}
              <span className="inline-flex items-center gap-1.5">
                <CountryFlagCircle country={s.country} size={14} title={s.name} />
                <span style={{ letterSpacing: '0.02em' }}>{s.name}</span>
              </span>
            </React.Fragment>
          ))}
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


function ChartCard({ title, icon: Icon, children, className = '', bodyClassName = 'p-3 sm:p-5' }) {
  return (
    <div className={`chart-card overflow-hidden ${className}`} style={{ willChange: 'transform' }}>
      <div
        className="flex items-center gap-3 px-3 sm:px-5 py-4"
        style={{
          background: 'var(--neu-bg)',
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.35), inset 0 -2px 0 rgba(255,255,255,0.02)',
        }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: '32px', height: '32px', borderRadius: '10px',
            background: 'var(--neu-bg)', boxShadow: 'var(--neu-pressed-sm)',
          }}
        >
          <Icon className="w-4 h-4 text-accent-cyan" />
        </div>
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider truncate">{title}</span>
      </div>
      <div className={`${bodyClassName} overflow-x-auto`}>{children}</div>
    </div>
  )
}


function Pagination({ currentPage, totalPages, onPageChange }) {
  const getPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 5
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentPage - 1)
      let end   = Math.min(totalPages - 1, currentPage + 1)
      if (currentPage <= 3) end = 4
      if (currentPage >= totalPages - 2) start = totalPages - 3
      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')
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
        className="timeline-page-btn"
      >
        Prev
      </button>
      <div className="flex items-center gap-2">
        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-500">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`timeline-page-btn ${currentPage === page ? 'active' : ''}`}
            >
              {page}
            </button>
          )
        ))}
      </div>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="timeline-page-btn"
      >
        Next
      </button>
    </div>
  )
}


function Toast({ message, type, onClose }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), 3000)
    return () => clearTimeout(timer)
  }, [message])

  const textColor = type === 'insert' ? '#ADFF2F' :
                    type === 'update' ? 'var(--blue)' :
                    'var(--red)'

  return (
    <div
      className="fixed bottom-4 right-4 px-4 py-3 text-sm font-medium z-50"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '14px',
        boxShadow: 'var(--neu-raised-md)',
        color: textColor,
      }}
    >
      {message}
    </div>
  )
}


// ---- Skeleton placeholders used while the trade table page is loading ----

function SkeletonBlock({ width = '100%', height = 12 }) {
  return (
    <span
      className="skeleton-shimmer inline-block align-middle"
      style={{ width, height, borderRadius: '4px' }}
    />
  )
}

function SkeletonTableRow() {
  return (
    <tr>
      <td><SkeletonBlock width="80%" /></td>
      <td><SkeletonBlock width="55%" /></td>
      <td><SkeletonBlock width="40%" /></td>
      <td><SkeletonBlock width="55%" /></td>
      <td><SkeletonBlock width="60%" /></td>
      <td><SkeletonBlock width="55%" /></td>
      <td><SkeletonBlock width="55%" /></td>
      <td><SkeletonBlock width="60%" /></td>
      <td><SkeletonBlock width="70%" /></td>
      <td><SkeletonBlock width="85%" /></td>
    </tr>
  )
}

function SkeletonMobileCard() {
  return (
    <div
      className="p-3"
      style={{ background: 'var(--card-flat)', borderRadius: '14px', boxShadow: 'none' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <SkeletonBlock width={32} height={14} />
          <SkeletonBlock width="60%" height={12} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <SkeletonBlock width={44} height={10} />
          <SkeletonBlock width={34} height={9} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2.5">
        <SkeletonBlock width="100%" height={28} />
        <SkeletonBlock width="100%" height={28} />
        <SkeletonBlock width="100%" height={28} />
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width="20%" height={10} />
      </div>
    </div>
  )
}


function OutcomeDistributionTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const fullName = payload[0]?.payload?.fullName || label
  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-2 font-semibold">{fullName}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-300">{entry.name}:</span>
          <span className="text-white font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}


function MarketSessionsTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const session = MARKET_SESSIONS.find(s => s.label === label)
  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 shadow-xl min-w-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: session?.color || '#6e7681' }} />
        <p className="text-white font-semibold">{label} Session</p>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {session?.crossesMidnight
          ? `${session.startHour}:00 - ${session.endHour}:00 UTC (next day)`
          : `${session?.startHour}:00 - ${session?.endHour}:00 UTC`}
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


function OutcomeCheckbox({ outcome, checked, onChange }) {
  return (
    <label
      className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg cursor-pointer transition-all ${
        checked
          ? 'bg-dark-tertiary border border-dark-border'
          : 'bg-dark-secondary/50 border border-transparent hover:border-dark-border'
      }`}
      style={checked ? { boxShadow: `inset 0 -2px 0 ${outcome.color}` } : undefined}
    >
      <input type="checkbox" checked={checked} onChange={() => onChange(outcome.key)} className="hidden" />
      {checked ? (
        <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: outcome.color }} />
      ) : (
        <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
      )}
      <span className={`text-xs sm:text-sm ${checked ? 'text-white' : 'text-gray-500'}`}>
        {outcome.label}
      </span>
    </label>
  )
}


function ChannelMultiSelect({ channelList, selectedChannelIds, onChange, channelColorMap, showOrphaned, onToggleOrphaned }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredChannels = useMemo(() => {
    let filtered = channelList
    if (!showOrphaned) {
      filtered = filtered.filter(ch => !ch.isOrphaned)
    }
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
          <div
            className="fixed inset-0 z-10"
            onClick={() => { setIsOpen(false); setSearchQuery('') }}
          />
          <div className="absolute z-20 mt-1 w-full min-w-[300px] max-h-[350px] bg-dark-secondary border border-dark-border rounded-lg shadow-xl flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-border bg-dark-tertiary/50">
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-accent-cyan hover:text-accent-blue transition-colors">
                  Select All
                </button>
                <span className="text-gray-600">|</span>
                <button onClick={deselectAll} className="text-xs text-accent-cyan hover:text-accent-blue transition-colors">
                  Deselect All
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

            <div className="px-3 py-2 border-b border-dark-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full flat-input pl-8 pr-8 py-1.5 border border-dark-border rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-cyan/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSearchQuery('') }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

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


// =====================================================================
// Trades page — server-driven via RPCs
// =====================================================================
export default function Trades() {
  // ---------- UI state ----------
  const [currentPage, setCurrentPage] = useState(1)
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING')
  const [toast, setToast] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [selectedOutcomes, setSelectedOutcomes] = useState(OUTCOME_TYPES.map(o => o.key))

  const [searchParams] = useSearchParams()
  const [selectedChannelIds, setSelectedChannelIds] = useState(() => {
    const ch = searchParams.get('channel')
    return ch ? [ch] : []
  })

  useEffect(() => {
    const ch = searchParams.get('channel')
    if (ch) setSelectedChannelIds([ch])
  }, [searchParams])

  const [ganttTimeRange, setGanttTimeRange] = useState('all')
  const [ganttPage, setGanttPage] = useState(1)
  const [outcomePage, setOutcomePage] = useState(1)
  const [activeTab, setActiveTab] = useState('trades')

  // ---------- Price chart (MT5-style) tab state ----------
  const [chartMarkers, setChartMarkers]   = useState([])
  const [chartMarkersLoading, setChartMarkersLoading] = useState(false)
  const [chartSymbol, setChartSymbol]     = useState('')
  const [chartTimeframe, setChartTimeframe] = useState('1h')
  const [chartCandles, setChartCandles]   = useState([])
  const [chartCandlesLoading, setChartCandlesLoading] = useState(false)
  const [chartCandleNote, setChartCandleNote] = useState(null)
  const [chartView, setChartView]         = useState(null) // visible {t0,t1}, reported by the chart

  const [dailyProfitMonth, setDailyProfitMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const [showOrphanedChannels, setShowOrphanedChannels] = useState(true)
  const [selectedWeekdays, setSelectedWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])

  const [filters, setFilters] = useState({
    orderType: '',
    side:      '',
    status:    '',
    startDate: '',
    endDate:   '',
  })

  // ---------- Data state ----------
  const [analytics,    setAnalytics]    = useState(null)
  const [pageData,     setPageData]     = useState({ total: 0, rows: [] })
  const [dailyCalendar, setDailyCalendar] = useState({})
  const [maxDrawdown,  setMaxDrawdown]  = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [pageLoading,  setPageLoading]  = useState(false) // toggled while paginating

  // ---------- Query filter envelope sent to RPCs ----------
  const queryFilters = useMemo(() => ({
    startDate:    filters.startDate || null,
    endDate:      filters.endDate   || null,
    channelIds:   selectedChannelIds,
    showOrphaned: showOrphanedChannels,
    status:       filters.status    || null,
    direction:    filters.side      || null,
    orderType:    filters.orderType || null,
    weekdays:     selectedWeekdays,
    excludeManualCancel: false,
  }), [filters, selectedChannelIds, showOrphanedChannels, selectedWeekdays])

  const filterKey = useMemo(() => JSON.stringify(queryFilters), [queryFilters])

  // ---------- Outcome filter callbacks ----------
  const toggleOutcome = useCallback((outcomeKey) => {
    setSelectedOutcomes(prev => prev.includes(outcomeKey)
      ? prev.filter(k => k !== outcomeKey)
      : [...prev, outcomeKey])
  }, [])

  const selectAllOutcomes   = useCallback(() => setSelectedOutcomes(OUTCOME_TYPES.map(o => o.key)), [])
  const deselectAllOutcomes = useCallback(() => setSelectedOutcomes([]), [])

  // ---------- Reset to page 1 whenever the filter envelope changes ----------
  useEffect(() => {
    setCurrentPage(1)
    setOutcomePage(1)
    setGanttPage(1)
  }, [filterKey])

  // ---------- Analytics + drawdown fetch (per filter set) ----------
  // These don't change when the user just paginates the table, so they're
  // scoped to filterKey only — no wasted RPCs on page navigation.
  useEffect(() => {
    let canceled = false
    async function load() {
      try {
        const [a, dd] = await Promise.all([
          fetchTradesAnalytics(queryFilters),
          fetchMaxDrawdown(queryFilters),
        ])
        if (!canceled) {
          setAnalytics(a)
          setMaxDrawdown(dd)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to load trades analytics:', err)
        if (!canceled) setLoading(false)
      }
    }
    load()
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  // ---------- Trade table page fetch ----------
  // Toggles pageLoading so the table can render skeleton rows during pagination
  // (a separate signal from the full-page `loading` spinner used on first mount).
  useEffect(() => {
    let canceled = false
    setPageLoading(true)
    fetchTradesPage(queryFilters, {
      limit:  TRADES_PER_PAGE,
      offset: (currentPage - 1) * TRADES_PER_PAGE,
    })
      .then(p => { if (!canceled) setPageData(p) })
      .catch(err => console.error('Failed to load trades page:', err))
      .finally(() => { if (!canceled) setPageLoading(false) })
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, currentPage])

  // ---------- Calendar fetch (full history for the filter set) ----------
  // We fetch all months at once so the UI's prev/next month navigation works
  // without round-trips. Cheap: one row per trading day.
  useEffect(() => {
    let canceled = false
    fetchDailyProfitCalendar(queryFilters)
      .then(d => { if (!canceled) setDailyCalendar(d) })
      .catch(err => console.error('Failed to load calendar:', err))
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  // ---------- Price-chart markers fetch (only while the chart tab is open) ----------
  // Pulls raw per-trade entry/exit points for the current filter set. Gated on
  // the active tab so the heavier raw-row fetch never runs for users who don't
  // open the chart.
  useEffect(() => {
    if (activeTab !== 'chart') return
    let canceled = false
    setChartMarkersLoading(true)
    fetchTradeMarkers(queryFilters)
      .then(m => { if (!canceled) setChartMarkers(m) })
      .catch(err => { console.error('Failed to load chart markers:', err); if (!canceled) setChartMarkers([]) })
      .finally(() => { if (!canceled) setChartMarkersLoading(false) })
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, activeTab])

  // ---------- Realtime: invalidate and refetch (debounced) ----------
  // The realtime subscription must be set up exactly once for the page's
  // lifetime — re-subscribing on every filter/page change would tear down the
  // websocket channel and lose events in the gap. We achieve that by reading
  // the live filter/page values through refs inside stable callbacks.
  const refetchTimerRef    = useRef(null)
  const queryFiltersRef    = useRef(queryFilters)
  const currentPageRef     = useRef(currentPage)
  const dailyProfitMonthRef = useRef(dailyProfitMonth)
  queryFiltersRef.current    = queryFilters
  currentPageRef.current     = currentPage
  dailyProfitMonthRef.current = dailyProfitMonth

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(async () => {
      const filters = queryFiltersRef.current
      const page    = currentPageRef.current
      try {
        const [a, p, dd, cal] = await Promise.all([
          fetchTradesAnalytics(filters),
          fetchTradesPage(filters, {
            limit:  TRADES_PER_PAGE,
            offset: (page - 1) * TRADES_PER_PAGE,
          }),
          fetchMaxDrawdown(filters),
          fetchDailyProfitCalendar(filters),
        ])
        setAnalytics(a)
        setPageData(p)
        setMaxDrawdown(dd)
        setDailyCalendar(cal)
      } catch (err) {
        console.error('Refetch after realtime event failed:', err)
      }
    }, 1500)
  }, [])

  const handleTradeInsert = useCallback((newTrade) => {
    setToast({
      message: `New trade: ${newTrade.symbol} ${newTrade.direction?.toUpperCase()}`,
      type: 'insert',
    })
    scheduleRefetch()
  }, [scheduleRefetch])

  const handleTradeUpdate = useCallback((updatedTrade, oldTrade) => {
    if (oldTrade?.status !== updatedTrade.status) {
      const statusEmoji = updatedTrade.status === 'closed'   ? '✅' :
                          updatedTrade.status === 'canceled' ? '❌' :
                          updatedTrade.status === 'active'   ? '🟢' : '🔄'
      setToast({
        message: `${statusEmoji} Trade ${updatedTrade.trade_id?.slice(0, 8)}: ${oldTrade?.status} → ${updatedTrade.status}`,
        type: 'update',
      })
    }
    scheduleRefetch()
  }, [scheduleRefetch])

  const handleTradeDelete = useCallback((deletedTrade) => {
    setToast({
      message: `Trade removed: ${deletedTrade.trade_id?.slice(0, 8)}`,
      type: 'delete',
    })
    scheduleRefetch()
  }, [scheduleRefetch])

  const handleStatusChange = useCallback((status, err) => {
    setConnectionStatus(status)
    if (err) console.error('WebSocket error:', err)
  }, [])

  useEffect(() => {
    const subscription = subscribeToTrades({
      onInsert: handleTradeInsert,
      onUpdate: handleTradeUpdate,
      onDelete: handleTradeDelete,
      onStatus: handleStatusChange,
    })
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      subscription.unsubscribe()
    }
    // Stable identities (empty-dep callbacks + refs for live values) keep this
    // subscription alive for the entire page lifetime — no resubs on filter/page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // =====================================================================
  // Derived view-models from the analytics bundle
  // =====================================================================

  const channelList = useMemo(() => {
    return (analytics?.channels_list || []).map(c => ({
      id:         c.channel_id,
      name:       c.channel_name,
      isOrphaned: c.is_orphaned,
    }))
  }, [analytics])

  const channelColorMap = useMemo(() => {
    const map = {}
    channelList.forEach((channel, index) => {
      map[channel.id] = CHANNEL_COLORS[index % CHANNEL_COLORS.length]
    })
    return map
  }, [channelList])

  const getChannelColor = useCallback(
    (channelId) => channelColorMap[channelId] || '#6e7681',
    [channelColorMap]
  )
  const getChannelName = useCallback(
    (channelId) => channelList.find(ch => ch.id === channelId)?.name || 'Unknown',
    [channelList]
  )

  // ---------- Summary / stat cards ----------
  const summary       = analytics?.summary || {}
  const wins          = Number(summary.wins)          || 0
  const losses        = Number(summary.losses)        || 0
  const breakevens    = Number(summary.breakevens)    || 0
  const netPnL        = Number(summary.net_pnl)       || 0
  const sumProfit     = Number(summary.sum_profit)    || 0
  const sumLossAbs    = Number(summary.sum_loss_abs)  || 0
  const totalAnalysis = Number(summary.total_analysis) || 0
  const totalFiltered = Number(summary.total_filtered) || 0
  const totalClosed   = Number(summary.total_closed)   || 0
  const winRate       = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0'

  // ---------- Cumulative P&L (pivot long → wide) ----------
  const cumulativePnLData = useMemo(() => {
    const rows = analytics?.daily_pnl || []
    if (rows.length === 0) return []
    const byDate = {}
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date, _ts: r.date_ts }
      byDate[r.date][r.channel] = Number(r.pnl) || 0
    }
    const allKeys = new Set()
    rows.forEach(r => allKeys.add(r.channel))
    const dates = Object.values(byDate).sort(
      (a, b) => new Date(a._ts) - new Date(b._ts)
    )
    const lastVals = {}
    dates.forEach(d => {
      allKeys.forEach(k => {
        if (d[k] !== undefined) lastVals[k] = d[k]
        else if (lastVals[k] !== undefined) d[k] = lastVals[k]
      })
    })
    return dates.map(({ _ts, ...rest }) => rest)
  }, [analytics])

  const chartChannelIds = useMemo(() => {
    return selectedChannelIds.length > 0 ? selectedChannelIds : ['all']
  }, [selectedChannelIds])

  // ---------- Outcome by channel (Outcome Distribution chart) ----------
  const outcomeByChannelData = useMemo(() => {
    return (analytics?.channel_outcomes || []).map(item => ({
      channelId: item.channel_id,
      channel:   (item.channel_name?.length > 25 ? item.channel_name.slice(0, 25) + '...' : item.channel_name) || 'Unknown',
      fullName:  item.channel_name || 'Unknown',
      profit:    Number(item.profit)    || 0,
      loss:      Number(item.loss)      || 0,
      breakeven: Number(item.breakeven) || 0,
      manual:    Number(item.manual)    || 0,
      canceled:  Number(item.canceled)  || 0,
      blocked:   Number(item.blocked)   || 0,
      unknown:   Number(item.unknown)   || 0,
    }))
  }, [analytics])

  // ---------- Market sessions ----------
  const marketSessionsData = useMemo(() => {
    return (analytics?.sessions || []).map(s => {
      const def    = MARKET_SESSIONS.find(m => m.key === s.key)
      const total  = Number(s.total)  || 0
      const profit = Number(s.profit) || 0
      return {
        session:    SESSION_KEY_TO_LABEL[s.key] || s.key,
        profit,
        loss:       Number(s.loss)      || 0,
        breakeven:  Number(s.breakeven) || 0,
        total,
        color:      def?.color,
        startHour:  def?.startHour,
        endHour:    def?.endHour,
        winRate:    total > 0 ? ((profit / total) * 100).toFixed(1) : '0.0',
      }
    })
  }, [analytics])

  // ---------- Hourly chart ----------
  const hourlyChartData = useMemo(() => {
    return (analytics?.hourly || []).map(r => ({
      hour:  `${r.hour}:00`,
      pnl:   Number(r.pnl)   || 0,
      count: Number(r.count) || 0,
    }))
  }, [analytics])

  // ---------- Day-of-week chart ----------
  const dowChartData = useMemo(() => {
    const map = {}
    for (const r of (analytics?.dow || [])) {
      map[r.dow] = { day: WEEKDAYS[r.dow]?.label || '?', pnl: Number(r.pnl) || 0, count: Number(r.count) || 0 }
    }
    return [0, 1, 2, 3, 4, 5, 6].map(d => map[d] || { day: WEEKDAYS[d].label, pnl: 0, count: 0 })
  }, [analytics])

  // ---------- Outcomes by Side ----------
  const outcomeBySideData = useMemo(() => {
    return (analytics?.side || []).map(s => ({
      side:      s.side,
      profit:    Number(s.profit)    || 0,
      loss:      Number(s.loss)      || 0,
      breakeven: Number(s.breakeven) || 0,
    }))
  }, [analytics])

  // ---------- Rolling win rate (computed from compact outcomes sequence) ----------
  const rollingWinRateData = useMemo(() => {
    const seq = analytics?.outcomes_seq || []
    return seq.map((_, idx) => {
      const start = Math.max(0, idx - 19)
      const window = seq.slice(start, idx + 1)
      let w = 0, l = 0
      for (const o of window) {
        if (o === 'W') w++
        else if (o === 'L') l++
      }
      const totalWL = w + l
      return { trade: idx + 1, winRate: totalWL > 0 ? ((w / totalWL) * 100).toFixed(1) : '0.0' }
    })
  }, [analytics])

  // ---------- Gantt chart ----------
  const ganttChartData = useMemo(() => {
    const channels = (analytics?.gantt || []).map(c => ({
      channelId:   c.channel_id,
      channelName: c.channel_name,
      firstTrade:  new Date(c.first_trade),
      lastTrade:   new Date(c.last_trade),
      totalTrades: Number(c.total_trades) || 0,
      trades:      [], // per-trade dots unavailable without raw rows
    }))

    const now = new Date()
    let startDate = null
    switch (ganttTimeRange) {
      case '1d': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);    break
      case '1w': startDate = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000); break
      case '1m': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      case '1y': startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break
      default:   startDate = null
    }

    const filtered = startDate
      ? channels.filter(c => c.lastTrade >= startDate)
      : channels

    if (filtered.length === 0) {
      return { channels: [], minDate: now, maxDate: now, totalRange: 0 }
    }
    const minDate = startDate || new Date(Math.min(...filtered.map(c => c.firstTrade.getTime())))
    const maxDate = new Date(Math.max(...filtered.map(c => c.lastTrade.getTime())))
    return {
      channels:   filtered.sort((a, b) => a.firstTrade - b.firstTrade),
      minDate,
      maxDate,
      totalRange: maxDate.getTime() - minDate.getTime(),
    }
  }, [analytics, ganttTimeRange])

  // ---------- Daily profit calendar ----------
  const dailyProfitData = dailyCalendar
  const dailyProfitBounds = useMemo(() => {
    const keys = Object.keys(dailyCalendar)
    if (keys.length === 0) return null
    const sorted = keys.sort()
    const first = sorted[0]
    const last  = sorted[sorted.length - 1]
    const [fy, fm] = first.split('-').map(Number)
    const [ly, lm] = last.split('-').map(Number)
    return {
      min: { year: fy, month: fm - 1 },
      max: { year: ly, month: lm - 1 },
    }
  }, [dailyCalendar])

  // ---------- Price chart derived data ----------
  // Distinct symbols (with counts) present in the filtered marker set, busiest
  // first — drives the symbol picker.
  const chartSymbolOptions = useMemo(() => {
    const counts = new Map()
    for (const m of chartMarkers) {
      if (!m.symbol) continue
      counts.set(m.symbol, (counts.get(m.symbol) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol))
  }, [chartMarkers])

  // Keep the selected symbol valid: default to the busiest one whenever the
  // current selection isn't in the (re-filtered) option list.
  useEffect(() => {
    if (chartSymbolOptions.length === 0) {
      if (chartSymbol !== '') setChartSymbol('')
      return
    }
    if (!chartSymbolOptions.some(s => s.symbol === chartSymbol)) {
      setChartSymbol(chartSymbolOptions[0].symbol)
    }
  }, [chartSymbolOptions, chartSymbol])

  const chartTrades = useMemo(
    () => chartMarkers.filter(m => m.symbol === chartSymbol),
    [chartMarkers, chartSymbol]
  )

  // Fetch background candles for whatever time window the chart is showing.
  // The chart reports its visible range (debounced); we pad it a little and ask
  // the provider for that slice. Driving off the *view* — not the full trade
  // history — is what lets M1/M5 work, since the provider caps each response at
  // 5000 bars and can't span months of minute data at once.
  useEffect(() => {
    if (activeTab !== 'chart' || !chartSymbol || !chartView) {
      setChartCandles([])
      setChartCandleNote(null)
      return
    }
    if (!hasCandleProvider()) {
      setChartCandles([])
      setChartCandleNote('no-key')
      return
    }
    const span = Math.max(chartView.t1 - chartView.t0, 60_000)
    const pad  = span * 0.3
    const ctrl = new AbortController()
    setChartCandlesLoading(true)
    fetchCandles({
      symbol:    chartSymbol,
      timeframe: chartTimeframe,
      startMs:   chartView.t0 - pad,
      endMs:     chartView.t1 + pad,
      signal:    ctrl.signal,
    })
      .then(({ candles, reason }) => {
        setChartCandles(candles)
        setChartCandleNote(candles.length === 0 ? (reason || 'no-data') : null)
      })
      .finally(() => setChartCandlesLoading(false))
    return () => ctrl.abort()
  }, [activeTab, chartSymbol, chartTimeframe, chartView])

  // Count of active sidebar filters — shown as a badge on the mobile filter button.
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.startDate) n++
    if (filters.endDate) n++
    if (filters.status) n++
    if (filters.side) n++
    if (filters.orderType) n++
    if (selectedChannelIds.length > 0) n++
    if (selectedWeekdays.length !== 7) n++
    return n
  }, [filters, selectedChannelIds, selectedWeekdays])

  // ---------- Pagination from server ----------
  const totalPages      = Math.max(1, Math.ceil(pageData.total / TRADES_PER_PAGE))
  const startIndex      = (currentPage - 1) * TRADES_PER_PAGE
  const endIndex        = startIndex + TRADES_PER_PAGE
  const paginatedTrades = pageData.rows


  // ---------- Misc handlers ----------
  function clearFilters() {
    setFilters({ orderType: '', side: '', status: '', startDate: '', endDate: '' })
    setSelectedChannelIds([])
    setCurrentPage(1)
    setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6])
    setOutcomePage(1)
    setGanttPage(1)
  }

  function handlePageChange(page) {
    setCurrentPage(page)
    document.getElementById('trades-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Export: paginate through the full server-filtered set in chunks.
  // For huge result sets this is unavoidably slow — same cost as the old
  // page load was. Consider a dedicated server-streamed CSV endpoint later.
  async function exportCSV() {
    const headers = ['Trade ID', 'Channel', 'Symbol', 'Side', 'Order Type', 'Entry', 'TP', 'SL', 'P&L', 'Status', 'Outcome', 'Cancel Reason', 'Time']
    const rows  = []
    const PAGE  = 500
    let offset  = 0
    let total   = 0
    try {
      do {
        const res = await fetchTradesPage(queryFilters, { limit: PAGE, offset })
        total = res.total
        res.rows.forEach(t => rows.push([
          t.trade_id, t.channel_name, t.symbol, t.direction, t.order_type,
          t.executed_entry_price, t.executed_tp_price, t.executed_sl_price,
          t.profit_loss, t.status, t.outcome, t.cancel_reason || '', t.signal_time,
        ]))
        offset += PAGE
      } while (offset < total)
    } catch (err) {
      console.error('Export failed:', err)
      return
    }

    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }


  // ---------- Trade row helpers ----------
  function getTradeEffectiveStatus(trade) {
    const pendingOrderType = trade.order_type === 'STOP' || trade.order_type === 'LIMIT'
    const isTerminal = trade.status === 'closed' || trade.status === 'canceled' || trade.status === 'blocked' || trade.status === 'expired'
    if (pendingOrderType && !trade.fill_time && !isTerminal) return 'pending'
    return trade.status
  }

  function getStatusBadgeClass(trade) {
    const effectiveStatus = getTradeEffectiveStatus(trade)
    if (effectiveStatus === 'closed') {
      if (trade.outcome === 'profit')    return 'badge-success'
      if (trade.outcome === 'loss')      return 'badge-danger'
      if (trade.outcome === 'breakeven') return 'badge-neutral'
      return 'badge-neutral'
    }
    if (effectiveStatus === 'active')  return 'badge-warning'
    if (effectiveStatus === 'pending') return 'badge-warning'
    if (effectiveStatus === 'canceled') {
      if (trade.cancel_reason === 'cancel_policy') return 'badge-cancel-policy'
      return 'badge-neutral'
    }
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
    if (effectiveStatus === 'canceled') {
      if (trade.cancel_reason === 'cancel_policy') return 'canceled (TP)'
      if (trade.cancel_reason === 'expired')       return 'expired'
      return 'canceled'
    }
    return effectiveStatus || '-'
  }


  // ---------- Render ----------
  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <style>{`
          @keyframes tradeBarPulse {
            0%, 100% { transform: scaleY(0.25); }
            50% { transform: scaleY(1); }
          }
        `}</style>
        <div className="flex items-end gap-1.5 h-16">
          {[
            { color: 'bg-emerald-500', delay: '0ms' },
            { color: 'bg-rose-500',    delay: '120ms' },
            { color: 'bg-emerald-500', delay: '240ms' },
            { color: 'bg-emerald-500', delay: '360ms' },
            { color: 'bg-rose-500',    delay: '480ms' },
            { color: 'bg-emerald-500', delay: '600ms' },
          ].map((bar, i) => (
            <div
              key={i}
              className={`w-2 h-full rounded-sm origin-bottom ${bar.color}`}
              style={{ animation: 'tradeBarPulse 1.1s ease-in-out infinite', animationDelay: bar.delay }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen relative max-w-full">
      {/* Shimmer keyframes for skeleton placeholders (table pagination loading). */}
      <style>{`
        @keyframes skeletonShimmer {
          0%   { background-position: -150% 0; }
          100% { background-position: 250% 0; }
        }
        .skeleton-shimmer {
          background-color: rgba(255, 255, 255, 0.04);
          background-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.14) 50%,
            transparent 100%
          );
          background-size: 50% 100%;
          background-repeat: no-repeat;
          background-position: -50% 0;
          animation: skeletonShimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ============ Sidebar ============ */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-80 lg:w-72 flex-shrink-0
        bg-dark-secondary border-r border-dark-border
        overflow-y-auto overflow-x-hidden
        transition-transform duration-300 ease-in-out z-40
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-5">
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

          <div className="mb-6">
            <ConnectionStatus status={connectionStatus} />
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <Calendar className="w-3 h-3 text-accent-cyan" /> Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full flat-input"
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
                className="w-full flat-input"
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
                className="w-full flat-select"
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
                className="w-full flat-select"
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
                className="w-full flat-select"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Weekday
              </label>
              <div className="flex gap-1">
                {WEEKDAYS.map(day => {
                  const isSelected = selectedWeekdays.includes(day.key)
                  return (
                    <button
                      key={day.key}
                      onClick={() => {
                        if (isSelected) setSelectedWeekdays(prev => prev.filter(d => d !== day.key))
                        else            setSelectedWeekdays(prev => [...prev, day.key].sort())
                      }}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${
                        isSelected
                          ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30'
                          : 'bg-dark-secondary text-gray-500 border border-dark-border hover:text-gray-300'
                      }`}
                      title={day.label}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
              {selectedWeekdays.length < 7 && (
                <button
                  onClick={() => setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6])}
                  className="text-xs text-accent-cyan hover:underline mt-1"
                >
                  Select all days
                </button>
              )}
            </div>

            <button
              onClick={clearFilters}
              className="btn-secondary w-full flex items-center justify-center gap-2 hover:bg-dark-tertiary transition-colors"
            >
              <X className="w-4 h-4" /> Clear Filters
            </button>
          </div>

          <button
            onClick={exportCSV}
            className="btn-secondary w-full flex items-center justify-center gap-2 px-4 py-2.5 hover:bg-dark-tertiary transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </aside>

      {/* ============ Main Content ============ */}
      <main
        className="flex-1 min-w-0 overflow-x-hidden"
        style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed bottom-6 right-6 z-30 p-4 transition-all"
          style={{
            background: 'var(--neu-bg)',
            border: 'none',
            borderRadius: '9999px',
            boxShadow: 'var(--neu-raised-lg)',
            color: '#ADFF2F',
            cursor: 'pointer',
          }}
        >
          <Filter className="w-6 h-6" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold rounded-full"
              style={{ background: '#ADFF2F', color: '#0d1117', boxShadow: '0 0 0 2px var(--neu-bg)' }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="p-4 sm:p-6 lg:p-8 max-w-full">
          {/* ============ Stats Summary ============ */}
          {(() => {
            const totalWL    = wins + losses
            const winsPct    = totalWL > 0 ? (wins  / totalWL) * 100 : 50
            const lossesPct  = totalWL > 0 ? (losses / totalWL) * 100 : 50
            const profitFactor = sumLossAbs > 0 ? sumProfit / sumLossAbs : (sumProfit > 0 ? Infinity : 0)
            const pnlDeltaPct  = isFinite(profitFactor) && profitFactor > 0
              ? ((profitFactor - 1) * 100)
              : (sumProfit > 0 ? 100 : 0)
            const excluded = totalFiltered - totalAnalysis

            const cardStyle    = { background: 'var(--neu-bg)', borderRadius: '20px', boxShadow: 'var(--neu-raised-sm)' }
            const iconBoxStyle = { borderRadius: '7px', background: 'var(--neu-bg)', boxShadow: 'var(--neu-pressed-sm)',
                                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
            const iconBoxClass = 'w-[20px] h-[20px] sm:w-[26px] sm:h-[26px]'
            const labelClass   = 'text-[9px] sm:text-xs font-semibold text-gray-400 uppercase tracking-[0.12em]'

            return (
              <div className="grid grid-cols-6 lg:grid-cols-5 gap-2 sm:gap-4 mb-6">
                {/* Analysis */}
                <div className="p-2.5 sm:p-5 col-span-2 lg:col-span-1" style={cardStyle}>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <div className={iconBoxClass} style={iconBoxStyle}><Hash className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" /></div>
                    <span className={labelClass}>Analysis</span>
                  </div>
                  <div className="text-sm sm:text-3xl font-bold font-mono text-white leading-none">
                    {totalAnalysis.toLocaleString()}
                  </div>
                  {totalFiltered !== totalAnalysis && (
                    <div className="text-[9px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 leading-tight">
                      of {totalFiltered.toLocaleString()} · {excluded.toLocaleString()} excluded
                    </div>
                  )}
                </div>

                {/* Net P&L */}
                <div className="p-2.5 sm:p-5 col-span-2 lg:col-span-1" style={cardStyle}>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <div className={iconBoxClass} style={iconBoxStyle}><DollarSign className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" /></div>
                    <span className={labelClass}>Net P&amp;L</span>
                  </div>
                  <div className={`text-sm sm:text-3xl font-bold font-mono leading-none ${netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {netPnL >= 0 ? '+' : '-'}${Math.abs(netPnL).toFixed(2)}
                  </div>
                  {totalWL > 0 && (
                    <div
                      className="inline-flex items-center gap-1 mt-1.5 sm:mt-2.5 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[11px] font-semibold font-mono"
                      style={{
                        background: netPnL >= 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: netPnL >= 0 ? '#22c55e' : '#ef4444',
                        borderRadius: '9999px',
                      }}
                    >
                      {netPnL >= 0
                        ? <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        : <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                      {netPnL >= 0 ? '+' : '-'}{Math.abs(pnlDeltaPct).toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Win Rate */}
                <div className="p-2.5 sm:p-5 col-span-2 lg:col-span-1" style={cardStyle}>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <div className={iconBoxClass} style={iconBoxStyle}><Percent className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" /></div>
                    <span className={labelClass}>Win Rate</span>
                  </div>
                  <div className="text-sm sm:text-3xl font-bold font-mono text-white leading-none">
                    {parseFloat(winRate).toFixed(1)}%
                  </div>
                  <div
                    className="mt-2 sm:mt-3 h-1.5 w-full overflow-hidden"
                    style={{ borderRadius: '9999px', background: 'rgba(148,163,184,0.18)' }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, parseFloat(winRate) || 0))}%`,
                        height: '100%',
                        borderRadius: '9999px',
                        background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)',
                      }}
                    />
                  </div>
                </div>

                {/* Wins · Losses */}
                <div className="p-2.5 sm:p-5 col-span-3 lg:col-span-1" style={cardStyle}>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <div className={iconBoxClass} style={iconBoxStyle}><BarChart3 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" /></div>
                    <span className={labelClass}>Wins · Losses</span>
                  </div>
                  <div className="text-sm sm:text-2xl font-bold font-mono leading-none">
                    <span className="text-green-400">{wins.toLocaleString()}</span>
                    <span className="text-gray-600 mx-1 sm:mx-1.5">/</span>
                    <span className="text-red-400">{losses.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-1 mt-1.5 sm:mt-3 h-1 sm:h-1.5">
                    <div style={{ width: `${winsPct}%`,   height: '100%', borderRadius: '9999px', background: '#22c55e', transition: 'width 0.3s ease' }} />
                    <div style={{ width: `${lossesPct}%`, height: '100%', borderRadius: '9999px', background: '#ef4444', transition: 'width 0.3s ease' }} />
                  </div>
                </div>

                {/* Max Drawdown */}
                <div className="p-2.5 sm:p-5 col-span-3 lg:col-span-1" style={cardStyle}>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                    <div className={iconBoxClass} style={iconBoxStyle}><TrendingDown className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" /></div>
                    <span className={labelClass}>Max Drawdown</span>
                  </div>
                  <div className="text-sm sm:text-2xl xl:text-3xl font-bold font-mono text-red-400 leading-none">
                    {maxDrawdown > 0 ? `-${Number(maxDrawdown).toFixed(2)}%` : '0.00%'}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider"
                      style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '9999px' }}
                    >
                      <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      Risk
                    </span>
                    <span className="text-[9px] sm:text-[11px] text-gray-500">peak to trough</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ============ Sub-tab navigation ============ */}
          {(() => {
            const tabs = [
              { key: 'trades',               label: 'Trades',               icon: BarChart3   },
              { key: 'chart',                label: 'Price Chart',          icon: CandlestickChart },
              { key: 'cumulative',           label: 'Cumulative P/L',       icon: TrendingUp  },
              { key: 'channel-activity',     label: 'Channel Activity',     icon: Calendar    },
              { key: 'market-sessions',      label: 'Market Sessions',      icon: Globe       },
              { key: 'outcome-distribution', label: 'Outcome Distribution', icon: Target      },
              { key: 'daily-profit',         label: 'Daily Profit',         icon: CalendarDays },
              { key: 'other',                label: 'Other',                icon: LayoutGrid  },
            ]
            return (
              <div
                className="flex items-center gap-1.5 sm:gap-2 mb-6 p-1.5 overflow-x-auto"
                style={{
                  background: 'var(--neu-bg)',
                  borderRadius: '14px',
                  boxShadow: 'var(--neu-pressed-sm)',
                  scrollbarWidth: 'none',
                }}
              >
                {tabs.map(tab => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                      style={{
                        borderRadius: '10px',
                        background: isActive ? 'var(--neu-bg)' : 'transparent',
                        boxShadow: isActive ? 'var(--neu-raised-sm)' : 'none',
                        color: isActive ? '#ADFF2F' : '#9ca3af',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* ============ Trades Table ============ */}
          {activeTab === 'trades' && (
            <div id="trades-table" className="chart-card flat-card mb-8 overflow-hidden">
              <div
                className="flex items-center gap-3 px-3 sm:px-5 py-4"
                style={{
                  background: 'var(--neu-bg)',
                  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.35), inset 0 -2px 0 rgba(255,255,255,0.02)',
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--neu-bg)', boxShadow: 'none' }}
                >
                  <BarChart3 className="w-4 h-4 text-accent-cyan" />
                </div>
                <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Trade History</span>
                <span
                  className="ml-auto text-xs text-gray-500 px-2 sm:px-3 py-1"
                  style={{ background: 'transparent', borderRadius: '0', boxShadow: 'none', border: 'none' }}
                >
                  <span className="hidden sm:inline">Showing </span>
                  {pageData.total === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, pageData.total)} of {pageData.total}
                </span>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
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
                    {pageLoading ? (
                      Array.from({ length: Math.max(1, paginatedTrades.length || TRADES_PER_PAGE) }, (_, i) => (
                        <SkeletonTableRow key={`skeleton-row-${i}`} />
                      ))
                    ) : (
                      <>
                        {paginatedTrades.map(trade => (
                          <tr key={trade.id} className="transition-colors hover:bg-dark-tertiary/50">
                            <td>
                              <span className="truncate max-w-[180px] block" title={getChannelName(trade.channel_id)}>
                                {getChannelName(trade.channel_id)}
                              </span>
                            </td>
                            <td className="font-semibold">{trade.symbol || '-'}</td>
                            <td>
                              <span className={`font-semibold ${trade.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                                {trade.direction?.toUpperCase() || '-'}
                              </span>
                            </td>
                            <td>{trade.order_type || '-'}</td>
                            <td>{trade.executed_entry_price?.toFixed(2) || trade.signal_entry_price?.toFixed(2) || '-'}</td>
                            <td>{trade.executed_tp_price?.toFixed(2) || '-'}</td>
                            <td>{trade.executed_sl_price?.toFixed(2) || trade.signal_sl_price?.toFixed(2) || '-'}</td>
                            <td>
                              {(() => {
                                if (trade.status === 'canceled') return <span className="text-gray-500">-</span>
                                if (trade.profit_loss != null) {
                                  return (
                                    <span className={trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}>
                                      {trade.profit_loss >= 0 ? '+' : '-'}${Math.abs(trade.profit_loss).toFixed(2)}
                                    </span>
                                  )
                                }
                                return <span className="text-gray-500">-</span>
                              })()}
                            </td>
                            <td>
                              {(() => {
                                const badgeClass = getStatusBadgeClass(trade)
                                const textColorClass =
                                  badgeClass === 'badge-success'       ? 'text-green-400' :
                                  badgeClass === 'badge-danger'        ? 'text-red-400' :
                                  badgeClass === 'badge-warning'       ? 'text-orange-400' :
                                  badgeClass === 'badge-cancel-policy' ? 'badge-cancel-policy' :
                                  'text-gray-400'
                                return (
                                  <span className={`font-medium uppercase ${textColorClass}`} style={{ fontSize: '11px', letterSpacing: '0.04em' }}>
                                    {getStatusDisplay(trade)}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="text-gray-500 text-xs sm:text-sm">
                              {trade.signal_time ? new Date(trade.signal_time).toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                        {paginatedTrades.length === 0 && (
                          <tr>
                            <td colSpan={10} className="text-center text-gray-500 py-8">No trades found</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden p-3 space-y-3">
                {pageLoading && (
                  Array.from({ length: Math.max(1, paginatedTrades.length || TRADES_PER_PAGE) }, (_, i) => (
                    <SkeletonMobileCard key={`skeleton-card-${i}`} />
                  ))
                )}
                {!pageLoading && paginatedTrades.map(trade => {
                  const badgeClass = getStatusBadgeClass(trade)
                  const statusColorClass =
                    badgeClass === 'badge-success'       ? 'text-green-400' :
                    badgeClass === 'badge-danger'        ? 'text-red-400' :
                    badgeClass === 'badge-warning'       ? 'text-orange-400' :
                    badgeClass === 'badge-cancel-policy' ? 'text-cyan-400' :
                    'text-gray-400'
                  const statusDotColor =
                    badgeClass === 'badge-success'       ? '#22c55e' :
                    badgeClass === 'badge-danger'        ? '#ef4444' :
                    badgeClass === 'badge-warning'       ? '#f59e0b' :
                    badgeClass === 'badge-cancel-policy' ? '#39d5ff' :
                    '#6e7681'
                  const isBuy = trade.direction === 'buy'
                  const entry = trade.executed_entry_price?.toFixed(2) || trade.signal_entry_price?.toFixed(2) || '-'
                  const tp    = trade.executed_tp_price?.toFixed(2) || '-'
                  const sl    = trade.executed_sl_price?.toFixed(2) || trade.signal_sl_price?.toFixed(2) || '-'
                  const signalDate = trade.signal_time ? new Date(trade.signal_time) : null
                  const dateStr = signalDate ? signalDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '-'
                  const timeStr = signalDate ? signalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'
                  return (
                    <div
                      key={trade.id}
                      className="p-3"
                      style={{ background: 'var(--card-flat)', borderRadius: '14px', boxShadow: 'none' }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
                            style={{
                              background: isBuy ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isBuy ? '#22c55e' : '#ef4444',
                              borderRadius: '6px',
                            }}
                          >
                            {trade.direction?.toUpperCase() || '-'}
                          </span>
                          <span className="text-xs font-semibold text-white truncate" title={getChannelName(trade.channel_id)}>
                            {getChannelName(trade.channel_id)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0 leading-tight">
                          <span className="text-[10px] text-gray-400 font-mono">{dateStr}</span>
                          <span className="text-[9px] text-gray-500 font-mono">{timeStr}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-2.5">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Entry</span>
                          <span className="text-xs font-mono font-semibold text-white">{entry}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">TP</span>
                          <span className="text-xs font-mono font-semibold text-green-400">{tp}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">SL</span>
                          <span className="text-xs font-mono font-semibold text-red-400">{sl}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${statusColorClass}`}
                            style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: statusDotColor }} />
                            {getStatusDisplay(trade)}
                            {(() => {
                              if (trade.status === 'canceled') return null
                              if (trade.profit_loss != null) {
                                return (
                                  <span className="ml-1 font-mono">
                                    · {trade.profit_loss >= 0 ? '+' : '-'}${Math.abs(trade.profit_loss).toFixed(2)}
                                  </span>
                                )
                              }
                              return null
                            })()}
                          </span>
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider">
                            {trade.symbol || '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {!pageLoading && paginatedTrades.length === 0 && (
                  <div className="text-center text-gray-500 py-8 text-sm">No trades found</div>
                )}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}

          {/* ============ Price Chart (MT5-style) ============ */}
          {activeTab === 'chart' && (
            <ChartCard
              title="Trades on Price Chart"
              icon={CandlestickChart}
              className="mb-6 -mx-4 sm:mx-0 rounded-none sm:rounded-2xl"
              bodyClassName="px-0 py-3 sm:p-5"
            >
              {chartMarkersLoading && chartMarkers.length === 0 ? (
                <div className="flex items-center justify-center h-[460px] text-gray-500 text-sm">
                  Loading trades…
                </div>
              ) : (
                <TradePriceChart
                  trades={chartTrades}
                  candles={chartCandles}
                  candlesLoading={chartCandlesLoading}
                  candleNote={chartCandleNote}
                  providerEnabled={hasCandleProvider()}
                  symbolOptions={chartSymbolOptions}
                  selectedSymbol={chartSymbol}
                  onSelectSymbol={setChartSymbol}
                  timeframe={chartTimeframe}
                  onTimeframe={setChartTimeframe}
                  onVisibleRange={(t0, t1) => setChartView({ t0, t1 })}
                />
              )}
            </ChartCard>
          )}

          {/* ============ Cumulative P&L ============ */}
          {activeTab === 'cumulative' && (
            <ChartCard title="Cumulative Profit/Loss by Channel Over Time" icon={TrendingUp} className="mb-6">
              {cumulativePnLData.length > 0 ? (() => {
                const channelExtremes = chartChannelIds.map((channelId) => {
                  const points = cumulativePnLData
                    .map(d => ({ date: d.date, value: d[channelId] }))
                    .filter(p => p.value !== undefined && p.value !== null)
                  if (points.length === 0) return null
                  let minP = points[0], maxP = points[0]
                  for (const p of points) {
                    if (p.value < minP.value) minP = p
                    if (p.value > maxP.value) maxP = p
                  }
                  const latest = points[points.length - 1]
                  const color = channelId === 'all' ? '#ADFF2F' : getChannelColor(channelId)
                  return { channelId, color, minP, maxP, latest }
                }).filter(Boolean)

                return (
                  <div className="w-full min-w-[300px] h-[360px] sm:h-[480px] lg:h-[600px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cumulativePnLData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          {chartChannelIds.map((channelId) => {
                            const color = channelId === 'all' ? '#ADFF2F' : getChannelColor(channelId)
                            return (
                              <linearGradient key={`grad-${channelId}`} id={`cum-grad-${channelId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                              </linearGradient>
                            )
                          })}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                        <XAxis dataKey="date" stroke="#6e7681" fontSize={11} tickMargin={6} angle={-45} textAnchor="end" height={50} />
                        <YAxis stroke="#6e7681" fontSize={11}
                          tickFormatter={(value) => `$${value.toFixed(0)}`}
                          scale="linear" domain={['auto', 'auto']} allowDataOverflow={false} width={56} />
                        <Tooltip
                          cursor={{ stroke: '#6e7681', strokeDasharray: '3 3', strokeWidth: 1 }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null
                            const hoveredItem = payload.find(p => p.value !== null && p.value !== undefined)
                            if (!hoveredItem) return null
                            const channelId = hoveredItem.dataKey
                            const displayName = channelId === 'all' ? 'All Channels' : getChannelName(channelId)
                            return (
                              <div className="bg-dark-secondary border border-dark-border rounded-lg px-4 py-3 shadow-xl">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hoveredItem.color }} />
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
                        {chartChannelIds.map((channelId) => (
                          <Area
                            key={channelId}
                            type="monotone"
                            dataKey={channelId}
                            name={channelId === 'all' ? 'All Channels' : getChannelName(channelId)}
                            stroke={channelId === 'all' ? '#ADFF2F' : getChannelColor(channelId)}
                            strokeWidth={2}
                            fill={`url(#cum-grad-${channelId})`}
                            fillOpacity={1}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                            isAnimationActive={false}
                          />
                        ))}
                        {channelExtremes.map(({ channelId, color, minP, maxP }) => (
                          <React.Fragment key={`anno-${channelId}`}>
                            <ReferenceDot
                              x={maxP.date} y={maxP.value} r={3} fill={color} stroke="#0d1117" strokeWidth={1}
                              label={{ value: `$${maxP.value.toFixed(2)}`, position: 'top', fill: '#c9d1d9', fontSize: 10 }}
                            />
                            <ReferenceDot
                              x={minP.date} y={minP.value} r={3} fill={color} stroke="#0d1117" strokeWidth={1}
                              label={{ value: `$${minP.value.toFixed(2)}`, position: 'bottom', fill: '#c9d1d9', fontSize: 10 }}
                            />
                          </React.Fragment>
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              })() : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No closed trades with dates to display
                </div>
              )}
            </ChartCard>
          )}

          {/* ============ Channel Activity (Gantt) ============ */}
          {activeTab === 'channel-activity' && (
            <ChartCard title="Channel Activity Timeline" icon={Calendar} className="mb-6">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-[11px] sm:text-sm text-gray-400">Time Range:</span>
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
                      onClick={() => { setGanttTimeRange(option.key); setGanttPage(1) }}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${
                        ganttTimeRange === option.key
                          ? 'bg-accent-cyan text-dark-primary'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-[10px] sm:text-xs text-gray-500">
                  {ganttChartData.channels.length} channels active
                </span>
              </div>

              {ganttChartData.channels.length > 0 ? (() => {
                const GANTT_PER_PAGE = 10
                const ganttTotalPages = Math.ceil(ganttChartData.channels.length / GANTT_PER_PAGE)
                const paginatedGanttChannels = ganttChartData.channels.slice((ganttPage - 1) * GANTT_PER_PAGE, ganttPage * GANTT_PER_PAGE)
                return (
                  <div className="relative overflow-x-auto">
                    <div className="flex items-center mb-2 pl-[200px] min-w-[600px]">
                      <div className="flex-1 flex justify-between text-[10px] sm:text-xs text-gray-500">
                        <span>{ganttChartData.minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                        <span>{ganttChartData.maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="space-y-2 min-w-[600px]">
                      {paginatedGanttChannels.map((channel) => {
                        const startPercent = ganttChartData.totalRange > 0
                          ? ((channel.firstTrade.getTime() - ganttChartData.minDate.getTime()) / ganttChartData.totalRange) * 100
                          : 0
                        const widthPercent = ganttChartData.totalRange > 0
                          ? ((channel.lastTrade.getTime() - channel.firstTrade.getTime()) / ganttChartData.totalRange) * 100
                          : 100
                        const minWidth = Math.max(widthPercent, 1)

                        return (
                          <div key={channel.channelId} className="flex items-center gap-3 group">
                            <div className="w-[200px] flex-shrink-0 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getChannelColor(channel.channelId) }} />
                              <span className="text-[11px] sm:text-sm text-gray-300 truncate" title={channel.channelName}>
                                {channel.channelName.length > 25 ? channel.channelName.slice(0, 25) + '...' : channel.channelName}
                              </span>
                            </div>
                            <div className="flex-1 h-6 bg-dark-tertiary/50 rounded relative overflow-hidden">
                              <div
                                className="absolute h-full rounded transition-all group-hover:opacity-80"
                                style={{
                                  left: `${startPercent}%`,
                                  width: `${minWidth}%`,
                                  backgroundColor: getChannelColor(channel.channelId),
                                  minWidth: '4px',
                                }}
                                title={`${channel.totalTrades} trades from ${channel.firstTrade.toLocaleDateString()} to ${channel.lastTrade.toLocaleDateString()}`}
                              />
                            </div>
                            <div className="w-[60px] text-right text-[10px] sm:text-xs text-gray-500">
                              {channel.totalTrades} <span className="hidden sm:inline">trades</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-dark-border/50 text-[10px] sm:text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-2 bg-accent-cyan rounded" />
                        <span>Active period</span>
                      </div>
                    </div>

                    {ganttTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-dark-border/50">
                        <span className="text-[10px] sm:text-xs text-gray-500">
                          Showing {(ganttPage - 1) * GANTT_PER_PAGE + 1}–{Math.min(ganttPage * GANTT_PER_PAGE, ganttChartData.channels.length)} of {ganttChartData.channels.length} channels
                        </span>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            onClick={() => setGanttPage(p => Math.max(1, p - 1))}
                            disabled={ganttPage === 1}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Prev
                          </button>
                          {Array.from({ length: ganttTotalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setGanttPage(page)}
                              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md transition-colors ${
                                ganttPage === page ? 'bg-accent-cyan text-dark-primary font-semibold' : 'bg-dark-tertiary text-gray-400 hover:text-white'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            onClick={() => setGanttPage(p => Math.min(ganttTotalPages, p + 1))}
                            disabled={ganttPage === ganttTotalPages}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No trades in selected time range
                </div>
              )}
            </ChartCard>
          )}

          {/* ============ Market Sessions ============ */}
          {activeTab === 'market-sessions' && (
            <ChartCard title="Performance by Market Session" icon={Globe} className="mb-6">
              <div className="mb-4 text-sm text-gray-400">
                Trade outcomes grouped by forex market sessions (based on signal time UTC)
              </div>

              {marketSessionsData.some(s => s.total > 0) ? (
                <div className="w-full min-w-[300px]">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={marketSessionsData} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 10 }} barSize={20}>
                      <XAxis type="number" stroke="#6e7681" fontSize={11} allowDecimals={false} />
                      <YAxis type="category" dataKey="session" stroke="#6e7681" fontSize={12} width={70} />
                      <Tooltip content={<MarketSessionsTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: 10 }} formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>} />
                      <Bar dataKey="profit"    name="Profit"    fill={COLORS.green} stackId="outcomes" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="loss"      name="Loss"      fill={COLORS.red}   stackId="outcomes" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="breakeven" name="Breakeven" fill={COLORS.gray}  stackId="outcomes" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  No closed trades to display
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-dark-border/50">
                {marketSessionsData.map(session => {
                  const sessionColor = MARKET_SESSIONS.find(s => s.label === session.session)?.color
                  return (
                    <div
                      key={session.session}
                      className="p-2.5 sm:p-4 transition-all"
                      style={{
                        background: 'var(--neu-bg)',
                        borderRadius: '14px',
                        boxShadow: 'var(--neu-raised-sm), inset 3px 0 0 0 ' + sessionColor,
                      }}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        <span
                          className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shadow-lg flex-shrink-0"
                          style={{ backgroundColor: sessionColor, boxShadow: `0 0 8px ${sessionColor}40` }}
                        />
                        <span className="text-xs sm:text-sm font-semibold text-white truncate">{session.session}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-3 text-[10px] sm:text-xs">
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Total</span>
                          <span className="text-white font-mono text-xs sm:text-base font-semibold">{session.total}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Win Rate</span>
                          <span className="text-white font-mono text-xs sm:text-base font-semibold">{session.winRate}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Wins</span>
                          <span className="text-green-400 font-mono text-xs sm:text-base font-semibold">{session.profit}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 mb-0.5">Losses</span>
                          <span className="text-red-400 font-mono text-xs sm:text-base font-semibold">{session.loss}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChartCard>
          )}

          {/* ============ Outcome Distribution ============ */}
          {activeTab === 'outcome-distribution' && (
            <ChartCard title="Outcome Distribution by Channel (sorted by Profit - Loss)" icon={Target} className="mb-6">
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 sm:mb-3">
                  <span className="text-xs sm:text-sm text-gray-400">Filter:</span>
                  <button onClick={selectAllOutcomes} className="text-[11px] sm:text-xs text-accent-cyan hover:text-accent-blue transition-colors">All</button>
                  <span className="text-gray-600 text-xs">|</span>
                  <button onClick={deselectAllOutcomes} className="text-[11px] sm:text-xs text-accent-cyan hover:text-accent-blue transition-colors">None</button>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
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

              {outcomeByChannelData.length > 0 && selectedOutcomes.length > 0 ? (() => {
                const OUTCOME_PER_PAGE = 15
                const outcomeTotalPages = Math.ceil(outcomeByChannelData.length / OUTCOME_PER_PAGE)
                const paginatedOutcomeData = outcomeByChannelData.slice((outcomePage - 1) * OUTCOME_PER_PAGE, outcomePage * OUTCOME_PER_PAGE)
                const visibleOutcomes = OUTCOME_TYPES.filter(o => selectedOutcomes.includes(o.key))
                const channelTotals = paginatedOutcomeData.map(c => visibleOutcomes.reduce((s, o) => s + (c[o.key] || 0), 0))
                const maxTotal = Math.max(1, ...channelTotals)
                return (
                  <div className="w-full">
                    {/* Mobile: stacked bars */}
                    <div className="sm:hidden space-y-2.5">
                      {paginatedOutcomeData.map((channel, idx) => {
                        const total = channelTotals[idx]
                        const rowWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0
                        return (
                          <div key={channel.channelId}>
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs text-gray-200 truncate min-w-0 flex-1" title={channel.fullName}>
                                {channel.fullName}
                              </span>
                              <span className="text-[11px] text-gray-500 flex-shrink-0 tabular-nums">{total}</span>
                            </div>
                            <div className="h-4 w-full bg-dark-tertiary/40 rounded overflow-hidden">
                              <div
                                className="h-full flex rounded overflow-hidden transition-all"
                                style={{ width: `${rowWidth}%` }}
                                title={visibleOutcomes
                                  .filter(o => (channel[o.key] || 0) > 0)
                                  .map(o => `${o.label}: ${channel[o.key]}`)
                                  .join(' • ')}
                              >
                                {visibleOutcomes.map((outcome) => {
                                  const value = channel[outcome.key] || 0
                                  if (value === 0 || total === 0) return null
                                  const pct = (value / total) * 100
                                  return (
                                    <div
                                      key={outcome.key}
                                      className="h-full"
                                      style={{ width: `${pct}%`, backgroundColor: outcome.color }}
                                      title={`${outcome.label}: ${value}`}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 pt-3 border-t border-dark-border/50">
                        {visibleOutcomes.map(outcome => (
                          <div key={outcome.key} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: outcome.color }} />
                            <span className="text-[11px] text-gray-400">{outcome.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Desktop: Recharts */}
                    <div className="hidden sm:block">
                      <ResponsiveContainer width="100%" height={Math.max(300, paginatedOutcomeData.length * 34)}>
                        <BarChart data={paginatedOutcomeData} layout="vertical" margin={{ left: 0, right: 10, top: 10, bottom: 10 }} barSize={16}>
                          <XAxis type="number" stroke="#6e7681" fontSize={11} />
                          <YAxis
                            type="category"
                            dataKey="fullName"
                            stroke="#6e7681"
                            fontSize={10}
                            width={180}
                            interval={0}
                            tick={({ x, y, payload }) => (
                              <text x={x} y={y} dy={4} textAnchor="end" fill="#9ca3af" fontSize={10}>
                                {payload.value.length > 28 ? payload.value.slice(0, 28) + '...' : payload.value}
                              </text>
                            )}
                          />
                          <Tooltip content={<OutcomeDistributionTooltip />} />
                          <Legend wrapperStyle={{ paddingTop: 20 }} formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>} />
                          {visibleOutcomes.map((outcome, index, arr) => (
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

                    {outcomeTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-dark-border/50">
                        <span className="text-xs text-gray-500">
                          Showing {(outcomePage - 1) * OUTCOME_PER_PAGE + 1}–{Math.min(outcomePage * OUTCOME_PER_PAGE, outcomeByChannelData.length)} of {outcomeByChannelData.length} channels
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setOutcomePage(p => Math.max(1, p - 1))}
                            disabled={outcomePage === 1}
                            className="px-3 py-1.5 text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Prev
                          </button>
                          {Array.from({ length: outcomeTotalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setOutcomePage(page)}
                              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                                outcomePage === page ? 'bg-accent-cyan text-dark-primary font-semibold' : 'bg-dark-tertiary text-gray-400 hover:text-white'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            onClick={() => setOutcomePage(p => Math.min(outcomeTotalPages, p + 1))}
                            disabled={outcomePage === outcomeTotalPages}
                            className="px-3 py-1.5 text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  {selectedOutcomes.length === 0 ? 'Select at least one outcome type to display' : 'No trades to display'}
                </div>
              )}
            </ChartCard>
          )}

          {/* ============ Daily Profit Calendar ============ */}
          {activeTab === 'daily-profit' && (() => {
            const { year, month } = dailyProfitMonth
            const monthLabel  = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
            const firstDay    = new Date(year, month, 1)
            const daysInMonth = new Date(year, month + 1, 0).getDate()
            const startWeekday = firstDay.getDay()

            const cells = []
            for (let i = 0; i < startWeekday; i++) cells.push(null)
            for (let d = 1; d <= daysInMonth; d++) {
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
              cells.push({ day: d, data: dailyProfitData[dateKey] || null })
            }
            while (cells.length % 7 !== 0) cells.push(null)

            const monthlyProfit = cells.reduce((s, c) => s + (c?.data?.profit || 0), 0)
            const monthlyTrades = cells.reduce((s, c) => s + (c?.data?.trades || 0), 0)
            const monthlyWins   = cells.reduce((s, c) => s + (c?.data?.wins   || 0), 0)
            const monthlyLosses = cells.reduce((s, c) => s + (c?.data?.losses || 0), 0)

            let maxAbs = 0
            cells.forEach(c => { if (c?.data) maxAbs = Math.max(maxAbs, Math.abs(c.data.profit)) })
            if (maxAbs === 0) maxAbs = 1

            const cellColor = (profit) => {
              if (profit == null) return 'transparent'
              if (profit === 0) return 'rgba(110, 118, 129, 0.18)'
              const intensity = Math.min(1, Math.abs(profit) / maxAbs)
              const alpha = 0.18 + intensity * 0.72
              return profit > 0
                ? `rgba(173, 255, 47, ${alpha})`
                : `rgba(248, 81, 73, ${alpha})`
            }

            const goPrev = () => {
              const m = month - 1
              if (m < 0) setDailyProfitMonth({ year: year - 1, month: 11 })
              else       setDailyProfitMonth({ year, month: m })
            }
            const goNext = () => {
              const m = month + 1
              if (m > 11) setDailyProfitMonth({ year: year + 1, month: 0 })
              else        setDailyProfitMonth({ year, month: m })
            }

            const canPrev = !dailyProfitBounds || (
              year > dailyProfitBounds.min.year ||
              (year === dailyProfitBounds.min.year && month > dailyProfitBounds.min.month)
            )
            const canNext = !dailyProfitBounds || (
              year < dailyProfitBounds.max.year ||
              (year === dailyProfitBounds.max.year && month < dailyProfitBounds.max.month)
            )

            const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

            return (
              <ChartCard title="Daily Profit (Risk-Based)" icon={CalendarDays} className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goPrev}
                      disabled={!canPrev}
                      className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-raised-sm)', color: '#9ca3af' }}
                      title="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="text-sm sm:text-base font-semibold text-white min-w-[150px] text-center">{monthLabel}</div>
                    <button
                      onClick={goNext}
                      disabled={!canNext}
                      className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--neu-bg)', boxShadow: 'var(--neu-raised-sm)', color: '#9ca3af' }}
                      title="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 text-xs flex-wrap">
                    <div className="flex flex-col">
                      <span className="text-gray-500 uppercase tracking-wider text-[10px]">Month P/L</span>
                      <span className={`font-mono font-semibold text-sm ${monthlyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {monthlyProfit >= 0 ? '+' : '-'}{Math.abs(monthlyProfit).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 uppercase tracking-wider text-[10px]">Trades</span>
                      <span className="font-mono font-semibold text-sm text-white">{monthlyTrades}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 uppercase tracking-wider text-[10px]">W / L</span>
                      <span className="font-mono font-semibold text-sm">
                        <span className="text-green-400">{monthlyWins}</span>
                        <span className="text-gray-600 mx-1">/</span>
                        <span className="text-red-400">{monthlyLosses}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mb-3 text-[10px] sm:text-xs text-gray-500">
                  <span>Loss</span>
                  <div
                    className="h-2 w-24 sm:w-32 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, rgba(248,81,73,0.9) 0%, rgba(110,118,129,0.25) 50%, rgba(173,255,47,0.9) 100%)',
                    }}
                  />
                  <span>Profit</span>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {weekdayLabels.map(w => (
                    <div key={w} className="text-[10px] sm:text-xs text-gray-500 text-center py-1 uppercase tracking-wider">{w}</div>
                  ))}
                  {cells.map((cell, i) => {
                    if (cell === null) return <div key={i} className="h-10 sm:h-12" />
                    const profit  = cell.data?.profit
                    const trades  = cell.data?.trades || 0
                    const hasData = cell.data != null
                    return (
                      <div
                        key={i}
                        className="h-10 sm:h-12 px-1 py-0.5 sm:px-1.5 sm:py-1 flex flex-col justify-between transition-all"
                        style={{
                          background: hasData ? cellColor(profit) : 'rgba(255,255,255,0.02)',
                          borderRadius: '5px',
                          boxShadow: hasData ? 'inset 0 0 0 1px rgba(255,255,255,0.06)' : 'none',
                        }}
                        title={hasData
                          ? `${monthLabel} ${cell.day} — ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}% (${trades} trade${trades !== 1 ? 's' : ''})`
                          : `${monthLabel} ${cell.day} — no trades`}
                      >
                        <div className="text-[9px] sm:text-[10px] font-semibold text-white/90 leading-none">{cell.day}</div>
                        {hasData && (
                          <div className="text-right">
                            <div className="text-[8px] sm:text-[10px] font-mono font-bold leading-none text-white">
                              {profit >= 0 ? '+' : ''}{profit.toFixed(1)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {monthlyTrades === 0 && (
                  <div className="text-center text-gray-500 py-6 text-sm">
                    No closed trades this month
                  </div>
                )}
              </ChartCard>
            )
          })()}

          {/* ============ Other charts ============ */}
          {activeTab === 'other' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <ChartCard title="Outcomes by Side" icon={Target}>
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={outcomeBySideData} layout="vertical" barSize={18} barGap={4} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" stroke="#6e7681" fontSize={11} tickMargin={8} />
                        <YAxis type="category" dataKey="side" stroke="#6e7681" fontSize={11} width={60} />
                        <Tooltip contentStyle={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
                        <Legend wrapperStyle={{ paddingTop: 10 }} />
                        <Bar dataKey="profit"    fill={COLORS.green} name="Profit"    radius={[0, 4, 4, 0]} />
                        <Bar dataKey="loss"      fill={COLORS.red}   name="Loss"      radius={[0, 4, 4, 0]} />
                        <Bar dataKey="breakeven" fill={COLORS.gray}  name="Breakeven" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Performance by Hour" icon={Clock}>
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={hourlyChartData} barSize={12} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                        <XAxis dataKey="hour" stroke="#6e7681" fontSize={10} tickMargin={8} />
                        <YAxis stroke="#6e7681" fontSize={11} width={36} />
                        <Tooltip contentStyle={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
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
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={dowChartData} layout="vertical" barSize={20} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" stroke="#6e7681" fontSize={11} tickMargin={8} />
                        <YAxis type="category" dataKey="day" stroke="#6e7681" fontSize={11} width={60} />
                        <Tooltip contentStyle={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
                        <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                          {dowChartData.map((entry, index) => (
                            <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Rolling Win Rate (20 trades)" icon={TrendingUp}>
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={rollingWinRateData} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                        <XAxis dataKey="trade" stroke="#6e7681" fontSize={11} />
                        <YAxis stroke="#6e7681" fontSize={11} domain={[0, 100]} width={36} />
                        <Tooltip contentStyle={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
                        <Line type="monotone" dataKey="winRate" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            </>
          )}

          <div className="pb-8" />
        </div>
      </main>
    </div>
  )
}
