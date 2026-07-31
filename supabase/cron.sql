-- NexaVerify — scheduled jobs (pg_cron + pg_net)
--
-- Run this AFTER supabase/schema.sql, and after replacing the two
-- placeholders below. This schedules three of NexaVerify's own admin API
-- routes to run automatically on a timer, entirely inside Supabase — no
-- external cron host needed. Each job just does the same HTTP POST a browser
-- button-click would, carrying a shared secret instead of a login session
-- (see lib/cron-auth.js).
--
-- Before running:
--   1. Replace YOUR-DOMAIN.com below with your real deployed domain (this
--      won't work against http://localhost — Supabase's servers can't reach
--      your laptop, so these jobs only make sense once you've deployed).
--   2. Replace YOUR_CRON_SECRET with the exact value you put in CRON_SECRET
--      in your hosting provider's environment variables.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Sync DaisySMS's service list + prices every hour.
select cron.schedule(
  'nexaverify-sync-services',
  '0 * * * *', -- every hour, on the hour
  $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN.com/api/admin/services/sync',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET', 'Content-Type', 'application/json')
  );
  $$
);

-- 2. Sync long-term rentals (paid_until / auto_renew) and charge renewal
--    fees every 3 hours. This is the job that makes auto-renew billing
--    actually automatic — see lib/ltr-sync.js.
select cron.schedule(
  'nexaverify-sync-ltrs',
  '0 */3 * * *', -- every 3 hours
  $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN.com/api/admin/rentals/sync-ltrs',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET', 'Content-Type', 'application/json')
  );
  $$
);

-- 3. Snapshot profiles/transactions/rentals to the private "backups" Storage
--    bucket once a day. Replaces manually exporting CSVs from Table Editor.
select cron.schedule(
  'nexaverify-backup',
  '30 3 * * *', -- once a day at 03:30 UTC
  $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN.com/api/admin/backup/run',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET', 'Content-Type', 'application/json')
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
    url := 'https://YOUR-DOMAIN.com/api/admin/currency-rates/sync',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET', 'Content-Type', 'application/json')
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
