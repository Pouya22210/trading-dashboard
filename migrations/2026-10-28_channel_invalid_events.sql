-- Activity Log: "Invalid" category for channels whose telegram_channel_id
-- became 8138751859. That id is positive, i.e. a Telegram user/bot account,
-- not a channel (channel ids are -100...), so these rows no longer point at
-- their real channel.
--
-- Run each step separately (autocommit): a new enum value can't be used in
-- the transaction that adds it.

-- 1. New event type
ALTER TYPE channel_event_type ADD VALUE IF NOT EXISTS 'channel_invalid';

-- 2. The one place that decides which telegram ids count as invalid
CREATE OR REPLACE FUNCTION public.is_invalid_telegram_channel_id(p_id bigint)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_id = 8138751859 $$;

-- 3. Log an event when a channel gets (or is created with) an invalid id.
--    bot_id is filled by channel_events_fill_bot_id.
CREATE OR REPLACE FUNCTION public.trigger_log_channel_invalid()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF public.is_invalid_telegram_channel_id(NEW.telegram_channel_id)
       AND (TG_OP = 'INSERT' OR OLD.telegram_channel_id IS DISTINCT FROM NEW.telegram_channel_id) THEN
        INSERT INTO channel_events (channel_id, event_type, description, event_data, new_channel_name)
        VALUES (
            NEW.id,
            'channel_invalid',
            'Channel "' || NEW.channel_key || '" became invalid (telegram id ' || NEW.telegram_channel_id || ')',
            jsonb_build_object(
                'telegram_channel_id', jsonb_build_object(
                    'old', CASE WHEN TG_OP = 'UPDATE' THEN OLD.telegram_channel_id END,
                    'new', NEW.telegram_channel_id)
            ),
            NEW.channel_key
        );
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS log_channel_invalid ON public.channels;
CREATE TRIGGER log_channel_invalid
AFTER INSERT OR UPDATE OF telegram_channel_id ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.trigger_log_channel_invalid();

-- 4. Backfill: one event for every channel that already has the invalid id
--    (when they became invalid wasn't recorded, so these are stamped now()).
INSERT INTO channel_events (channel_id, event_type, description, event_data, new_channel_name)
SELECT c.id,
       'channel_invalid',
       'Channel "' || c.channel_key || '" became invalid (telegram id ' || c.telegram_channel_id || ')',
       jsonb_build_object('telegram_channel_id', jsonb_build_object('old', NULL, 'new', c.telegram_channel_id)),
       c.channel_key
FROM channels c
WHERE public.is_invalid_telegram_channel_id(c.telegram_channel_id)
  AND NOT EXISTS (SELECT 1 FROM channel_events e
                  WHERE e.channel_id = c.id AND e.event_type = 'channel_invalid');
