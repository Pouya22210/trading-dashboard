-- =====================================================================
-- AI grade × outcome distribution for the Trades page "AI Grades" tab.
-- =====================================================================
-- For every (channel, provider, grade 0-10) cell, counts closed trades
-- that ended in profit vs loss. Respects the exact same filter envelope
-- as get_trades_analytics via _trades_filter_ids (channels, dates,
-- status, direction, order type, weekdays, orphaned, news blackouts).
--
-- Grade source per provider (same fallback the UI chips use):
--   claude: ai_label (text 0-10)      else round(win_probability * 10)
--   gemini: gemini_label (text 0-10)  else round(gemini_win_probability * 10)
-- Trades with no grade from a provider are simply absent for it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_grade_outcome_distribution(p_filters jsonb DEFAULT '{}'::jsonb)
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
      t.ai_label, t.win_probability,
      t.gemini_label, t.gemini_win_probability
    FROM public.v_trades_with_channels v
    JOIN public.trades t ON t.id = v.id
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
      AND v.status = 'closed'
      AND v.outcome IN ('profit', 'loss')
  ),
  graded AS (
    SELECT
      b.channel_id,
      b.channel_name,
      b.outcome,
      p.provider,
      LEAST(10, GREATEST(0, p.grade)) AS grade
    FROM base b
    CROSS JOIN LATERAL (VALUES
      ('claude',
       COALESCE(
         CASE WHEN b.ai_label ~ '^\s*\d{1,2}\s*$' THEN trim(b.ai_label)::int END,
         CASE WHEN b.win_probability IS NOT NULL THEN ROUND(b.win_probability * 10)::int END
       )),
      ('gemini',
       COALESCE(
         CASE WHEN b.gemini_label ~ '^\s*\d{1,2}\s*$' THEN trim(b.gemini_label)::int END,
         CASE WHEN b.gemini_win_probability IS NOT NULL THEN ROUND(b.gemini_win_probability * 10)::int END
       ))
    ) AS p(provider, grade)
    WHERE p.grade IS NOT NULL
  ),
  cells AS (
    SELECT
      channel_id,
      channel_name,
      provider,
      grade,
      COUNT(*) FILTER (WHERE outcome = 'profit') AS wins,
      COUNT(*) FILTER (WHERE outcome = 'loss')   AS losses
    FROM graded
    GROUP BY channel_id, channel_name, provider, grade
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'channel_id',   channel_id,
      'channel_name', channel_name,
      'provider',     provider,
      'grade',        grade,
      'wins',         wins,
      'losses',       losses
    )
    ORDER BY channel_name, provider, grade
  ), '[]'::jsonb)
  INTO result
  FROM cells;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_grade_outcome_distribution(jsonb) TO anon, authenticated;
