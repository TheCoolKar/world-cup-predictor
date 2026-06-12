-- Migration 003: Admin panel "Leagues" tab
-- The "Members can view league membership" policy only lets users see
-- memberships of leagues they belong to. Admins need to see every league's
-- member list, so add an admin select policy (same pattern as the existing
-- admin policies on submissions and match_results).

drop policy if exists "Admins can view all league members" on public.league_members;

create policy "Admins can view all league members"
  on public.league_members for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
