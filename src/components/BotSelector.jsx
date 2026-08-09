import React from 'react'
import { Server } from 'lucide-react'
import { useBot } from './BotContext'

// Single-select bot (VPS) picker bound to the global BotContext.
// Rendered in the Navbar as the primary switch, and again in the Trades
// filter sidebar (variant="filter") so it reads as one of the filters there.
// Both drive the same selection — there is no per-page bot state.

export default function BotSelector({ variant = 'navbar', className = '' }) {
  const { bots, selectedBotId, setSelectedBotId, loading } = useBot()

  const isFilter = variant === 'filter'

  if (loading && bots.length === 0) {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>Loading bots…</div>
    )
  }

  // With a single bot registered the picker is noise in the navbar, but it
  // still belongs in the filter sidebar so the filter set looks complete.
  if (bots.length <= 1 && !isFilter) return null

  const selected = bots.find(b => b.id === selectedBotId)

  const select = (
    <select
      value={selectedBotId || ''}
      onChange={e => setSelectedBotId(e.target.value)}
      className={
        isFilter
          ? 'w-full bg-dark-secondary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500'
          : 'bg-dark-secondary border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer'
      }
      aria-label="Selected bot"
    >
      {bots.map(bot => (
        <option key={bot.id} value={bot.id}>
          {bot.name}{bot.is_active ? '' : ' (inactive)'}
        </option>
      ))}
    </select>
  )

  // The filter variant is label-less: the Trades sidebar supplies its own
  // heading so it matches the styling of every other filter there.
  if (isFilter) {
    return (
      <div className={className}>
        {select}
        {selected?.description && (
          <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{selected.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <Server
        className="absolute left-2.5 w-4 h-4 pointer-events-none"
        style={{ color: selected?.color || '#6366f1' }}
      />
      {select}
    </div>
  )
}
