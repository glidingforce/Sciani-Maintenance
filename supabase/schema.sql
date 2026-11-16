-- Scinai maintenance workspace: shared storage schema.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Every row belongs to the signed-in user; row-level security blocks all other access.

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_idx on public.tasks (user_id);
create index if not exists contacts_user_idx on public.contacts (user_id);

alter table public.tasks enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own contacts" on public.contacts;
create policy "own contacts" on public.contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No access at all for anonymous requests.
revoke all on public.tasks from anon;
revoke all on public.contacts from anon;
