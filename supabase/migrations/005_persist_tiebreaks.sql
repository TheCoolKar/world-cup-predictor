-- Migration 005: persist bracket tiebreak choices
-- thirdsUserPicks (cut-line 3rd-place selections) and groupOrderOverrides
-- (manually reordered group standings) previously lived only in React state
-- and reset on every page load. Store them alongside the rest of the bracket:
-- { "thirds": ["A","C",...], "groupOrders": { "B": ["Canada","Qatar",...] } }
--
-- NOTE: run this BEFORE deploying the frontend that writes the column,
-- otherwise autosave upserts will fail with "column does not exist".

alter table public.submissions
  add column if not exists tiebreaks jsonb not null default '{}';
