-- Safety tables for blocking and reports.
alter table public.posts add column if not exists description text;

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists blocks_blocker_idx on public.blocks(blocker_id);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);
create index if not exists reports_status_idx on public.reports(status, created_at desc);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Users can view blocks involving themselves" on public.blocks;
create policy "Users can view blocks involving themselves" on public.blocks
for select to authenticated using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can block other users" on public.blocks;
create policy "Users can block other users" on public.blocks
for insert to authenticated with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists "Users can unblock users they blocked" on public.blocks;
create policy "Users can unblock users they blocked" on public.blocks
for delete to authenticated using (auth.uid() = blocker_id);

drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports" on public.reports
for insert to authenticated with check (auth.uid() = reporter_id and reporter_id <> reported_user_id);

drop policy if exists "Users can view their submitted reports" on public.reports;
create policy "Users can view their submitted reports" on public.reports
for select to authenticated using (auth.uid() = reporter_id);

drop policy if exists "Admins can review reports" on public.reports;
create policy "Admins can review reports" on public.reports
for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports" on public.reports
for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Keep this policy on posts so shared feeds can read posts from other users.
drop policy if exists "Authenticated users can view posts" on public.posts;
create policy "Authenticated users can view posts" on public.posts
for select to authenticated using (true);

-- Keep this policy on profiles so safety filters can resolve user identities.
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles" on public.profiles
for select to authenticated using (true);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.post_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.post_comments
add column if not exists parent_comment_id uuid references public.post_comments(id) on delete cascade;

create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);
create index if not exists post_comments_parent_idx on public.post_comments(parent_comment_id);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "Authenticated users can view post likes" on public.post_likes;
create policy "Authenticated users can view post likes" on public.post_likes
for select to authenticated using (true);

drop policy if exists "Users can like posts" on public.post_likes;
create policy "Users can like posts" on public.post_likes
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can unlike posts" on public.post_likes;
create policy "Users can unlike posts" on public.post_likes
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated users can view post comments" on public.post_comments;
create policy "Authenticated users can view post comments" on public.post_comments
for select to authenticated using (true);

drop policy if exists "Users can comment on posts" on public.post_comments;
create policy "Users can comment on posts" on public.post_comments
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can delete their comments" on public.post_comments;
create policy "Users can delete their comments" on public.post_comments
for delete to authenticated using (auth.uid() = user_id);
