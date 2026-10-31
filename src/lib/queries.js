import { supabase } from './supabase'

// =====================================================================
// Server-side aggregate queries
// =====================================================================
// All page-level analytics go through these helpers. They call Postgres
// RPCs that return pre-aggregated data, so payload + render cost stay
// bounded as the trades table grows.
//
// SQL definitions: migrations/2026-05-24_perf_aggregates.sql
// =====================================================================


// ---------- Dashboard: per-channel rollup for a time range ----------

const TIME_RANGE_DAYS = {
  '1d':  1,
  '1w':  7,
  '1m':  30,
  '1y':  365,
  'all': null,
}

export async function fetchChannelPerformance(timeRange = '1w', excludeOrphaned = false, botId = null) {
  const days = TIME_RANGE_DAYS[timeRange] ?? 7
  const startTs = days != null
    ? new Date(Date.now() - days * 86400_000).toISOString()
    : null

  // This RPC does NOT go through _trades_filter_ids, so it takes the bot
  // filter as its own parameter.
  const { data, error } = await supabase.rpc('get_channel_performance', {
    p_start_ts: startTs,
    p_end_ts: null,
    p_exclude_orphaned: excludeOrphaned,
    p_bot_id: botId,
  })

  if (error) throw error
  return (data || []).map(row => ({
    channelId:   row.channel_id,
    channelName: row.channel_name,
    isOrphaned:  row.is_orphaned,
    trades:      Number(row.total_trades),
    wins:        Number(row.wins),
    losses:      Number(row.losses),
    breakevens:  Number(row.breakevens),
    pnl:         Number(row.total_pnl)     || 0,
    pnlPercent:  Number(row.total_pnl_pct) || 0,
    winRate:     Number(row.win_rate)      || 0,
  }))
}


// ---------- Trades page: server-paginated table rows ----------

export async function fetchTradesPage(filters, { limit = 10, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('get_trades_paginated', {
    p_filters: serializeFilters(filters),
    p_limit:   limit,
    p_offset:  offset,
  })
  if (error) throw error
  const rows = data?.rows || []

  // The AI signal-grader fields (Claude: ai_label/win_probability/llm_analysis,
  // Gemini: gemini_label/gemini_win_probability/gemini_llm_analysis) and the block
  // reason (notes) aren't returned by the get_trades_paginated RPC, so fetch them
  // straight from the trades table by id and merge in. No RPC/view change needed.
  const ids = rows.map(r => r.id).filter(Boolean)
  if (ids.length) {
    try {
      const { data: extra } = await supabase
        .from('trades')
        .select('id, channel_id, telegram_msg_id, ai_label, win_probability, llm_analysis, gemini_label, gemini_win_probability, gemini_llm_analysis, notes')
        .in('id', ids)
      const extraMap = Object.fromEntries((extra || []).map(a => [a.id, a]))
      for (const r of rows) {
        const a = extraMap[r.id]
        if (a) {
          r.ai_label                = a.ai_label
          r.win_probability         = a.win_probability
          r.llm_analysis            = a.llm_analysis
          r.gemini_label            = a.gemini_label
          r.gemini_win_probability  = a.gemini_win_probability
          r.gemini_llm_analysis     = a.gemini_llm_analysis
          r.notes                   = a.notes
          r.channel_id              = r.channel_id ?? a.channel_id
          r.telegram_msg_id         = r.telegram_msg_id ?? a.telegram_msg_id
        }
      }
    } catch (_) { /* optional — never block the trades page on this */ }
    try {
      await attachStrategyRejections(rows)
    } catch (_) { /* optional — the tooltip falls back to the notes reason */ }
  }

  return {
    total: Number(data?.total) || 0,
    rows,
  }
}


// For blocked rows, the strategies that rejected the signal and their exact
// reasons (trades.notes only has the generic one, e.g. "Signal does not fit
// the current market regime"). Matched on channel_id + telegram_msg_id.
// Sets row.strategy_rejections = [{ strategy, reason }].
async function attachStrategyRejections(rows) {
  const blocked = rows.filter(r => r.status === 'blocked' && r.channel_id && r.telegram_msg_id != null)
  if (!blocked.length) return
  const { data, error } = await supabase
    .from('strategy_decisions')
    .select('channel_id, telegram_msg_id, strategy, reason, created_at')
    .in('channel_id', [...new Set(blocked.map(r => r.channel_id))])
    .in('telegram_msg_id', [...new Set(blocked.map(r => r.telegram_msg_id))])
    .in('stage', ['signal', 'flip_recheck'])
    .eq('action', 'reject')
    .order('created_at', { ascending: true })
  if (error) throw error
  const byTrade = {}
  for (const d of data || []) {
    const key = `${d.channel_id}:${d.telegram_msg_id}`
    if (!byTrade[key]) byTrade[key] = []
    const list = byTrade[key]
    if (!list.some(x => x.strategy === d.strategy && x.reason === d.reason)) {
      list.push({ strategy: d.strategy, reason: d.reason })
    }
  }
  for (const r of blocked) r.strategy_rejections = byTrade[`${r.channel_id}:${r.telegram_msg_id}`] || []
}

// Ids of the trades that went through any of the given pipeline strategies
// (same rule as the `strategies` filter in _trades_filter_ids). Paged past
// PostgREST's 1000-row cap.
async function fetchStrategyTradeIds(strategies, botId) {
  const ids = new Set()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .rpc('trade_ids_for_strategies', { p_strategies: strategies, p_bot_id: botId || null })
      .range(offset, offset + 999)
    if (error) throw error
    for (const row of data || []) ids.add(row.id)
    if (!data || data.length < 1000) break
  }
  return ids
}


// ---------- Trades page: chart + stat-card bundle ----------

export async function fetchTradesAnalytics(filters) {
  const { data, error } = await supabase.rpc('get_trades_analytics', {
    p_filters: serializeFilters(filters),
  })
  if (error) throw error
  return data || {}
}


// ---------- Trades page: AI grade × win/loss distribution ----------
// One row per (channel, provider, grade 0-10) cell over closed trades. Same
// filter envelope as the analytics RPC, so the AI Grades tab tracks every
// sidebar filter (incl. news blackouts).
// SQL: migrations/2026-07-27_grade_outcome_distribution_v2.sql
//
// Two win/loss pairs, and the difference matters:
//   signalWins/signalLosses — did the GRADED SIGNAL win? For trades the AI
//     execution gate INVERTED (score in the 0-4 band → placed on the
//     opposite side) our profit means the graded signal lost, i.e. the
//     grader was right, so the outcome is flipped at the SQL level. This is
//     the pair to judge the model on.
//   execWins/execLosses — did the trade we actually placed win? The P&L view.
// `inverted` counts the flipped trades in the cell; `breakeven` counts closed
// trades whose SL was moved to BE, so the TP-vs-SL race never resolved (they
// are in neither win/loss pair).

export async function fetchGradeOutcomeDistribution(filters) {
  const { data, error } = await supabase.rpc('get_grade_outcome_distribution', {
    p_filters: serializeFilters(filters),
  })
  if (error) throw error
  return (data || []).map(row => ({
    channelId:    row.channel_id,
    channelName:  row.channel_name,
    provider:     row.provider,
    grade:        Number(row.grade),
    signalWins:   Number(row.signal_wins)   || 0,
    signalLosses: Number(row.signal_losses) || 0,
    execWins:     Number(row.exec_wins)     || 0,
    execLosses:   Number(row.exec_losses)   || 0,
    breakeven:    Number(row.breakeven)     || 0,
    inverted:     Number(row.inverted)      || 0,
    // Inverted trades split by OUR result, so the chart can colour them apart
    // from real losses/wins on the same side of the axis.
    invertedExecWins:   Number(row.inverted_exec_wins)   || 0,
    invertedExecLosses: Number(row.inverted_exec_losses) || 0,
  }))
}

// Market-regime confidence × outcome (shadow-mode decisions only). One row per
// channel × confidence bucket (0-9 = 0-10% … 90-100%, null = no regime data)
// × passExConf ("every regime rule except min confidence accepts").
export async function fetchRegimeOutcomeDistribution(filters) {
  const { data, error } = await supabase.rpc('get_regime_outcome_distribution', {
    p_filters: serializeFilters(filters),
  })
  if (error) throw error
  return (data || []).map(row => ({
    channelId:   row.channel_id,
    channelName: row.channel_name,
    confBucket:  row.conf_bucket == null ? null : Number(row.conf_bucket),
    passExConf:  row.pass_ex_conf,
    wins:        Number(row.wins)      || 0,
    losses:      Number(row.losses)    || 0,
    breakeven:   Number(row.breakeven) || 0,
  }))
}


// ---------- Trades page: risk-based daily calendar ----------
// Fetches the *entire* calendar for the filter set (not per-month). The UI
// paginates through months locally, and uses the dataset's min/max date to
// decide whether prev/next is allowed. One row per trading day — bounded by
// how long the user has been trading, not by trade volume.

export async function fetchDailyProfitCalendar(filters) {
  const { data, error } = await supabase.rpc('get_daily_profit_calendar', {
    p_filters: serializeFilters(filters),
    p_year:    null,
    p_month:   null,
  })
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    map[row.date] = {
      profit: Number(row.profit) || 0,
      trades: Number(row.trades) || 0,
      wins:   Number(row.wins)   || 0,
      losses: Number(row.losses) || 0,
    }
  }
  return map
}


// ---------- Trades page: risk-based max drawdown ----------

export async function fetchMaxDrawdown(filters) {
  const { data, error } = await supabase.rpc('get_max_drawdown', {
    p_filters: serializeFilters(filters),
  })
  if (error) throw error
  return Number(data) || 0
}


// ---------- Trades page: per-trade points for the price chart ----------
// The MT5-style price chart needs raw entry/exit time+price for every trade
// matching the sidebar filters (not server-side aggregates). We read straight
// from the `v_trades_with_channels` view — the same proven path as
// supabase.fetchTrades — selecting full rows and mapping to lean points.
//
// Filters that the view supports are applied server-side; `weekdays` and
// `sessions` are applied client-side here (UTC). Rows are
// pulled in 1000-row batches to bypass Supabase's max-rows cap, and capped so a
// huge history can't lock up the browser.

const MARKERS_BATCH = 1000
const MARKERS_CAP    = 20000

export async function fetchTradeMarkers(filters = {}) {
  const f = filters
  const channelIds = f.channelIds ?? []
  const weekdaySet = new Set(f.weekdays ?? [0, 1, 2, 3, 4, 5, 6])
  const sessionKeys = f.sessions?.length ? f.sessions : null
  const strategyIds = f.strategies?.length ? await fetchStrategyTradeIds(f.strategies, f.botId) : null

  const markers = []
  let offset = 0
  let hasMore = true

  while (hasMore && markers.length < MARKERS_CAP) {
    let query = supabase
      .from('v_trades_with_channels')
      .select('*', { count: 'exact' })
      .order('signal_time', { ascending: true })
      .range(offset, offset + MARKERS_BATCH - 1)

    if (f.botId)                      query = query.eq('bot_id', f.botId)
    if (channelIds.length > 0)        query = query.in('channel_id', channelIds)
    if ((f.showOrphaned ?? true) === false) query = query.eq('is_orphaned_channel', false)
    if (f.startDate)                  query = query.gte('signal_time', f.startDate)
    if (f.endDate)                    query = query.lte('signal_time', f.endDate)
    if (f.status)                     query = query.eq('status', f.status)
    if (f.direction)                  query = query.eq('direction', f.direction)
    if (f.orderType)                  query = query.eq('order_type', f.orderType)

    const { data, error, count } = await query
    if (error) throw error

    for (const row of data || []) {
      const entryTime = toMs(row.execution_time || row.fill_time || row.signal_time)
      const entryPrice = numOrNull(row.executed_entry_price ?? row.signal_entry_price)
      if (entryTime == null || entryPrice == null) continue
      if (!weekdaySet.has(new Date(entryTime).getUTCDay())) continue
      if (sessionKeys && !inAnySession(toMs(row.signal_time), sessionKeys)) continue
      if (strategyIds && !strategyIds.has(row.id)) continue

      const exitTime  = toMs(row.close_time)
      const exitPrice = numOrNull(row.close_price)
      markers.push({
        id:         row.id,
        tradeId:    row.trade_id,
        channelId:  row.channel_id,
        symbol:     row.symbol,
        direction:  row.direction,
        orderType:  row.order_type,
        status:     row.status,
        outcome:    row.outcome,
        profitLoss: numOrNull(row.profit_loss),
        entryTime,
        entryPrice,
        exitTime:   exitTime,
        exitPrice:  exitTime != null && exitPrice != null ? exitPrice : null,
      })
    }

    const fetched = (data || []).length
    if (fetched < MARKERS_BATCH || (count != null && offset + fetched >= count)) {
      hasMore = false
    } else {
      offset += MARKERS_BATCH
    }
  }

  return markers
}

// UTC hour windows per market session — must match the `sessions` filter in
// public._trades_filter_ids (and the Market Sessions buckets in
// get_trades_analytics). [start, end) with end < start wrapping past midnight.
const SESSION_UTC_HOURS = {
  sydney:  [22, 7],
  tokyo:   [0, 9],
  london:  [8, 17],
  newyork: [13, 22],
}

function inAnySession(ms, keys) {
  if (ms == null) return false
  const h = new Date(ms).getUTCHours()
  return keys.some(k => {
    const [start, end] = SESSION_UTC_HOURS[k] || []
    if (start == null) return false
    return start < end ? (h >= start && h < end) : (h >= start || h < end)
  })
}

function toMs(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function numOrNull(value) {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}


// ---------------------------------------------------------------------
// Filter serialization — keeps RPC payloads consistent across pages.
// ---------------------------------------------------------------------
function serializeFilters(f = {}) {
  return {
    // Which bot (VPS) these results belong to. Read at the one chokepoint
    // every filtered analytics RPC funnels through (_trades_filter_ids), so
    // this single key scopes the whole Trades & Analysis page.
    // null = unscoped, which is what the pre-multi-bot dashboard sent.
    bot_id:                 f.botId || null,
    start_ts:               f.startDate || null,
    end_ts:                 f.endDate   || null,
    channel_ids:            f.channelIds   ?? [],
    show_orphaned:          f.showOrphaned ?? true,
    status:                 f.status    || null,
    direction:              f.direction || null,
    order_type:             f.orderType || null,
    weekdays:               f.weekdays  ?? [0, 1, 2, 3, 4, 5, 6],
    // Market sessions (sydney/tokyo/london/newyork) on signal hour, UTC.
    // Empty = no session filter.
    sessions:               f.sessions  ?? [],
    // Pipeline strategies (regime, ai_grader, ...): trades that went through
    // ANY of them. Empty = no strategy filter.
    strategies:             f.strategies ?? [],
    exclude_manual_cancel:  f.excludeManualCancel ?? false,
    // News what-if exclusion: array of { category_id, days_before, days_after }.
    // The RPC drops trades whose signal day falls in any of these windows.
    news_blackouts:         f.newsBlackouts ?? [],
  }
}
