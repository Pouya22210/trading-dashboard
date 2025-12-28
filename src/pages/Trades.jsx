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
  const [currentPage, setCurrentPage] = useState(1)
  const tradesPerPage = 10
  
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

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

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

  // Pagination Logic
  const indexOfLastTrade = currentPage * tradesPerPage
  const indexOfFirstTrade = indexOfLastTrade - tradesPerPage
  const currentTrades = filteredTrades.slice(indexOfFirstTrade, indexOfLastTrade)
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage)

  const paginate = (pageNumber) => setCurrentPage(pageNumber)

  // Calculate filtered stats
  const closedTrades = filteredTrades.filter(t => t.status === 'closed')
  const wins = closedTrades.filter(t => t.outcome === 'profit').length
  const losses = closedTrades.filter(t => t.outcome === 'loss').length
  const netPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : 0

  // Chart data calculations (remains same as your original)
  const outcomeBySide = filteredTrades.reduce((acc, trade) => {
    if (trade.status !== 'closed') return acc
    const side = trade.direction || 'Unknown'
    const outcome = trade.outcome || 'unknown'
    if (!acc[side]) acc[side] = { side, profit: 0, loss: 0, breakeven: 0 }
    acc[side][outcome] = (acc[side][outcome] || 0) + 1
    return acc
  }, {})
  const outcomeBySideData = Object.values(outcomeBySide)

  const hourlyData = filteredTrades.reduce((acc, trade) => {
    if (trade.status !== 'closed' || !trade.signal_time) return acc
    const hour = new Date(trade.signal_time).getHours()
    if (!acc[hour]) acc[hour] = { hour: `${hour}:00`, pnl: 0, count: 0 }
    acc[hour].pnl += trade.profit_loss || 0
    acc[hour].count++
    return acc
  }, {})
  const hourlyChartData = Object.values(hourlyData).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))

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
      {/* Filters (UI Remains Same) */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
           {/* ... filter inputs ... */}
           <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Calendar className="w-3 h-3 text-accent-cyan" /> Start Date
            </label>
            <input type="date" className="w-full bg-dark-secondary border border-dark-border rounded px-2 py-1 text-sm text-white" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Calendar className="w-3 h-3 text-accent-cyan" /> End Date
            </label>
            <input type="date" className="w-full bg-dark-secondary border border-dark-border rounded px-2 py-1 text-sm text-white" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Filter className="w-3 h-3 text-accent-cyan" /> Channel
            </label>
            <select className="w-full bg-dark-secondary border border-dark-border rounded px-2 py-1 text-sm text-white" value={filters.channel} onChange={e => setFilters({ ...filters, channel: e.target.value })}>
              <option value="">All Channels</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.channel_key}>{ch.channel_key}</option>
              ))}
            </select>
          </div>
          {/* Note: I've truncated the repeated filter UI for brevity, but kept the logic intact */}
        </div>
        <button onClick={clearFilters} className="btn-secondary flex items-center gap-2">
          <X className="w-4 h-4" /> Clear Filters
        </button>
      </div>

      {/* Stats Summary (UI Remains Same) */}
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

      <div className="flex gap-3 mb-6">
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Trades Table with Pagination */}
      <div className="chart-card mb-6">
        <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
          <BarChart3 className="w-4 h-4 text-accent-cyan" />
          <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Trade History</span>
          <span className="ml-auto text-xs text-gray-500">Showing {indexOfFirstTrade + 1}-{Math.min(indexOfLastTrade, filteredTrades.length)} of {filteredTrades.length}</span>
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
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-dark-border bg-dark-tertiary/30">
            <div className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-1">
              <button 
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-dark-border disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // Only show a few numbers around the current page to keep it clean
                if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => paginate(pageNum)}
                      className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                        currentPage === pageNum 
                        ? 'bg-accent-cyan text-dark-main' 
                        : 'text-gray-400 hover:bg-dark-border'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                  return <span key={pageNum} className="text-gray-600 px-1">...</span>;
                }
                return null;
              })}

              <button 
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-dark-border disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Charts (Rest of code remains unchanged) */}
      {/* ... */}
    </div>
  )
}
