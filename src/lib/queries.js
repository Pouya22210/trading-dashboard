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
  return {
    total: Number(data?.total) || 0,
    rows:  data?.rows || [],
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
  }
}
