// =====================================================================
// Insights tab -- tick-driven near-miss distributions.
// =====================================================================
// The "Insights" sub-tab on the Trades page needs metrics that can only be
// computed from MT5 tick history (closest approach of price to entry / SL).
// Those live behind the same Flask backend the Backtest tab uses, so we POST
// the current sidebar filter envelope and get back two histograms.
// =====================================================================

// Same default as Backtest.jsx -- the MT5-backed Flask API, exposed via ngrok.
export const BACKTEST_API_URL =
  import.meta.env.VITE_BACKTEST_API_URL || 'https://unkindhearted-lilian-unspent.ngrok-free.dev'

/**
 * Fetch the entry-near-miss and SL-room distributions for a filter set.
 * @param {{ channelIds?: string[], startDate?: string|null, endDate?: string|null, showOrphaned?: boolean }} filters
 * @returns {Promise<{ entry_near_miss: object, sl_room: object }>}
 */
export async function fetchTradeInsights(filters = {}) {
  const payload = {
    channel_ids:   filters.channelIds ?? [],
    start_date:    toDate(filters.startDate),
    end_date:      toDate(filters.endDate),
    show_orphaned: filters.showOrphaned ?? true,
  }

  const res = await fetch(`${BACKTEST_API_URL}/api/insights/distances`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data.result
}

// The backend expects plain YYYY-MM-DD. Sidebar dates already arrive that way,
// but tolerate full ISO strings just in case.
function toDate(value) {
  if (!value) return null
  return String(value).slice(0, 10)
}
