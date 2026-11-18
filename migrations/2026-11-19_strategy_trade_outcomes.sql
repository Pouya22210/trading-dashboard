-- Per-trade outcomes in CLOSE ORDER for one strategy, for the Trades page
-- "AI Grades" tab: max losing streak per confidence level + best/worst
-- channel rankings. The bucketed distribution RPCs can't do this: a streak
-- needs the trades in time order.
--
-- Drawdown here is counted in TRADES (consecutive losses), not money, so it
-- stays valid for any risk:reward and account size. Breakeven trades are left
-- out (they neither extend nor break a losing streak; balance didn't move).
--
-- p_strategy:
--   'regime'    -> s = details.regime_conf, p = details.regime_pass_ex_conf
--                  (latest shadow signal/flip_recheck decision, same rows as
--                  get_regime_outcome_distribution). won = our outcome.
--   'kronos'    -> s = details.kronos_prob (same rows as
--                  get_strategy_score_distribution). won = our outcome.
--   'ai_grader' -> g1 = Claude grade 0-10, g2 = Gemini grade 0-10 (same
--                  fallbacks as get_grade_outcome_distribution). won = the
--                  GRADED SIGNAL's outcome (flipped for inverted trades), the
--                  same perspective the AI grade card scores.
--   any other pipeline strategy -> s = details.<p_score_key> (0-1).
--
-- Rows without a score (no regime data / no forecast / ungraded) are omitted;
-- the cards exclude those trades too.
--
-- Returns a jsonb array, oldest close first:
--   { t, ch, cn, won, s, p, g1, g2 }   (unused keys are null)

CREATE OR REPLACE FUNCTION public.get_strategy_trade_outcomes(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_strategy text DEFAULT 'regime',
  p_score_key text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  result jsonb;
  v_score_key text := COALESCE(
    p_score_key,
    CASE p_strategy WHEN 'regime' THEN 'regime_conf' WHEN 'kronos' THEN 'kronos_prob' END
  );
BEGIN
  IF p_strategy = 'ai_grader' THEN
    WITH
    base AS (
      SELECT
        v.id,
        v.channel_id,
        COALESCE(v.display_channel_name, v.channel_name, 'Unknown') AS channel_name,
        COALESCE(v.close_time, v.updated_at) AS closed_at,
        v.outcome,
        -- Same inversion rule as get_grade_outcome_distribution.
        (
          COALESCE(t.is_inverted, false)
          OR CASE
               WHEN t.signal_entry_price IS NOT NULL AND t.signal_sl_price IS NOT NULL
                    AND t.signal_sl_price <> t.signal_entry_price
                 THEN (CASE WHEN t.signal_sl_price < t.signal_entry_price THEN 'buy' ELSE 'sell' END)
                      <> v.direction::text
               WHEN t.signal_tp_prices IS NOT NULL
                    AND jsonb_typeof(t.signal_tp_prices) = 'array'
                    AND jsonb_array_length(t.signal_tp_prices) > 0
                    AND (t.signal_tp_prices->>0) ~ '^-?[0-9.]+$'
                    AND (t.signal_tp_prices->>0)::numeric <> t.signal_sl_price
                 THEN (CASE WHEN t.signal_sl_price < (t.signal_tp_prices->>0)::numeric THEN 'buy' ELSE 'sell' END)
                      <> v.direction::text
               ELSE false
             END
        ) AS is_inverted,
        LEAST(10, GREATEST(0, COALESCE(
          CASE WHEN t.ai_label ~ '^\s*\d{1,2}\s*$' THEN trim(t.ai_label)::int END,
          CASE WHEN t.win_probability IS NOT NULL THEN ROUND(t.win_probability * 10)::int END
        ))) AS g1,
        LEAST(10, GREATEST(0, COALESCE(
          CASE WHEN t.gemini_label ~ '^\s*\d{1,2}\s*$' THEN trim(t.gemini_label)::int END,
          CASE WHEN t.gemini_win_probability IS NOT NULL THEN ROUND(t.gemini_win_probability * 10)::int END
        ))) AS g2
      FROM public.v_trades_with_channels v
      JOIN public.trades t ON t.id = v.id
      WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
        AND v.status = 'closed'
        AND v.outcome IN ('profit', 'loss')
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        't',   closed_at,
        'ch',  channel_id,
        'cn',  channel_name,
        'won', ((outcome = 'profit') <> is_inverted),
        'g1',  g1,
        'g2',  g2
      )
      ORDER BY closed_at, id
    ), '[]'::jsonb)
    INTO result
    FROM base
    WHERE g1 IS NOT NULL OR g2 IS NOT NULL;

  ELSE
    WITH
    base AS (
      SELECT
        v.id,
        v.channel_id,
        COALESCE(v.display_channel_name, v.channel_name, 'Unknown') AS channel_name,
        COALESCE(v.close_time, v.updated_at) AS closed_at,
        v.outcome,
        t.telegram_msg_id
      FROM public.v_trades_with_channels v
      JOIN public.trades t ON t.id = v.id
      WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
        AND v.status = 'closed'
        AND v.outcome IN ('profit', 'loss')
    ),
    judged AS (
      SELECT b.*, d.score, d.pass
      FROM base b
      JOIN LATERAL (
        SELECT
          CASE WHEN jsonb_typeof(sd.details -> v_score_key) = 'number'
               THEN (sd.details ->> v_score_key)::float8 END AS score,
          CASE WHEN p_strategy = 'regime'
               THEN (sd.details ->> 'regime_pass_ex_conf')::boolean
               ELSE true END AS pass
        FROM public.strategy_decisions sd
        WHERE sd.channel_id = b.channel_id
          AND sd.telegram_msg_id = b.telegram_msg_id
          AND sd.strategy = p_strategy
          AND sd.stage IN ('signal', 'flip_recheck')
          AND sd.details->>'mode' = 'shadow'
          AND (p_strategy <> 'regime' OR sd.details ? 'regime_pass_ex_conf')
        ORDER BY sd.created_at DESC
        LIMIT 1
      ) d ON true
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        't',   closed_at,
        'ch',  channel_id,
        'cn',  channel_name,
        'won', outcome = 'profit',
        's',   score,
        'p',   pass
      )
      ORDER BY closed_at, id
    ), '[]'::jsonb)
    INTO result
    FROM judged
    WHERE score IS NOT NULL AND pass IS NOT NULL;
  END IF;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_strategy_trade_outcomes(jsonb, text, text) TO anon, authenticated;
