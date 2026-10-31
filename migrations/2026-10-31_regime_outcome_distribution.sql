-- Market-regime confidence × outcome, for the Trades page "AI Grades" tab.
--
-- The regime strategy runs in SHADOW mode for this: every signal executes, and
-- the bot logs (strategy_decisions.details) the regime's confidence plus
-- `regime_pass_ex_conf` = "every regime rule EXCEPT min_confidence accepts".
-- The dashboard then re-cuts the decision at any confidence threshold X:
--     allowed at X  <=>  regime_pass_ex_conf AND regime_conf >= X
-- and compares the allowed set against the baseline (every trade taken).
--
-- Only shadow-mode rows written by the patched bot count (they carry
-- regime_pass_ex_conf). Enforce-mode rows are excluded: the trades they
-- rejected were never placed, so their outcome is unknown.
--
-- The regime judges the side actually TRADED (channel reverse + AI inversion
-- applied, see trade_pipeline), so the executed outcome is the right one here.
-- If the AI inverted a signal, the regime's flip_recheck row is the decision
-- that applies, hence "latest signal/flip_recheck row" per trade.
--
-- One row per channel × confidence bucket × pass_ex_conf. conf_bucket 0-9 =
-- 0-10% … 90-100%; NULL bucket / NULL pass = regime had no usable data.

CREATE OR REPLACE FUNCTION public.get_regime_outcome_distribution(p_filters jsonb DEFAULT '{}'::jsonb)
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
    SELECT
      b.channel_id,
      b.channel_name,
      b.outcome,
      d.conf,
      d.pass_ex_conf
    FROM base b
    JOIN LATERAL (
      SELECT
        (sd.details->>'regime_conf')::float8            AS conf,
        (sd.details->>'regime_pass_ex_conf')::boolean   AS pass_ex_conf
      FROM public.strategy_decisions sd
      WHERE sd.channel_id = b.channel_id
        AND sd.telegram_msg_id = b.telegram_msg_id
        AND sd.strategy = 'regime'
        AND sd.stage IN ('signal', 'flip_recheck')
        AND sd.details->>'mode' = 'shadow'
        AND sd.details ? 'regime_pass_ex_conf'
      ORDER BY sd.created_at DESC
      LIMIT 1
    ) d ON true
  ),
  cells AS (
    SELECT
      channel_id,
      channel_name,
      CASE WHEN pass_ex_conf IS NULL OR conf IS NULL THEN NULL
           ELSE LEAST(9, GREATEST(0, floor(conf * 10)::int))
      END AS conf_bucket,
      pass_ex_conf,
      COUNT(*) FILTER (WHERE outcome = 'profit')    AS wins,
      COUNT(*) FILTER (WHERE outcome = 'loss')      AS losses,
      COUNT(*) FILTER (WHERE outcome = 'breakeven') AS breakeven
    FROM judged
    GROUP BY 1, 2, 3, 4
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'channel_id',   channel_id,
      'channel_name', channel_name,
      'conf_bucket',  conf_bucket,
      'pass_ex_conf', pass_ex_conf,
      'wins',         wins,
      'losses',       losses,
      'breakeven',    breakeven
    )
    ORDER BY channel_name, conf_bucket, pass_ex_conf
  ), '[]'::jsonb)
  INTO result
  FROM cells;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_regime_outcome_distribution(jsonb) TO anon, authenticated;
