-- Migration 014: Server-side enforcement of knockout round locks
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run (uses CREATE OR REPLACE + DROP IF EXISTS).
--
-- PROBLEM: Knockout bracket predictions lock at the round level — all picks for
-- a round become final the moment the first match of that round kicks off.
-- This prevents late UI-bypass submissions where a user makes picks for later
-- slots in a round after seeing earlier results in the same round.
--
-- SOLUTION: A BEFORE UPDATE trigger on public.submissions that compares
-- OLD.bracket vs NEW.bracket and rejects any modification to a round whose
-- first match has already kicked off.
--
-- Round lock timestamps (UTC) — first kickoff in each round:
--   R32:  2026-06-28 19:00 UTC (3:00 PM ET, EDT = UTC-4)
--   R16:  2026-07-06 19:00 UTC
--   QF:   2026-07-11 19:00 UTC
--   SF:   2026-07-14 23:00 UTC (7:00 PM ET)
--   F:    2026-07-19 23:00 UTC
--
-- Note: this trigger fires only on UPDATE (not INSERT). A brand-new
-- submission from a user with no prior row is an INSERT and is not blocked.
-- In practice the auto-save mechanism creates a row well before submission,
-- so INSERT-only bypass requires a freshly created account with no auto-save
-- history — an edge case that is additionally protected by client-side guards.
--
-- The "3P" (third-place play-off) key is intentionally excluded: it is not
-- tracked by the live feed, never scored, and has no separate lock time.

CREATE OR REPLACE FUNCTION public.check_ko_round_locks()
RETURNS TRIGGER AS $$
DECLARE
  round_lock_times jsonb := '{
    "R32": "2026-06-28T19:00:00Z",
    "R16": "2026-07-06T19:00:00Z",
    "QF":  "2026-07-11T19:00:00Z",
    "SF":  "2026-07-14T23:00:00Z",
    "F":   "2026-07-19T23:00:00Z"
  }'::jsonb;
  rnd      text;
  lock_at  timestamptz;
BEGIN
  -- Fast-path: if bracket hasn't changed at all, nothing to check.
  IF OLD.bracket IS NOT DISTINCT FROM NEW.bracket THEN
    RETURN NEW;
  END IF;

  FOR rnd IN SELECT jsonb_object_keys(round_lock_times) LOOP
    lock_at := (round_lock_times ->> rnd)::timestamptz;

    IF NOW() >= lock_at THEN
      -- Round is locked — its sub-tree in the bracket must be identical.
      IF (OLD.bracket -> rnd) IS DISTINCT FROM (NEW.bracket -> rnd) THEN
        RAISE EXCEPTION
          'Knockout round % is locked (picks closed at %). Cannot modify bracket after round kicks off.',
          rnd, lock_at
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if it exists so the migration is safe to re-run.
DROP TRIGGER IF EXISTS enforce_ko_round_locks ON public.submissions;

CREATE TRIGGER enforce_ko_round_locks
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_ko_round_locks();
