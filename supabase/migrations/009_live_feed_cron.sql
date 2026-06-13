-- Migration 009: pg_cron job to invoke the live-feed Edge Function every minute
-- Run this in the Supabase SQL editor.
-- Safe to re-run.
--
-- Prerequisites (Supabase Dashboard → Database → Extensions):
--   pg_cron  — enable if not already on
--   pg_net   — enable if not already on
--
-- The anon key below is intentionally public (it's already in the frontend
-- bundle). The function is deployed with --no-verify-jwt so any valid JWT works.
-- The actual service role key lives only inside the Edge Function as a Supabase-
-- injected env var — it never appears here.

-- Remove previous schedule if it exists (makes this safe to re-run)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'live-feed-poll') then
    perform cron.unschedule('live-feed-poll');
  end if;
end $$;

select cron.schedule(
  'live-feed-poll',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://rrscrikhzrbymrfjodet.supabase.co/functions/v1/live-feed',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyc2NyaWtoenJieW1yZmpvZGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjUxMTYsImV4cCI6MjA5NTA0MTExNn0.Mro0aHrmx9C0JoOVgDn7M338K0BTtz5Yx8fh-Fb8Cnw"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);
