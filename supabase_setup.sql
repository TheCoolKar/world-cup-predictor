-- Run this once in the Supabase SQL editor to set up the submissions table.

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

-- Only one submission per user (upsert on user_id)
create unique index if not exists submissions_user_id_idx on public.submissions(user_id);

-- Row-level security: users can only read/write their own row
alter table public.submissions enable row level security;

create policy "Users can insert their own submission"
  on public.submissions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own submission"
  on public.submissions for update
  using (auth.uid() = user_id);

create policy "Users can read their own submission"
  on public.submissions for select
  using (auth.uid() = user_id);

-- Organizer admin: service-role key bypasses RLS so you can query all rows
-- from the Supabase dashboard or a server-side script.
