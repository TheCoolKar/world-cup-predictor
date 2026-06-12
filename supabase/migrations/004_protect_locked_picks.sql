-- Migration 004: server-side protection for locked picks
--
-- Problem: the client autosaves the ENTIRE picks object. A device or tab with
-- a stale localStorage copy silently overwrites newer picks in the DB — even
-- for matches that have already kicked off.
--
-- Fix: a kickoff schedule table + a trigger on submissions that, for any match
-- already kicked off, keeps the previous pick/score regardless of what the
-- client sends. The dashboard and service-role requests have no auth.uid(),
-- so admins can still correct locked picks manually (Table editor / SQL).

-- ── Kickoff schedule (group stage) ────────────────────────────────────────────
-- Generated from src/data/wc2026_fixtures.json (ET kickoff = UTC-4, matching
-- parseMatchKickoff in MyBracket.jsx). Re-run-safe: upserts on conflict.

create table if not exists public.match_kickoffs (
  match_id text primary key,
  kickoff  timestamptz not null
);

alter table public.match_kickoffs enable row level security;

drop policy if exists "Anyone can read kickoffs" on public.match_kickoffs;
create policy "Anyone can read kickoffs"
  on public.match_kickoffs for select using (true);
-- No insert/update/delete policies: only the service role can modify the schedule.

insert into public.match_kickoffs (match_id, kickoff) values
  ('A1', '2026-06-11 19:00:00+00'),
  ('A2', '2026-06-12 02:00:00+00'),
  ('A3', '2026-06-19 01:00:00+00'),
  ('A4', '2026-06-18 16:00:00+00'),
  ('A5', '2026-06-25 01:00:00+00'),
  ('A6', '2026-06-25 01:00:00+00'),
  ('B1', '2026-06-12 19:00:00+00'),
  ('B2', '2026-06-13 19:00:00+00'),
  ('B3', '2026-06-18 22:00:00+00'),
  ('B4', '2026-06-18 19:00:00+00'),
  ('B5', '2026-06-24 19:00:00+00'),
  ('B6', '2026-06-24 19:00:00+00'),
  ('C1', '2026-06-13 22:00:00+00'),
  ('C2', '2026-06-14 01:00:00+00'),
  ('C3', '2026-06-20 01:00:00+00'),
  ('C4', '2026-06-19 22:00:00+00'),
  ('C5', '2026-06-24 22:00:00+00'),
  ('C6', '2026-06-24 22:00:00+00'),
  ('D1', '2026-06-13 01:00:00+00'),
  ('D2', '2026-06-14 01:00:00+00'),
  ('D3', '2026-06-19 19:00:00+00'),
  ('D4', '2026-06-19 04:00:00+00'),
  ('D5', '2026-06-26 02:00:00+00'),
  ('D6', '2026-06-26 02:00:00+00'),
  ('E1', '2026-06-14 17:00:00+00'),
  ('E2', '2026-06-14 23:00:00+00'),
  ('E3', '2026-06-20 20:00:00+00'),
  ('E4', '2026-06-21 00:00:00+00'),
  ('E5', '2026-06-25 20:00:00+00'),
  ('E6', '2026-06-25 20:00:00+00'),
  ('F1', '2026-06-14 20:00:00+00'),
  ('F2', '2026-06-15 02:00:00+00'),
  ('F3', '2026-06-20 17:00:00+00'),
  ('F4', '2026-06-20 04:00:00+00'),
  ('F5', '2026-06-25 23:00:00+00'),
  ('F6', '2026-06-25 23:00:00+00'),
  ('G1', '2026-06-15 19:00:00+00'),
  ('G2', '2026-06-16 01:00:00+00'),
  ('G3', '2026-06-21 19:00:00+00'),
  ('G4', '2026-06-22 01:00:00+00'),
  ('G5', '2026-06-27 03:00:00+00'),
  ('G6', '2026-06-27 03:00:00+00'),
  ('H1', '2026-06-15 16:00:00+00'),
  ('H2', '2026-06-15 22:00:00+00'),
  ('H3', '2026-06-21 16:00:00+00'),
  ('H4', '2026-06-21 22:00:00+00'),
  ('H5', '2026-06-27 00:00:00+00'),
  ('H6', '2026-06-27 00:00:00+00'),
  ('I1', '2026-06-16 19:00:00+00'),
  ('I2', '2026-06-16 22:00:00+00'),
  ('I3', '2026-06-22 21:00:00+00'),
  ('I4', '2026-06-23 00:00:00+00'),
  ('I5', '2026-06-26 19:00:00+00'),
  ('I6', '2026-06-26 19:00:00+00'),
  ('J1', '2026-06-17 01:00:00+00'),
  ('J2', '2026-06-16 04:00:00+00'),
  ('J3', '2026-06-22 17:00:00+00'),
  ('J4', '2026-06-23 03:00:00+00'),
  ('J5', '2026-06-28 02:00:00+00'),
  ('J6', '2026-06-28 02:00:00+00'),
  ('K1', '2026-06-17 17:00:00+00'),
  ('K2', '2026-06-18 02:00:00+00'),
  ('K3', '2026-06-23 17:00:00+00'),
  ('K4', '2026-06-24 02:00:00+00'),
  ('K5', '2026-06-27 23:30:00+00'),
  ('K6', '2026-06-27 23:30:00+00'),
  ('L1', '2026-06-17 20:00:00+00'),
  ('L2', '2026-06-17 23:00:00+00'),
  ('L3', '2026-06-23 20:00:00+00'),
  ('L4', '2026-06-23 23:00:00+00'),
  ('L5', '2026-06-27 21:00:00+00'),
  ('L6', '2026-06-27 21:00:00+00')
on conflict (match_id) do update set kickoff = excluded.kickoff;

-- ── Trigger: locked picks/scores can't be changed by clients ──────────────────

create or replace function public.protect_locked_picks()
returns trigger as $$
declare
  locked_ids text[];
begin
  -- Dashboard / service-role sessions have no auth.uid() — let admins fix anything.
  if auth.uid() is null then
    return new;
  end if;

  select coalesce(array_agg(match_id), '{}') into locked_ids
  from public.match_kickoffs
  where kickoff <= now();

  if array_length(locked_ids, 1) is null then
    return new;
  end if;

  -- Rebuild picks: locked matches keep their previous value (or stay absent),
  -- unlocked matches take whatever the client sent.
  new.picks := (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from (
      select key, value from jsonb_each(coalesce(new.picks, '{}'::jsonb))
        where not (key = any(locked_ids))
      union all
      select key, value from jsonb_each(coalesce(old.picks, '{}'::jsonb))
        where key = any(locked_ids)
    ) merged
  );

  -- Same for predicted scores (score mode).
  new.scores := (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from (
      select key, value from jsonb_each(coalesce(new.scores, '{}'::jsonb))
        where not (key = any(locked_ids))
      union all
      select key, value from jsonb_each(coalesce(old.scores, '{}'::jsonb))
        where key = any(locked_ids)
    ) merged
  );

  -- Keep the denormalised count consistent with the merged picks.
  new.group_picks_count := (select count(*) from jsonb_object_keys(new.picks));

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_locked_picks on public.submissions;

create trigger protect_locked_picks
  before update on public.submissions
  for each row execute function public.protect_locked_picks();
