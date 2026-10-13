-- Migration 012: per-slot knockout bracket scoring columns
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.
--
-- ko_slot_statuses: jsonb that mirrors the bracket shape, storing the scoring
--   status for each predicted knockout slot:
--     { "R32": ["correct"|"wrong"|"void"|"pending", ...×16],
--       "R16": [...×8], "QF": [...×4], "SF": [...×2], "F": [...×1], "3P": [...×1] }
--
--   Status meanings:
--     pending — match hasn't been played yet, or no pick was recorded
--     void    — one or both teams the user predicted for this slot didn't reach it
--               (scores 0; not counted as a wrong pick)
--     correct — both predicted teams reached this slot AND the user picked the winner
--     wrong   — both predicted teams reached this slot but the user picked the loser
--
-- ko_points: sum of points from 'correct' slots only.
--   Points per round: R32=1, R16=2, QF=4, SF=8, Final=16.
--
-- Both columns are populated by the client-side scoring engine
-- (src/utils/bracketScoring.js / scoreBracket) whenever new match results land.
-- They may be NULL/0 for a given user until the scoring engine has run for them.
-- The leaderboard computes knockout points on the fly for real-time accuracy;
-- these columns support the future per-slot breakdown view and fast DB queries.

alter table public.submissions
  add column if not exists ko_slot_statuses jsonb,
  add column if not exists ko_points        int not null default 0;
