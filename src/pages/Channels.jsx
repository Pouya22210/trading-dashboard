import React, { useState, useEffect } from 'react'
import { 
  Plus, Edit2, Trash2, Settings, Shield, Target, Zap, 
  MessageSquare, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  Save, X, Check, RefreshCw
} from 'lucide-react'
import { fetchChannels, createChannel, updateChannel, deleteChannel, subscribeToChannels } from '../lib/supabase'
import LogoutButton from '../components/LogoutButton'

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div 
        className={`toggle-switch ${checked ? 'active' : ''}`}
        onClick={() => onChange(!checked)}
      />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function FormField({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-400 mb-2">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30' 
          : 'text-gray-400 hover:text-white hover:bg-dark-tertiary'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function ChannelEditorModal({ channel, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('basic')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    channel_key: '',
    risk_per_trade: 0.02,
    risk_tolerance: 0.1,
    magic_number: 123456,
    max_slippage_points: 20,
    trade_monitor_interval_sec: 0.5,
    is_active: true,
    is_reversed: false,  // v11.0: Reverse trade feature
    instruments: [{ logical_symbol: 'XAUUSD', broker_symbol: 'XAUUSD', pip_tolerance_pips: 1.5 }],
    final_tp_policy: { kind: 'rr', rr_ratio: 1.0, tp_index: 1 },
    riskfree_policy: { enabled: true, kind: '%path', percent: 50, pips: 10, tp_index: 1 },
    cancel_policy: { enabled: true, kind: 'final_tp', percent: 50, tp_index: 1, enable_for_now: true, enable_for_limit: true, enable_for_auto: true },
    commands: { enable_close: true, enable_cancel_limit: true, enable_riskfree: false, close_phrases: [], cancel_limit_phrases: [], riskfree_phrases: [] },
    circuit_breaker: { enabled: true, max_daily_trades: 20, max_daily_loss_pct: 10 },
    trend_filter: { enabled: false, swing_strength: 2, min_swings_required: 2, ema_period: 50, candles_to_fetch: 100, require_all_three: false, log_details: true },
  })

  useEffect(() => {
    if (channel) {
      setFormData({
        channel_key: channel.channel_key || '',
        risk_per_trade: channel.risk_per_trade || 0.02,
        risk_tolerance: channel.risk_tolerance || 0.1,
        magic_number: channel.magic_number || 123456,
        max_slippage_points: channel.max_slippage_points || 20,
        trade_monitor_interval_sec: channel.trade_monitor_interval_sec || 0.5,
        is_active: channel.is_active ?? true,
        is_reversed: channel.is_reversed ?? false,  // v11.0: Reverse trade feature
        instruments: channel.instruments || [{ logical_symbol: 'XAUUSD', broker_symbol: 'XAUUSD', pip_tolerance_pips: 1.5 }],
        final_tp_policy: channel.final_tp_policy || { kind: 'rr', rr_ratio: 1.0, tp_index: 1 },
        riskfree_policy: channel.riskfree_policy || { enabled: false, kind: '%path', percent: 50 },
        cancel_policy: channel.cancel_policy || { enabled: true, kind: 'final_tp', enable_for_now: true, enable_for_limit: true, enable_for_auto: true },
        commands: channel.commands || { enable_close: true, enable_cancel_limit: true, enable_riskfree: false, close_phrases: [], cancel_limit_phrases: [], riskfree_phrases: [] },
        circuit_breaker: channel.circuit_breaker || { enabled: true, max_daily_trades: 20, max_daily_loss_pct: 10 },
        trend_filter: channel.trend_filter || { enabled: false, swing_strength: 2, min_swings_required: 2, ema_period: 50, candles_to_fetch: 100, require_all_three: false, log_details: true },
      })
    }
  }, [channel])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } catch (err) {
      console.error('Save failed:', err)
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'basic', icon: Settings, label: 'Basic' },
    { id: 'instruments', icon: TrendingUp, label: 'Instruments' },
    { id: 'tp', icon: Target, label: 'TP Policy' },
    { id: 'riskfree', icon: Shield, label: 'Risk-Free' },
    { id: 'cancel', icon: X, label: 'Cancel' },
    { id: 'trend', icon: TrendingUp, label: 'Trend Filter' },
    { id: 'commands', icon: MessageSquare, label: 'Commands' },
    { id: 'circuit', icon: Zap, label: 'Circuit Breaker' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-accent-cyan" />
            {channel ? 'Edit Channel' : 'Add Channel'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-b border-dark-border">
          <div className="flex flex-wrap gap-2 p-4">
            {tabs.map(tab => (
              <TabButton
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                icon={tab.icon}
                label={tab.label}
              />
            ))}
          </div>
        </div>

        <div className="modal-body max-h-[60vh] overflow-y-auto">
          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <FormField label="Channel Key" hint="Telegram channel name or ID">
                <input
                  type="text"
                  value={formData.channel_key}
                  onChange={e => setFormData({ ...formData, channel_key: e.target.value })}
                  placeholder="e.g., FOREX TRADING MASTER™🏙"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Risk Per Trade" hint="e.g., 0.02 = 2%">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="0.5"
                    value={formData.risk_per_trade}
                    onChange={e => setFormData({ ...formData, risk_per_trade: parseFloat(e.target.value) })}
                  />
                </FormField>
                <FormField label="Risk Tolerance" hint="Allowed % over limit">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={formData.risk_tolerance}
                    onChange={e => setFormData({ ...formData, risk_tolerance: parseFloat(e.target.value) })}
                  />
                </FormField>
              </div>
              <FormField label="Magic Number">
                <input
                  type="number"
                  value={formData.magic_number}
                  onChange={e => setFormData({ ...formData, magic_number: parseInt(e.target.value) })}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Max Slippage (points)">
                  <input
                    type="number"
                    value={formData.max_slippage_points}
                    onChange={e => setFormData({ ...formData, max_slippage_points: parseInt(e.target.value) })}
                  />
                </FormField>
                <FormField label="Monitor Interval (sec)">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.trade_monitor_interval_sec}
                    onChange={e => setFormData({ ...formData, trade_monitor_interval_sec: parseFloat(e.target.value) })}
                  />
                </FormField>
              </div>
              
              {/* Channel Active Toggle */}
              <Toggle
                checked={formData.is_active}
                onChange={checked => setFormData({ ...formData, is_active: checked })}
                label="Channel Active"
              />
              
              {/* v11.0: Reverse Signals Toggle */}
              <div className={`flex items-center justify-between p-4 rounded-lg border ${
                formData.is_reversed 
                  ? 'bg-orange-500/10 border-orange-500/50' 
                  : 'bg-dark-tertiary border-dark-border'
              }`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 ${formData.is_reversed ? 'text-orange-400' : 'text-gray-500'}`} />
                    <label className={`text-sm font-medium ${formData.is_reversed ? 'text-orange-400' : 'text-gray-400'}`}>
                      Reverse Signals
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    BUY→SELL, SELL→BUY, swap TP/SL. Use for poorly performing channels.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_reversed}
                  onChange={e => setFormData({ ...formData, is_reversed: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-600 text-orange-500 focus:ring-orange-500"
                />
              </div>
              
              {formData.is_reversed && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                  <p className="text-xs text-orange-300">
                    <strong>⚠️ Reverse Mode Active:</strong> All signals from this channel will be inverted. 
                    BUY signals become SELL orders, SELL signals become BUY orders, and TP/SL levels are swapped.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Instruments Tab */}
          {activeTab === 'instruments' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-300">Primary Instrument</h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Logical Symbol">
                  <input
                    type="text"
                    value={formData.instruments[0]?.logical_symbol || ''}
                    onChange={e => setFormData({
                      ...formData,
                      instruments: [{ ...formData.instruments[0], logical_symbol: e.target.value }]
                    })}
                    placeholder="XAUUSD"
                  />
                </FormField>
                <FormField label="Broker Symbol">
                  <input
                    type="text"
                    value={formData.instruments[0]?.broker_symbol || ''}
                    onChange={e => setFormData({
                      ...formData,
                      instruments: [{ ...formData.instruments[0], broker_symbol: e.target.value }]
                    })}
                    placeholder="XAUUSD"
                  />
                </FormField>
                <FormField label="Pip Tolerance">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.instruments[0]?.pip_tolerance_pips || 1.5}
                    onChange={e => setFormData({
                      ...formData,
                      instruments: [{ ...formData.instruments[0], pip_tolerance_pips: parseFloat(e.target.value) }]
                    })}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* TP Policy Tab */}
          {activeTab === 'tp' && (
            <div className="space-y-4">
              <FormField label="Policy Type">
                <select
                  value={formData.final_tp_policy.kind}
                  onChange={e => setFormData({
                    ...formData,
                    final_tp_policy: { ...formData.final_tp_policy, kind: e.target.value }
                  })}
                >
                  <option value="rr">Risk:Reward Ratio</option>
                  <option value="tp_index">TP Index</option>
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="R:R Ratio">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.final_tp_policy.rr_ratio || 1}
                    onChange={e => setFormData({
                      ...formData,
                      final_tp_policy: { ...formData.final_tp_policy, rr_ratio: parseFloat(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="TP Index">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.final_tp_policy.tp_index || 1}
                    onChange={e => setFormData({
                      ...formData,
                      final_tp_policy: { ...formData.final_tp_policy, tp_index: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Risk-Free Tab */}
          {activeTab === 'riskfree' && (
            <div className="space-y-4">
              <Toggle
                checked={formData.riskfree_policy.enabled}
                onChange={checked => setFormData({
                  ...formData,
                  riskfree_policy: { ...formData.riskfree_policy, enabled: checked }
                })}
                label="Enable Risk-Free Policy"
              />
              <FormField label="Trigger Type">
                <select
                  value={formData.riskfree_policy.kind}
                  onChange={e => setFormData({
                    ...formData,
                    riskfree_policy: { ...formData.riskfree_policy, kind: e.target.value }
                  })}
                >
                  <option value="%path">Percent of Path</option>
                  <option value="pips">Pips</option>
                  <option value="tp_index">TP Index</option>
                </select>
              </FormField>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Percent">
                  <input
                    type="number"
                    value={formData.riskfree_policy.percent || 50}
                    onChange={e => setFormData({
                      ...formData,
                      riskfree_policy: { ...formData.riskfree_policy, percent: parseFloat(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="Pips">
                  <input
                    type="number"
                    value={formData.riskfree_policy.pips || 10}
                    onChange={e => setFormData({
                      ...formData,
                      riskfree_policy: { ...formData.riskfree_policy, pips: parseFloat(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="TP Index">
                  <input
                    type="number"
                    min="1"
                    value={formData.riskfree_policy.tp_index || 1}
                    onChange={e => setFormData({
                      ...formData,
                      riskfree_policy: { ...formData.riskfree_policy, tp_index: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Cancel Policy Tab */}
          {activeTab === 'cancel' && (
            <div className="space-y-4">
              <Toggle
                checked={formData.cancel_policy.enabled}
                onChange={checked => setFormData({
                  ...formData,
                  cancel_policy: { ...formData.cancel_policy, enabled: checked }
                })}
                label="Enable Cancel Policy"
              />
              <FormField label="Trigger Type">
                <select
                  value={formData.cancel_policy.kind}
                  onChange={e => setFormData({
                    ...formData,
                    cancel_policy: { ...formData.cancel_policy, kind: e.target.value }
                  })}
                >
                  <option value="final_tp">Final TP</option>
                  <option value="%path">Percent of Path</option>
                  <option value="tp_index">TP Index</option>
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Percent">
                  <input
                    type="number"
                    value={formData.cancel_policy.percent || 50}
                    onChange={e => setFormData({
                      ...formData,
                      cancel_policy: { ...formData.cancel_policy, percent: parseFloat(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="TP Index">
                  <input
                    type="number"
                    min="1"
                    value={formData.cancel_policy.tp_index || 1}
                    onChange={e => setFormData({
                      ...formData,
                      cancel_policy: { ...formData.cancel_policy, tp_index: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Apply to Order Types:</p>
                <div className="flex flex-wrap gap-4">
                  <Toggle
                    checked={formData.cancel_policy.enable_for_now}
                    onChange={checked => setFormData({
                      ...formData,
                      cancel_policy: { ...formData.cancel_policy, enable_for_now: checked }
                    })}
                    label="NOW orders"
                  />
                  <Toggle
                    checked={formData.cancel_policy.enable_for_limit}
                    onChange={checked => setFormData({
                      ...formData,
                      cancel_policy: { ...formData.cancel_policy, enable_for_limit: checked }
                    })}
                    label="LIMIT orders"
                  />
                  <Toggle
                    checked={formData.cancel_policy.enable_for_auto}
                    onChange={checked => setFormData({
                      ...formData,
                      cancel_policy: { ...formData.cancel_policy, enable_for_auto: checked }
                    })}
                    label="AUTO orders"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Trend Filter Tab */}
          {activeTab === 'trend' && (
            <div className="space-y-4">
              <div className="bg-dark-tertiary p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-300">
                  <strong>Trend Filter</strong> blocks trades when both M1 and M5 timeframes are against the signal.
                  Uses 3 methods: Structure (HH/HL), VWAP, and EMA.
                </p>
              </div>
              <Toggle
                checked={formData.trend_filter.enabled}
                onChange={checked => setFormData({
                  ...formData,
                  trend_filter: { ...formData.trend_filter, enabled: checked }
                })}
                label="Enable Trend Filter"
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Swing Strength" hint="Candles on each side">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.trend_filter.swing_strength}
                    onChange={e => setFormData({
                      ...formData,
                      trend_filter: { ...formData.trend_filter, swing_strength: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="Min Swings Required">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formData.trend_filter.min_swings_required}
                    onChange={e => setFormData({
                      ...formData,
                      trend_filter: { ...formData.trend_filter, min_swings_required: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="EMA Period">
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={formData.trend_filter.ema_period}
                    onChange={e => setFormData({
                      ...formData,
                      trend_filter: { ...formData.trend_filter, ema_period: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="Candles to Fetch">
                  <input
                    type="number"
                    min="20"
                    max="500"
                    value={formData.trend_filter.candles_to_fetch}
                    onChange={e => setFormData({
                      ...formData,
                      trend_filter: { ...formData.trend_filter, candles_to_fetch: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
              </div>
              <Toggle
                checked={formData.trend_filter.require_all_three}
                onChange={checked => setFormData({
                  ...formData,
                  trend_filter: { ...formData.trend_filter, require_all_three: checked }
                })}
                label="Require All Three Methods to Agree"
              />
              <Toggle
                checked={formData.trend_filter.log_details}
                onChange={checked => setFormData({
                  ...formData,
                  trend_filter: { ...formData.trend_filter, log_details: checked }
                })}
                label="Log Detailed Analysis"
              />
            </div>
          )}

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Toggle
                  checked={formData.commands.enable_close}
                  onChange={checked => setFormData({
                    ...formData,
                    commands: { ...formData.commands, enable_close: checked }
                  })}
                  label="Enable Close Command"
                />
                <FormField label="Close Phrases (regex, one per line)">
                  <textarea
                    rows={3}
                    value={(formData.commands.close_phrases || []).join('\n')}
                    onChange={e => setFormData({
                      ...formData,
                      commands: { ...formData.commands, close_phrases: e.target.value.split('\n').filter(Boolean) }
                    })}
                    placeholder="\\bclose (?:this|order)\\b"
                  />
                </FormField>
              </div>
              <div className="space-y-3">
                <Toggle
                  checked={formData.commands.enable_cancel_limit}
                  onChange={checked => setFormData({
                    ...formData,
                    commands: { ...formData.commands, enable_cancel_limit: checked }
                  })}
                  label="Enable Cancel Command"
                />
                <FormField label="Cancel Phrases (regex, one per line)">
                  <textarea
                    rows={3}
                    value={(formData.commands.cancel_limit_phrases || []).join('\n')}
                    onChange={e => setFormData({
                      ...formData,
                      commands: { ...formData.commands, cancel_limit_phrases: e.target.value.split('\n').filter(Boolean) }
                    })}
                    placeholder="\\bcancel (?:this|order)\\b"
                  />
                </FormField>
              </div>
              <div className="space-y-3">
                <Toggle
                  checked={formData.commands.enable_riskfree}
                  onChange={checked => setFormData({
                    ...formData,
                    commands: { ...formData.commands, enable_riskfree: checked }
                  })}
                  label="Enable RiskFree Command"
                />
                <FormField label="RiskFree Phrases (regex, one per line)">
                  <textarea
                    rows={3}
                    value={(formData.commands.riskfree_phrases || []).join('\n')}
                    onChange={e => setFormData({
                      ...formData,
                      commands: { ...formData.commands, riskfree_phrases: e.target.value.split('\n').filter(Boolean) }
                    })}
                    placeholder="\\brisk\\s*free now\\b"
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Circuit Breaker Tab */}
          {activeTab === 'circuit' && (
            <div className="space-y-4">
              <Toggle
                checked={formData.circuit_breaker.enabled}
                onChange={checked => setFormData({
                  ...formData,
                  circuit_breaker: { ...formData.circuit_breaker, enabled: checked }
                })}
                label="Enable Circuit Breaker"
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Max Daily Trades">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.circuit_breaker.max_daily_trades}
                    onChange={e => setFormData({
                      ...formData,
                      circuit_breaker: { ...formData.circuit_breaker, max_daily_trades: parseInt(e.target.value) }
                    })}
                  />
                </FormField>
                <FormField label="Max Daily Loss (%)">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    value={formData.circuit_breaker.max_daily_loss_pct}
                    onChange={e => setFormData({
                      ...formData,
                      circuit_breaker: { ...formData.circuit_breaker, max_daily_loss_pct: parseFloat(e.target.value) }
                    })}
                  />
                </FormField>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
            {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Channel</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Channels() {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingChannel, setEditingChannel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    loadChannels()
    
    const subscription = subscribeToChannels(() => loadChannels())
    return () => subscription.unsubscribe()
  }, [])

  async function loadChannels() {
    try {
      const data = await fetchChannels()
      setChannels(data)
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditingChannel(null)
    setShowModal(true)
  }

  function openEditModal(channel) {
    setEditingChannel(channel)
    setShowModal(true)
  }

  async function handleSave(formData) {
    if (editingChannel) {
      await updateChannel(editingChannel.id, formData)
    } else {
      await createChannel(formData)
    }
    await loadChannels()
  }

  async function handleDelete(id) {
    try {
      await deleteChannel(id)
      setDeleteConfirm(null)
      await loadChannels()
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete: ' + err.message)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-gray-500">Loading channels...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Channel Configuration</h1>
          <p className="text-gray-500 mt-1">Manage your Telegram signal channels</p>
        </div>
        <div className="flex items-center gap-3">
          <LogoutButton />
          <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Channel
          </button>
        </div>
      </div>

      {/* Channels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {channels.map(channel => (
          <div 
            key={channel.id} 
            className={`bg-dark-card border rounded-xl p-5 ${
              channel.is_reversed 
                ? 'border-orange-500/50' 
                : 'border-dark-border'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white truncate">{channel.channel_key}</h3>
                  <span className={`badge ${channel.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {channel.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {/* v11.0: Reverse indicator */}
                  {channel.is_reversed && (
                    <span className="badge bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Reversed
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">Magic: {channel.magic_number}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditModal(channel)} className="p-2 text-gray-400 hover:text-accent-blue rounded-lg hover:bg-dark-tertiary">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteConfirm(channel.id)} className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-dark-tertiary">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-dark-tertiary rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase mb-1">Risk/Trade</div>
                <div className="text-white font-mono">{(channel.risk_per_trade * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-dark-tertiary rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase mb-1">Instruments</div>
                <div className="text-white font-mono">
                  {channel.instruments?.map(i => i.logical_symbol).join(', ') || 'XAUUSD'}
                </div>
              </div>
              <div className="bg-dark-tertiary rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase mb-1">Risk-Free</div>
                <div className="text-white font-mono flex items-center gap-2">
                  {channel.riskfree_policy?.enabled ? (
                    <><Check className="w-3 h-3 text-green-400" /> {channel.riskfree_policy.percent}%</>
                  ) : (
                    <span className="text-gray-500">Disabled</span>
                  )}
                </div>
              </div>
              <div className="bg-dark-tertiary rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase mb-1">Trend Filter</div>
                <div className="text-white font-mono flex items-center gap-2">
                  {channel.trend_filter?.enabled ? (
                    <><Check className="w-3 h-3 text-green-400" /> Enabled</>
                  ) : (
                    <span className="text-gray-500">Disabled</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {channels.length === 0 && (
          <div className="col-span-2 bg-dark-card border border-dark-border rounded-xl p-12 text-center">
            <Settings className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Channels Configured</h3>
            <p className="text-gray-500 mb-4">Add your first Telegram signal channel to get started.</p>
            <button onClick={openAddModal} className="btn-primary">
              <Plus className="w-4 h-4 inline mr-2" /> Add Channel
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showModal && (
        <ChannelEditorModal
          channel={editingChannel}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Confirm Delete
              </h2>
            </div>
            <div className="modal-body">
              <p className="text-gray-300">Are you sure you want to delete this channel? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
