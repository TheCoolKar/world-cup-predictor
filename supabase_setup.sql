-- Run this in the Supabase SQL editor.
-- Safe to re-run — drops existing policies before recreating them.

-- ── Profiles table ────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles"     on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── Submissions table ─────────────────────────────────────────────────────────

create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  email            text,
  display_name     text,
  picks            jsonb not null default '{}',
  scores           jsonb not null default '{}',
  bracket          jsonb not null default '{}',
  bracket_scores   jsonb not null default '{}',
  group_picks_count int not null default 0,
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists submissions_user_id_idx on public.submissions(user_id);

alter table public.submissions enable row level security;

drop policy if exists "Users can insert their own submission" on public.submissions;
drop policy if exists "Users can update their own submission" on public.submissions;
drop policy if exists "Users can read their own submission"   on public.submissions;

create policy "Users can insert their own submission"
  on public.submissions for insert with check (auth.uid() = user_id);

create policy "Users can update their own submission"
  on public.submissions for update using (auth.uid() = user_id);

create policy "Users can read their own submission"
  on public.submissions for select using (auth.uid() = user_id);

-- ── Avatar storage bucket ─────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view avatars"            on storage.objects;
drop policy if exists "Users can upload their own avatar"  on storage.objects;
drop policy if exists "Users can update their own avatar"  on storage.objects;
drop policy if exists "Users can delete their own avatar"  on storage.objects;

create policy "Anyone can view avatars"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
