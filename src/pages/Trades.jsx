import React, { useState, useEffect } from 'react'
import { 
  Calendar, Filter, Download, Plus, Trash2, Search, X,
  BarChart3, Clock, TrendingUp, Target, ChevronLeft, ChevronRight
} from 'lucide-react'
import { 
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { fetchTrades, fetchChannels, subscribeToTrades } from '../lib/supabase'

const COLORS = {
  green: '#3fb950',
  red: '#f85149',
  blue: '#58a6ff',
  cyan: '#39d5ff',
  purple: '#a371f7',
}

function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="chart-card">
      <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
        <Icon className="w-4 h-4 text-accent-cyan" />
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRows, setSelectedRows] = useState([])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  
  // Filters
  const [filters, setFilters] = useState({
    channel: '',
    orderType: '',
    side: '',
    status: '',
    startDate: '',
    endDate: '',
  })

  useEffect(() => {
    loadData()
    
    const subscription = subscribeToTrades(() => loadData())
    return () => subscription.unsubscribe()
  }, [])

  async function loadData() {
    try {
      const [tradesData, channelsData] = await Promise.all([
        fetchTrades({ limit: 500 }),
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

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (filters.channel && trade.channel_name !== filters.channel) return false
    if (filters.orderType && trade.order_type !== filters.orderType) return false
    if (filters.side && trade.direction !== filters.side) return false
    if (filters.status && trade.status !== filters.status) return false
    if (filters.startDate && new Date(trade.signal_time) < new Date(filters.startDate)) return false
    if (filters.endDate && new Date(trade.signal_time) > new Date(filters.endDate)) return false
    return true
  })

  // Reset to first page whenever filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  // Keep currentPage in range when number of trades changes
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize))
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [filteredTrades.length, currentPage])

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize))
  const startIndex = (currentPage - 1) * pageSize
  const currentTrades = filteredTrades.slice(startIndex, startIndex + pageSize)
  const showingFrom = filteredTrades.length === 0 ? 0 : startIndex + 1
  const showingTo = Math.min(filteredTrades.length, startIndex + pageSize)

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
    setFilters({ channel: '', orderType: '', side: '', status: '', startDate: '', endDate: '' })
  }

  function exportCSV() {
    const headers = ['Trade ID', 'Channel', 'Symbol', 'Side', 'Order Type', 'Entry', 'TP', 'SL', 'P&L', 'Status', 'Time']
    const rows = filteredTrades.map(t => [
      t.trade_id, t.channel_name, t.symbol, t.direction, t.order_type,
      t.executed_entry_price, t.executed_tp_price, t.executed_sl_price,
      t.profit_loss, t.status, t.signal_time
    ])
    
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-gray-500">Loading trades...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
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
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Filter className="w-3 h-3 text-accent-cyan" /> Channel
            </label>
            <select
              value={filters.channel}
              onChange={e => setFilters({ ...filters, channel: e.target.value })}
            >
              <option value="">All Channels</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.channel_key}>{ch.channel_key}</option>
              ))}
            </select>
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

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Trades Table */}
      <div className="chart-card mb-6">
        <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
          <BarChart3 className="w-4 h-4 text-accent-cyan" />
          <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tradeeeeeeee History</span>
          <span className="ml-auto text-xs text-gray-500">
            {filteredTrades.length} trades • Page {totalPages === 0 ? 0 : currentPage} of {totalPages}
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
              {currentTrades.map(trade => (
                <tr key={trade.id}>
                  <td className="text-accent-cyan">{trade.trade_id?.slice(0, 12) || '-'}</td>
                  <td>{trade.channel_name?.slice(0, 20) || '-'}</td>
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
                    <span className={`badge ${
                      trade.status === 'closed' ? (trade.outcome === 'profit' ? 'badge-success' : 'badge-danger') :
                      trade.status === 'active' ? 'badge-warning' : 'badge-neutral'
                    }`}>
                      {trade.status || '-'}
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

        {/* Pagination Controls */}
        {filteredTrades.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-dark-border text-sm text-gray-400">
            <div>
              Showing <span className="text-white font-mono">{showingFrom}</span>
              {'–'}
              <span className="text-white font-mono">{showingTo}</span> of{' '}
              <span className="text-white font-mono">{filteredTrades.length}</span> trades
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary px-2 py-1 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <span className="px-3 py-1 rounded-md bg-dark-tertiary border border-dark-border font-mono text-xs">
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="btn-secondary px-2 py-1 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || filteredTrades.length === 0}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
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
              <Bar dataKey="breakeven" fill={COLORS.blue} name="Breakeven" stackId="a" />
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
