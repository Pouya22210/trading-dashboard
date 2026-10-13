import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Settings, Shield, Target, Zap,
  MessageSquare, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  Save, X, Check, RefreshCw, Shuffle, Search,
  Users, Newspaper, Brain, Eraser, Layers
} from 'lucide-react'
import {
  fetchChannels, createChannel, updateChannel, deleteChannel, subscribeToChannels,
  fetchAppSetting, updateAppSetting,
  fetchNewsCategories, fetchNewsBlackouts, saveChannelNewsBlackouts,
  deleteTradesByChannel,
  fetchAiGate, saveAiGate, normalizeAiGate, AI_GATE_DEFAULTS, AI_GATE_MIN_WAIT_SEC
} from '../lib/supabase'
import LogoutButton from '../components/LogoutButton'
import VisitorsTab from '../components/VisitorsTab'
import StrategyList from '../components/StrategyList'
import StrategiesTab from '../components/StrategiesTab'
import { useBot } from '../components/BotContext'

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

// Dual-handle slider for a news blackout window.
// Track runs from -7 (days before) ... 0 (today / event day) ... +7 (days after).
// Left handle controls days-before, right handle controls days-after.
const NEWS_SLIDER_STOPS = 7
function NewsBlackoutSlider({ daysBefore, daysAfter, onChange, disabled }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(null) // 'left' | 'right' | null

  const pct = (v) => ((v + NEWS_SLIDER_STOPS) / (NEWS_SLIDER_STOPS * 2)) * 100
  const leftVal = -Math.abs(daysBefore)   // -7..0
  const rightVal = Math.abs(daysAfter)    // 0..7

  const valueFromClientX = (clientX) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = rect.width ? (clientX - rect.left) / rect.width : 0
    const v = Math.round(ratio * (NEWS_SLIDER_STOPS * 2)) - NEWS_SLIDER_STOPS
    return Math.max(-NEWS_SLIDER_STOPS, Math.min(NEWS_SLIDER_STOPS, v))
  }

  const applyMove = (which, clientX) => {
    const v = valueFromClientX(clientX)
    if (which === 'left') {
      onChange(Math.max(0, -Math.min(0, v)), daysAfter)        // clamp to left half
    } else {
      onChange(daysBefore, Math.max(0, Math.max(0, v)))        // clamp to right half
    }
  }

  // All dragging is handled on the track (thumbs are visual only). On press we
  // pick which handle to move from the click side, capture the pointer, and
  // follow it until release.
  const onTrackPointerDown = (e) => {
    if (disabled) return
    e.preventDefault()
    const v = valueFromClientX(e.clientX)
    const which = v < 0 ? 'left' : v > 0 ? 'right' : (daysBefore <= daysAfter ? 'left' : 'right')
    draggingRef.current = which
    e.currentTarget.setPointerCapture?.(e.pointerId)
    applyMove(which, e.clientX)
  }
  const onTrackPointerMove = (e) => {
    if (!draggingRef.current) return
    applyMove(draggingRef.current, e.clientX)
  }
  const onTrackPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const ticks = []
  for (let i = -NEWS_SLIDER_STOPS; i <= NEWS_SLIDER_STOPS; i++) ticks.push(i)

  const thumbStyle = (active) => ({
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: disabled ? '#4b5563' : '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
    border: `2px solid ${disabled ? '#6b7280' : '#ef4444'}`,
    cursor: disabled ? 'not-allowed' : 'grab',
    touchAction: 'none',
    zIndex: active ? 3 : 2,
  })

  return (
    <div style={{ opacity: disabled ? 0.5 : 1, userSelect: 'none' }}>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-red-300 font-medium">{daysBefore} day{daysBefore === 1 ? '' : 's'} before</span>
        <span className="text-gray-400">news day (0)</span>
        <span className="text-red-300 font-medium">{daysAfter} day{daysAfter === 1 ? '' : 's'} after</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        style={{ position: 'relative', height: 28, cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'none' }}
      >
        {/* base rail */}
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, height: 6,
          transform: 'translateY(-50%)', borderRadius: 999,
          background: 'var(--card-recess)',
        }} />
        {/* highlighted blackout span */}
        <div style={{
          position: 'absolute', top: '50%', height: 6, transform: 'translateY(-50%)',
          left: `${pct(leftVal)}%`, width: `${pct(rightVal) - pct(leftVal)}%`,
          borderRadius: 999,
          background: disabled ? '#4b5563' : 'linear-gradient(90deg,#f87171,#ef4444)',
        }} />
        {/* center (today) marker */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', width: 2, height: 16,
          transform: 'translate(-50%, -50%)', background: '#9ca3af', borderRadius: 2,
        }} />
        {/* handles (visual only; dragging is handled on the track) */}
        <div style={{ ...thumbStyle(false), left: `${pct(leftVal)}%`, pointerEvents: 'none' }} />
        <div style={{ ...thumbStyle(false), left: `${pct(rightVal)}%`, pointerEvents: 'none' }} />
      </div>

      {/* tick labels */}
      <div className="flex justify-between mt-1 px-0">
        {ticks.map((t) => (
          <span key={t} className="text-[10px] text-gray-500" style={{ width: 12, textAlign: 'center' }}>
            {Math.abs(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

// Build the per-category blackout map for the form from a channel's saved rows.
// Default policy: blocked on the event day (enabled, 0/0) when there's no saved
// row, matching the bot's default. A saved row overrides this per channel.
function buildNewsBlackout(categories, existing) {
  const map = {}
  for (const c of categories || []) {
    const e = existing?.[c.id]
    map[c.id] = {
      is_enabled: e?.is_enabled ?? false,
      days_before: e?.days_before ?? 0,
      days_after: e?.days_after ?? 0,
    }
  }
  return map
}

// Dual-handle range slider over the AI grade scale (integers 0-10).
// Both handles are draggable; the one nearest the press point wins, and they
// swap freely (low/high are normalised by the caller).
function GradeRangeSlider({ low, high, onChange, disabled, accent = '#4ade80' }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(null) // 'low' | 'high' | null

  const STOPS = 10
  const pct = (v) => (v / STOPS) * 100

  const valueFromClientX = (clientX) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = rect.width ? (clientX - rect.left) / rect.width : 0
    return Math.max(0, Math.min(STOPS, Math.round(ratio * STOPS)))
  }

  const applyMove = (which, clientX) => {
    const v = valueFromClientX(clientX)
    // Handles may cross: keep the pair ordered so the band stays valid.
    const next = which === 'low' ? [v, high] : [low, v]
    onChange(Math.min(next[0], next[1]), Math.max(next[0], next[1]))
  }

  const onPointerDown = (e) => {
    if (disabled) return
    e.preventDefault()
    const v = valueFromClientX(e.clientX)
    const which = Math.abs(v - low) <= Math.abs(v - high) ? 'low' : 'high'
    draggingRef.current = which
    e.currentTarget.setPointerCapture?.(e.pointerId)
    applyMove(which, e.clientX)
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    applyMove(draggingRef.current, e.clientX)
  }
  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const thumbStyle = {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: disabled ? '#4b5563' : '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
    border: `2px solid ${disabled ? '#6b7280' : accent}`,
    pointerEvents: 'none',
    zIndex: 2,
  }

  return (
    <div style={{ opacity: disabled ? 0.5 : 1, userSelect: 'none' }}>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ position: 'relative', height: 28, cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'none' }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, height: 6,
          transform: 'translateY(-50%)', borderRadius: 999,
          background: 'var(--card-recess)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', height: 6, transform: 'translateY(-50%)',
          left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`,
          borderRadius: 999,
          background: disabled ? '#4b5563' : accent,
        }} />
        <div style={{ ...thumbStyle, left: `${pct(low)}%` }} />
        <div style={{ ...thumbStyle, left: `${pct(high)}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        {Array.from({ length: STOPS + 1 }, (_, i) => (
          <span
            key={i}
            className="text-[10px]"
            style={{
              width: 12,
              textAlign: 'center',
              color: !disabled && i >= low && i <= high ? accent : '#6b7280',
              fontWeight: !disabled && i >= low && i <= high ? 600 : 400,
            }}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
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

// ============================================================================
// AI EXECUTION TAB
// ----------------------------------------------------------------------------
// Global (all-channel) control over how the AI signal grade drives execution.
// Master switch OFF == the bot's normal behaviour: trades go out immediately and
// grading stays a label-only background job. Switch it ON and no order — market
// or pending — is placed until that signal has a 0-10 grade, which then routes
// it into one of three outcomes: execute / execute inverted / block.
// Persisted as a single `ai_execution_gate` row in app_settings; the bot re-reads
// it every 30s.
// ============================================================================
const GATE_GREEN = '#4ade80'
const GATE_ORANGE = '#fb923c'
const GATE_RED = '#f87171'

function gradeOutcome(score, cfg) {
  if (score >= cfg.execute_min && score <= cfg.execute_max) return 'execute'
  if (cfg.inverse_enabled && score >= cfg.inverse_min && score <= cfg.inverse_max) return 'inverse'
  return 'blocked'
}

// One cell per grade 0-10 showing exactly what happens to a signal with that
// score. Makes gaps and overlaps between the two bands obvious at a glance.
function GradeOutcomeMap({ cfg }) {
  const colors = { execute: GATE_GREEN, inverse: GATE_ORANGE, blocked: GATE_RED }
  const labels = { execute: 'Trade', inverse: 'Invert', blocked: 'Block' }
  return (
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }, (_, score) => {
        const outcome = gradeOutcome(score, cfg)
        const color = colors[outcome]
        return (
          <div
            key={score}
            className="text-center py-2 px-0.5"
            style={{
              borderRadius: '8px',
              background: `${color}1f`,
              border: `1px solid ${color}59`,
            }}
            title={`Grade ${score} → ${labels[outcome]}`}
          >
            <div className="text-sm font-semibold" style={{ color }}>{score}</div>
            <div className="text-[9px] uppercase tracking-wide" style={{ color }}>
              {labels[outcome]}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AIExecutionTab() {
  const [cfg, setCfg] = useState(AI_GATE_DEFAULTS)
  const [savedCfg, setSavedCfg] = useState(AI_GATE_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)

  // The gate is per bot — each VPS grades with its own strategy, so its
  // execute/inverse bands belong to it. Reload whenever the bot changes.
  const { selectedBotId, selectedBot } = useBot()

  useEffect(() => {
    if (!selectedBotId) return
    let cancelled = false
    setLoading(true)
    fetchAiGate(selectedBotId)
      .then(loaded => {
        if (cancelled) return
        setCfg(loaded)
        setSavedCfg(loaded)
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [selectedBotId])

  const patch = (p) => {
    setCfg(prev => ({ ...prev, ...p }))
    setSavedAt(null)
  }

  const dirty = JSON.stringify(cfg) !== JSON.stringify(savedCfg)
  // The execute band is checked first, so an overlap silently shrinks the
  // inverse band — warn instead of letting it look like both apply.
  const overlap = cfg.inverse_enabled &&
    cfg.inverse_min <= cfg.execute_max && cfg.execute_min <= cfg.inverse_max

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveAiGate(cfg, selectedBotId)
      const stored = normalizeAiGate(cfg)
      setCfg(stored)
      setSavedCfg(stored)
      setSavedAt(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading AI execution settings...</div>
  }

  const off = !cfg.enabled

  return (
    <div className="space-y-4">
      {/* Master switch */}
      <div
        className="p-5"
        style={{
          background: 'var(--card-flat)',
          borderRadius: '20px',
          border: cfg.enabled
            ? '2px solid rgba(139,92,246,0.45)'
            : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Brain className={`w-5 h-5 ${cfg.enabled ? 'text-violet-400' : 'text-gray-500'}`} />
              <h3 className={`text-lg font-semibold ${cfg.enabled ? 'text-violet-300' : 'text-gray-300'}`}>
                AI Grade Execution Control
              </h3>
              <span className={`badge ${cfg.enabled ? 'badge-success' : 'badge-neutral'}`}>
                {cfg.enabled ? 'ON' : 'OFF'}
              </span>
              {/* These bands belong to one VPS — say which, or a per-bot
                  setting looks like a global one. */}
              {selectedBot && (
                <span className="badge badge-neutral" title="This gate applies to the selected bot only">
                  {selectedBot.name}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-2 ml-7">
              {cfg.enabled ? (
                <>
                  Every signal is graded <span className="text-gray-200">before</span> anything is sent to the
                  broker — market and pending orders alike. The grade then decides whether the trade is
                  executed, executed in the opposite direction, or blocked. All other logic
                  (risk, TP/SL policies, cancel, news blackout, circuit breaker) is unchanged.
                </>
              ) : (
                <>
                  Off — the bot behaves exactly as normal: trades are placed immediately on the signal and
                  AI grading stays a label-only background job that never blocks anything.
                </>
              )}
            </p>
          </div>
          <Toggle checked={cfg.enabled} onChange={checked => patch({ enabled: checked })} />
        </div>
      </div>

      {/* Dimmed but still editable while the gate is off, so the bands can be
          set up before switching it on. */}
      <div style={{ opacity: off ? 0.55 : 1 }} className="space-y-4">
        {/* Outcome map */}
        <div
          className="p-5"
          style={{ background: 'var(--card-flat)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h4 className="text-sm font-medium text-gray-300 mb-3">What happens at each grade</h4>
          <GradeOutcomeMap cfg={cfg} />
          {overlap && (
            <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: GATE_ORANGE }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              The two ranges overlap. Grades in both are executed normally — the execute range wins.
            </p>
          )}
        </div>

        {/* Execute range */}
        <div
          className="p-5"
          style={{
            background: 'var(--card-flat)',
            borderRadius: '20px',
            border: `2px solid ${GATE_GREEN}40`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4" style={{ color: GATE_GREEN }} />
            <span className="text-sm font-medium" style={{ color: GATE_GREEN }}>
              Execute normally — grades {cfg.execute_min}–{cfg.execute_max}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4 ml-6">
            Signals scored in this range are traded exactly as the channel sent them.
          </p>
          <GradeRangeSlider
            low={cfg.execute_min}
            high={cfg.execute_max}
            accent={GATE_GREEN}
            onChange={(lo, hi) => patch({ execute_min: lo, execute_max: hi })}
          />
        </div>

        {/* Inverse range */}
        <div
          className="p-5"
          style={{
            background: 'var(--card-flat)',
            borderRadius: '20px',
            border: cfg.inverse_enabled
              ? `2px solid ${GATE_ORANGE}40`
              : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-start justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" style={{ color: cfg.inverse_enabled ? GATE_ORANGE : '#6b7280' }} />
              <span
                className="text-sm font-medium"
                style={{ color: cfg.inverse_enabled ? GATE_ORANGE : '#d1d5db' }}
              >
                Execute inverted — grades {cfg.inverse_min}–{cfg.inverse_max}
              </span>
            </div>
            <Toggle
              checked={cfg.inverse_enabled}
              onChange={checked => patch({ inverse_enabled: checked })}
            />
          </div>
          <p className="text-xs text-gray-500 mb-4 ml-6">
            Signals scored in this range are traded the other way round: BUY→SELL, SELL→BUY, with SL and TP
            swapped — the same mechanism as the per-channel "Reverse Signals" option. On a channel that is
            already reversed the two cancel out and the original direction is traded.
          </p>
          <GradeRangeSlider
            low={cfg.inverse_min}
            high={cfg.inverse_max}
            accent={GATE_ORANGE}
            disabled={!cfg.inverse_enabled}
            onChange={(lo, hi) => patch({ inverse_min: lo, inverse_max: hi })}
          />
        </div>

        {/* Blocked note */}
        <div
          className="p-4 flex items-start gap-2"
          style={{ background: 'var(--card-flat)', borderRadius: '14px', border: `1px solid ${GATE_RED}40` }}
        >
          <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: GATE_RED }} />
          <p className="text-xs text-gray-400">
            <span style={{ color: GATE_RED }} className="font-medium">Everything else is blocked.</span>{' '}
            Grades in neither range — and signals the grader could not score at all — never reach the broker.
            They are still recorded as blocked trades with the reason, so nothing disappears silently.
          </p>
        </div>

        {/* Advanced */}
        <div
          className="p-5 space-y-4"
          style={{ background: 'var(--card-flat)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h4 className="text-sm font-medium text-gray-300">Grading source and timing</h4>

          <FormField
            label="Which grade decides"
            hint="Channels can have Claude and/or Gemini grading enabled. If the chosen provider returns no score, the other one is used."
          >
            <select value={cfg.provider} onChange={e => patch({ provider: e.target.value })}>
              <option value="gemini">Gemini score</option>
              <option value="claude">Claude score</option>
              <option value="average">Average of both</option>
            </select>
          </FormField>

          <FormField
            label="Max wait for a grade (seconds)"
            hint={`If grading takes longer than this the signal is treated as stale and blocked, rather than entering at a price that has already moved on. Grading normally takes 15-40s, so the minimum is ${AI_GATE_MIN_WAIT_SEC}s — below that nothing could ever be traded.`}
          >
            <input
              type="number"
              min={AI_GATE_MIN_WAIT_SEC}
              step="30"
              value={cfg.max_grade_wait_sec}
              // Kept as typed so the field can be cleared and retyped; coerced
              // on blur instead of collapsing an empty box to 0 mid-edit.
              onChange={e => patch({ max_grade_wait_sec: e.target.value })}
              onBlur={e => {
                const n = parseInt(e.target.value, 10)
                patch({
                  max_grade_wait_sec: Number.isNaN(n)
                    ? AI_GATE_DEFAULTS.max_grade_wait_sec
                    : Math.max(AI_GATE_MIN_WAIT_SEC, n),
                })
              }}
              className="w-40"
            />
          </FormField>

          <div className="flex items-center justify-between p-4"
            style={{ background: 'var(--card-recess)', borderRadius: '14px' }}
          >
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-300">
                Trade channels without AI grading
              </label>
              <p className="text-xs text-gray-500 mt-1">
                A channel with neither Claude nor Gemini enabled can never produce a grade. Off (default),
                its signals are blocked while this gate is on. On, those channels keep trading ungated.
              </p>
            </div>
            <Toggle
              checked={cfg.trade_ungraded_channels}
              onChange={checked => patch({ trade_ungraded_channels: checked })}
            />
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {error && (
            <span className="text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
          {!error && savedAt && (
            <span className="text-green-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Saved at {savedAt.toLocaleTimeString()} — the bot picks it up within 30s.
            </span>
          )}
          {!error && !savedAt && dirty && (
            <span className="text-gray-500">Unsaved changes</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save</>}
        </button>
      </div>
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

// Generate a unique 6-digit magic number (100000–999999) not already in use
function generateUniqueMagicNumber(existingChannels) {
  const usedMagics = new Set(
    (existingChannels || []).map(ch => ch.magic_number)
  )
  let magic
  do {
    magic = Math.floor(100000 + Math.random() * 900000)
  } while (usedMagics.has(magic))
  return magic
}

function ChannelEditorModal({ channel, onSave, onClose, existingChannels, newsCategories }) {
  const [activeTab, setActiveTab] = useState('basic')
  const [saving, setSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [formData, setFormData] = useState({
    channel_key: '',
    risk_per_trade: 0.02,
    risk_tolerance: 0.1,
    magic_number: channel ? (channel.magic_number || 123456) : generateUniqueMagicNumber(existingChannels),
    max_slippage_points: 20,
    trade_monitor_interval_sec: 0.5,
    is_active: true,
    is_reversed: false,  // v11.0: Reverse trade feature
    ai_analysis_enabled: false,  // Claude signal grader (label only)
    ai_analysis_gemini_enabled: false,  // Gemini signal grader (label only)
    instruments: [{ logical_symbol: 'XAUUSD', broker_symbol: 'XAUUSD', pip_tolerance_pips: 1.5 }],
    final_tp_policy: { kind: 'rr', rr_ratio: 1.0, tp_index: 1 },
    riskfree_policy: { enabled: true, kind: '%path', percent: 50, pips: 10, tp_index: 1 },
    cancel_policy: { enabled: true, kind: 'final_tp', percent: 50, tp_index: 1, enable_for_now: true, enable_for_limit: true, enable_for_auto: true },
    commands: { enable_close: true, enable_cancel_limit: true, enable_riskfree: false, enable_sl_update: false, close_phrases: [], cancel_limit_phrases: [], riskfree_phrases: [], sl_update_phrases: ['\\bstop\\b.*\\bupdat'] },
    circuit_breaker: { enabled: true, max_daily_trades: 20, max_daily_loss_pct: 10 },
    news_blackout: {},  // { [category_id]: { is_enabled, days_before, days_after } }
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
        ai_analysis_enabled: channel.ai_analysis_enabled ?? false,  // Claude signal grader (label only)
        ai_analysis_gemini_enabled: channel.ai_analysis_gemini_enabled ?? false,  // Gemini signal grader (label only)
        instruments: channel.instruments || [{ logical_symbol: 'XAUUSD', broker_symbol: 'XAUUSD', pip_tolerance_pips: 1.5 }],
        final_tp_policy: channel.final_tp_policy || { kind: 'rr', rr_ratio: 1.0, tp_index: 1 },
        riskfree_policy: channel.riskfree_policy || { enabled: false, kind: '%path', percent: 50 },
        cancel_policy: channel.cancel_policy || { enabled: true, kind: 'final_tp', enable_for_now: true, enable_for_limit: true, enable_for_auto: true },
        commands: channel.commands || { enable_close: true, enable_cancel_limit: true, enable_riskfree: false, enable_sl_update: false, close_phrases: [], cancel_limit_phrases: [], riskfree_phrases: [], sl_update_phrases: ['\\bstop\\b.*\\bupdat'] },
        circuit_breaker: channel.circuit_breaker || { enabled: true, max_daily_trades: 20, max_daily_loss_pct: 10 },
        news_blackout: buildNewsBlackout(newsCategories, channel.news_blackouts),
      })
    }
  }, [channel])

  // Rebuild the news-blackout map when the category catalogue loads (or changes),
  // preserving any other in-progress edits. Adds defaults for new categories.
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      news_blackout: buildNewsBlackout(newsCategories, channel?.news_blackouts ?? prev.news_blackout),
    }))
  }, [newsCategories, channel])

  function validateForm() {
    const errors = {}
    // Exclude current channel when editing
    const otherChannels = (existingChannels || []).filter(
      ch => ch.id !== channel?.id
    )

    // Channel name validation
    const name = (formData.channel_key || '').trim()
    if (!name) {
      errors.channel_key = 'Channel name is required'
    } else {
      const duplicate = otherChannels.find(
        ch => ch.channel_key.toLowerCase() === name.toLowerCase()
      )
      if (duplicate) {
        errors.channel_key = `Channel name "${name}" is already in use`
      }
    }

    // Magic number validation
    const magic = formData.magic_number
    if (!magic || isNaN(magic)) {
      errors.magic_number = 'Magic number is required'
    } else if (magic < 100000 || magic > 999999) {
      errors.magic_number = 'Magic number must be 6 digits (100000–999999)'
    } else {
      const duplicate = otherChannels.find(ch => ch.magic_number === magic)
      if (duplicate) {
        errors.magic_number = `Magic number ${magic} is already used by "${duplicate.channel_key}"`
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    if (!validateForm()) {
      setActiveTab('basic')  // Switch to basic tab to show errors
      return
    }

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
    { id: 'news', icon: Newspaper, label: 'News Blackout' },
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
                  onChange={e => {
                    setFormData({ ...formData, channel_key: e.target.value })
                    if (validationErrors.channel_key) {
                      setValidationErrors(prev => ({ ...prev, channel_key: undefined }))
                    }
                  }}
                  placeholder="e.g., FOREX TRADING MASTER™🏙"
                  className={validationErrors.channel_key ? '!border-red-500' : ''}
                />
                {validationErrors.channel_key && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {validationErrors.channel_key}
                  </p>
                )}
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Risk Per Trade">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.risk_per_trade}
                    onChange={e => setFormData({ ...formData, risk_per_trade: parseFloat(e.target.value) })}
                  />
                </FormField>
                <FormField label="Risk Tolerance">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.risk_tolerance}
                    onChange={e => setFormData({ ...formData, risk_tolerance: parseFloat(e.target.value) })}
                  />
                </FormField>
              </div>
              <FormField label="Magic Number" hint="Unique 6-digit identifier for MT5 orders (100000–999999)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.magic_number}
                    onChange={e => {
                      setFormData({ ...formData, magic_number: parseInt(e.target.value) })
                      if (validationErrors.magic_number) {
                        setValidationErrors(prev => ({ ...prev, magic_number: undefined }))
                      }
                    }}
                    className={validationErrors.magic_number ? '!border-red-500' : ''}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, magic_number: generateUniqueMagicNumber(existingChannels) })
                      setValidationErrors(prev => ({ ...prev, magic_number: undefined }))
                    }}
                    className="px-3 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-xs text-accent-cyan hover:bg-accent-cyan/10 transition-colors whitespace-nowrap flex items-center gap-1.5"
                    title="Generate unique magic number"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
                {validationErrors.magic_number && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {validationErrors.magic_number}
                  </p>
                )}
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
              <div
                className="flex items-center justify-between p-4"
                style={{
                  background: 'var(--card-flat)',
                  borderRadius: '14px',
                  border: formData.is_reversed
                    ? '2px solid rgba(255,179,92,0.40)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 ${formData.is_reversed ? 'text-orange-400' : 'text-gray-500'}`} />
                    <label className={`text-sm font-medium ${formData.is_reversed ? 'text-orange-300' : 'text-gray-300'}`}>
                      Reverse Signals
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 ml-6">BUY→SELL, SELL→BUY. Use for poorly performing channels.</p>
                </div>
                <Toggle
                  checked={formData.is_reversed}
                  onChange={checked => setFormData({ ...formData, is_reversed: checked })}
                />
              </div>

              {/* AI Signal Analysis Toggles (label only — do not block trades).
                  Claude and Gemini are independent: enable either or both. With
                  both on, each signal gets two separate 0-10 scores. */}
              <div
                className="flex items-center justify-between p-4"
                style={{
                  background: 'var(--card-flat)',
                  borderRadius: '14px',
                  border: formData.ai_analysis_enabled
                    ? '2px solid rgba(139,92,246,0.40)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Brain className={`w-4 h-4 ${formData.ai_analysis_enabled ? 'text-violet-400' : 'text-gray-500'}`} />
                    <label className={`text-sm font-medium ${formData.ai_analysis_enabled ? 'text-violet-300' : 'text-gray-300'}`}>
                      AI Signal Analysis — Claude
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 ml-6">Grades each signal 0-10 with Claude. Label only — does not block trades.</p>
                </div>
                <Toggle
                  checked={formData.ai_analysis_enabled}
                  onChange={checked => setFormData({ ...formData, ai_analysis_enabled: checked })}
                />
              </div>

              <div
                className="flex items-center justify-between p-4"
                style={{
                  background: 'var(--card-flat)',
                  borderRadius: '14px',
                  border: formData.ai_analysis_gemini_enabled
                    ? '2px solid rgba(56,189,248,0.40)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Brain className={`w-4 h-4 ${formData.ai_analysis_gemini_enabled ? 'text-sky-400' : 'text-gray-500'}`} />
                    <label className={`text-sm font-medium ${formData.ai_analysis_gemini_enabled ? 'text-sky-300' : 'text-gray-300'}`}>
                      AI Signal Analysis — Gemini
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 ml-6">Grades each signal 0-10 with Gemini 2.5 Flash. Label only — does not block trades.</p>
                </div>
                <Toggle
                  checked={formData.ai_analysis_gemini_enabled}
                  onChange={checked => setFormData({ ...formData, ai_analysis_gemini_enabled: checked })}
                />
              </div>
            </div>
          )}

          {/* Instruments Tab */}
          {activeTab === 'instruments' && (
            <div className="space-y-4">
              {formData.instruments.map((inst, idx) => (
                <div key={idx} className="bg-dark-tertiary rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Instrument {idx + 1}</span>
                    {formData.instruments.length > 1 && (
                      <button
                        onClick={() => setFormData({
                          ...formData,
                          instruments: formData.instruments.filter((_, i) => i !== idx)
                        })}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField label="Logical Symbol">
                      <input
                        value={inst.logical_symbol}
                        onChange={e => {
                          const updated = [...formData.instruments]
                          updated[idx] = { ...updated[idx], logical_symbol: e.target.value }
                          setFormData({ ...formData, instruments: updated })
                        }}
                      />
                    </FormField>
                    <FormField label="Broker Symbol">
                      <input
                        value={inst.broker_symbol}
                        onChange={e => {
                          const updated = [...formData.instruments]
                          updated[idx] = { ...updated[idx], broker_symbol: e.target.value }
                          setFormData({ ...formData, instruments: updated })
                        }}
                      />
                    </FormField>
                    <FormField label="Pip Tolerance">
                      <input
                        type="number"
                        step="0.1"
                        value={inst.pip_tolerance_pips}
                        onChange={e => {
                          const updated = [...formData.instruments]
                          updated[idx] = { ...updated[idx], pip_tolerance_pips: parseFloat(e.target.value) }
                          setFormData({ ...formData, instruments: updated })
                        }}
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setFormData({
                  ...formData,
                  instruments: [...formData.instruments, { logical_symbol: '', broker_symbol: '', pip_tolerance_pips: 1.5 }]
                })}
                className="btn-secondary w-full"
              >
                <Plus className="w-4 h-4 inline mr-2" /> Add Instrument
              </button>
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
                  <option value="pips">Pips from Entry</option>
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
                    value={formData.riskfree_policy.pips || 0}
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
              <div className="grid grid-cols-3 gap-4">
                <Toggle
                  checked={formData.cancel_policy.enable_for_now ?? true}
                  onChange={checked => setFormData({
                    ...formData,
                    cancel_policy: { ...formData.cancel_policy, enable_for_now: checked }
                  })}
                  label="For NOW orders"
                />
                <Toggle
                  checked={formData.cancel_policy.enable_for_limit ?? true}
                  onChange={checked => setFormData({
                    ...formData,
                    cancel_policy: { ...formData.cancel_policy, enable_for_limit: checked }
                  })}
                  label="For LIMIT orders"
                />
                <Toggle
                  checked={formData.cancel_policy.enable_for_auto ?? true}
                  onChange={checked => setFormData({
                    ...formData,
                    cancel_policy: { ...formData.cancel_policy, enable_for_auto: checked }
                  })}
                  label="For AUTO orders"
                />
              </div>
            </div>
          )}

          {/* News Blackout Tab */}
          {activeTab === 'news' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Suspend trading around high-impact news. <span className="text-gray-300">By default every
                channel trades through news</span> — toggle a category on to block this channel around it, then
                drag the two handles to widen the window (<span className="text-red-300">before</span> / <span className="text-red-300">after</span>,
                center 0 = the news day).
                While inside a window, new signals are blocked and any unfilled pending orders are canceled.
              </p>

              {(!newsCategories || newsCategories.length === 0) ? (
                <div className="text-center text-gray-500 py-8 text-sm">
                  No news categories found. Run the database migration
                  (<code className="text-gray-400">migrations/0001_news_blackout.sql</code>) to enable this feature.
                </div>
              ) : newsCategories.map(cat => {
                const cfg = formData.news_blackout?.[cat.id] || { is_enabled: false, days_before: 0, days_after: 0 }
                const setCfg = (patch) => setFormData(prev => ({
                  ...prev,
                  news_blackout: {
                    ...prev.news_blackout,
                    [cat.id]: { ...prev.news_blackout?.[cat.id], ...patch },
                  },
                }))
                return (
                  <div
                    key={cat.id}
                    className="p-4"
                    style={{
                      background: 'var(--card-flat)',
                      borderRadius: '14px',
                      border: cfg.is_enabled
                        ? '2px solid rgba(239,68,68,0.40)'
                        : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Newspaper className={`w-4 h-4 ${cfg.is_enabled ? 'text-red-400' : 'text-gray-500'}`} />
                        <span className={`text-sm font-medium ${cfg.is_enabled ? 'text-red-300' : 'text-gray-300'}`}>
                          {cat.label}
                        </span>
                      </div>
                      <Toggle
                        checked={cfg.is_enabled}
                        onChange={checked => setCfg({ is_enabled: checked })}
                      />
                    </div>
                    <NewsBlackoutSlider
                      daysBefore={cfg.days_before}
                      daysAfter={cfg.days_after}
                      disabled={!cfg.is_enabled}
                      onChange={(b, a) => setCfg({ days_before: b, days_after: a })}
                    />
                  </div>
                )
              })}
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
              <div className="space-y-3">
                <Toggle
                  checked={formData.commands.enable_sl_update}
                  onChange={checked => setFormData({
                    ...formData,
                    commands: { ...formData.commands, enable_sl_update: checked }
                  })}
                  label="Enable SL Update Command"
                />
                <FormField label="SL Update Phrases (regex, one per line)" hint="Detects messages like 'STOP POINT UPDATED TO 4700' and modifies the SL of the most recent active trade">
                  <textarea
                    rows={3}
                    value={(formData.commands.sl_update_phrases || []).join('\n')}
                    onChange={e => setFormData({
                      ...formData,
                      commands: { ...formData.commands, sl_update_phrases: e.target.value.split('\n').filter(Boolean) }
                    })}
                    placeholder="\\bstop\\b.*\\bupdat"
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

const PAGE_TAB_HEADINGS = {
  'channels': {
    title: 'Channel Configuration',
    subtitle: 'Manage your Telegram signal channels',
  },
  'ai-execution': {
    title: 'AI Execution Control',
    subtitle: 'Route order execution by the AI signal grade — for every channel at once',
  },
  'strategies': {
    title: 'Signal Strategies',
    subtitle: 'Switch filters such as the market regime on or off and set the order they run in',
  },
  'visitors': {
    title: 'Site Visitors',
    subtitle: 'Track and manage visitors to this dashboard',
  },
}

export default function Channels() {
  const [channels, setChannels] = useState([])
  const [newsCategories, setNewsCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingChannel, setEditingChannel] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [clearTradesConfirm, setClearTradesConfirm] = useState(null)  // channel whose trades to clear
  const [clearingTrades, setClearingTrades] = useState(false)
  const [pageTab, setPageTab] = useState('channels')
  
  // Global settings state (Issue 1: Pending order expiry)
  const [pendingExpiryHours, setPendingExpiryHours] = useState(6)
  const [savingExpiry, setSavingExpiry] = useState(false)

  // Everything on this page is scoped to the selected VPS.
  const { selectedBotId } = useBot()

  useEffect(() => {
    if (!selectedBotId) return
    loadChannels()
    loadGlobalSettings()

    const subscription = subscribeToChannels(() => loadChannels())
    return () => subscription.unsubscribe()
  }, [selectedBotId])

  async function loadChannels() {
    try {
      setLoading(true)
      const [data, categories, blackouts] = await Promise.all([
        // Only the selected VPS's channels.
        fetchChannels(selectedBotId),
        fetchNewsCategories(),
        fetchNewsBlackouts(),
      ])
      // Attach each channel's saved blackout map for the editor + card badge.
      const withBlackouts = (data || []).map(ch => ({
        ...ch,
        news_blackouts: blackouts[ch.id] || {},
      }))
      setChannels(withBlackouts)
      setNewsCategories(categories || [])
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadGlobalSettings() {
    try {
      const expiry = await fetchAppSetting('pending_order_expiry_hours')
      if (expiry !== null && expiry !== undefined) {
        setPendingExpiryHours(expiry)
      }
    } catch (err) {
      console.error('Failed to load global settings:', err)
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
    let channelId
    if (editingChannel) {
      await updateChannel(editingChannel.id, formData)
      channelId = editingChannel.id
    } else {
      // New channels belong to the VPS currently selected.
      const created = await createChannel({ ...formData, bot_id: selectedBotId })
      channelId = created?.id
    }
    // Persist per-channel news blackout settings (no-op if migration not applied)
    if (channelId && formData.news_blackout) {
      try {
        await saveChannelNewsBlackouts(channelId, formData.news_blackout)
      } catch (err) {
        console.error('Failed to save news blackout settings:', err)
      }
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

  async function handleClearTrades(channel) {
    setClearingTrades(true)
    try {
      const removed = await deleteTradesByChannel(channel.id)
      setClearTradesConfirm(null)
      alert(`Removed ${removed} trade${removed === 1 ? '' : 's'} for "${channel.channel_key}".`)
    } catch (err) {
      console.error('Clear trades failed:', err)
      alert('Failed to clear trades: ' + err.message)
    } finally {
      setClearingTrades(false)
    }
  }

  async function handleSaveExpiry() {
    setSavingExpiry(true)
    try {
      await updateAppSetting('pending_order_expiry_hours', pendingExpiryHours)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingExpiry(false)
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
          <h1 className="text-2xl font-bold text-white">
            {PAGE_TAB_HEADINGS[pageTab].title}
          </h1>
          <p className="text-gray-500 mt-1">
            {PAGE_TAB_HEADINGS[pageTab].subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LogoutButton />
          {pageTab === 'channels' && (
            <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Channel
            </button>
          )}
        </div>
      </div>

      {/* Page sub-tabs */}
      <div
        className="flex items-center gap-1.5 sm:gap-2 mb-6 p-1.5 overflow-x-auto"
        style={{
          background: 'var(--card-recess)',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.06)',
          scrollbarWidth: 'none',
        }}
      >
        {[
          { key: 'channels', label: 'Channels', icon: Settings },
          { key: 'strategies', label: 'Strategies', icon: Layers },
          { key: 'ai-execution', label: 'AI Execution', icon: Brain },
          { key: 'visitors', label: 'Visitors', icon: Users },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = pageTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setPageTab(tab.key)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
              style={{
                borderRadius: '10px',
                background: isActive ? 'rgba(173,255,47,0.12)' : 'transparent',
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

      {pageTab === 'visitors' && <VisitorsTab />}

      {/* The strategy list is the VPS switch for this page: picking one shows
          that VPS's channels, their settings, and its own AI execution gate. */}
      {pageTab !== 'visitors' && <StrategyList />}

      {pageTab === 'strategies' && <StrategiesTab />}

      {pageTab === 'ai-execution' && <AIExecutionTab />}

      {pageTab === 'channels' && (<>
      {/* Global Settings (Issue 1: Pending Order Expiry) */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-accent-cyan" />
          Global Settings
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Pending Order Expiry (hours)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                step="0.5"
                value={pendingExpiryHours}
                onChange={e => setPendingExpiryHours(parseFloat(e.target.value) || 0)}
                className="w-32"
              />
              <button
                onClick={handleSaveExpiry}
                disabled={savingExpiry}
                className="btn-primary flex items-center gap-2"
              >
                {savingExpiry ? 'Saving...' : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Unfilled STOP/LIMIT orders are automatically canceled after this time. Set to 0 to disable.
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search channels..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue/50"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Channels Grid */}
      {(() => {
        const q = searchQuery.trim().toLowerCase()
        const filtered = q ? channels.filter(ch => ch.channel_key.toLowerCase().includes(q)) : channels
        return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-2 text-center text-gray-500 py-12">No channels match "{searchQuery}"</div>
        ) : filtered.map(channel => (
          <div
            key={channel.id}
            className="p-5"
            style={{
              background: 'var(--card-flat)',
              borderRadius: '20px',
              border: channel.is_reversed
                ? '2px solid rgba(255,179,92,0.40)'
                : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white truncate">{channel.channel_key}</h3>
                  <span className={`badge ${channel.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {channel.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {channel.is_reversed && (
                    <span className="badge" style={{ color: 'var(--orange)' }}>
                      <RefreshCw className="w-3 h-3 inline mr-1" />Reversed
                    </span>
                  )}
                  {channel.ai_analysis_enabled && (
                    <span className="badge" style={{ color: '#a78bfa' }} title="Claude signal grading enabled">
                      <Brain className="w-3 h-3 inline mr-1" />Claude
                    </span>
                  )}
                  {channel.ai_analysis_gemini_enabled && (
                    <span className="badge" style={{ color: '#38bdf8' }} title="Gemini signal grading enabled">
                      <Brain className="w-3 h-3 inline mr-1" />Gemini
                    </span>
                  )}
                  {newsCategories.length > 0 &&
                    newsCategories.some(c => (channel.news_blackouts?.[c.id]?.is_enabled ?? false)) && (
                    <span className="badge" style={{ color: '#f87171' }} title="News blackout active">
                      <Newspaper className="w-3 h-3 inline mr-1" />News
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">Magic: {channel.magic_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditModal(channel)} className="text-gray-400 hover:text-accent-cyan">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setClearTradesConfirm(channel)}
                  className="text-gray-400 hover:text-amber-400"
                  title="Remove all trades for this channel"
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteConfirm(channel.id)} className="text-gray-400 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-dark-tertiary rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase mb-1">Risk</div>
                <div className="text-white font-mono">{(channel.risk_per_trade * 100).toFixed(1)}%</div>
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
            </div>
          </div>
        ))}
      </div>
        )
      })()}
      </>)}

      {/* Edit Modal — now receives existingChannels for validation */}
      {showModal && (
        <ChannelEditorModal
          channel={editingChannel}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          existingChannels={channels}
          newsCategories={newsCategories}
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

      {/* Clear Trades Confirmation */}
      {clearTradesConfirm && (
        <div className="modal-overlay" onClick={() => !clearingTrades && setClearTradesConfirm(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Remove All Trades
              </h2>
            </div>
            <div className="modal-body">
              <p className="text-gray-300">
                Are you sure you want to remove <span className="font-semibold text-white">all trades</span> for
                channel <span className="font-semibold text-white">"{clearTradesConfirm.channel_key}"</span>?
                The channel itself is kept. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setClearTradesConfirm(null)}
                className="btn-secondary"
                disabled={clearingTrades}
              >
                Cancel
              </button>
              <button
                onClick={() => handleClearTrades(clearTradesConfirm)}
                className="btn-danger flex items-center gap-2"
                disabled={clearingTrades}
              >
                {clearingTrades ? 'Removing...' : <><Eraser className="w-4 h-4" /> Remove Trades</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
