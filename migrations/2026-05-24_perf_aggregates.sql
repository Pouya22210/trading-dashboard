-- =====================================================================
-- Dashboard / Trades page performance migration
-- =====================================================================
-- Purpose: stop fetching every trade row over the wire. Push aggregation
-- to Postgres so page load time stays constant as trade volume grows.
--
-- Apply this file once in the Supabase SQL editor (or via psql). All
-- statements are idempotent — safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Indexes — every RPC below relies on these for sub-second queries.
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trades_signal_time_desc
  ON public.trades (signal_time DESC);

CREATE INDEX IF NOT EXISTS idx_trades_close_time_desc
  ON public.trades (close_time DESC)
  WHERE close_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_channel_signal
  ON public.trades (channel_id, signal_time DESC);

CREATE INDEX IF NOT EXISTS idx_trades_status
  ON public.trades (status);


-- ---------------------------------------------------------------------
-- 2) Helper: shared filter predicate.
-- Returns the IDs that match the filter envelope used by both the table
-- and the analytics RPCs. Centralizes filter logic so a UI filter change
-- always produces consistent results across stats, charts, and table.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._trades_filter_ids(
  p_filters jsonb
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
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
  v_exclude_manual_cancel boolean     := COALESCE((p_filters->>'exclude_manual_cancel')::boolean, false);
BEGIN
  RETURN QUERY
  SELECT v.id::uuid
  FROM public.v_trades_with_channels v
  WHERE
        (v_start_ts   IS NULL OR v.signal_time >= v_start_ts)
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
    AND (NOT v_exclude_manual_cancel
         OR v.status::text <> 'canceled'
         OR v.cancel_reason = 'cancel_policy');
END;
$$;


-- ---------------------------------------------------------------------
-- 3) get_channel_performance — used by the Dashboard
-- ---------------------------------------------------------------------
-- Returns per-channel rollup for a date range. Replaces the dashboard's
-- "fetch every trade and group in JS" pattern.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_channel_performance(
  p_start_ts          timestamptz DEFAULT NULL,
  p_end_ts            timestamptz DEFAULT NULL,
  p_exclude_orphaned  boolean     DEFAULT false
)
RETURNS TABLE (
  channel_id    uuid,
  channel_name  text,
  is_orphaned   boolean,
  total_trades  bigint,
  wins          bigint,
  losses        bigint,
  breakevens    bigint,
  total_pnl     numeric,
  win_rate      numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.channel_id,
    COALESCE(MAX(v.display_channel_name), MAX(v.channel_name), 'Unknown')      AS channel_name,
    BOOL_OR(COALESCE(v.is_orphaned_channel, false))                            AS is_orphaned,
    COUNT(*)                                                                   AS total_trades,
    COUNT(*) FILTER (WHERE v.outcome = 'profit')                               AS wins,
    COUNT(*) FILTER (WHERE v.outcome = 'loss')                                 AS losses,
    COUNT(*) FILTER (WHERE v.outcome = 'breakeven')                            AS breakevens,
    COALESCE(SUM(v.profit_loss) FILTER (WHERE v.status = 'closed'), 0)         AS total_pnl,
    CASE
      WHEN COUNT(*) FILTER (WHERE v.outcome IN ('profit', 'loss')) > 0 THEN
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE v.outcome = 'profit')
          / NULLIF(COUNT(*) FILTER (WHERE v.outcome IN ('profit', 'loss')), 0),
          2
        )
      ELSE 0
    END AS win_rate
  FROM public.v_trades_with_channels v
  WHERE
        (p_start_ts IS NULL OR v.signal_time >= p_start_ts)
    AND (p_end_ts   IS NULL OR v.signal_time <= p_end_ts)
    AND (NOT p_exclude_orphaned OR COALESCE(v.is_orphaned_channel, false) = false)
  GROUP BY v.channel_id
$$;


-- ---------------------------------------------------------------------
-- 4) get_trades_paginated — used by the Trades table
-- ---------------------------------------------------------------------
-- Returns { total, rows } for the current page. Sort order matches the
-- existing UI: active first, then pending, then everything else;
-- within each group, newest signal_time first.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trades_paginated(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   int   DEFAULT 10,
  p_offset  int   DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total bigint;
  v_rows  jsonb;
BEGIN
  v_total := (
    SELECT COUNT(*)
    FROM public._trades_filter_ids(p_filters)
  );

  WITH page AS (
    SELECT v.*,
      CASE
        WHEN v.order_type IN ('STOP','LIMIT')
             AND v.fill_time IS NULL
             AND v.status::text NOT IN ('closed','canceled','blocked','expired')
          THEN 1
        WHEN v.status = 'active'  THEN 0
        WHEN v.status = 'pending' THEN 1
        ELSE 2
      END AS status_rank
    FROM public.v_trades_with_channels v
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
    ORDER BY
      CASE
        WHEN v.order_type IN ('STOP','LIMIT')
             AND v.fill_time IS NULL
             AND v.status::text NOT IN ('closed','canceled','blocked','expired')
          THEN 1
        WHEN v.status = 'active'  THEN 0
        WHEN v.status = 'pending' THEN 1
        ELSE 2
      END,
      v.signal_time DESC
    LIMIT  p_limit
    OFFSET p_offset
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(page.*) - 'status_rank' ORDER BY page.status_rank, page.signal_time DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM page;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'rows',  COALESCE(v_rows,  '[]'::jsonb)
  );
END;
$$;


-- ---------------------------------------------------------------------
-- 5) get_trades_analytics — powers all Trades-page charts and stat cards
-- ---------------------------------------------------------------------
-- Returns a single jsonb bundle with every aggregation needed by the
-- analysis tabs. The frontend just consumes the slices it needs.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trades_analytics(
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH
  filtered AS (
    SELECT v.*
    FROM public.v_trades_with_channels v
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
  ),
  -- ANALYSIS set: matches the UI's analysisTrades (excludes manual/expired cancels)
  analysis AS (
    SELECT * FROM filtered
    WHERE status::text <> 'canceled' OR cancel_reason = 'cancel_policy'
  ),
  closed AS (
    SELECT * FROM analysis WHERE status = 'closed'
  ),

  -- Stat cards summary
  summary AS (
    SELECT jsonb_build_object(
      'total_filtered',  (SELECT COUNT(*) FROM filtered),
      'total_analysis',  (SELECT COUNT(*) FROM analysis),
      'total_closed',    COUNT(*),
      'wins',            COUNT(*) FILTER (WHERE outcome = 'profit'),
      'losses',          COUNT(*) FILTER (WHERE outcome = 'loss'),
      'breakevens',      COUNT(*) FILTER (WHERE outcome = 'breakeven'),
      'net_pnl',         COALESCE(SUM(profit_loss), 0),
      'sum_profit',      COALESCE(SUM(profit_loss) FILTER (WHERE outcome = 'profit'), 0),
      'sum_loss_abs',    COALESCE(ABS(SUM(profit_loss) FILTER (WHERE outcome = 'loss')), 0)
    ) AS j
    FROM closed
  ),

  -- Per-channel outcome distribution (Outcome Distribution chart)
  channel_outcomes_raw AS (
    SELECT
      channel_id,
      COALESCE(MAX(display_channel_name), MAX(channel_name), 'Unknown') AS channel_name,
      COUNT(*) FILTER (WHERE outcome = 'profit')    AS profit,
      COUNT(*) FILTER (WHERE outcome = 'loss')      AS loss,
      COUNT(*) FILTER (WHERE outcome = 'breakeven') AS breakeven,
      COUNT(*) FILTER (WHERE outcome = 'manual')    AS manual,
      COUNT(*) FILTER (WHERE outcome = 'canceled')  AS canceled,
      COUNT(*) FILTER (WHERE outcome = 'blocked')   AS blocked,
      COUNT(*) FILTER (WHERE outcome IS NULL)       AS unknown,
      (COUNT(*) FILTER (WHERE outcome = 'profit'))::int
        - (COUNT(*) FILTER (WHERE outcome = 'loss'))::int AS sort_score
    FROM analysis
    GROUP BY channel_id
  ),
  channel_outcomes AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'channel_id',   channel_id,
        'channel_name', channel_name,
        'profit',       profit,
        'loss',         loss,
        'breakeven',    breakeven,
        'manual',       manual,
        'canceled',     canceled,
        'blocked',      blocked,
        'unknown',      unknown
      )
      ORDER BY sort_score DESC
    ) AS j
    FROM channel_outcomes_raw
  ),

  -- Cumulative P&L chart: per-day per-channel + per-day all
  daily_per_channel_bucket AS (
    SELECT
      date_trunc('day', close_time)            AS day,
      channel_id,
      SUM(COALESCE(profit_loss, 0))::numeric   AS day_pnl
    FROM closed
    WHERE close_time IS NOT NULL
    GROUP BY date_trunc('day', close_time), channel_id
  ),
  daily_per_channel AS (
    SELECT
      day,
      channel_id::text AS channel_key,
      SUM(day_pnl) OVER (PARTITION BY channel_id ORDER BY day) AS cumulative
    FROM daily_per_channel_bucket
  ),
  daily_all_bucket AS (
    SELECT
      date_trunc('day', close_time)          AS day,
      SUM(COALESCE(profit_loss, 0))::numeric AS day_pnl
    FROM closed
    WHERE close_time IS NOT NULL
    GROUP BY date_trunc('day', close_time)
  ),
  daily_all AS (
    SELECT
      day,
      'all'::text AS channel_key,
      SUM(day_pnl) OVER (ORDER BY day) AS cumulative
    FROM daily_all_bucket
  ),
  daily_combined AS (
    SELECT day, channel_key, cumulative FROM daily_per_channel
    UNION ALL
    SELECT day, channel_key, cumulative FROM daily_all
  ),
  daily_pnl AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'date',    to_char(day, 'Mon DD'),
        'date_ts', day,
        'channel', channel_key,
        'pnl',     ROUND(cumulative::numeric, 4)
      )
      ORDER BY day, channel_key
    ) AS j
    FROM daily_combined
  ),

  -- Hourly P&L (signal hour, server tz)
  hourly_raw AS (
    SELECT
      EXTRACT(HOUR FROM signal_time)::int AS h,
      COALESCE(SUM(profit_loss), 0)::numeric AS pnl,
      COUNT(*) AS cnt
    FROM closed
    WHERE signal_time IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM signal_time)::int
  ),
  hourly AS (
    SELECT jsonb_agg(
      jsonb_build_object('hour', h, 'pnl', pnl, 'count', cnt)
      ORDER BY h
    ) AS j FROM hourly_raw
  ),

  -- Day of week (0 = Sunday)
  dow_raw AS (
    SELECT
      EXTRACT(DOW FROM signal_time)::int AS d,
      COALESCE(SUM(profit_loss), 0)::numeric AS pnl,
      COUNT(*) AS cnt
    FROM closed
    WHERE signal_time IS NOT NULL
    GROUP BY EXTRACT(DOW FROM signal_time)::int
  ),
  dow AS (
    SELECT jsonb_agg(
      jsonb_build_object('dow', d, 'pnl', pnl, 'count', cnt)
      ORDER BY d
    ) AS j FROM dow_raw
  ),

  -- Market session outcomes (signal_time UTC hour bucketed into sessions)
  sessions_hours AS (
    SELECT
      EXTRACT(HOUR FROM (signal_time AT TIME ZONE 'UTC'))::int AS utc_hour,
      outcome
    FROM closed
    WHERE signal_time IS NOT NULL
  ),
  sessions_def AS (
    SELECT * FROM (VALUES
      ('sydney',  1, 22, 7,  true),
      ('tokyo',   2, 0,  9,  false),
      ('london',  3, 8,  17, false),
      ('newyork', 4, 13, 22, false)
    ) AS s(k, ord, start_h, end_h, crosses)
  ),
  sessions_raw AS (
    SELECT
      s.k, s.ord,
      COUNT(r.outcome) FILTER (WHERE r.outcome = 'profit')    AS profit_n,
      COUNT(r.outcome) FILTER (WHERE r.outcome = 'loss')      AS loss_n,
      COUNT(r.outcome) FILTER (WHERE r.outcome = 'breakeven') AS breakeven_n,
      COUNT(r.*) AS total_n
    FROM sessions_def s
    LEFT JOIN sessions_hours r
      ON (NOT s.crosses AND r.utc_hour >= s.start_h AND r.utc_hour < s.end_h)
      OR (    s.crosses AND (r.utc_hour >= s.start_h OR r.utc_hour < s.end_h))
    GROUP BY s.k, s.ord
  ),
  sessions AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'key',       k,
        'profit',    COALESCE(profit_n,    0),
        'loss',      COALESCE(loss_n,      0),
        'breakeven', COALESCE(breakeven_n, 0),
        'total',     COALESCE(total_n,     0)
      )
      ORDER BY ord
    ) AS j FROM sessions_raw
  ),

  -- Gantt: per-channel first/last/total (uses filtered, not analysis)
  gantt_raw AS (
    SELECT
      channel_id,
      COALESCE(MAX(display_channel_name), MAX(channel_name), 'Unknown') AS channel_name,
      MIN(signal_time) AS first_trade,
      MAX(signal_time) AS last_trade,
      COUNT(*)         AS total_trades
    FROM filtered
    WHERE signal_time IS NOT NULL
    GROUP BY channel_id
  ),
  gantt AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'channel_id',   channel_id,
        'channel_name', channel_name,
        'first_trade',  first_trade,
        'last_trade',   last_trade,
        'total_trades', total_trades
      )
      ORDER BY first_trade
    ) AS j FROM gantt_raw
  ),

  -- Channel list (for the multi-select dropdown)
  channels_list AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'channel_id',   channel_id,
        'channel_name', channel_name,
        'is_orphaned',  is_orphaned
      )
      ORDER BY channel_name
    ) AS j FROM (
      SELECT DISTINCT
        channel_id,
        COALESCE(MAX(display_channel_name) OVER (PARTITION BY channel_id),
                 MAX(channel_name)         OVER (PARTITION BY channel_id),
                 'Unknown') AS channel_name,
        BOOL_OR(COALESCE(is_orphaned_channel, false))
          OVER (PARTITION BY channel_id) AS is_orphaned
      FROM filtered
    ) t
  ),

  -- Side breakdown (Outcomes by Side chart)
  side_raw AS (
    SELECT
      direction::text AS side,
      COUNT(*) FILTER (WHERE outcome = 'profit')    AS profit,
      COUNT(*) FILTER (WHERE outcome = 'loss')      AS loss,
      COUNT(*) FILTER (WHERE outcome = 'breakeven') AS breakeven
    FROM closed
    GROUP BY direction::text
  ),
  side AS (
    SELECT jsonb_agg(
      jsonb_build_object('side', side, 'profit', profit, 'loss', loss, 'breakeven', breakeven)
    ) AS j FROM side_raw
  ),

  -- Outcomes sequence (chronological), used by the rolling win-rate chart.
  -- Returns single-character codes ('W'/'L'/'B'/'O') to keep payload tiny.
  outcomes_seq AS (
    SELECT jsonb_agg(
      CASE outcome
        WHEN 'profit'    THEN 'W'
        WHEN 'loss'      THEN 'L'
        WHEN 'breakeven' THEN 'B'
        ELSE 'O'
      END
      ORDER BY close_time NULLS LAST, signal_time
    ) AS j
    FROM closed
  )

  SELECT jsonb_build_object(
    'summary',          (SELECT j FROM summary),
    'channel_outcomes', COALESCE((SELECT j FROM channel_outcomes), '[]'::jsonb),
    'daily_pnl',        COALESCE((SELECT j FROM daily_pnl),        '[]'::jsonb),
    'hourly',           COALESCE((SELECT j FROM hourly),           '[]'::jsonb),
    'dow',              COALESCE((SELECT j FROM dow),              '[]'::jsonb),
    'sessions',         COALESCE((SELECT j FROM sessions),         '[]'::jsonb),
    'gantt',            COALESCE((SELECT j FROM gantt),            '[]'::jsonb),
    'side',             COALESCE((SELECT j FROM side),             '[]'::jsonb),
    'channels_list',    COALESCE((SELECT j FROM channels_list),    '[]'::jsonb),
    'outcomes_seq',     COALESCE((SELECT j FROM outcomes_seq),     '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;


-- ---------------------------------------------------------------------
-- 6) get_daily_profit_calendar — risk-based per-day P&L for the calendar
-- ---------------------------------------------------------------------
-- Returns one row per day with the closed trades' risk-normalized P&L.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_profit_calendar(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_year    int   DEFAULT NULL,
  p_month   int   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start date;
  v_end   date;
  result  jsonb;
BEGIN
  IF p_year IS NOT NULL AND p_month IS NOT NULL THEN
    v_start := make_date(p_year, p_month, 1);
    v_end   := (v_start + interval '1 month')::date;
  END IF;

  WITH analysis AS (
    SELECT v.*
    FROM public.v_trades_with_channels v
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
      AND (v.status::text <> 'canceled' OR v.cancel_reason = 'cancel_policy')
      AND v.status = 'closed'
      AND COALESCE(v.close_time, v.signal_time) IS NOT NULL
      AND (v_start IS NULL OR COALESCE(v.close_time, v.signal_time) >= v_start)
      AND (v_end   IS NULL OR COALESCE(v.close_time, v.signal_time) <  v_end)
  ),
  with_r AS (
    SELECT
      a.outcome,
      date_trunc('day', COALESCE(a.close_time, a.signal_time))::date AS d,
      COALESCE(c.risk_per_trade, 0.01) * 100.0 AS risk_pct,
      CASE
        WHEN a.outcome = 'profit' THEN
          CASE
            WHEN COALESCE(a.executed_entry_price, a.signal_entry_price) IS NOT NULL
                 AND a.executed_tp_price IS NOT NULL
                 AND COALESCE(a.executed_sl_price, a.signal_sl_price) IS NOT NULL
                 AND ABS(COALESCE(a.executed_entry_price, a.signal_entry_price)
                       - COALESCE(a.executed_sl_price, a.signal_sl_price)) > 0
            THEN ABS(a.executed_tp_price - COALESCE(a.executed_entry_price, a.signal_entry_price))
               / ABS(COALESCE(a.executed_entry_price, a.signal_entry_price)
                   - COALESCE(a.executed_sl_price, a.signal_sl_price))
            ELSE 1
          END
        WHEN a.outcome = 'loss'      THEN -1
        WHEN a.outcome = 'breakeven' THEN 0
        ELSE NULL
      END AS pnl_r
    FROM analysis a
    LEFT JOIN public.channels c ON c.id = a.channel_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date',    to_char(d, 'YYYY-MM-DD'),
      'profit',  ROUND(SUM(pnl_r * risk_pct)::numeric, 4),
      'trades',  COUNT(*),
      'wins',    COUNT(*) FILTER (WHERE outcome = 'profit'),
      'losses',  COUNT(*) FILTER (WHERE outcome = 'loss')
    )
    ORDER BY d
  ) INTO result
  FROM with_r
  WHERE pnl_r IS NOT NULL
  GROUP BY d;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


-- ---------------------------------------------------------------------
-- 7) get_max_drawdown — risk-based peak-to-trough, in % of account
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_max_drawdown(
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_max_dd numeric := 0;
  v_peak   numeric := 0;
  v_cum    numeric := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT
      a.outcome,
      COALESCE(c.risk_per_trade, 0.01) * 100.0 AS risk_pct
    FROM public.v_trades_with_channels a
    LEFT JOIN public.channels c ON c.id = a.channel_id
    WHERE a.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
      AND (a.status::text <> 'canceled' OR a.cancel_reason = 'cancel_policy')
      AND a.status = 'closed'
      AND a.outcome IN ('profit', 'loss')
      AND a.close_time IS NOT NULL
    ORDER BY a.close_time
  LOOP
    IF r.outcome = 'profit' THEN
      v_cum := v_cum + r.risk_pct;
    ELSE
      v_cum := v_cum - r.risk_pct;
    END IF;

    IF v_cum > v_peak THEN
      v_peak := v_cum;
    END IF;

    IF (v_peak - v_cum) > v_max_dd THEN
      v_max_dd := v_peak - v_cum;
    END IF;
  END LOOP;

  RETURN v_max_dd;
END;
$$;


-- ---------------------------------------------------------------------
-- Grants — Supabase clients use `anon` and `authenticated`.
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._trades_filter_ids(jsonb)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_performance(timestamptz, timestamptz, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trades_paginated(jsonb, int, int)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trades_analytics(jsonb)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_profit_calendar(jsonb, int, int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_drawdown(jsonb)                            TO anon, authenticated;
