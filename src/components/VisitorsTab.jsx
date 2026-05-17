import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Users, Globe, RefreshCw, Trash2, AlertTriangle, MapPin, Eye, Clock, X
} from 'lucide-react'
import { fetchSiteVisits, deleteSiteVisit, clearAllSiteVisits, recordSiteVisit } from '../lib/supabase'

const VISITS_PER_PAGE = 25

function StatCard({ label, value, icon: Icon, accent = '#58a6ff' }) {
  return (
    <div
      className="p-4 sm:p-5"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '16px',
        boxShadow: 'var(--neu-raised-sm)',
      }}
    >
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <div
          className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7"
          style={{
            borderRadius: '8px',
            background: 'var(--neu-bg)',
            boxShadow: 'var(--neu-pressed-sm)',
            color: accent,
          }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <div className="text-lg sm:text-2xl font-bold font-mono text-white leading-none">
        {value}
      </div>
    </div>
  )
}

function FlagEmoji({ countryCode }) {
  if (!countryCode || countryCode.length !== 2) {
    return <Globe className="w-3.5 h-3.5 text-gray-500" />
  }
  return (
    <img
      src={`https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`}
      alt={countryCode}
      width={20}
      height={15}
      style={{ display: 'inline-block', borderRadius: '2px' }}
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}

function formatRelative(ts) {
  const t = new Date(ts).getTime()
  const now = Date.now()
  const diff = (now - t) / 1000
  if (diff < 60)       return `${Math.floor(diff)}s ago`
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400*7)  return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

function maskIP(ip) {
  if (!ip) return '—'
  if (ip.includes('.')) {
    // IPv4
    const parts = ip.split('.')
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.•.•`
  }
  if (ip.includes(':')) {
    // IPv6
    return ip.split(':').slice(0, 3).join(':') + ':•'
  }
  return ip
}

export default function VisitorsTab() {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState(null)
  const [diag, setDiag] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSiteVisits({ limit: 1000 })
      setVisits(data)
    } catch (err) {
      console.error('Failed to load visits:', err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleTestRecord() {
    setDiag({ status: 'running', message: 'Recording test visit...' })
    const res = await recordSiteVisit({ force: true, path: '/__diagnostic__' })
    if (res?.error) {
      setDiag({ status: 'error', message: `Insert failed: ${res.error.message || res.error}` })
    } else if (res?.data) {
      setDiag({ status: 'ok', message: `Recorded id ${res.data.id} from ${res.data.country || 'unknown country'}` })
      await load()
    } else {
      setDiag({ status: 'warn', message: `No insert: ${res?.skipped || 'unknown'}` })
    }
  }

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    const total = visits.length
    const countries = new Set(visits.map(v => v.country).filter(Boolean))
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const today = visits.filter(v => new Date(v.visited_at) >= todayStart).length

    const counts = {}
    visits.forEach(v => {
      if (!v.country) return
      counts[v.country] = (counts[v.country] || 0) + 1
    })
    const topCountries = Object.entries(counts)
      .map(([country, count]) => ({
        country,
        count,
        code: visits.find(v => v.country === country)?.country_code || null,
      }))
      .sort((a, b) => b.count - a.count)

    return { total, uniqueCountries: countries.size, today, topCountries }
  }, [visits])

  async function handleDelete(id) {
    try {
      await deleteSiteVisit(id)
      setVisits(prev => prev.filter(v => v.id !== id))
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  async function handleClearAll() {
    try {
      await clearAllSiteVisits()
      setVisits([])
      setConfirmClear(false)
      setPage(1)
    } catch (err) {
      alert('Failed to clear: ' + err.message)
    }
  }

  const totalPages = Math.max(1, Math.ceil(visits.length / VISITS_PER_PAGE))
  const pageVisits = visits.slice((page - 1) * VISITS_PER_PAGE, page * VISITS_PER_PAGE)
  const maxTop = stats.topCountries[0]?.count || 1

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleTestRecord}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Insert a test visit row to verify the table and RLS policies are working"
          >
            <Eye className="w-4 h-4" />
            Record Test Visit
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            disabled={visits.length === 0}
            className="btn-danger flex items-center gap-2 text-sm disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
        <span className="text-xs text-gray-500">{visits.length} record{visits.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Error / diagnostic banner */}
      {error && (
        <div
          className="mb-4 p-3 text-sm flex items-start gap-2"
          style={{
            background: 'rgba(248, 81, 73, 0.10)',
            color: '#f85149',
            borderRadius: '10px',
            boxShadow: 'inset 0 0 0 1px rgba(248, 81, 73, 0.25)',
          }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">Failed to load visits</div>
            <div className="text-xs font-mono opacity-90">{error}</div>
            <div className="text-xs opacity-75 mt-1">Most likely the <code>site_visits</code> table is missing or RLS blocks SELECT. Re-run <code>migrations/001_site_visits.sql</code>.</div>
          </div>
        </div>
      )}
      {diag && (
        <div
          className="mb-4 p-3 text-sm flex items-start gap-2"
          style={{
            background: diag.status === 'ok'    ? 'rgba(34, 197, 94, 0.10)'
                      : diag.status === 'error' ? 'rgba(248, 81, 73, 0.10)'
                      :                           'rgba(240, 136, 62, 0.10)',
            color:      diag.status === 'ok'    ? '#22c55e'
                      : diag.status === 'error' ? '#f85149'
                      :                           '#f0883e',
            borderRadius: '10px',
            boxShadow: 'inset 0 0 0 1px currentColor',
          }}
        >
          <div className="flex-1 font-mono text-xs">{diag.message}</div>
          <button onClick={() => setDiag(null)} className="opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total Visits"      value={stats.total}           icon={Eye}   accent="#58a6ff" />
        <StatCard label="Today"             value={stats.today}           icon={Clock} accent="#ADFF2F" />
        <StatCard label="Unique Countries"  value={stats.uniqueCountries} icon={Globe} accent="#39d5ff" />
        <StatCard label="Top Country"       value={stats.topCountries[0]?.country || '—'} icon={MapPin} accent="#a371f7" />
      </div>

      {/* Top countries */}
      {stats.topCountries.length > 0 && (
        <div
          className="p-4 sm:p-5 mb-6"
          style={{
            background: 'var(--neu-bg)',
            borderRadius: '16px',
            boxShadow: 'var(--neu-raised-sm)',
          }}
        >
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent-cyan" />
            Top Countries
          </h3>
          <div className="space-y-2">
            {stats.topCountries.slice(0, 8).map(c => (
              <div key={c.country} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-36 sm:w-44 flex-shrink-0">
                  <FlagEmoji countryCode={c.code} />
                  <span className="text-sm text-gray-300 truncate" title={c.country}>{c.country}</span>
                </div>
                <div className="flex-1 h-2 bg-dark-tertiary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.count / maxTop) * 100}%`,
                      background: 'linear-gradient(90deg, #58a6ff 0%, #ADFF2F 100%)',
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-white w-12 text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visits table */}
      <div
        className="overflow-hidden"
        style={{
          background: 'var(--neu-bg)',
          borderRadius: '16px',
          boxShadow: 'var(--neu-raised-sm)',
        }}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-accent-cyan" />
            Recent Visits
          </h3>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading visits...</div>
        ) : visits.length === 0 ? (
          <div className="text-center text-gray-500 py-12 px-4 text-sm">
            No visits recorded yet. Make sure the <code className="text-accent-cyan">site_visits</code> table exists in Supabase (see <code className="text-accent-cyan">migrations/001_site_visits.sql</code>).
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">When</th>
                    <th className="text-left">Country</th>
                    <th className="text-left">City</th>
                    <th className="text-left">IP</th>
                    <th className="text-left">Path</th>
                    <th className="text-left">Referrer</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageVisits.map(v => (
                    <tr key={v.id} className="hover:bg-dark-tertiary/30">
                      <td className="text-xs text-gray-400" title={new Date(v.visited_at).toLocaleString()}>
                        {formatRelative(v.visited_at)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <FlagEmoji countryCode={v.country_code} />
                          <span className="text-sm text-gray-300">{v.country || '—'}</span>
                        </div>
                      </td>
                      <td className="text-sm text-gray-400">{v.city || '—'}</td>
                      <td className="text-xs font-mono text-gray-500">{maskIP(v.ip)}</td>
                      <td className="text-xs font-mono text-gray-400 max-w-[200px] truncate" title={v.path}>{v.path || '—'}</td>
                      <td className="text-xs text-gray-500 max-w-[180px] truncate" title={v.referrer}>{v.referrer || '—'}</td>
                      <td>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors p-1"
                          title="Delete this visit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-3 space-y-2">
              {pageVisits.map(v => (
                <div
                  key={v.id}
                  className="p-3"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '10px',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FlagEmoji countryCode={v.country_code} />
                      <span className="text-sm font-semibold text-white truncate">
                        {v.country || 'Unknown'}
                        {v.city && <span className="text-gray-500 font-normal ml-1">· {v.city}</span>}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 font-mono">
                    <span>{maskIP(v.ip)}</span>
                    <span>{formatRelative(v.visited_at)}</span>
                  </div>
                  {v.path && (
                    <div className="text-[10px] font-mono text-gray-500 mt-1 truncate" title={v.path}>
                      {v.path}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-white/5">
                <span className="text-xs text-gray-500">
                  {(page - 1) * VISITS_PER_PAGE + 1}–{Math.min(page * VISITS_PER_PAGE, visits.length)} of {visits.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-400">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-xs rounded-md bg-dark-tertiary text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Clear all confirmation */}
      {confirmClear && (
        <div className="modal-overlay" onClick={() => setConfirmClear(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Clear All Visits
              </h2>
            </div>
            <div className="modal-body">
              <p className="text-gray-300">
                Delete all {visits.length} visit record{visits.length !== 1 ? 's' : ''}? This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmClear(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleClearAll} className="btn-danger flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
