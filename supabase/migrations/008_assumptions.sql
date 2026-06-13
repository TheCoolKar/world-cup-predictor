-- Migration 008: assumed outcomes for locked group matches + live results
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.

-- Late joiners can't pick group matches that have already kicked off, which
-- left their knockout bracket stuck on TBD. They now record an "assumed
-- outcome" for those matches — used only to seed their own bracket, never
-- scored, and superseded by the real result as soon as it lands.
-- The protect_locked_picks trigger (004) only guards picks/scores, so this
-- column stays writable after kickoff by design.

alter table public.submissions
  add column if not exists assumptions jsonb default '{}'::jsonb;

-- Broadcast match_results changes so open brackets fill TBD slots live as
-- the feed (scripts/fetchLiveFeed.mjs) or an admin enters final scores.

do $$ begin
  alter publication supabase_realtime add table public.match_results;
exception when duplicate_object then null;
end $$;
