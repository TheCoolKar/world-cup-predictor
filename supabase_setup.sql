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

-- ── Admin role ───────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ── Admin RLS policy on submissions ──────────────────────────────────────────

drop policy if exists "Admins can view all submissions" on public.submissions;

create policy "Admins can view all submissions"
  on public.submissions for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ── Delete policies (GDPR) ───────────────────────────────────────────────────

drop policy if exists "Users can delete own profile"     on public.profiles;
drop policy if exists "Users can delete own submission"  on public.submissions;

create policy "Users can delete own profile"
  on public.profiles for delete using (auth.uid() = id);

create policy "Users can delete own submission"
  on public.submissions for delete using (auth.uid() = user_id);

-- ── Profile auto-creation trigger ────────────────────────────────────────────
-- Creates a profiles row atomically when a new auth user signs up.
-- Prevents orphaned auth users if the client-side insert ever fails.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- ── Friendships ───────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

drop policy if exists "Users can view own friendships"    on public.friendships;
drop policy if exists "Users can send friend requests"    on public.friendships;
drop policy if exists "Addressee can update friendship"   on public.friendships;
drop policy if exists "Users can delete own friendships"  on public.friendships;

create policy "Users can view own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can update friendship"
  on public.friendships for update
  using (auth.uid() = addressee_id);

create policy "Users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ── Friend invite links ───────────────────────────────────────────────────────

create table if not exists public.friend_invites (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null,
  creator_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

alter table public.friend_invites enable row level security;

drop policy if exists "Anyone can read invite by token"   on public.friend_invites;
drop policy if exists "Creator can manage own invites"    on public.friend_invites;

create policy "Anyone can read invite by token"
  on public.friend_invites for select using (true);

create policy "Creator can manage own invites"
  on public.friend_invites for all
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- ── Leagues ───────────────────────────────────────────────────────────────────

create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  creator_id  uuid not null references auth.users(id) on delete cascade,
  join_code   text unique not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.leagues enable row level security;

-- ── League members ────────────────────────────────────────────────────────────
-- Created before leagues RLS policies because those policies reference this table.

create table if not exists public.league_members (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

alter table public.league_members enable row level security;

drop policy if exists "Members can view league membership"  on public.league_members;
drop policy if exists "Users can join leagues"              on public.league_members;
drop policy if exists "Users can leave leagues"             on public.league_members;

create policy "Members can view league membership"
  on public.league_members for select
  using (auth.uid() = user_id);

create policy "Users can join leagues"
  on public.league_members for insert
  with check (auth.uid() = user_id);

create policy "Users can leave leagues"
  on public.league_members for delete
  using (auth.uid() = user_id);

-- ── Leagues RLS policies (after league_members exists) ───────────────────────

drop policy if exists "Public leagues visible to all"     on public.leagues;
drop policy if exists "Members can view their leagues"    on public.leagues;
drop policy if exists "Authenticated users can create"    on public.leagues;
drop policy if exists "Creator can update/delete league"  on public.leagues;

create policy "Public leagues visible to all"
  on public.leagues for select
  using (is_public = true);

create policy "Members can view their leagues"
  on public.leagues for select
  using (
    exists (select 1 from public.league_members where league_id = id and user_id = auth.uid())
  );

create policy "Authenticated users can create"
  on public.leagues for insert
  with check (auth.uid() = creator_id);

create policy "Creator can update/delete league"
  on public.leagues for all
  using (auth.uid() = creator_id);
