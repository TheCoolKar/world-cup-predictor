-- Migration 001: confidence multipliers + streak tracking
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.

-- ── Confidence multiplier ─────────────────────────────────────────────────────
-- Per-match confidence picked by the user when predicting: 1, 2 or 3.
-- Stored as jsonb keyed by match id, e.g. {"A1": 2, "B3": 3}.
-- A correct pick earns 1 point × its confidence; missing entries default to ×1.

alter table public.submissions
  add column if not exists confidence jsonb not null default '{}';

-- ── Streak tracking ───────────────────────────────────────────────────────────
-- Denormalised correct-prediction streaks, refreshed by the client whenever
-- the user views their profile. current_streak = consecutive correct picks
-- ending at their most recent graded match; best_streak = all-time best run.

alter table public.profiles
  add column if not exists current_streak int not null default 0,
  add column if not exists best_streak int not null default 0;
