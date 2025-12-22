import React, { useState, useEffect } from 'react'
import { 
  TrendingUp, TrendingDown, Activity, Target, Award, AlertTriangle,
  DollarSign, BarChart3, PieChart, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { 
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts'
import { fetchTrades, subscribeToTrades } from '../lib/supabase'

const COLORS = {
  green: '#3fb950',
  red: '#f85149',
  blue: '#58a6ff',
  cyan: '#39d5ff',
  purple: '#a371f7',
  yellow: '#d29922',
}

function KPICard({ title, value, subtitle, icon: Icon, trend, trendValue }) {
  const isPositive = trend === 'up'
  
  return (
    <div className="kpi-card">
      <div className="mb-3">
        <Icon className="w-5 h-5 text-accent-cyan" />
      </div>
      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className={`text-2xl font-bold font-mono ${
        value?.toString().includes('-') ? 'text-red-400' : 
        value?.toString().includes('+') || parseFloat(value) > 0 ? 'text-green-400' : 'text-white'
      }`}>
        {value}
      </div>
      {subtitle && (
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          {trend && (
            <span className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trendValue}
            </span>
          )}
          <span>{subtitle}</span>
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="chart-card">
      <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-dark-tertiary to-dark-secondary border-b border-dark-border">
        <Icon className="w-4 h-4 text-accent-cyan" />
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})

  useEffect(() => {
    loadTrades()
    
    // Subscribe to real-time updates
    const subscription = subscribeToTrades(() => {
      loadTrades()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadTrades() {
    try {
      const data = await fetchTrades({ limit: 500 })
      setTrades(data)
      calculateKPIs(data)
    } catch (err) {
      console.error('Failed to load trades:', err)
    } finally {
      setLoading(false)
    }
  }

  function calculateKPIs(trades) {
    const closed = trades.filter(t => t.status === 'closed')
    const wins = closed.filter(t => t.outcome === 'profit')
    const losses = closed.filter(t => t.outcome === 'loss')
    
    const totalProfit = closed.filter(t => t.profit_loss > 0).reduce((sum, t) => sum + (t.profit_loss || 0), 0)
    const totalLoss = Math.abs(closed.filter(t => t.profit_loss < 0).reduce((sum, t) => sum + (t.profit_loss || 0), 0))
    const netProfit = closed.reduce((sum, t) => sum + (t.profit_loss || 0), 0)
    
    setKpis({
      totalTrades: closed.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      netProfit: netProfit,
      winRate: closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) : 0,
      profitFactor: totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : 0,
      avgWin: wins.length > 0 ? (totalProfit / wins.length).toFixed(2) : 0,
      avgLoss: losses.length > 0 ? (totalLoss / losses.length).toFixed(2) : 0,
      maxWin: Math.max(...closed.map(t => t.profit_loss || 0), 0).toFixed(2),
      maxLoss: Math.min(...closed.map(t => t.profit_loss || 0), 0).toFixed(2),
    })
  }

  // Prepare chart data
  const channelPnL = trades.reduce((acc, trade) => {
    if (trade.status !== 'closed') return acc
    const channel = trade.channel_name || 'Unknown'
    acc[channel] = (acc[channel] || 0) + (trade.profit_loss || 0)
    return acc
  }, {})

  const channelChartData = Object.entries(channelPnL).map(([name, pnl]) => ({
    name: name.length > 20 ? name.substring(0, 20) + '...' : name,
    pnl: parseFloat(pnl.toFixed(2)),
    fill: pnl >= 0 ? COLORS.green : COLORS.red
  }))

  const winLossData = [
    { name: 'Wins', value: kpis.winTrades || 0, fill: COLORS.green },
    { name: 'Losses', value: kpis.lossTrades || 0, fill: COLORS.red },
  ]

  // Daily P&L
  const dailyPnL = trades.reduce((acc, trade) => {
    if (trade.status !== 'closed' || !trade.close_time) return acc
    const date = new Date(trade.close_time).toLocaleDateString()
    acc[date] = (acc[date] || 0) + (trade.profit_loss || 0)
    return acc
  }, {})

  const dailyChartData = Object.entries(dailyPnL)
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }))
    .slice(-14)

  // Cumulative P&L
  let cumulative = 0
  const cumulativeData = trades
    .filter(t => t.status === 'closed')
    .sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
    .map((trade, idx) => {
      cumulative += trade.profit_loss || 0
      return { trade: idx + 1, cumulative: parseFloat(cumulative.toFixed(2)) }
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Primary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Net Profit"
          value={`$${kpis.netProfit?.toFixed(2) || '0.00'}`}
          icon={DollarSign}
          subtitle="Total realized P&L"
        />
        <KPICard
          title="Total Trades"
          value={kpis.totalTrades || 0}
          icon={Activity}
          subtitle="Closed positions"
        />
        <KPICard
          title="Win Rate"
          value={`${kpis.winRate || 0}%`}
          icon={Target}
          subtitle={`${kpis.winTrades} wins / ${kpis.lossTrades} losses`}
        />
        <KPICard
          title="Profit Factor"
          value={kpis.profitFactor || '0.00'}
          icon={Award}
          subtitle="Gross profit / Gross loss"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KPICard title="Win Trades" value={kpis.winTrades || 0} icon={TrendingUp} />
        <KPICard title="Loss Trades" value={kpis.lossTrades || 0} icon={TrendingDown} />
        <KPICard title="Avg Win" value={`$${kpis.avgWin || '0'}`} icon={ArrowUpRight} />
        <KPICard title="Avg Loss" value={`$${kpis.avgLoss || '0'}`} icon={ArrowDownRight} />
        <KPICard title="Max Win" value={`$${kpis.maxWin || '0'}`} icon={TrendingUp} />
        <KPICard title="Max Loss" value={`$${kpis.maxLoss || '0'}`} icon={AlertTriangle} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ChartCard title="P&L by Channel" icon={BarChart3}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelChartData} layout="vertical">
                <XAxis type="number" stroke="#6e7681" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#6e7681" fontSize={11} width={120} />
                <Tooltip 
                  contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                  {channelChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        
        <ChartCard title="Win/Loss Distribution" icon={PieChart}>
          <ResponsiveContainer width="100%" height={300}>
            <RePieChart>
              <Pie
                data={winLossData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {winLossData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
              />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily P&L" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyChartData}>
              <XAxis dataKey="date" stroke="#6e7681" fontSize={10} />
              <YAxis stroke="#6e7681" fontSize={11} />
              <Tooltip 
                contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {dailyChartData.map((entry, index) => (
                  <Cell key={index} fill={entry.pnl >= 0 ? COLORS.green : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cumulative P&L" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeData}>
              <defs>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="trade" stroke="#6e7681" fontSize={11} />
              <YAxis stroke="#6e7681" fontSize={11} />
              <Tooltip 
                contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8 }}
              />
              <Area 
                type="monotone" 
                dataKey="cumulative" 
                stroke={COLORS.cyan} 
                fillOpacity={1} 
                fill="url(#colorCumulative)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
