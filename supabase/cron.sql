-- NexaVerify — scheduled jobs (pg_cron + pg_net)
--
-- Run this AFTER supabase/schema.sql. This schedules NexaVerify's own admin
-- API routes to run automatically on a timer, entirely inside Supabase — no
-- external cron host needed. Each job just does the same HTTP POST a browser
-- button-click would, carrying a shared secret instead of a login session
-- (see lib/cron-auth.js).
--
-- URL is set to https://nexaverify.org and the secret below matches
-- CRON_SECRET in .env.local. If you ever rotate CRON_SECRET in your hosting
-- provider's env vars, update it here too — it must match exactly.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Sync DaisySMS's service list + prices every hour.
select cron.schedule(
  'nexaverify-sync-services',
  '0 * * * *', -- every hour, on the hour
  $$
  select net.http_post(
    url := 'https://nexaverify.org/api/admin/services/sync',
    headers := jsonb_build_object('x-cron-secret', '8mK2vW9pX4qR7zLb', 'Content-Type', 'application/json')
  );
  $$
);

-- 2. PAUSED (2026-07-31): this was meant to sync long-term rentals
--    (paid_until / auto_renew) and charge renewal fees every 3 hours via
--    DaisySMS's GET /api/ltrs. Live testing proved that endpoint is a
--    .com-only web dashboard route that doesn't accept api_key auth on
--    .io — it redirects to the login page instead of returning JSON. .io's
--    own published docs (daisysms.io/docs/api) don't document any bulk
--    list/expiry-check action either, only getNumber/getStatus/setStatus.
--    Auto-renewal billing is paused until there's a real endpoint to sync
--    against; admins should track/renew long-term rentals manually via
--    /admin/numbers for now — see lib/ltr-sync.js and the sync-ltrs route.
--    Do NOT re-enable this schedule without first confirming a working
--    DaisySMS endpoint exists for this account.
--
-- select cron.schedule(
--   'nexaverify-sync-ltrs',
--   '0 */3 * * *', -- every 3 hours
--   $$
--   select net.http_post(
--     url := 'https://nexaverify.org/api/admin/rentals/sync-ltrs',
--     headers := jsonb_build_object('x-cron-secret', '8mK2vW9pX4qR7zLb', 'Content-Type', 'application/json')
--   );
--   $$
-- );

-- 3. Snapshot profiles/transactions/rentals to the private "backups" Storage
--    bucket once a day. Replaces manually exporting CSVs from Table Editor.
select cron.schedule(
  'nexaverify-backup',
  '30 3 * * *', -- once a day at 03:30 UTC
  $$
  select net.http_post(
    url := 'https://nexaverify.org/api/admin/backup/run',
    headers := jsonb_build_object('x-cron-secret', '8mK2vW9pX4qR7zLb', 'Content-Type', 'application/json')
  );
  $$
);

-- 4. Refresh live USD/GBP/EUR -> NGN exchange rates every 6 hours (see
--    lib/exchange-rate.js — free, keyless API, nothing to configure). Any
--    currency an admin has switched to "Custom" in /admin/currency is left
--    alone; only currencies still set to "Live" actually change.
select cron.schedule(
  'nexaverify-sync-currency',
  '0 */6 * * *', -- every 6 hours
  $$
  select net.http_post(
    url := 'https://nexaverify.org/api/admin/currency-rates/sync',
    headers := jsonb_build_object('x-cron-secret', '8mK2vW9pX4qR7zLb', 'Content-Type', 'application/json')
  );
  $$
);

-- 5. Cancel + refund any short-term rental (either provider) that's gone 3
--    minutes with no code — see app/api/admin/rentals/sweep-timeouts. Runs
--    every minute so the worst-case delay past the 3-minute mark is ~1
--    minute. Long-term rentals are excluded by the route itself.
select cron.schedule(
  'nexaverify-sweep-timeouts',
  '* * * * *', -- every minute
  $$
  select net.http_post(
    url := 'https://nexaverify.org/api/admin/rentals/sweep-timeouts',
    headers := jsonb_build_object('x-cron-secret', '8mK2vW9pX4qR7zLb', 'Content-Type', 'application/json')
  );
  $$
);

-- Useful later, run any of these in the SQL Editor:
--   select * from cron.job;                                                -- list scheduled jobs
--   select * from cron.job_run_details order by start_time desc limit 20;  -- check recent runs / failures
--   select cron.unschedule('nexaverify-sync-services');                    -- remove a job by name
--   select cron.unschedule('nexaverify-sync-ltrs');
--   select cron.unschedule('nexaverify-backup');
--   select cron.unschedule('nexaverify-sync-currency');
--   select cron.unschedule('nexaverify-sweep-timeouts');
