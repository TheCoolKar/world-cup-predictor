-- Migration 013: Survivor Score columns
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.
--
-- Adds two columns to public.submissions for the Survivor Score system,
-- which is INDEPENDENT of the existing ko_slot_statuses / ko_points columns
-- (migration 012). Do not merge or overwrite either column.
--
-- survivor_points: total Survivor Score for this user.
--   Points per correctly-predicted team survival, by destination round:
--     Into R16 (16 teams): 1 pt each — max 16
--     Into QF  (8 teams):  2 pts each — max 16
--     Into SF  (4 teams):  4 pts each — max 16
--     Into F   (2 teams):  8 pts each — max 16
--   Maximum possible: 64 points.
--
-- survivor_breakdown: per-round detail, JSON-serialised output of scoreSurvivor()
--   from src/utils/survivorScoring.js. Shape:
--     { "R16": { "correct": 10, "points": 10, "complete": true },
--       "QF":  { "correct": 5,  "points": 10, "complete": true },
--       "SF":  { "correct": 2,  "points": 8,  "complete": false },
--       "F":   { "correct": 0,  "points": 0,  "complete": false } }
--   A round's "complete" flag is false while any feeding match is still pending.
--
-- Both columns are populated by the client-side scoring engine and may be
-- NULL/0 until the engine has run for a given user. The leaderboard always
-- computes survivor_points on the fly for real-time accuracy; these columns
-- support future per-round breakdown views and fast DB queries.

alter table public.submissions
  add column if not exists survivor_points    int  not null default 0,
  add column if not exists survivor_breakdown jsonb;
