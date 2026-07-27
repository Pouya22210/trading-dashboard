-- =====================================================================
-- AI grade × outcome distribution — v2, inversion-aware.
-- Supersedes migrations/2026-07-05_grade_outcome_distribution.sql
-- =====================================================================
-- v1 counted `outcome = 'profit'` as a win for the grade cell. That was
-- correct until the AI execution gate started INVERTING signals scored 0-4
-- (2026-07-26): for those rows the grade describes the side we did NOT
-- trade, so our profit means the graded signal LOST — i.e. the grader was
-- RIGHT. Counting it as "grade 4 won" inverts the meaning of every low-score
-- cell and cancels out the grader's real skill.
--
-- v2 returns two perspectives per cell:
--   signal_wins / signal_losses — did the GRADED SIGNAL win? Outcome is
--       flipped for inverted rows. This is the series to grade the model on
--       (calibration, AUC, log loss, confusion matrix).
--   exec_wins / exec_losses     — did the trade WE PLACED win? Unchanged
--       from v1's meaning; this is the P&L view.
-- Under the current gate (execute 6-10, inverse 0-4) the two coincide in
-- aggregate — we trade with the grader above the cutoff and against it
-- below, so we win exactly when it is right — but they differ per cell,
-- which is the whole point of the tab.
--
-- Also newly reported:
--   breakeven — closed trades whose SL was moved to breakeven, so the
--       TP-vs-SL race never resolved. v1 dropped these silently; they are
--       excluded from both win/loss pairs but surfaced so the censoring is
--       visible (it disproportionately removes near-misses).
--   inverted  — how many of the cell's trades were flipped.
--
-- Grade source per provider (same fallback the UI chips use):
--   claude: ai_label (text 0-10)      else round(win_probability * 10)
--   gemini: gemini_label (text 0-10)  else round(gemini_win_probability * 10)
-- Trades with no grade from a provider are simply absent for it.
-- Same filter envelope as get_trades_analytics via _trades_filter_ids.
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
      COALESCE(t.is_inverted, false) AS is_inverted,
      t.ai_label, t.win_probability,
      t.gemini_label, t.gemini_win_probability
    FROM public.v_trades_with_channels v
    JOIN public.trades t ON t.id = v.id
    WHERE v.id IN (SELECT id FROM public._trades_filter_ids(p_filters))
      AND v.status = 'closed'
      AND v.outcome IN ('profit', 'loss', 'breakeven')
  ),
  graded AS (
    SELECT
      b.channel_id,
      b.channel_name,
      b.outcome,
      b.is_inverted,
      -- Did the signal the model actually graded win its own race? For a
      -- normal trade that is our outcome; for an inverted one it is the
      -- mirror (our TP is the signal's SL and vice versa). NULL for
      -- breakeven: the race never finished.
      CASE WHEN b.outcome = 'breakeven' THEN NULL
           ELSE ((b.outcome = 'profit') <> b.is_inverted)
      END AS signal_won,
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
      COUNT(*) FILTER (WHERE signal_won IS TRUE)     AS signal_wins,
      COUNT(*) FILTER (WHERE signal_won IS FALSE)    AS signal_losses,
      COUNT(*) FILTER (WHERE outcome = 'profit')     AS exec_wins,
      COUNT(*) FILTER (WHERE outcome = 'loss')       AS exec_losses,
      COUNT(*) FILTER (WHERE outcome = 'breakeven')  AS breakeven,
      COUNT(*) FILTER (WHERE is_inverted)            AS inverted
    FROM graded
    GROUP BY channel_id, channel_name, provider, grade
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'channel_id',    channel_id,
      'channel_name',  channel_name,
      'provider',      provider,
      'grade',         grade,
      'signal_wins',   signal_wins,
      'signal_losses', signal_losses,
      'exec_wins',     exec_wins,
      'exec_losses',   exec_losses,
      'breakeven',     breakeven,
      'inverted',      inverted
    )
    ORDER BY channel_name, provider, grade
  ), '[]'::jsonb)
  INTO result
  FROM cells;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_grade_outcome_distribution(jsonb) TO anon, authenticated;
