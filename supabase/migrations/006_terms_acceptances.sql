-- Migration 006: terms & conditions acceptance log
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run.

-- ── Terms acceptance log ──────────────────────────────────────────────────────
-- One row per disclaimer acceptance. Most visitors accept before signing in,
-- so user_id/email are nullable; signed-in acceptances carry both.
-- version mirrors the DisclaimerModal storage-key version ("v1", "v2", …) so
-- re-acceptances after a terms bump are distinguishable.

create table if not exists public.terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  email       text,
  version     text not null,
  user_agent  text,
  accepted_at timestamptz not null default now()
);

create index if not exists terms_acceptances_accepted_at_idx
  on public.terms_acceptances (accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- Anyone — including anonymous visitors — may log an acceptance
drop policy if exists "anyone can log acceptance" on public.terms_acceptances;
create policy "anyone can log acceptance"
  on public.terms_acceptances
  for insert
  to anon, authenticated
  with check (true);

-- Only admins may read the log
drop policy if exists "admins can read acceptances" on public.terms_acceptances;
create policy "admins can read acceptances"
  on public.terms_acceptances
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin
    )
  );
