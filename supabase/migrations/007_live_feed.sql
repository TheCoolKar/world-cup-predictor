-- Migration 007: live match feed (scores, cards, subs, goals)
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.

-- ── Live match state ──────────────────────────────────────────────────────────
-- One row per fixture, continuously upserted by scripts/fetchLiveFeed.mjs while
-- a match is live. match_id uses app fixture ids (A1–L6 group, M73–M104 KO).

create table if not exists public.live_matches (
  match_id   text primary key,
  fotmob_id  bigint,
  home_team  text,
  away_team  text,
  status     text not null default 'NS',   -- NS | LIVE | HT | FT | AET | CANC …
  minute     text,                          -- e.g. "67'", "45+2'", "HT"
  home_score int,
  away_score int,
  kickoff    timestamptz,
  updated_at timestamptz not null default now()
);

-- ── Match events ──────────────────────────────────────────────────────────────
-- Append-only event timeline per match: goals, cards, substitutions, halves.
-- seq is the event's index in the FotMob feed, making upserts idempotent.

create table if not exists public.match_events (
  match_id   text not null,
  seq        int  not null,
  minute     int,
  overload   int,                            -- added time (e.g. 45+2 → minute 45, overload 2)
  type       text not null,                  -- Goal | Card | Substitution | Half | AddedTime
  card       text,                           -- Yellow | Red | YellowRed (Card events only)
  player     text,
  assist     text,                           -- Goal events only
  detail     text,                           -- goal description / "On: X · Off: Y" for subs
  is_home    boolean,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

create index if not exists match_events_match_id_idx on public.match_events (match_id);

-- ── RLS: public read, writes only via service role (which bypasses RLS) ──────

alter table public.live_matches enable row level security;
alter table public.match_events enable row level security;

drop policy if exists "anyone can read live matches" on public.live_matches;
create policy "anyone can read live matches"
  on public.live_matches for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can read match events" on public.match_events;
create policy "anyone can read match events"
  on public.match_events for select
  to anon, authenticated
  using (true);

-- ── Realtime: broadcast inserts/updates to subscribed clients ────────────────

do $$ begin
  alter publication supabase_realtime add table public.live_matches;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.match_events;
exception when duplicate_object then null;
end $$;
