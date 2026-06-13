-- Migration 009: schedule the live-feed edge function via pg_cron
--
-- Polls the `live-feed` Edge Function every minute during World Cup match hours
-- (~15:00–04:59 UTC, covering ET/CT/PT kickoffs) for true minute-by-minute
-- updates — the always-free upgrade over the 5-minute GitHub Actions poller.
--
-- ── ONE-TIME SETUP (do these before/after running this migration) ────────────
--
--   1. Pick a random secret and set it on the function:
--        supabase secrets set CRON_SECRET=<random-string>
--
--   2. Store the SAME secret in Vault so the cron job can present it
--      (run once in the SQL editor — keeps the secret OUT of this repo):
--        select vault.create_secret('<random-string>', 'live_feed_cron_secret');
--
--   3. Deploy the function (no JWT — the shared secret is the guard):
--        supabase functions deploy live-feed --no-verify-jwt
--
--   4. Run this migration.
--
-- Verify the project URL below matches your project ref.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any previous schedule so this migration is safe to re-run
select cron.unschedule('live-feed-poll')
where exists (select 1 from cron.job where jobname = 'live-feed-poll');

select cron.schedule(
  'live-feed-poll',
  '* 15-23,0-4 * * *',        -- every minute, 15:00–23:59 and 00:00–04:59 UTC
  $$
  select net.http_post(
    url     := 'https://efrhtycodarydbkogwue.supabase.co/functions/v1/live-feed',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'live_feed_cron_secret')
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Inspect runs:    select * from cron.job_run_details order by start_time desc limit 20;
-- Pause for a day: select cron.unschedule('live-feed-poll');
