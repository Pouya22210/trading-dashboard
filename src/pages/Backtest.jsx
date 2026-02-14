import React, { useState, useEffect } from 'react'
import { 
  FlaskConical, Calendar, Target, Shield, XCircle, 
  Play, Loader2, TrendingUp, TrendingDown, Trophy,
  AlertCircle, ArrowUpRight, ArrowDownRight, BarChart3
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// API Base URL - adjust based on your setup
const API_BASE_URL = import.meta.env.VITE_BACKTEST_API_URL || 'https://unkindhearted-lilian-unspent.ngrok-free.dev'


export default function Backtest() {
  // State
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  
  // Form state
  const [selectedChannel, setSelectedChannel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // TP Policy
  const [tpKind, setTpKind] = useState('rr')
  const [tpRrRatio, setTpRrRatio] = useState(1.0)
  const [tpIndex, setTpIndex] = useState(0)
  
  // Riskfree Policy
  const [rfEnabled, setRfEnabled] = useState(false)
  const [rfKind, setRfKind] = useState('%path')
  const [rfPercent, setRfPercent] = useState(50)
  const [rfTpIndex, setRfTpIndex] = useState(0)
  const [rfPips, setRfPips] = useState(0)
  
  // Cancel Policy
  const [cancelEnabled, setCancelEnabled] = useState(true)
  const [cancelKind, setCancelKind] = useState('final_tp')
  const [cancelTpIndex, setCancelTpIndex] = useState(0)
  const [cancelPercent, setCancelPercent] = useState(100)

  // Load channels on mount
  useEffect(() => {
    loadChannels()
    
    // Set default date range (last 30 days)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    
    setStartDate(start.toISOString().split('T')[0])
    setEndDate(end.toISOString().split('T')[0])
  }, [])

  const loadChannels = async () => {
    try {
      setLoadingChannels(true)
      // Load directly from Supabase
      const { data, error: supabaseError } = await supabase
        .from('channels')
        .select('id, channel_key, telegram_channel_id, is_active')
        .order('channel_key')
      
      if (supabaseError) throw supabaseError
      
      setChannels(data || [])
      if (data && data.length > 0) {
        setSelectedChannel(data[0].id)
      }
    } catch (err) {
      console.error('Failed to load channels:', err)
      setError(`Failed to load channels: ${err.message}`)
    } finally {
      setLoadingChannels(false)
    }
  }

  const runBacktest = async () => {
    if (!selectedChannel || !startDate || !endDate) {
      setError('Please select a channel and date range')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const payload = {
        channel_id: selectedChannel,
        start_date: startDate,
        end_date: endDate,
        tp_policy: buildTpPolicy(),
        riskfree_policy: buildRiskfreePolicy(),
        cancel_policy: buildCancelPolicy()
      }

      const response = await fetch(`${API_BASE_URL}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        setResults(data.result)
      } else {
        setError(data.error || 'Backtest failed')
      }
    } catch (err) {
      setError(`Failed to run backtest: ${err.message}. Make sure the backtest API server is running.`)
    } finally {
      setLoading(false)
    }
  }

  const buildTpPolicy = () => ({
    kind: tpKind,
    rr_ratio: tpKind === 'rr' ? parseFloat(tpRrRatio) : null,
    tp_index: tpKind === 'tp_index' ? parseInt(tpIndex) : null
  })

  const buildRiskfreePolicy = () => ({
    enabled: rfEnabled,
    kind: rfKind,
    percent: rfKind === '%path' ? parseFloat(rfPercent) : null,
    tp_index: rfKind === 'tp_index' ? parseInt(rfTpIndex) : null,
    pips: rfKind === 'pips' ? parseFloat(rfPips) : null
  })

  const buildCancelPolicy = () => ({
    enabled: cancelEnabled,
    kind: cancelKind,
    tp_index: cancelKind === 'tp_index' ? parseInt(cancelTpIndex) : null,
    percent: cancelKind === '%path' ? parseFloat(cancelPercent) : null
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Strategy Backtest</h1>
        </div>
        <p className="text-gray-400 ml-13">
          Test different configurations on historical trades to optimize your strategy
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-dark-secondary border border-dark-border rounded-xl p-6 mb-6">
        
        {/* Channel & Date Selection */}
        <div className="mb-6 pb-6 border-b border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-accent-cyan" />
            <h3 className="text-sm font-semibold text-white">Channel & Period</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Channel</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                disabled={loadingChannels}
                className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
              >
                <option value="">Select a channel...</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    {ch.is_active ? '✓' : '✗'} {ch.channel_key}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
              />
            </div>
          </div>
        </div>

        {/* TP Policy */}
        <div className="mb-6 pb-6 border-b border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">Take Profit Policy</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">TP Type</label>
              <select
                value={tpKind}
                onChange={(e) => setTpKind(e.target.value)}
                className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
              >
                <option value="rr">Risk-Reward Ratio</option>
                <option value="tp_index">TP Index (from signal)</option>
              </select>
            </div>
            
            {tpKind === 'rr' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">RR Ratio</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={tpRrRatio}
                  onChange={(e) => setTpRrRatio(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                />
              </div>
            )}
            
            {tpKind === 'tp_index' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">TP Index (0-based)</label>
                <input
                  type="number"
                  min="0"
                  value={tpIndex}
                  onChange={(e) => setTpIndex(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* Riskfree Policy */}
        <div className="mb-6 pb-6 border-b border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold text-white">Riskfree (Breakeven) Policy</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rfEnabled}
                onChange={(e) => setRfEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-cyan focus:ring-accent-cyan focus:ring-offset-0"
              />
              <span className="text-xs text-gray-400">Enabled</span>
            </label>
          </div>

          {rfEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Trigger Type</label>
                <select
                  value={rfKind}
                  onChange={(e) => setRfKind(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                >
                  <option value="%path">% of Path to TP</option>
                  <option value="tp_index">At TP Index</option>
                  <option value="pips">Fixed Pips</option>
                </select>
              </div>
              
              {rfKind === '%path' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Percent (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={rfPercent}
                    onChange={(e) => setRfPercent(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>
              )}
              
              {rfKind === 'tp_index' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">TP Index</label>
                  <input
                    type="number"
                    min="0"
                    value={rfTpIndex}
                    onChange={(e) => setRfTpIndex(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>
              )}
              
              {rfKind === 'pips' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Pips</label>
                  <input
                    type="number"
                    min="0"
                    value={rfPips}
                    onChange={(e) => setRfPips(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cancel Policy */}
        <div className="mb-6 pb-6 border-b border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Cancel Policy</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cancelEnabled}
                onChange={(e) => setCancelEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-cyan focus:ring-accent-cyan focus:ring-offset-0"
              />
              <span className="text-xs text-gray-400">Enabled</span>
            </label>
          </div>

          {cancelEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Cancel At</label>
                <select
                  value={cancelKind}
                  onChange={(e) => setCancelKind(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                >
                  <option value="final_tp">Final TP Price</option>
                  <option value="tp_index">Specific TP Index</option>
                  <option value="%path">% of Path to TP</option>
                </select>
              </div>
              
              {cancelKind === 'tp_index' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">TP Index</label>
                  <input
                    type="number"
                    min="0"
                    value={cancelTpIndex}
                    onChange={(e) => setCancelTpIndex(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>
              )}
              
              {cancelKind === '%path' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Percent (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={cancelPercent}
                    onChange={(e) => setCancelPercent(e.target.value)}
                    className="w-full px-3 py-2.5 bg-dark-tertiary border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-accent-cyan transition-colors"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Run Button */}
        <div className="flex justify-end">
          <button
            onClick={runBacktest}
            disabled={loading || !selectedChannel}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all
              ${loading || !selectedChannel
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary hover:shadow-lg hover:shadow-accent-cyan/20'
              }
            `}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Backtest
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Results Panel */}
      {results && (
        <div className="bg-dark-secondary border border-dark-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-accent-cyan" />
            <h3 className="text-lg font-semibold text-white">Backtest Results</h3>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Total Trades"
              value={results.total_trades}
              icon={<BarChart3 className="w-5 h-5" />}
              iconColor="text-gray-400"
            />
            <SummaryCard
              title="Wins"
              value={results.wins}
              icon={<Trophy className="w-5 h-5" />}
              iconColor="text-green-400"
              subtitle={`Original: ${results.original_wins}`}
              valueColor="text-green-400"
            />
            <SummaryCard
              title="Losses"
              value={results.losses}
              icon={<TrendingDown className="w-5 h-5" />}
              iconColor="text-red-400"
              subtitle={`Original: ${results.original_losses}`}
              valueColor="text-red-400"
            />
            <SummaryCard
              title="Breakeven"
              value={results.breakevens}
              icon={<Shield className="w-5 h-5" />}
              iconColor="text-yellow-400"
              subtitle={`Original: ${results.original_breakevens}`}
              valueColor="text-yellow-400"
            />
            <SummaryCard
              title="Win Rate"
              value={`${results.win_rate}%`}
              icon={<Target className="w-5 h-5" />}
              iconColor="text-accent-cyan"
              valueColor="text-accent-cyan"
            />
            <SummaryCard
              title="Total Pips"
              value={results.total_pips}
              icon={results.total_pips >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              iconColor={results.total_pips >= 0 ? 'text-green-400' : 'text-red-400'}
              subtitle={`Diff: ${results.pips_difference >= 0 ? '+' : ''}${results.pips_difference}`}
              valueColor={results.total_pips >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <SummaryCard
              title="Avg Pips/Trade"
              value={results.avg_pips_per_trade}
              icon={<BarChart3 className="w-5 h-5" />}
              iconColor="text-gray-400"
            />
            <SummaryCard
              title="Avg RR"
              value={results.avg_rr}
              icon={<Target className="w-5 h-5" />}
              iconColor="text-purple-400"
              valueColor="text-purple-400"
            />
          </div>

          {/* Comparison Banner */}
          <div className={`
            flex items-center gap-3 p-4 rounded-xl mb-6 border
            ${results.pips_difference >= 0 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-red-500/10 border-red-500/30'
            }
          `}>
            {results.pips_difference >= 0 ? (
              <ArrowUpRight className="w-6 h-6 text-green-400" />
            ) : (
              <ArrowDownRight className="w-6 h-6 text-red-400" />
            )}
            <span className={`text-sm font-medium ${results.pips_difference >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {results.pips_difference >= 0 
                ? `This configuration would have gained ${results.pips_difference} more pips`
                : `This configuration would have lost ${Math.abs(results.pips_difference)} more pips`
              }
            </span>
          </div>

          {/* Trade Details Table */}
          {results.trades && results.trades.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Trade Details</h4>
              <div className="overflow-x-auto rounded-lg border border-dark-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-dark-tertiary">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Trade ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Symbol</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Direction</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Entry</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">TP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">SL</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Outcome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Pips</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">RR</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Original</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border">
                    {results.trades.map((trade, i) => (
                      <tr key={i} className="hover:bg-dark-tertiary/50 transition-colors">
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                          {trade.trade_id.slice(0, 12)}...
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{trade.symbol}</td>
                        <td className="px-4 py-3">
                          <span className={`
                            px-2 py-1 rounded text-xs font-semibold
                            ${trade.direction === 'buy' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                            }
                          `}>
                            {trade.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono">{trade.entry_price}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono">{trade.tp_price}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono">{trade.sl_price}</td>
                        <td className="px-4 py-3">
                          <OutcomeBadge outcome={trade.outcome} />
                        </td>
                        <td className={`px-4 py-3 font-semibold font-mono ${
                          trade.pips_gained >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.pips_gained >= 0 ? '+' : ''}{trade.pips_gained}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono">{trade.rr_achieved}</td>
                        <td className="px-4 py-3">
                          <OutcomeBadge outcome={trade.original_outcome} small />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// Helper Components

function SummaryCard({ title, value, icon, iconColor, subtitle, valueColor }) {
  return (
    <div className="bg-dark-tertiary border border-dark-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-xs font-medium text-gray-400">{title}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor || 'text-white'}`}>{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
      )}
    </div>
  )
}

function OutcomeBadge({ outcome, small }) {
  const config = {
    profit: { bg: 'bg-green-500/20', color: 'text-green-400', text: 'WIN' },
    loss: { bg: 'bg-red-500/20', color: 'text-red-400', text: 'LOSS' },
    breakeven: { bg: 'bg-yellow-500/20', color: 'text-yellow-400', text: 'BE' },
    canceled: { bg: 'bg-gray-500/20', color: 'text-gray-400', text: 'CANCEL' }
  }
  
  const c = config[outcome] || config.canceled
  
  return (
    <span className={`
      inline-block px-2 py-1 rounded font-semibold
      ${c.bg} ${c.color}
      ${small ? 'text-[10px]' : 'text-xs'}
    `}>
      {c.text}
    </span>
  )
}
