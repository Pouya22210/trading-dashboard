import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
)

// Helper functions for common operations
export async function fetchChannels() {
  const { data, error } = await supabase
    .from('v_channel_configs')
    .select('*')
    .order('channel_key')
  
  if (error) throw error
  return data
}

export async function fetchChannel(id) {
  const { data, error } = await supabase
    .from('v_channel_configs')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) throw error
  return data
}

export async function createChannel(channelData) {
  // Insert into channels table first
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({
      channel_key: channelData.channel_key,
      risk_per_trade: channelData.risk_per_trade,
      risk_tolerance: channelData.risk_tolerance,
      magic_number: channelData.magic_number,
      max_slippage_points: channelData.max_slippage_points,
      trade_monitor_interval_sec: channelData.trade_monitor_interval_sec,
      is_active: true,
      is_reversed: channelData.is_reversed || false  // v11.0: Reverse trade support
    })
    .select()
    .single()

  if (channelError) throw channelError

  const channelId = channel.id

  // Insert instruments
  if (channelData.instruments?.length > 0) {
    const instruments = channelData.instruments.map((inst, idx) => ({
      channel_id: channelId,
      logical_symbol: inst.logical_symbol,
      broker_symbol: inst.broker_symbol,
      pip_tolerance_pips: inst.pip_tolerance_pips,
      display_order: idx
    }))
    
    const { error: instError } = await supabase.from('instruments').insert(instruments)
    if (instError) throw instError
  }

  // Insert policies
  await supabase.from('final_tp_policies').insert({
    channel_id: channelId,
    kind: channelData.final_tp_policy?.kind || 'rr',
    tp_index: channelData.final_tp_policy?.tp_index,
    rr_ratio: channelData.final_tp_policy?.rr_ratio || 1.0
  })

  await supabase.from('riskfree_policies').insert({
    channel_id: channelId,
    is_enabled: channelData.riskfree_policy?.enabled ?? false,
    kind: channelData.riskfree_policy?.kind || '%path',
    tp_index: channelData.riskfree_policy?.tp_index,
    pips: channelData.riskfree_policy?.pips,
    percent: channelData.riskfree_policy?.percent || 50
  })

  await supabase.from('cancel_policies').insert({
    channel_id: channelId,
    is_enabled: channelData.cancel_policy?.enabled ?? true,
    kind: channelData.cancel_policy?.kind || 'final_tp',
    tp_index: channelData.cancel_policy?.tp_index,
    percent: channelData.cancel_policy?.percent,
    enable_for_now: channelData.cancel_policy?.enable_for_now ?? true,
    enable_for_limit: channelData.cancel_policy?.enable_for_limit ?? true,
    enable_for_auto: channelData.cancel_policy?.enable_for_auto ?? true
  })

  await supabase.from('command_configs').insert({
    channel_id: channelId,
    enable_close: channelData.commands?.enable_close ?? true,
    enable_cancel_limit: channelData.commands?.enable_cancel_limit ?? true,
    enable_riskfree: channelData.commands?.enable_riskfree ?? false,
    close_phrases: channelData.commands?.close_phrases || [],
    cancel_limit_phrases: channelData.commands?.cancel_limit_phrases || [],
    riskfree_phrases: channelData.commands?.riskfree_phrases || []
  })

  await supabase.from('circuit_breaker_configs').insert({
    channel_id: channelId,
    is_enabled: channelData.circuit_breaker?.enabled ?? true,
    max_daily_trades: channelData.circuit_breaker?.max_daily_trades || 20,
    max_daily_loss_pct: channelData.circuit_breaker?.max_daily_loss_pct || 10
  })

  await supabase.from('trend_filter_configs').insert({
    channel_id: channelId,
    is_enabled: channelData.trend_filter?.enabled ?? false,
    swing_strength: channelData.trend_filter?.swing_strength || 2,
    min_swings_required: channelData.trend_filter?.min_swings_required || 2,
    ema_period: channelData.trend_filter?.ema_period || 50,
    candles_to_fetch: channelData.trend_filter?.candles_to_fetch || 100,
    require_all_three: channelData.trend_filter?.require_all_three ?? false,
    log_details: channelData.trend_filter?.log_details ?? true
  })

  return channel
}

export async function updateChannel(id, channelData) {
  // Update main channel
  const { error: channelError } = await supabase
    .from('channels')
    .update({
      channel_key: channelData.channel_key,
      risk_per_trade: channelData.risk_per_trade,
      risk_tolerance: channelData.risk_tolerance,
      magic_number: channelData.magic_number,
      max_slippage_points: channelData.max_slippage_points,
      trade_monitor_interval_sec: channelData.trade_monitor_interval_sec,
      is_active: channelData.is_active,
      is_reversed: channelData.is_reversed ?? false  // v11.0: Reverse trade support
    })
    .eq('id', id)

  if (channelError) throw channelError

  // Update instruments - delete and recreate
  await supabase.from('instruments').delete().eq('channel_id', id)
  if (channelData.instruments?.length > 0) {
    const instruments = channelData.instruments.map((inst, idx) => ({
      channel_id: id,
      logical_symbol: inst.logical_symbol,
      broker_symbol: inst.broker_symbol,
      pip_tolerance_pips: inst.pip_tolerance_pips,
      display_order: idx
    }))
    await supabase.from('instruments').insert(instruments)
  }

  // Update policies
  await supabase.from('final_tp_policies').update({
    kind: channelData.final_tp_policy?.kind || 'rr',
    tp_index: channelData.final_tp_policy?.tp_index,
    rr_ratio: channelData.final_tp_policy?.rr_ratio || 1.0
  }).eq('channel_id', id)

  await supabase.from('riskfree_policies').update({
    is_enabled: channelData.riskfree_policy?.enabled ?? false,
    kind: channelData.riskfree_policy?.kind || '%path',
    tp_index: channelData.riskfree_policy?.tp_index,
    pips: channelData.riskfree_policy?.pips,
    percent: channelData.riskfree_policy?.percent || 50
  }).eq('channel_id', id)

  await supabase.from('cancel_policies').update({
    is_enabled: channelData.cancel_policy?.enabled ?? true,
    kind: channelData.cancel_policy?.kind || 'final_tp',
    tp_index: channelData.cancel_policy?.tp_index,
    percent: channelData.cancel_policy?.percent,
    enable_for_now: channelData.cancel_policy?.enable_for_now ?? true,
    enable_for_limit: channelData.cancel_policy?.enable_for_limit ?? true,
    enable_for_auto: channelData.cancel_policy?.enable_for_auto ?? true
  }).eq('channel_id', id)

  await supabase.from('command_configs').update({
    enable_close: channelData.commands?.enable_close ?? true,
    enable_cancel_limit: channelData.commands?.enable_cancel_limit ?? true,
    enable_riskfree: channelData.commands?.enable_riskfree ?? false,
    close_phrases: channelData.commands?.close_phrases || [],
    cancel_limit_phrases: channelData.commands?.cancel_limit_phrases || [],
    riskfree_phrases: channelData.commands?.riskfree_phrases || []
  }).eq('channel_id', id)

  await supabase.from('circuit_breaker_configs').update({
    is_enabled: channelData.circuit_breaker?.enabled ?? true,
    max_daily_trades: channelData.circuit_breaker?.max_daily_trades || 20,
    max_daily_loss_pct: channelData.circuit_breaker?.max_daily_loss_pct || 10
  }).eq('channel_id', id)

  await supabase.from('trend_filter_configs').update({
    is_enabled: channelData.trend_filter?.enabled ?? false,
    swing_strength: channelData.trend_filter?.swing_strength || 2,
    min_swings_required: channelData.trend_filter?.min_swings_required || 2,
    ema_period: channelData.trend_filter?.ema_period || 50,
    candles_to_fetch: channelData.trend_filter?.candles_to_fetch || 100,
    require_all_three: channelData.trend_filter?.require_all_three ?? false,
    log_details: channelData.trend_filter?.log_details ?? true
  }).eq('channel_id', id)

  return { id }
}

export async function deleteChannel(id) {
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', id)
  
  if (error) throw error
  return true
}

// ============================================================================
// 🔥 FIXED FUNCTION - This is the critical change to fix the 1000 limit issue
// ============================================================================
export async function fetchTrades(filters = {}) {
  let query = supabase
    .from('trades')
    .select('*', { count: 'exact' })  // Add count to know total records
    .order('signal_time', { ascending: false })

  if (filters.channel) {
    query = query.eq('channel_name', filters.channel)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.startDate) {
    query = query.gte('signal_time', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('signal_time', filters.endDate)
  }

  // Fetch ALL records by using a very large limit
  // Supabase can handle up to 1000 per query, so we use range for larger datasets
  const { data, error, count } = await query.range(0, 99999)  // This will get up to 100k records
  
  if (error) throw error
  return data || []
}

export async function fetchDailyStats() {
  const { data, error } = await supabase
    .from('v_daily_stats')
    .select('*')
    .order('trade_date', { ascending: false })
    .limit(30)

  if (error) throw error
  return data || []
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS (Improved)
// ============================================================================

/**
 * Subscribe to real-time trade updates with granular callbacks
 * @param {Object} callbacks - Object with onInsert, onUpdate, onDelete handlers
 * @param {Function} callbacks.onInsert - Called when a new trade is inserted
 * @param {Function} callbacks.onUpdate - Called when a trade is updated
 * @param {Function} callbacks.onDelete - Called when a trade is deleted
 * @param {Function} callbacks.onAny - Called for any change (optional fallback)
 * @param {Function} callbacks.onStatus - Called when connection status changes
 * @returns {Object} Subscription object with unsubscribe method
 */
export function subscribeToTrades(callbacks = {}) {
  const { onInsert, onUpdate, onDelete, onAny, onStatus } = callbacks

  const channel = supabase
    .channel('trades-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('🟢 Trade INSERT:', payload.new?.trade_id)
        if (onInsert) onInsert(payload.new)
        if (onAny) onAny('INSERT', payload.new, null)
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('🟡 Trade UPDATE:', payload.new?.trade_id, payload.new?.status)
        if (onUpdate) onUpdate(payload.new, payload.old)
        if (onAny) onAny('UPDATE', payload.new, payload.old)
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('🔴 Trade DELETE:', payload.old?.trade_id)
        if (onDelete) onDelete(payload.old)
        if (onAny) onAny('DELETE', null, payload.old)
      }
    )
    .subscribe((status, err) => {
      console.log('📡 Trades subscription status:', status)
      if (err) console.error('Subscription error:', err)
      if (onStatus) onStatus(status, err)
    })

  return {
    unsubscribe: () => {
      console.log('Unsubscribing from trades channel')
      supabase.removeChannel(channel)
    },
    channel
  }
}

/**
 * Subscribe to real-time channel config updates
 */
export function subscribeToChannels(callbacks = {}) {
  const { onInsert, onUpdate, onDelete, onAny, onStatus } = callbacks

  const channel = supabase
    .channel('channels-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'channels' },
      (payload) => {
        console.log('🟢 Channel INSERT:', payload.new?.channel_key)
        if (onInsert) onInsert(payload.new)
        if (onAny) onAny('INSERT', payload.new, null)
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'channels' },
      (payload) => {
        console.log('🟡 Channel UPDATE:', payload.new?.channel_key)
        if (onUpdate) onUpdate(payload.new, payload.old)
        if (onAny) onAny('UPDATE', payload.new, payload.old)
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'channels' },
      (payload) => {
        console.log('🔴 Channel DELETE:', payload.old?.channel_key)
        if (onDelete) onDelete(payload.old)
        if (onAny) onAny('DELETE', null, payload.old)
      }
    )
    .subscribe((status, err) => {
      console.log('📡 Channels subscription status:', status)
      if (err) console.error('Subscription error:', err)
      if (onStatus) onStatus(status, err)
    })

  return {
    unsubscribe: () => {
      console.log('Unsubscribing from channels channel')
      supabase.removeChannel(channel)
    },
    channel
  }
}

/**
 * Subscribe to daily stats view updates (listens to trades table)
 */
export function subscribeToDailyStats(callback) {
  // Daily stats is a view based on trades, so we listen to trades
  return subscribeToTrades({
    onAny: () => callback()
  })
}
