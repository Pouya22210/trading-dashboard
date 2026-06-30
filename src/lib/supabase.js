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

  // ai_analysis_enabled lives on the channels table but isn't exposed by the
  // v_channel_configs view, so pull it directly and merge by channel id.
  const { data: aiFlags } = await supabase.from('channels').select('id, ai_analysis_enabled')
  const flagMap = Object.fromEntries((aiFlags || []).map(c => [c.id, c.ai_analysis_enabled]))
  return (data || []).map(ch => ({ ...ch, ai_analysis_enabled: flagMap[ch.id] ?? false }))
}

export async function fetchChannel(id) {
  const { data, error } = await supabase
    .from('v_channel_configs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error

  // ai_analysis_enabled isn't in the view — read it from the channels table.
  const { data: ch } = await supabase.from('channels').select('ai_analysis_enabled').eq('id', id).single()
  return { ...data, ai_analysis_enabled: ch?.ai_analysis_enabled ?? false }
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
      is_reversed: channelData.is_reversed || false,  // v11.0: Reverse trade support
      ai_analysis_enabled: channelData.ai_analysis_enabled || false  // AI signal analysis (label only)
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
    enable_sl_update: channelData.commands?.enable_sl_update ?? false,
    close_phrases: channelData.commands?.close_phrases || [],
    cancel_limit_phrases: channelData.commands?.cancel_limit_phrases || [],
    riskfree_phrases: channelData.commands?.riskfree_phrases || [],
    sl_update_phrases: channelData.commands?.sl_update_phrases || ['\\bstop\\b.*\\bupdat']
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
      is_reversed: channelData.is_reversed ?? false,
      ai_analysis_enabled: channelData.ai_analysis_enabled ?? false  // AI signal analysis (label only)
    })
    .eq('id', id)

  if (channelError) throw channelError

  // Delete and recreate instruments
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
    enable_sl_update: channelData.commands?.enable_sl_update ?? false,
    close_phrases: channelData.commands?.close_phrases || [],
    cancel_limit_phrases: channelData.commands?.cancel_limit_phrases || [],
    riskfree_phrases: channelData.commands?.riskfree_phrases || [],
    sl_update_phrases: channelData.commands?.sl_update_phrases || ['\\bstop\\b.*\\bupdat']
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

/**
 * Delete every trade belonging to a channel. Returns the number of rows removed.
 */
export async function deleteTradesByChannel(channelId) {
  const { data, error } = await supabase
    .from('trades')
    .delete()
    .eq('channel_id', channelId)
    .select('id')

  if (error) throw error
  return (data || []).length
}

// ============================================================================
// NEWS BLACKOUT
// ============================================================================

/**
 * Fetch the catalogue of news categories (FOMC, CPI, NFP, ...).
 * Extensible: add a row to `news_categories` and it appears here automatically.
 */
export async function fetchNewsCategories() {
  const { data, error } = await supabase
    .from('news_categories')
    .select('id, key, label, display_order, is_active')
    .eq('is_active', true)
    .order('display_order')

  if (error) {
    // Degrade gracefully if the migration hasn't been applied yet.
    console.warn('fetchNewsCategories failed (migration applied?):', error.message)
    return []
  }
  return data || []
}

/**
 * Fetch every channel's news-blackout rows, grouped by channel id:
 *   { [channel_id]: { [category_id]: { is_enabled, days_before, days_after } } }
 */
export async function fetchNewsBlackouts() {
  const { data, error } = await supabase
    .from('channel_news_blackouts')
    .select('channel_id, category_id, is_enabled, days_before, days_after')

  if (error) {
    console.warn('fetchNewsBlackouts failed (migration applied?):', error.message)
    return {}
  }
  const byChannel = {}
  for (const row of data || []) {
    if (!byChannel[row.channel_id]) byChannel[row.channel_id] = {}
    byChannel[row.channel_id][row.category_id] = {
      is_enabled: row.is_enabled,
      days_before: row.days_before,
      days_after: row.days_after,
    }
  }
  return byChannel
}

/**
 * Persist a channel's news-blackout settings.
 * @param {string} channelId
 * @param {Object} blackoutByCategory - { [category_id]: { is_enabled, days_before, days_after } }
 */
export async function saveChannelNewsBlackouts(channelId, blackoutByCategory) {
  const rows = Object.entries(blackoutByCategory || {}).map(([category_id, cfg]) => ({
    channel_id: channelId,
    category_id,
    is_enabled: !!cfg.is_enabled,
    days_before: Math.max(0, Math.min(7, parseInt(cfg.days_before) || 0)),
    days_after: Math.max(0, Math.min(7, parseInt(cfg.days_after) || 0)),
  }))
  if (rows.length === 0) return true

  const { error } = await supabase
    .from('channel_news_blackouts')
    .upsert(rows, { onConflict: 'channel_id,category_id' })

  if (error) throw error
  return true
}

/**
 * Fetch the nearest upcoming economic-calendar events (for the navbar popover).
 * Returns rows with: event_time, event_date, currency, title, impact, forecast, previous.
 * @param {number} limit
 */
export async function fetchUpcomingNews(limit = 25) {
  // Include events from the start of today so an event earlier today still shows.
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Only look ahead 7 days (through the end of the 7th day from today).
  const endOfWindow = new Date(startOfToday)
  endOfWindow.setDate(endOfWindow.getDate() + 7)
  endOfWindow.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('economic_calendar')
    .select('event_time, event_date, currency, title, impact, forecast, previous')
    .eq('impact', 'high')                       // only red / high-impact news
    .gte('event_time', startOfToday.toISOString())
    .lte('event_time', endOfWindow.toISOString())
    .order('event_time', { ascending: true })
    .limit(limit)

  if (error) {
    console.warn('fetchUpcomingNews failed (migration applied?):', error.message)
    return []
  }
  return data || []
}

// ============================================================================
// CRITICAL FIX: Fetch ALL trades using pagination to bypass 1000-row limit
// UPDATED: Use v_trades_with_channels view for current channel info
// ============================================================================
export async function fetchTrades(filters = {}) {
  const BATCH_SIZE = 1000  // Supabase's max-rows limit
  const allTrades = []
  let offset = 0
  let hasMore = true

  console.log('🔄 Starting to fetch all trades...')

  while (hasMore) {
    let query = supabase
      .from('v_trades_with_channels')  // ✅ Use view instead of trades table
      .select('*', { count: 'exact' })
      .order('signal_time', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)  // Fetch in batches

    // Apply filters - UPDATED to use channel_id instead of channel_name
    if (filters.channelId) {
      query = query.eq('channel_id', filters.channelId)
    }
    // Legacy support for channel name filter (for backward compatibility)
    if (filters.channel) {
      query = query.eq('display_channel_name', filters.channel)
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
    // New filter: exclude orphaned channels
    if (filters.excludeOrphaned) {
      query = query.eq('is_orphaned_channel', false)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching trades:', error)
      throw error
    }

    if (data && data.length > 0) {
      allTrades.push(...data)
      console.log(`📦 Fetched batch: ${data.length} trades (offset: ${offset}, total so far: ${allTrades.length}/${count})`)
      
      // Check if there are more records to fetch
      if (data.length < BATCH_SIZE || allTrades.length >= count) {
        hasMore = false
      } else {
        offset += BATCH_SIZE
      }
    } else {
      hasMore = false
    }

    // Safety check: stop if we've fetched an unreasonable number (prevents infinite loop)
    if (allTrades.length > 100000) {
      console.warn('⚠️ Stopped fetching after 100,000 trades (safety limit)')
      hasMore = false
    }
  }

  console.log(`✅ Fetched ${allTrades.length} trades total`)
  return allTrades
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
// APP SETTINGS
// ============================================================================

export async function fetchAppSetting(key) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error) throw error
  return data?.value
}

export async function updateAppSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .update({
      value: value,
      updated_at: new Date().toISOString()
    })
    .eq('key', key)

  if (error) throw error
  return true
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
 * @param {Function} callbacks.onStatus - Called when connection status changes
 */
export function subscribeToTrades(callbacks = {}) {
  const {
    onInsert = () => {},
    onUpdate = () => {},
    onDelete = () => {},
    onStatus = () => {}
  } = callbacks

  // Each subscriber gets its own channel so independent subscriptions
  // (Dashboard + Trades, or re-subscriptions after dep changes) don't
  // collide on the same channel name.
  const channelName = `trades-changes-${Math.random().toString(36).slice(2, 10)}`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('Trade inserted:', payload.new)
        onInsert(payload.new)
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('Trade updated:', payload.new)
        onUpdate(payload.new, payload.old)
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'trades' },
      (payload) => {
        console.log('Trade deleted:', payload.old)
        onDelete(payload.old)
      }
    )
    .subscribe((status, err) => {
      console.log('Subscription status:', status)
      onStatus(status, err)
    })

  return channel
}

// ==================== SITE VISITS ====================

// Cheap session de-dup: don't insert another visit row within this tab session.
const SITE_VISIT_SESSION_KEY = 'site_visit_recorded'

async function fetchGeoIP() {
  // ipapi.co is free for ~1000 req/day. Times out fast so a hanging request
  // can't block the visit insert.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) {
      console.warn('[site_visits] geo-IP HTTP', res.status)
      return null
    }
    const j = await res.json()
    if (j.error) {
      console.warn('[site_visits] geo-IP API error:', j.reason || j.error)
      return null
    }
    return {
      ip:           j.ip || null,
      country:      j.country_name || null,
      country_code: j.country_code || null,
      city:         j.city || null,
      region:       j.region || null,
    }
  } catch (err) {
    console.warn('[site_visits] geo-IP fetch failed:', err.message || err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function recordSiteVisit({ path, referrer, force } = {}) {
  try {
    if (typeof window === 'undefined') return { skipped: 'no-window' }
    if (!force && sessionStorage.getItem(SITE_VISIT_SESSION_KEY) === '1') {
      return { skipped: 'session-dedup' }
    }

    const geo = await fetchGeoIP()
    const row = {
      ip:           geo?.ip ?? null,
      country:      geo?.country ?? null,
      country_code: geo?.country_code ?? null,
      city:         geo?.city ?? null,
      region:       geo?.region ?? null,
      user_agent:   navigator.userAgent?.slice(0, 500) ?? null,
      path:         path ?? window.location.pathname,
      referrer:     referrer ?? document.referrer ?? null,
    }
    const { data, error } = await supabase.from('site_visits').insert(row).select().single()
    if (error) {
      console.error('[site_visits] insert failed:', error.message, error)
      return { error }
    }
    // Only set the dedup flag for regular page-load tracking. Manual test
    // inserts (force=true) should NOT lock out future auto-tracking in this tab.
    if (!force) sessionStorage.setItem(SITE_VISIT_SESSION_KEY, '1')
    console.log('[site_visits] recorded:', data?.country || 'unknown', 'id', data?.id)
    return { data }
  } catch (err) {
    console.error('[site_visits] unexpected error:', err)
    return { error: err }
  }
}

export async function fetchSiteVisits({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .order('visited_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function deleteSiteVisit(id) {
  const { error } = await supabase.from('site_visits').delete().eq('id', id)
  if (error) throw error
}

export async function clearAllSiteVisits() {
  // .neq with an always-true predicate would still hit RLS row-by-row; use a wide id filter.
  const { error } = await supabase.from('site_visits').delete().gte('id', 0)
  if (error) throw error
}

/**
 * Subscribe to live MT5 position P&L broadcasts from the sigbot.
 * The bot pushes a tick every ~2s on topic 'live-positions' with shape:
 *   { positions: [{ ticket, magic, symbol, side, profit, swap, price, volume }], ts }
 * Returns the channel so callers can unsubscribe.
 */
export function subscribeToLivePositions(onTick) {
  const channel = supabase
    .channel('live-positions')
    .on('broadcast', { event: 'tick' }, ({ payload }) => {
      try {
        onTick(payload)
      } catch (err) {
        console.error('subscribeToLivePositions handler error:', err)
      }
    })
    .subscribe()

  return channel
}

/**
 * Subscribe to channel configuration changes
 */
export function subscribeToChannels(callback) {
  const channel = supabase
    .channel('channels-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'channels' },
      callback
    )
    .subscribe()

  return channel
}
