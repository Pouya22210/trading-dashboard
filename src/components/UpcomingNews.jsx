import React, { useState, useEffect, useCallback } from 'react'
import { Newspaper, X, RefreshCw } from 'lucide-react'
import { fetchUpcomingNews } from '../lib/supabase'

const IMPACT = {
  high:    { color: '#ef4444', label: 'High' },
  medium:  { color: '#f59e0b', label: 'Medium' },
  low:     { color: '#22c55e', label: 'Low' },
  holiday: { color: '#6b7280', label: 'Holiday' },
}
function impactMeta(impact) {
  return IMPACT[(impact || '').toLowerCase()] || { color: '#6b7280', label: impact || '—' }
}

// "Today" / "Tomorrow" / "Mon, Jun 10"
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function UpcomingNews() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await fetchUpcomingNews(30))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  // Group by event_date, preserving the time-sorted order.
  const groups = []
  const idx = {}
  for (const ev of events) {
    if (!(ev.event_date in idx)) {
      idx[ev.event_date] = groups.length
      groups.push({ date: ev.event_date, items: [] })
    }
    groups[idx[ev.event_date]].items.push(ev)
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Upcoming news"
        title="Upcoming news"
        style={{
          width: '40px', height: '40px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', borderRadius: '12px',
          background: 'transparent', border: 'none',
          boxShadow: 'none',
          color: open ? 'var(--accent-green)' : 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'color 0.18s ease',
        }}
      >
        <Newspaper style={{ width: '18px', height: '18px' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0"
          style={{ top: '68px', background: 'rgba(15,17,21,0.6)', backdropFilter: 'blur(4px)', zIndex: 56 }}
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className="fixed"
        style={{
          top: '76px', right: '12px',
          width: 'min(380px, 94vw)', maxHeight: 'calc(100vh - 92px)',
          background: 'var(--neu-bg)', borderRadius: '16px',
          boxShadow: '0 12px 30px rgba(0,0,0,0.55)', zIndex: 57,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <Newspaper style={{ width: 16, height: 16, color: '#ef4444' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Upcoming News</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>USD</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} title="Refresh" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
              <RefreshCw style={{ width: 14, height: 14 }} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setOpen(false)} title="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* legend */}
        <div className="flex items-center gap-3 px-4 py-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="flex items-center gap-1">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: IMPACT.high.color, display: 'inline-block' }} />
            High impact · next 7 days
          </span>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {loading && events.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No upcoming news found.
            </div>
          ) : groups.map(g => (
            <div key={g.date}>
              <div style={{
                padding: '8px 16px 4px', fontSize: 11, fontWeight: 600,
                color: 'var(--accent-green)', letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {dayLabel(g.date)}
              </div>
              {g.items.map((ev, i) => {
                const m = impactMeta(ev.impact)
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2" style={{ fontSize: 13 }}>
                    <span title={m.label} style={{
                      width: 10, height: 10, borderRadius: '50%', background: m.color,
                      flexShrink: 0, boxShadow: `0 0 6px ${m.color}66`,
                    }} />
                    <span className="font-mono" style={{ color: 'var(--text-tertiary)', fontSize: 12, width: 52, flexShrink: 0 }}>
                      {timeLabel(ev.event_time)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
