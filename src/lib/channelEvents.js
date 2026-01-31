// ============================================================================
// CHANNEL EVENTS API
// ============================================================================

import { supabase } from './supabase'

/**
 * Fetch channel events from the audit trail
 * @param {Object} filters - Optional filters
 * @param {string} filters.channelId - Filter by specific channel
 * @param {string} filters.eventType - Filter by event type
 * @param {number} filters.limit - Max events to return (default 100)
 * @returns {Promise<Array>} List of channel events
 */
export async function fetchChannelEvents(filters = {}) {
  let query = supabase
    .from('v_channel_events')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.channelId) {
    query = query.eq('channel_id', filters.channelId)
  }
  if (filters.eventType) {
    query = query.eq('event_type', filters.eventType)
  }
  if (filters.limit) {
    query = query.limit(filters.limit)
  } else {
    query = query.limit(100)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Subscribe to real-time channel event updates
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onInsert - Called when new event is logged
 * @param {Function} callbacks.onAny - Called for any event
 * @returns {Object} Subscription with unsubscribe method
 */
export function subscribeToChannelEvents(callbacks = {}) {
  const { onInsert, onAny, onStatus } = callbacks

  const channel = supabase
    .channel('channel-events-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'channel_events' },
      (payload) => {
        console.log('📝 Channel Event:', payload.new?.event_type, payload.new?.description)
        if (onInsert) onInsert(payload.new)
        if (onAny) onAny('INSERT', payload.new)
      }
    )
    .subscribe((status, err) => {
      console.log('📡 Channel events subscription status:', status)
      if (err) console.error('Subscription error:', err)
      if (onStatus) onStatus(status, err)
    })

  return {
    unsubscribe: () => {
      console.log('Unsubscribing from channel events')
      supabase.removeChannel(channel)
    },
    channel
  }
}

/**
 * Log a manual channel event (for frontend actions)
 * Note: Most events are auto-logged via triggers, but this can be used
 * for manual logging if needed
 */
export async function logChannelEvent(eventData) {
  const { data, error } = await supabase
    .from('channel_events')
    .insert({
      channel_id: eventData.channelId,
      event_type: eventData.eventType,
      description: eventData.description,
      event_data: eventData.eventData || {},
      old_channel_name: eventData.oldChannelName,
      new_channel_name: eventData.newChannelName
    })
    .select()
    .single()

  if (error) throw error
  return data
}
