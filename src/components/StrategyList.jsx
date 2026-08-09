import React from 'react'
import { Server, Check, Circle } from 'lucide-react'
import { useBot } from './BotContext'

// The list of VPS (strategies) on the Channels page. Selecting one switches
// the global bot selection, so the channel list, their settings and the AI
// execution gate below all follow it.
//
// Grading strategy is NOT editable here: prompts and timeframes live in files
// on each VPS (a voting setup needs a different prompt per model). What the
// bot reports about itself at startup — `bots.grader_snapshot` — is shown
// read-only so you can see what each machine is actually running.

function timeAgo(iso) {
  if (!iso) return 'never'
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (!Number.isFinite(seconds)) return 'unknown'
  if (seconds < 60) return 'just now'
  const units = [['d', 86400], ['h', 3600], ['m', 60]]
  for (const [label, size] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`
  }
  return 'just now'
}

function GraderSummary({ snapshot }) {
  if (!snapshot || Object.keys(snapshot).length === 0) {
    return <p className="text-[11px] text-gray-600 mt-2">No strategy reported yet — start the bot to publish it.</p>
  }

  const { strategy, providers, timeframes, decide, models } = snapshot
  const chips = []
  if (strategy) chips.push(strategy)
  if (Array.isArray(providers) && providers.length) chips.push(providers.join(' + '))
  if (Array.isArray(timeframes) && timeframes.length) {
    chips.push(timeframes.map(tf => Array.isArray(tf) ? tf[0] : tf).join('/'))
  }
  if (decide && decide !== 'single') chips.push(`decide: ${decide}`)

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.length === 0 && <span className="text-[11px] text-gray-600">built-in defaults</span>}
      {chips.map((chip, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-tertiary text-gray-400 border border-gray-700"
          title={models ? JSON.stringify(models) : undefined}
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

export default function StrategyList() {
  const { bots, selectedBotId, setSelectedBotId, loading } = useBot()

  if (loading && bots.length === 0) {
    return <div className="text-sm text-gray-500 py-4">Loading strategies…</div>
  }

  if (bots.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No bots registered yet. See <code className="text-gray-400">docs/NEW_VPS_SETUP.md</code>.
      </div>
    )
  }

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Strategies (VPS)
        </h2>
        <span className="text-xs text-gray-500">{bots.length} registered</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bots.map(bot => {
          const isSelected = bot.id === selectedBotId
          return (
            <button
              key={bot.id}
              type="button"
              onClick={() => setSelectedBotId(bot.id)}
              aria-pressed={isSelected}
              className={`text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-violet-500 bg-violet-500/5'
                  : 'border-gray-700 bg-dark-secondary hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-2">
                <Server className="w-4 h-4 mt-0.5 shrink-0" style={{ color: bot.color || '#6366f1' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-white text-sm truncate">{bot.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                    {!bot.is_active && (
                      <span className="text-[10px] text-amber-500 border border-amber-500/40 rounded px-1">
                        inactive
                      </span>
                    )}
                  </div>

                  {bot.description && (
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{bot.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-500">
                    <Circle
                      className="w-2 h-2"
                      fill={bot.last_seen_at ? '#22c55e' : '#6b7280'}
                      stroke="none"
                    />
                    <span>seen {timeAgo(bot.last_seen_at)}</span>
                    {bot.vps_label && <span className="text-gray-600">· {bot.vps_label}</span>}
                  </div>

                  <GraderSummary snapshot={bot.grader_snapshot} />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
