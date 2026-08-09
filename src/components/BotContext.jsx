import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// =====================================================================
// Selected bot (VPS / strategy)
// =====================================================================
// Each VPS runs its own MT5, its own channels and its own AI grading
// strategy, but they all write to this one database. Every page shows
// exactly ONE bot at a time — there is deliberately no "all bots" option,
// because aggregating results across different strategies and different
// brokers produces a number that means nothing.
//
// The selection is global (not per page) so Trades, Analysis, Dashboard
// and Channels can never disagree about which bot you are looking at,
// and it is persisted so a reload keeps you where you were.
// =====================================================================

const STORAGE_KEY = 'sigbot.selectedBotId'

const BotContext = createContext(null)

export function BotProvider({ children }) {
  const [bots, setBots] = useState([])
  const [selectedBotId, setSelectedBotId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadBots = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('bots')
      .select('id, bot_key, name, description, vps_label, color, is_active, grader_snapshot, last_seen_at, display_order')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })

    if (err) {
      setError(err)
      setLoading(false)
      return
    }

    const rows = data || []
    setBots(rows)
    setError(null)

    // Always land on a real bot: keep the stored one if it still exists and
    // is active, otherwise fall back to the first active bot.
    setSelectedBotId(current => {
      const stillValid = rows.some(b => b.id === current && b.is_active)
      if (stillValid) return current
      const firstActive = rows.find(b => b.is_active) || rows[0]
      return firstActive ? firstActive.id : null
    })
    setLoading(false)
  }, [])

  useEffect(() => { loadBots() }, [loadBots])

  // Keep the picker live when a new VPS is registered or renamed.
  useEffect(() => {
    const subscription = supabase
      .channel('bots-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bots' }, () => loadBots())
      .subscribe()
    return () => supabase.removeChannel(subscription)
  }, [loadBots])

  useEffect(() => {
    if (!selectedBotId) return
    try { localStorage.setItem(STORAGE_KEY, selectedBotId) } catch { /* private mode */ }
  }, [selectedBotId])

  const selectedBot = useMemo(
    () => bots.find(b => b.id === selectedBotId) || null,
    [bots, selectedBotId],
  )

  const value = useMemo(() => ({
    bots,
    selectedBot,
    selectedBotId,
    setSelectedBotId,
    loading,
    error,
    reloadBots: loadBots,
  }), [bots, selectedBot, selectedBotId, loading, error, loadBots])

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>
}

export function useBot() {
  const ctx = useContext(BotContext)
  if (!ctx) throw new Error('useBot must be used inside a <BotProvider>')
  return ctx
}
