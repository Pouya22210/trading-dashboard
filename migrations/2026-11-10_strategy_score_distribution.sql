-- Strategy score × outcome, for the Trades page "AI Grades" tab (Kronos card,
-- and any later pipeline strategy that logs a 0-1 score).
--
-- Like get_regime_outcome_distribution: only SHADOW-mode decisions count, so
-- every judged signal was really executed and has a real outcome; the
-- dashboard re-cuts "allowed at threshold X" = score >= X at render time.
-- The latest signal/flip_recheck row per trade applies (if the AI inverted a
-- signal, the re-check judged the side actually traded).
--
-- p_strategy  strategy_decisions.strategy, e.g. 'kronos'
-- p_score_key key inside strategy_decisions.details holding the 0-1 score,
--             e.g. 'kronos_prob'
--
-- One row per channel × score bucket. bucket 0-19 = 0-5% … 95-100%;
-- NULL bucket = the strategy judged the trade but had no score (no forecast).

CREATE OR REPLACE FUNCTION public.get_strategy_score_distribution(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_strategy text DEFAULT 'kronos',
  p_score_key text DEFAULT 'kronos_prob'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH
  base AS (
    SELECT
      v.channel_id,
      COALESCE(v.display_channel_name, v.channel_name, 'Unknown') AS channel_name,
      v.outcome,
      t.telegram_msg_id
    FROM public.v_trades_with_channels v
    JOIN public.trades t ON t.id = v.id
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
      AND v.status = 'closed'
      AND v.outcome IN ('profit', 'loss', 'breakeven')
  ),
  judged AS (
    SELECT b.channel_id, b.channel_name, b.outcome, d.score
    FROM base b
    JOIN LATERAL (
      SELECT CASE WHEN jsonb_typeof(sd.details -> p_score_key) = 'number'
                  THEN (sd.details ->> p_score_key)::float8 END AS score
      FROM public.strategy_decisions sd
      WHERE sd.channel_id = b.channel_id
        AND sd.telegram_msg_id = b.telegram_msg_id
        AND sd.strategy = p_strategy
        AND sd.stage IN ('signal', 'flip_recheck')
        AND sd.details->>'mode' = 'shadow'
      ORDER BY sd.created_at DESC
      LIMIT 1
    ) d ON true
  ),
  cells AS (
    SELECT
      channel_id,
      channel_name,
      CASE WHEN score IS NULL THEN NULL
           ELSE LEAST(19, GREATEST(0, floor(score * 20)::int))
      END AS bucket,
      COUNT(*) FILTER (WHERE outcome = 'profit')    AS wins,
      COUNT(*) FILTER (WHERE outcome = 'loss')      AS losses,
      COUNT(*) FILTER (WHERE outcome = 'breakeven') AS breakeven
    FROM judged
    GROUP BY 1, 2, 3
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'channel_id',   channel_id,
      'channel_name', channel_name,
      'bucket',       bucket,
      'wins',         wins,
      'losses',       losses,
      'breakeven',    breakeven
    )
    ORDER BY channel_name, bucket
  ), '[]'::jsonb)
  INTO result
  FROM cells;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_strategy_score_distribution(jsonb, text, text) TO anon, authenticated;
