-- Migration 002: fix league join-code lookup for private leagues
-- The original "Members can view their leagues" policy creates a chicken-and-egg
-- problem: you can't look up a private league by its join code to join it
-- because you're not yet a member.
-- Fix: allow any authenticated user to read any league row.
-- The join_code itself already acts as a capability token.

drop policy if exists "Authenticated users can look up any league" on public.leagues;

create policy "Authenticated users can look up any league"
  on public.leagues for select
  using (auth.uid() is not null);
