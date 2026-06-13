-- Migration 010: resolve Supabase database security advisors
-- Safe to re-run.
--
-- Covers the SQL-addressable WARN advisors:
--   • function_search_path_mutable               (handle_new_user, current_user_in_league, protect_locked_picks)
--   • anon/authenticated_security_definer_function_executable (all three above)
--   • rls_policy_always_true                      (terms_acceptances INSERT)
--   • public_bucket_allows_listing               (avatars bucket)
--
-- Two advisors are handled OUTSIDE this file (see notes at the bottom):
--   • extension_in_public (pg_net)  — needs care, the live-feed cron depends on it
--   • auth_leaked_password_protection — a Dashboard Auth toggle, not SQL

-- ── 1. Pin search_path on SECURITY DEFINER functions ─────────────────────────
-- An empty search_path forces every reference to be schema-qualified, closing
-- the search_path-injection vector. All three bodies already qualify their
-- objects (public.*, auth.uid()), so this is behaviour-preserving.
alter function public.handle_new_user()      set search_path = '';
alter function public.protect_locked_picks() set search_path = '';

-- ── 2. Trigger functions must not be callable through the REST RPC API ────────
-- handle_new_user and protect_locked_picks only ever run as triggers. Triggers
-- fire with the function-owner's rights regardless of these grants, so revoking
-- EXECUTE removes the /rest/v1/rpc/* exposure without affecting the triggers.
revoke execute on function public.handle_new_user()      from anon, authenticated, public;
revoke execute on function public.protect_locked_picks() from anon, authenticated, public;

-- ── 3. Hide the RLS helper from the public API ───────────────────────────────
-- current_user_in_league must stay SECURITY DEFINER (it breaks RLS recursion on
-- league_members) and authenticated must keep EXECUTE so the league policies can
-- call it. Moving it to a non-exposed schema removes the RPC endpoint while RLS
-- keeps working: policies reference the function by OID, so the move is
-- transparent to them.
create schema if not exists private;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_user_in_league'
  ) then
    execute 'alter function public.current_user_in_league(uuid) set schema private';
  end if;
end $$;

alter function private.current_user_in_league(uuid) set search_path = '';

-- ── 4. terms_acceptances INSERT — replace the always-true WITH CHECK ──────────
-- Visitors may still log an acceptance before signing in (user_id null), but a
-- signed-in user can now only log their OWN acceptance — no forging another
-- user's id.
drop policy if exists "anyone can log acceptance" on public.terms_acceptances;
create policy "anyone can log acceptance"
  on public.terms_acceptances
  for insert
  to anon, authenticated
  with check (
    (auth.uid() is null     and user_id is null) or
    (auth.uid() is not null  and user_id = auth.uid())
  );

-- ── 5. avatars bucket — stop clients listing every file ──────────────────────
-- The bucket is public, so object URLs (getPublicUrl) keep working without any
-- SELECT policy. Dropping the broad policy removes the ability to enumerate the
-- bucket. The app only ever loads avatars by their stored public URL.
drop policy if exists "Anyone can view avatars" on storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- STILL TO DO (outside this migration):
--
--   pg_net in public schema — run, then immediately confirm the live-feed cron
--   still posts (select status_code from net._http_response order by created desc):
--     alter extension pg_net set schema extensions;
--
--   Leaked password protection — Dashboard → Authentication → Sign In / Providers
--   → Password → enable "Check against HaveIBeenPwned".
