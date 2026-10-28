import React, { useState, useEffect } from 'react'
import {
  GripVertical, ChevronUp, ChevronDown, Brain, Activity, Save, Check,
  AlertTriangle, ArrowDown, Send, Zap, RefreshCw, Settings
} from 'lucide-react'
import {
  fetchStrategyPipeline, saveStrategyPipeline, normalizeStrategyPipeline,
  fetchAiGate, saveAiGate, fetchStrategyDecisions,
  REGIME_CODES, REGIME_TIMEFRAMES,
} from '../lib/supabase'
import { useBot } from './BotContext'

// ============================================================================
// STRATEGIES TAB
// ----------------------------------------------------------------------------
// Every signal runs through the switched-on strategies from top to bottom.
// A strategy can accept (next one runs), reject (trade blocked, reason logged)
// or — the AI grader only — invert the trade. Drag cards to change the order.
// Nothing switched on == trades execute exactly as normal.
//
// Stored in the `strategy_pipeline` app_settings row (order + regime config);
// the AI grader's on/off is the existing `ai_execution_gate.enabled`. The bot
// re-reads both every 30s.
// ============================================================================

const ACCENT = '#ADFF2F'
const CARD = { background: 'var(--card-flat)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)' }

// Also used by the Trades page's strategy filter.
export const STRATEGY_META = {
  regime: {
    label: 'Market Regime',
    icon: Activity,
    color: '#38bdf8',
    blurb: 'Accepts a signal only if its direction fits the current market regime (trend, volatility, '
      + 'higher-timeframe context). Pending orders are re-checked until they fill and cancelled if the '
      + 'regime turns against them.',
  },
  ai_grader: {
    label: 'AI Grader',
    icon: Brain,
    color: '#a78bfa',
    blurb: 'Grades the chart 0-10 and executes, inverts or blocks by the bands set in the AI Execution tab.',
  },
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      className={`toggle-switch ${checked ? 'active' : ''}`}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
    />
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function NumberInput({ value, onChange, step = 0.05, min = 0, max }) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={e => {
        const n = parseFloat(e.target.value)
        onChange(Number.isNaN(n) ? min : Math.max(min, max !== undefined ? Math.min(max, n) : n))
      }}
      className="w-full"
    />
  )
}

function RegimeSettings({ cfg, onChange }) {
  const set = (p) => onChange({ ...cfg, ...p })
  const setPolicy = (code, side, val) =>
    set({ policy: { ...cfg.policy, [code]: { ...cfg.policy[code], [side]: val } } })

  return (
    <div className="mt-4 pt-4 space-y-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Mode" hint="Shadow logs every decision but never blocks — use it to judge the strategy first.">
          <select value={cfg.mode} onChange={e => set({ mode: e.target.value })} className="w-full">
            <option value="enforce">Enforce — reject means blocked</option>
            <option value="shadow">Shadow — log only, never block</option>
          </select>
        </Field>
        <Field label="If no regime is available" hint="Regime service down, file stale, or symbol not covered.">
          <select value={cfg.on_missing} onChange={e => set({ on_missing: e.target.value })} className="w-full">
            <option value="block">Block the signal</option>
            <option value="allow">Let it through</option>
          </select>
        </Field>
        <Field label="Regime timeframe" hint="Its regime decides which side may trade.">
          <select value={cfg.primary_tf} onChange={e => set({ primary_tf: e.target.value })} className="w-full">
            {REGIME_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </Field>
        <Field label="Higher-timeframe veto" hint="A bullish/bearish higher timeframe blocks trades against it.">
          <select value={cfg.context_tf} onChange={e => set({ context_tf: e.target.value })} className="w-full">
            <option value="">Off</option>
            {REGIME_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </Field>
        <Field label="Minimum regime confidence (0-1)" hint="Below this the regime is too uncertain to trade.">
          <NumberInput value={cfg.min_confidence} max={1} onChange={v => set({ min_confidence: v })} />
        </Field>
        <Field label="Max change-point probability (0-1)" hint="Stand aside while a regime change is likely. 1 = off.">
          <NumberInput value={cfg.max_change_point_prob} max={1} onChange={v => set({ max_change_point_prob: v })} />
        </Field>
        <Field label="Min SL distance in volatile regimes (× ATR)" hint="Rejects stops inside normal noise. 0 = off.">
          <NumberInput value={cfg.min_stop_atr_volatile} step={0.1} onChange={v => set({ min_stop_atr_volatile: v })} />
        </Field>
        <Field
          label="Market-character rules: min confidence (0-1)"
          hint="Trending market: no counter-trend trades. Mean-reverting market: no breakout entries (entry beyond price in the trade direction). Applies only when the character read is at least this confident. 1 = off."
        >
          <NumberInput value={cfg.min_character_conf} max={1} onChange={v => set({ min_character_conf: v })} />
        </Field>
        <Field label="Regime data max age (seconds)" hint="Older regime data counts as missing.">
          <NumberInput value={cfg.max_age_sec} step={30} min={30} onChange={v => set({ max_age_sec: v })} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4 p-4" style={{ background: 'var(--card-recess)', borderRadius: '14px' }}>
        <div>
          <div className="text-sm font-medium text-gray-300">Re-check pending orders</div>
          <p className="text-xs text-gray-500 mt-1">
            While a limit/stop order waits to fill, cancel it if the regime turns against it. Missing or stale
            regime data never cancels an order.
          </p>
        </div>
        <Toggle checked={cfg.pending_recheck} onChange={v => set({ pending_recheck: v })} />
      </div>

      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">Allowed sides per regime</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REGIME_CODES.map(({ code, name }) => (
            <div key={code} className="p-3" style={{ background: 'var(--card-recess)', borderRadius: '12px' }}>
              <div className="text-xs text-gray-300 mb-2">{name}</div>
              <div className="flex gap-2">
                {['BUY', 'SELL'].map(side => {
                  const on = cfg.policy[code][side]
                  const color = side === 'BUY' ? '#4ade80' : '#f87171'
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setPolicy(code, side, !on)}
                      className="flex-1 text-[11px] font-semibold py-1"
                      style={{
                        borderRadius: '8px',
                        color: on ? color : '#6b7280',
                        background: on ? `${color}1f` : 'transparent',
                        border: `1px solid ${on ? `${color}59` : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      {side}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field label="regimes.json path (optional)" hint="Blank = MetaQuotes Common\Files\regimes.json, where the regime service writes by default.">
        <input type="text" value={cfg.regimes_path} onChange={e => set({ regimes_path: e.target.value })} className="w-full" placeholder="default" />
      </Field>
    </div>
  )
}

function StrategyCard({ k, index, total, enabled, status, onToggle, onMove, dragging, dragHandlers, children, expanded, onExpand }) {
  const meta = STRATEGY_META[k]
  const Icon = meta.icon
  // Only the grip starts a drag, so selecting text in the settings inputs
  // below doesn't pick the whole card up.
  const [armed, setArmed] = useState(false)
  return (
    <div
      draggable={armed}
      {...dragHandlers}
      onDragEnd={e => { setArmed(false); dragHandlers.onDragEnd(e) }}
      className="p-4 sm:p-5 transition-all"
      style={{
        ...CARD,
        border: enabled ? `2px solid ${meta.color}59` : CARD.border,
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-0.5 text-gray-500">
          <span
            onPointerDown={() => setArmed(true)}
            onPointerUp={() => setArmed(false)}
            style={{ cursor: 'grab', touchAction: 'none' }}
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" aria-hidden />
          </span>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="hover:text-white disabled:opacity-20" aria-label="Move up">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="hover:text-white disabled:opacity-20" aria-label="Move down">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-gray-500">#{index + 1}</span>
            <Icon className="w-4 h-4" style={{ color: enabled ? meta.color : '#6b7280' }} />
            <h3 className="text-base font-semibold" style={{ color: enabled ? meta.color : '#d1d5db' }}>{meta.label}</h3>
            <span className={`badge ${enabled ? 'badge-success' : 'badge-neutral'}`}>{status}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{meta.blurb}</p>
          {onExpand && (
            <button type="button" onClick={onExpand} className="text-xs mt-2 flex items-center gap-1 text-gray-400 hover:text-white">
              <Settings className="w-3.5 h-3.5" /> {expanded ? 'Hide settings' : 'Settings'}
            </button>
          )}
          {children}
        </div>

        <Toggle checked={enabled} onChange={onToggle} />
      </div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="flex justify-center py-1 text-gray-600">
      <ArrowDown className="w-4 h-4" />
    </div>
  )
}

function RecentDecisions({ botId, refreshKey }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetchStrategyDecisions(botId).then(setRows).finally(() => setLoading(false))
  }
  useEffect(() => { if (botId) load() }, [botId, refreshKey])

  const colors = { accept: '#4ade80', reject: '#f87171', invert: '#fb923c', shadow_reject: '#facc15' }
  return (
    <div className="p-5" style={CARD}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-300">Recent strategy decisions</h4>
        <button type="button" onClick={load} className="text-gray-400 hover:text-white" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">{loading ? 'Loading…' : 'No decisions yet. They appear here once a strategy judges a signal.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="py-1.5 pr-3 font-medium">Time</th>
                <th className="py-1.5 pr-3 font-medium">Symbol</th>
                <th className="py-1.5 pr-3 font-medium">Side</th>
                <th className="py-1.5 pr-3 font-medium">Strategy</th>
                <th className="py-1.5 pr-3 font-medium">Decision</th>
                <th className="py-1.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-gray-300">{r.symbol}</td>
                  <td className="py-1.5 pr-3 text-gray-300 uppercase">{r.effective_side}</td>
                  <td className="py-1.5 pr-3 text-gray-300 whitespace-nowrap">
                    {STRATEGY_META[r.strategy]?.label || r.strategy}
                    {r.stage !== 'signal' && <span className="text-gray-500"> ({r.stage.replace('_', ' ')})</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold whitespace-nowrap" style={{ color: colors[r.action] || '#9ca3af' }}>
                    {r.action.replace('_', ' ')}
                  </td>
                  <td className="py-1.5 text-gray-400">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function StrategiesTab() {
  const { selectedBotId, selectedBot } = useBot()
  const [pipeline, setPipeline] = useState(normalizeStrategyPipeline(null))
  const [savedPipeline, setSavedPipeline] = useState(null)
  const [gate, setGate] = useState(null)
  const [savedGate, setSavedGate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [expanded, setExpanded] = useState({ regime: false })

  useEffect(() => {
    if (!selectedBotId) return
    let cancelled = false
    setLoading(true)
    Promise.all([fetchStrategyPipeline(selectedBotId), fetchAiGate(selectedBotId)])
      .then(([p, g]) => {
        if (cancelled) return
        setPipeline(p); setSavedPipeline(p)
        setGate(g); setSavedGate(g)
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [selectedBotId])

  const regime = pipeline.strategies.regime
  const enabledOf = (k) => (k === 'ai_grader' ? !!gate?.enabled : !!pipeline.strategies[k]?.enabled)
  const statusOf = (k) => {
    if (!enabledOf(k)) return 'OFF'
    if (k === 'regime' && regime.mode === 'shadow') return 'SHADOW'
    return 'ON'
  }

  const pipelineDirty = JSON.stringify(pipeline) !== JSON.stringify(savedPipeline)
  const gateDirty = !!gate && !!savedGate && gate.enabled !== savedGate.enabled
  const dirty = pipelineDirty || gateDirty

  const touch = () => setSavedAt(null)
  const setRegime = (cfg) => { setPipeline(p => ({ ...p, strategies: { ...p.strategies, regime: cfg } })); touch() }
  const toggle = (k, v) => {
    if (k === 'ai_grader') setGate(g => ({ ...g, enabled: v }))
    else setPipeline(p => ({ ...p, strategies: { ...p.strategies, [k]: { ...p.strategies[k], enabled: v } } }))
    touch()
  }
  const moveTo = (key, targetIndex) => {
    setPipeline(p => {
      const order = p.order.filter(k => k !== key)
      order.splice(Math.max(0, Math.min(order.length, targetIndex)), 0, key)
      return JSON.stringify(order) === JSON.stringify(p.order) ? p : { ...p, order }
    })
    touch()
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (pipelineDirty) {
        await saveStrategyPipeline(pipeline, selectedBotId)
        const stored = normalizeStrategyPipeline(pipeline)
        setPipeline(stored); setSavedPipeline(stored)
      }
      if (gateDirty) {
        // Re-read the gate first so bands edited in the AI Execution tab
        // meanwhile aren't overwritten — only the on/off switch changes here.
        const latest = await fetchAiGate(selectedBotId)
        const next = { ...latest, enabled: gate.enabled }
        await saveAiGate(next, selectedBotId)
        setGate(next); setSavedGate(next)
      }
      setSavedAt(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !gate) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading strategies...</div>
  }

  const active = pipeline.order.filter(enabledOf)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-5" style={CARD}>
        <div className="flex items-center gap-2 flex-wrap">
          <Zap className="w-5 h-5" style={{ color: ACCENT }} />
          <h3 className="text-lg font-semibold text-gray-200">Signal Strategies</h3>
          {selectedBot && (
            <span className="badge badge-neutral" title="These strategies apply to the selected bot only">{selectedBot.name}</span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Every signal — market or pending — runs through the switched-on strategies from top to bottom before
          anything is sent to the broker. A rejection blocks the trade and records the reason. Drag the cards
          (or use the arrows) to change the order. With everything off, trades execute exactly as normal.
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-4 text-xs">
          <span className="px-2.5 py-1 text-gray-300" style={{ background: 'var(--card-recess)', borderRadius: '8px' }}>Signal</span>
          {active.map(k => (
            <React.Fragment key={k}>
              <span className="text-gray-600">→</span>
              <span className="px-2.5 py-1 font-medium"
                style={{ background: `${STRATEGY_META[k].color}1f`, color: STRATEGY_META[k].color, borderRadius: '8px' }}>
                {STRATEGY_META[k].label}{statusOf(k) === 'SHADOW' ? ' (shadow)' : ''}
              </span>
            </React.Fragment>
          ))}
          <span className="text-gray-600">→</span>
          <span className="px-2.5 py-1 font-medium" style={{ background: `${ACCENT}1f`, color: ACCENT, borderRadius: '8px' }}>Execute</span>
          {active.length === 0 && <span className="text-gray-500 ml-2">(no filters — normal execution)</span>}
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <div className="flex justify-center pb-1 text-xs text-gray-500 items-center gap-1.5">
          <Send className="w-3.5 h-3.5" /> Signal arrives
        </div>
        <FlowArrow />
        {pipeline.order.map((k, i) => (
          <React.Fragment key={k}>
            <StrategyCard
              k={k}
              index={i}
              total={pipeline.order.length}
              enabled={enabledOf(k)}
              status={statusOf(k)}
              onToggle={v => toggle(k, v)}
              onMove={d => moveTo(k, i + d)}
              dragging={dragKey === k}
              dragHandlers={{
                onDragStart: e => { setDragKey(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k) },
                onDragOver: e => { e.preventDefault(); if (dragKey && dragKey !== k) moveTo(dragKey, i) },
                onDrop: e => e.preventDefault(),
                onDragEnd: () => setDragKey(null),
              }}
              expanded={expanded[k]}
              onExpand={k === 'regime' ? () => setExpanded(x => ({ ...x, regime: !x.regime })) : null}
            >
              {k === 'regime' && expanded.regime && <RegimeSettings cfg={regime} onChange={setRegime} />}
              {k === 'ai_grader' && (
                <p className="text-[11px] text-gray-500 mt-2">
                  Bands, provider and max wait are set in the <span className="text-gray-300">AI Execution</span> tab.
                  Switching it here is the same switch.
                </p>
              )}
            </StrategyCard>
            <FlowArrow />
          </React.Fragment>
        ))}
        <div className="flex justify-center pt-1 text-xs font-medium items-center gap-1.5" style={{ color: ACCENT }}>
          <Zap className="w-3.5 h-3.5" /> Order sent to the broker
        </div>
      </div>

      {enabledOf('regime') && (
        <div className="p-4 flex items-start gap-2" style={{ ...CARD, borderRadius: '14px', border: '1px solid rgba(56,189,248,0.25)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#38bdf8' }} />
          <p className="text-xs text-gray-400">
            The market regime comes from the rule-based regime service on the VPS
            (<code className="text-gray-300">scriptsun_regime_service.bat</code>, which runs
            <code className="text-gray-300"> sigbot/regime_final/regime_detector.py</code>). If it is not running, signals are
            {regime.on_missing === 'block' ? ' blocked' : ' let through'} as "no regime available".
          </p>
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {error && <span className="text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {error}</span>}
          {!error && savedAt && (
            <span className="text-green-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Saved at {savedAt.toLocaleTimeString()} — the bot picks it up within 30s.
            </span>
          )}
          {!error && !savedAt && dirty && <span className="text-gray-500">Unsaved changes</span>}
        </div>
        <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary flex items-center gap-2">
          {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save</>}
        </button>
      </div>

      <RecentDecisions botId={selectedBotId} refreshKey={savedAt?.getTime()} />
    </div>
  )
}
