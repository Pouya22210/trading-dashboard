-- Adds a `sessions` key to the shared Trades filter (p_filters).
--
-- `sessions` is an array of session keys ('sydney','tokyo','london','newyork').
-- A trade matches when its signal hour (UTC) falls inside ANY selected session.
-- Hour windows are identical to the `sessions_def` buckets in
-- get_trades_analytics, so the filter and the Market Sessions tab agree.
-- Missing / null / empty array = no session filter (the 4 sessions together
-- cover all 24 UTC hours, so "all selected" is also a no-op).

CREATE OR REPLACE FUNCTION public._trades_filter_ids(p_filters jsonb)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_bot_id                uuid        := NULLIF(p_filters->>'bot_id','')::uuid;
  v_start_ts              timestamptz := NULLIF(p_filters->>'start_ts','')::timestamptz;
  v_end_ts                timestamptz := NULLIF(p_filters->>'end_ts','')::timestamptz;
  v_channel_ids           uuid[]      := CASE
                                            WHEN p_filters ? 'channel_ids'
                                                 AND jsonb_typeof(p_filters->'channel_ids') = 'array'
                                                 AND jsonb_array_length(p_filters->'channel_ids') > 0
                                            THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'channel_ids'))::uuid[]
                                            ELSE NULL
                                          END;
  v_show_orphaned         boolean     := COALESCE((p_filters->>'show_orphaned')::boolean, true);
  v_status                text        := NULLIF(p_filters->>'status','');
  v_direction             text        := NULLIF(p_filters->>'direction','');
  v_order_type            text        := NULLIF(p_filters->>'order_type','');
  v_weekdays              int[]       := CASE
                                            WHEN p_filters ? 'weekdays'
                                                 AND jsonb_typeof(p_filters->'weekdays') = 'array'
                                                 AND jsonb_array_length(p_filters->'weekdays') > 0
                                            THEN ARRAY(SELECT (jsonb_array_elements_text(p_filters->'weekdays'))::int)
                                            ELSE ARRAY[0,1,2,3,4,5,6]
                                          END;
  v_sessions              text[]      := CASE
                                            WHEN p_filters ? 'sessions'
                                                 AND jsonb_typeof(p_filters->'sessions') = 'array'
                                                 AND jsonb_array_length(p_filters->'sessions') > 0
                                            THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'sessions'))
                                            ELSE NULL
                                          END;
  v_exclude_manual_cancel boolean     := COALESCE((p_filters->>'exclude_manual_cancel')::boolean, false);
  v_news_blackouts        jsonb       := CASE
                                            WHEN jsonb_typeof(p_filters->'news_blackouts') = 'array'
                                            THEN p_filters->'news_blackouts'
                                            ELSE '[]'::jsonb
                                          END;
BEGIN
  RETURN QUERY
  SELECT v.id::uuid
  FROM public.v_trades_with_channels v
  WHERE
        (v_bot_id     IS NULL OR v.bot_id = v_bot_id)
    AND (v_start_ts   IS NULL OR v.signal_time >= v_start_ts)
    AND (v_end_ts     IS NULL OR v.signal_time <= v_end_ts)
    AND (v_channel_ids IS NULL OR v.channel_id = ANY(v_channel_ids))
    AND (v_show_orphaned OR COALESCE(v.is_orphaned_channel, false) = false)
    AND (v_direction  IS NULL OR v.direction::text = v_direction)
    AND (v_order_type IS NULL OR v.order_type = v_order_type)
    AND (v_status     IS NULL OR (
        CASE
          WHEN v.order_type IN ('STOP','LIMIT')
               AND v.fill_time IS NULL
               AND v.status::text NOT IN ('closed','canceled','blocked','expired')
            THEN 'pending'
          ELSE v.status::text
        END
      ) = v_status)
    AND EXTRACT(DOW FROM v.signal_time)::int = ANY(v_weekdays)
    AND (v_sessions IS NULL OR EXISTS (
      SELECT 1
      FROM (VALUES
        ('sydney',  22, 7,  true),
        ('tokyo',   0,  9,  false),
        ('london',  8,  17, false),
        ('newyork', 13, 22, false)
      ) AS s(k, start_h, end_h, crosses)
      CROSS JOIN LATERAL (
        SELECT EXTRACT(HOUR FROM (v.signal_time AT TIME ZONE 'UTC'))::int AS utc_hour
      ) h
      WHERE s.k = ANY(v_sessions)
        AND (   (NOT s.crosses AND h.utc_hour >= s.start_h AND h.utc_hour < s.end_h)
             OR (    s.crosses AND (h.utc_hour >= s.start_h OR h.utc_hour < s.end_h)))
    ))
    AND (NOT v_exclude_manual_cancel
         OR v.status::text <> 'canceled'
         OR v.cancel_reason = 'cancel_policy')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_news_blackouts)
             AS nb(category_id uuid, days_before int, days_after int)
      JOIN public.news_events ne ON ne.category_id = nb.category_id
      WHERE (v.signal_time AT TIME ZONE 'UTC')::date
            BETWEEN ne.event_date - COALESCE(nb.days_before, 0)
                AND ne.event_date + COALESCE(nb.days_after, 0)
    );
END;
$function$;
