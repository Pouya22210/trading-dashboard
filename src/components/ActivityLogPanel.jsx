import React, { useState, useEffect, useCallback } from 'react'
import { 
  History, Plus, Edit3, Trash2, ToggleLeft, ToggleRight,
  RefreshCw, ChevronDown, ChevronUp, Settings, ArrowRight,
  Clock, Filter
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { fetchChannelEvents, subscribeToChannelEvents } from '../lib/channelEvents'

// Event type configurations — accent colors kept; backgrounds and
// borders are handled via neumorphism (raised/pressed surfaces).
const EVENT_CONFIG = {
  channel_created:       { icon: Plus,       color: '#ADFF2F',          label: 'Channel Created' },
  channel_updated:       { icon: Edit3,      color: 'var(--blue)',      label: 'Settings Updated' },
  channel_deleted:       { icon: Trash2,     color: 'var(--red)',       label: 'Channel Deleted' },
  channel_enabled:       { icon: ToggleRight, color: '#ADFF2F',         label: 'Channel Enabled' },
  channel_disabled:      { icon: ToggleLeft, color: 'var(--orange)',    label: 'Channel Disabled' },
  telegram_name_changed: { icon: RefreshCw,  color: 'var(--purple)',    label: 'Name Changed' },
  policy_updated:        { icon: Settings,   color: '#ADFF2F',          label: 'Policy Updated' },
  settings_updated:      { icon: Settings,   color: 'rgba(232,234,239,0.58)', label: 'Settings Updated' },
}

// Get config with fallback
function getEventConfig(eventType) {
  return EVENT_CONFIG[eventType] || {
    icon: Clock,
    color: 'rgba(232,234,239,0.58)',
    label: eventType,
  }
}

// Format a value for display
function formatValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // Format percentages and decimals nicely
    if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`
    return value.toFixed(2).replace(/\.?0+$/, '')
  }
  return String(value)
}

// Format field names to be more readable
function formatFieldName(field) {
  return field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

// Change row component - shows before/after
function ChangeRow({ field, oldValue, newValue }) {
  const formattedField = formatFieldName(field)
  const formattedOld = formatValue(oldValue)
  const formattedNew = formatValue(newValue)
  
  return (
    <div
      className="flex items-center gap-2 py-2 px-3 text-sm"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '12px',
        boxShadow: 'var(--neu-pressed-sm)',
      }}
    >
      <span className="text-gray-400 min-w-[100px] text-xs font-medium">
        {formattedField}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className="line-through truncate max-w-[80px]"
          style={{ color: 'rgba(255,92,92,0.75)' }}
          title={formattedOld}
        >
          {formattedOld}
        </span>
        <ArrowRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
        <span
          className="font-medium truncate max-w-[80px]"
          style={{ color: '#ADFF2F' }}
          title={formattedNew}
        >
          {formattedNew}
        </span>
      </div>
    </div>
  )
}

// Single event card component
function EventCard({ event, isExpanded, onToggle }) {
  const config = getEventConfig(event.event_type)
  const Icon = config.icon
  const eventData = event.event_data || {}
  
  // Extract changes from event data
  const changes = []
  
  // Handle telegram name changes specially
  if (event.event_type === 'telegram_name_changed') {
    changes.push({
      field: 'Channel Name',
      old: event.old_channel_name || eventData.old_name,
      new: event.new_channel_name || eventData.new_name
    })
  }
  
  // Handle channel_updated changes (from trigger)
  if (eventData.channel_key) {
    const change = eventData.channel_key
    if (change.old !== undefined && change.new !== undefined) {
      changes.push({ field: 'channel_key', old: change.old, new: change.new })
    }
  }
  if (eventData.is_active) {
    const change = eventData.is_active
    if (change.old !== undefined && change.new !== undefined) {
      changes.push({ field: 'is_active', old: change.old, new: change.new })
    }
  }
  if (eventData.risk_per_trade) {
    const change = eventData.risk_per_trade
    if (change.old !== undefined && change.new !== undefined) {
      changes.push({ field: 'risk_per_trade', old: change.old, new: change.new })
    }
  }
  if (eventData.is_reversed) {
    const change = eventData.is_reversed
    if (change.old !== undefined && change.new !== undefined) {
      changes.push({ field: 'is_reversed', old: change.old, new: change.new })
    }
  }
  
  // Handle policy_updated changes (from policy table triggers)
  if (eventData.policy && eventData.changes && typeof eventData.changes === 'object') {
    Object.entries(eventData.changes).forEach(([field, change]) => {
      if (typeof change === 'object' && change.old !== undefined) {
        changes.push({ field, old: change.old, new: change.new })
      }
    })
  }
  
  // Handle generic changes object (fallback)
  if (!eventData.policy && eventData.changes && typeof eventData.changes === 'object') {
    Object.entries(eventData.changes).forEach(([field, change]) => {
      if (typeof change === 'object' && change.old !== undefined) {
        changes.push({ field, old: change.old, new: change.new })
      }
    })
  }
  
  // Handle channel_created - show initial values
  if (event.event_type === 'channel_created' && eventData.channel_key) {
    changes.push({ field: 'channel_key', old: null, new: eventData.channel_key })
    if (eventData.risk_per_trade) {
      changes.push({ field: 'risk_per_trade', old: null, new: eventData.risk_per_trade })
    }
    if (eventData.magic_number) {
      changes.push({ field: 'magic_number', old: null, new: eventData.magic_number })
    }
  }
  
  const hasChanges = changes.length > 0
  const channelName = event.new_channel_name || event.old_channel_name || event.current_channel_name || 'Unknown Channel'
  const policyName = eventData.policy ? formatFieldName(eventData.policy) : null
  
  return (
    <div
      className="transition-all overflow-hidden"
      style={{
        background: 'var(--neu-bg)',
        borderRadius: '18px',
        boxShadow: 'var(--neu-raised-sm)',
      }}
    >
      {/* Header - always visible */}
      <div
        className={`p-4 ${hasChanges ? 'cursor-pointer' : ''}`}
        onClick={() => hasChanges && onToggle(event.id)}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-pressed-sm)',
            }}
          >
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="text-xs font-semibold px-2.5 py-1"
                style={{
                  color: config.color,
                  background: 'var(--neu-bg)',
                  borderRadius: '9999px',
                  boxShadow: 'var(--neu-pressed-sm)',
                }}
              >
                {config.label}
              </span>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
              </span>
            </div>

            <p className="text-sm text-white font-medium truncate" title={channelName}>
              {channelName}
            </p>

            {/* Show policy name for policy updates */}
            {policyName && (
              <p className="text-xs text-gray-400 mt-0.5">
                {policyName}
              </p>
            )}

            {/* Quick preview of changes count */}
            {hasChanges && !isExpanded && (
              <p className="text-xs text-gray-500 mt-1">
                {changes.length} setting{changes.length !== 1 ? 's' : ''} changed
              </p>
            )}
          </div>

          {/* Expand button */}
          {hasChanges && (
            <button
              className="flex items-center justify-center transition-opacity"
              style={{
                width: '28px',
                height: '28px',
                color: config.color,
                background: 'var(--neu-bg)',
                border: 'none',
                borderRadius: '9px',
                boxShadow: 'var(--neu-raised-sm)',
                cursor: 'pointer',
              }}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded changes section */}
      {isExpanded && hasChanges && (
        <div
          className="px-4 pb-4 space-y-2 pt-3"
          style={{ boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25)' }}
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>Changes</span>
            <div className="flex-1" style={{ height: '1px', background: 'rgba(0,0,0,0.3)' }} />
          </div>
          {changes.map((change, idx) => (
            <ChangeRow 
              key={idx}
              field={change.field}
              oldValue={change.old}
              newValue={change.new}
            />
          ))}
          
          {/* Full timestamp */}
          <div className="text-xs text-gray-500 pt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(event.created_at), 'MMM d, yyyy h:mm:ss a')}
          </div>
        </div>
      )}
    </div>
  )
}

// Filter options
const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'telegram_name_changed', label: 'Renames' },
  { key: 'channel_updated', label: 'Settings' },
  { key: 'policy_updated', label: 'Policies' },
  { key: 'channel_created', label: 'Created' },
  { key: 'channel_deleted', label: 'Deleted' }
]

export default function ActivityLogPanel({ className = '' }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  // Load events
  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchChannelEvents({ limit: 50 })
      setEvents(data)
    } catch (err) {
      console.error('Failed to load channel events:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load and subscription
  useEffect(() => {
    loadEvents()
    
    const subscription = subscribeToChannelEvents({
      onInsert: (newEvent) => {
        setEvents(prev => [newEvent, ...prev].slice(0, 50))
      }
    })

    return () => subscription.unsubscribe()
  }, [loadEvents])

  // Toggle expansion
  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Filter events
  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.event_type === filter)

  return (
    <div className={`chart-card ${className}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{
          background: 'var(--neu-bg)',
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.35), inset 0 -2px 0 rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'var(--neu-bg)',
              boxShadow: 'var(--neu-pressed-sm)',
            }}
          >
            <History className="w-4 h-4" style={{ color: 'var(--purple)' }} />
          </div>
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Activity Log
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center transition-all"
            style={{
              width: '30px',
              height: '30px',
              background: 'var(--neu-bg)',
              border: 'none',
              borderRadius: '10px',
              boxShadow: (showFilters || filter !== 'all') ? 'var(--neu-pressed-sm)' : 'var(--neu-raised-sm)',
              color: (showFilters || filter !== 'all') ? 'var(--purple)' : 'rgba(232,234,239,0.45)',
              cursor: 'pointer',
            }}
            title="Filter events"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={loadEvents}
            disabled={loading}
            className="flex items-center justify-center transition-all"
            style={{
              width: '30px',
              height: '30px',
              background: 'var(--neu-bg)',
              border: 'none',
              borderRadius: '10px',
              boxShadow: 'var(--neu-raised-sm)',
              color: 'rgba(232,234,239,0.45)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div
          className="px-5 py-3 flex flex-wrap gap-2"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.25)' }}
        >
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className="px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: 'var(--neu-bg)',
                border: 'none',
                borderRadius: '9999px',
                boxShadow: filter === opt.key ? 'var(--neu-pressed-sm)' : 'var(--neu-raised-sm)',
                color: filter === opt.key ? 'var(--purple)' : 'rgba(232,234,239,0.58)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Events list */}
      <div className="p-5 max-h-[600px] overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-purple-400" />
            <p className="text-sm">Loading activity...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <History className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">
              {filter === 'all' 
                ? 'No activity recorded yet' 
                : `No ${FILTER_OPTIONS.find(o => o.key === filter)?.label.toLowerCase()} events`}
            </p>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="mt-2 text-purple-400 text-sm hover:underline"
              >
                Show all events
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isExpanded={expandedIds.has(event.id)}
                onToggle={toggleExpand}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {events.length > 0 && (
        <div
          className="px-5 py-3 text-xs text-gray-500 text-center"
          style={{ boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25)' }}
        >
          Showing {filteredEvents.length} of {events.length} events
        </div>
      )}
    </div>
  )
}
