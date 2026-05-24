# Performance migration: server-side aggregates

## What changed and why

Before this migration, both `Dashboard.jsx` and `Trades.jsx` called `fetchTrades()` which paginated through **every** row of `v_trades_with_channels` (8,970 rows at the time of writing, growing) and aggregated client-side. Page load time grew linearly with trade volume.

After this migration:
- The dashboard calls `get_channel_performance(time_range)` and gets back ~one row per channel.
- The trades table calls `get_trades_paginated(filters, limit, offset)` and gets back one page (10 rows).
- All chart data on the trades page comes from `get_trades_analytics(filters)` and `get_daily_profit_calendar(filters, year, month)` and `get_max_drawdown(filters)`, each returning pre-aggregated jsonb bundles.

Every query's cost is now bounded by the *output* size, not the number of trades. Going from 9k → 900k trades changes load time by milliseconds, not seconds.

## How to apply

1. Open the [Supabase SQL editor](https://supabase.com/dashboard/project/_/sql) for your project.
2. Open [migrations/2026-05-24_perf_aggregates.sql](2026-05-24_perf_aggregates.sql) and copy its contents.
3. Paste into the SQL editor and click **Run**. All statements are idempotent — safe to re-run.
4. Sanity check by running one of the new functions:
   ```sql
   SELECT * FROM public.get_channel_performance(now() - interval '7 days', null, false) LIMIT 5;
   SELECT public.get_trades_paginated('{}'::jsonb, 5, 0);
   ```

The frontend (`Dashboard.jsx`, `Trades.jsx`) is already wired up to call these functions — once the migration is applied, the next page load will use the new path.

## What's in the migration

- **5 indexes** on `trades`: time-based, channel-scoped, status filters, and pagination support.
- **`_trades_filter_ids(filters)`**: shared filter predicate used by every other RPC.
- **`get_channel_performance(start, end, exclude_orphaned)`**: per-channel rollup for the Dashboard.
- **`get_trades_paginated(filters, limit, offset)`**: one page of trades for the table, plus total count.
- **`get_trades_analytics(filters)`**: bundle of every aggregation needed by the analysis tabs — summary, channel outcomes, daily P&L, hourly, day-of-week, sessions, gantt, side, outcomes sequence.
- **`get_daily_profit_calendar(filters, year, month)`**: risk-based per-day P&L for the calendar tab.
- **`get_max_drawdown(filters)`**: walking peak-to-trough drawdown calculation.

All functions are `STABLE` (cacheable within a transaction) and granted `EXECUTE` to `anon` and `authenticated`.

## Realtime behavior

The frontend still subscribes to trade inserts/updates/deletes. On any event, it debounces 1.5s and then invalidates+refetches the active queries. This is the standard pattern — much simpler than maintaining duplicate aggregation logic on the client, and the next query is fast anyway.

## Trade-offs

- Each filter change is now a network round-trip instead of an in-memory recompute. With proper indexes the round-trip is ~50–100ms — fast enough that the UI still feels snappy.
- The Gantt chart no longer shows individual trade dots within each channel's bar (the per-trade list isn't included in the aggregate). The bar still shows first/last/total. If you need the dots back, add a `gantt_trades` slice to the analytics RPC that returns up-to-N points per channel.
- CSV export now pages through the full result set on demand (500 rows per request). Slow for huge exports but only happens when the user clicks Export. Replace with a dedicated server-streamed endpoint if needed.

## Future work (optional)

- **Materialized views** for `get_channel_performance` once aggregation itself takes >200ms. Refresh via `pg_cron`.
- **Keyset pagination** instead of offset for the trades table (offset gets slow past ~10k rows). Function signature can accept `cursor_signal_time + cursor_id` from the last row of the previous page.
- **TanStack Query / SWR** for the client cache layer — currently each component manages its own loading state. A shared cache would give stale-while-revalidate, request dedup, and free Dashboard ↔ Trades navigation.
