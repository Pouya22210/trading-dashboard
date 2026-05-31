// =====================================================================
// Background OHLC candles for the MT5-style trade price chart.
// =====================================================================
// Uses Twelve Data (https://twelvedata.com). Its free tier covers forex,
// metals, crypto and stocks, and the API sends CORS headers, so we can call
// it straight from the browser like the existing geo-IP lookup does.
//
// Enable candles by setting VITE_TWELVEDATA_API_KEY in your environment.
// WITHOUT a key the chart still renders every trade (entry -> exit) on a
// price/time grid; it just won't draw the candlestick background.
// =====================================================================

const TD_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY || ''

// Chart timeframes -> Twelve Data intervals. `ms` is the nominal bar width,
// used by the chart to size candle bodies and clamp zoom.
export const CHART_TIMEFRAMES = [
  { key: '1m',  label: 'M1',  tdInterval: '1min',  ms: 60_000 },
  { key: '5m',  label: 'M5',  tdInterval: '5min',  ms: 5 * 60_000 },
  { key: '15m', label: 'M15', tdInterval: '15min', ms: 15 * 60_000 },
  { key: '30m', label: 'M30', tdInterval: '30min', ms: 30 * 60_000 },
  { key: '1h',  label: 'H1',  tdInterval: '1h',    ms: 60 * 60_000 },
  { key: '4h',  label: 'H4',  tdInterval: '4h',    ms: 4 * 60 * 60_000 },
  { key: '1d',  label: 'D1',  tdInterval: '1day',  ms: 24 * 60 * 60_000 },
]

export function hasCandleProvider() {
  return Boolean(TD_KEY)
}

// Symbols that don't follow the plain BASE/QUOTE 3+3 convention.
const SYMBOL_OVERRIDES = {
  GOLD:   'XAU/USD',
  XAUUSD: 'XAU/USD',
  XAGUSD: 'XAG/USD',
  SILVER: 'XAG/USD',
  USOIL:  'WTI/USD',
  WTI:    'WTI/USD',
  UKOIL:  'BRENT/USD',
}

// Map an MT5 / broker symbol to a Twelve Data symbol.
// Broker symbols often carry suffixes (EURUSD.r, XAUUSDm, BTCUSD-ECN); we strip
// those, then split a clean 6-letter code into BASE/QUOTE.
export function toProviderSymbol(symbol) {
  if (!symbol) return null
  let core = String(symbol).trim()
  core = core.replace(/[._#/\\-].*$/, '') // drop everything from the first separator
  core = core.replace(/[a-z]+$/, '')      // drop a trailing lowercase broker tag (EURUSDm)
  core = core.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (SYMBOL_OVERRIDES[core]) return SYMBOL_OVERRIDES[core]
  if (/^[A-Z]{6}$/.test(core)) return `${core.slice(0, 3)}/${core.slice(3)}`
  return core || null
}

function parseTdDatetime(dt) {
  if (!dt) return NaN
  // Daily bars come as "2024-05-30"; intraday as "2024-05-30 14:30:00" (UTC).
  if (dt.length <= 10) return Date.parse(`${dt}T00:00:00Z`)
  return Date.parse(`${dt.replace(' ', 'T')}Z`)
}

const tdDate = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/**
 * Fetch OHLC candles for a symbol/timeframe covering [startMs, endMs].
 * Always resolves (never throws to the caller) so a flaky price feed can't
 * blank out the trade overlay. Returns { candles, reason, tdSymbol }.
 */
export async function fetchCandles({ symbol, timeframe, startMs, endMs, signal } = {}) {
  const tdSymbol = toProviderSymbol(symbol)
  if (!TD_KEY) return { candles: [], reason: 'no-key', tdSymbol }
  if (!tdSymbol) return { candles: [], reason: 'no-symbol', tdSymbol }

  const tf = CHART_TIMEFRAMES.find(t => t.key === timeframe) || CHART_TIMEFRAMES[4]

  // Twelve Data caps each response at 5000 bars. If the requested window holds
  // more bars than that (common for M1/M5 over a wide range), pull the most
  // recent slice that fits so we always return candles for the visible area
  // instead of an empty/mismatched page.
  const MAX_BARS = 5000
  if (startMs && endMs && (endMs - startMs) / tf.ms > MAX_BARS) {
    startMs = endMs - MAX_BARS * tf.ms
  }

  const params = new URLSearchParams({
    symbol:     tdSymbol,
    interval:   tf.tdInterval,
    apikey:     TD_KEY,
    format:     'JSON',
    timezone:   'UTC',
    outputsize: '5000',
  })
  if (startMs) params.set('start_date', tdDate(startMs))
  if (endMs)   params.set('end_date',   tdDate(endMs))

  try {
    const res = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, { signal })
    if (!res.ok) return { candles: [], reason: `http-${res.status}`, tdSymbol }
    const json = await res.json()
    if (json.status === 'error') return { candles: [], reason: json.message || 'provider-error', tdSymbol }
    const candles = (json.values || [])
      .map(v => ({
        t: parseTdDatetime(v.datetime),
        o: parseFloat(v.open),
        h: parseFloat(v.high),
        l: parseFloat(v.low),
        c: parseFloat(v.close),
      }))
      .filter(c => Number.isFinite(c.t) && Number.isFinite(c.o))
      .sort((a, b) => a.t - b.t)
    return { candles, reason: null, tdSymbol }
  } catch (err) {
    if (err?.name === 'AbortError') return { candles: [], reason: 'aborted', tdSymbol }
    console.warn('[priceData] candle fetch failed:', err?.message || err)
    return { candles: [], reason: 'fetch-failed', tdSymbol }
  }
}
