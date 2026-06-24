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

export async function fetchChannelPerformance(timeRange = '1w', excludeOrphaned = false) {
  const days = TIME_RANGE_DAYS[timeRange] ?? 7
  const startTs = days != null
    ? new Date(Date.now() - days * 86400_000).toISOString()
    : null

  const { data, error } = await supabase.rpc('get_channel_performance', {
    p_start_ts: startTs,
    p_end_ts: null,
    p_exclude_orphaned: excludeOrphaned,
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

  // The AI signal-grader fields (ai_label, win_probability, llm_analysis) and the
  // block reason (notes) aren't returned by the get_trades_paginated RPC, so fetch
  // them straight from the trades table by id and merge in. No RPC/view change needed.
  const ids = rows.map(r => r.id).filter(Boolean)
  if (ids.length) {
    try {
      const { data: extra } = await supabase
        .from('trades')
        .select('id, ai_label, win_probability, llm_analysis, notes')
        .in('id', ids)
      const extraMap = Object.fromEntries((extra || []).map(a => [a.id, a]))
      for (const r of rows) {
        const a = extraMap[r.id]
        if (a) {
          r.ai_label        = a.ai_label
          r.win_probability = a.win_probability
          r.llm_analysis    = a.llm_analysis
          r.notes           = a.notes
        }
      }
    } catch (_) { /* optional — never block the trades page on this */ }
  }

  return {
    total: Number(data?.total) || 0,
    rows,
  }
}


// ---------- Trades page: chart + stat-card bundle ----------

export async function fetchTradesAnalytics(filters) {
  const { data, error } = await supabase.rpc('get_trades_analytics', {
    p_filters: serializeFilters(filters),
  })
  if (error) throw error
  return data || {}
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
// Filters that the view supports are applied server-side; `weekdays` is applied
// by the caller-facing filter here on the trade's signal time (UTC). Rows are
// pulled in 1000-row batches to bypass Supabase's max-rows cap, and capped so a
// huge history can't lock up the browser.

const MARKERS_BATCH = 1000
const MARKERS_CAP    = 20000

export async function fetchTradeMarkers(filters = {}) {
  const f = filters
  const channelIds = f.channelIds ?? []
  const weekdaySet = new Set(f.weekdays ?? [0, 1, 2, 3, 4, 5, 6])

  const markers = []
  let offset = 0
  let hasMore = true

  while (hasMore && markers.length < MARKERS_CAP) {
    let query = supabase
      .from('v_trades_with_channels')
      .select('*', { count: 'exact' })
      .order('signal_time', { ascending: true })
      .range(offset, offset + MARKERS_BATCH - 1)

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
    start_ts:               f.startDate || null,
    end_ts:                 f.endDate   || null,
    channel_ids:            f.channelIds   ?? [],
    show_orphaned:          f.showOrphaned ?? true,
    status:                 f.status    || null,
    direction:              f.direction || null,
    order_type:             f.orderType || null,
    weekdays:               f.weekdays  ?? [0, 1, 2, 3, 4, 5, 6],
    exclude_manual_cancel:  f.excludeManualCancel ?? false,
    // News what-if exclusion: array of { category_id, days_before, days_after }.
    // The RPC drops trades whose signal day falls in any of these windows.
    news_blackouts:         f.newsBlackouts ?? [],
  }
}
