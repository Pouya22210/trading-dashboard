-- ===========================================================================
-- AI execution gate (Channels > AI Execution tab)
-- ===========================================================================
-- Adds the global setting that makes order execution depend on the AI signal
-- grade, plus the decline category used when the gate blocks a signal.
--
-- The dashboard upserts the app_settings row itself, so the feature works
-- without this migration; running it just seeds a sane default and lets blocked
-- trades be filed under their own category instead of failing that one insert.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
-- ===========================================================================

-- 1. Decline category for signals the gate refuses to trade.
--    (ALTER TYPE ... ADD VALUE is allowed in a transaction on PG 12+ as long as
--     the new value isn't used in the same transaction.)
ALTER TYPE decline_category ADD VALUE IF NOT EXISTS 'ai_grade';

-- 2. The gate config itself. Shape must match AI_GATE_DEFAULTS in
--    sigbot/App.py and AI_GATE_DEFAULTS in trading-dashboard/src/lib/supabase.js.
--
--    enabled                 master switch; false = the bot's normal behaviour
--    provider                which grade decides: gemini | claude | average
--    execute_min/max         grades traded as-is
--    inverse_enabled         whether the inverse band is active
--    inverse_min/max         grades traded with the direction flipped
--    trade_ungraded_channels let channels with no grader keep trading ungated
--    max_grade_wait_sec      block the signal if grading takes longer than this
INSERT INTO app_settings (key, value, description)
VALUES (
  'ai_execution_gate',
  '{
    "enabled": false,
    "provider": "gemini",
    "execute_min": 6,
    "execute_max": 10,
    "inverse_enabled": false,
    "inverse_min": 0,
    "inverse_max": 4,
    "trade_ungraded_channels": false,
    "max_grade_wait_sec": 300
  }'::jsonb,
  'AI execution gate: routes order execution by the AI signal grade (see Channels > AI Execution)'
)
ON CONFLICT (key) DO NOTHING;
