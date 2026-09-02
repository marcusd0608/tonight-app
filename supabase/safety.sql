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

-- Tonight group activities and host-approved membership.
alter table public.going_out add column if not exists activity_category text not null default 'Other';
alter table public.going_out add column if not exists activity_details text;
alter table public.going_out add column if not exists max_capacity integer;
alter table public.going_out drop constraint if exists going_out_activity_category_check;
alter table public.going_out add constraint going_out_activity_category_check
  check (activity_category in ('Sports', 'Gym', 'Boba', 'Food', 'Study', 'Party', 'Other'));
alter table public.going_out drop constraint if exists going_out_max_capacity_check;
alter table public.going_out add constraint going_out_max_capacity_check
  check (max_capacity is null or max_capacity >= 2);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.going_out(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (status_id, requester_id)
);

create index if not exists join_requests_status_idx on public.join_requests(status_id, status, created_at);
create index if not exists join_requests_requester_idx on public.join_requests(requester_id, status);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage their push subscriptions" on public.push_subscriptions;
create policy "Users can manage their push subscriptions" on public.push_subscriptions
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.join_requests enable row level security;

drop policy if exists "Users can request to join" on public.join_requests;
create policy "Users can request to join" on public.join_requests
for insert to authenticated
with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists "Users can view their join requests" on public.join_requests;
create policy "Users can view their join requests" on public.join_requests
for select to authenticated
using (auth.uid() = requester_id or exists (
  select 1 from public.going_out
  where going_out.id = join_requests.status_id
    and going_out.user_id = auth.uid()
));

drop policy if exists "Hosts can review join requests" on public.join_requests;
create policy "Hosts can review join requests" on public.join_requests
for update to authenticated
using (exists (
  select 1 from public.going_out
  where going_out.id = join_requests.status_id
    and going_out.user_id = auth.uid()
))
with check (status in ('approved', 'rejected') and exists (
  select 1 from public.going_out
  where going_out.id = join_requests.status_id
    and going_out.user_id = auth.uid()
));

create or replace function public.enforce_join_request_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  capacity integer;
  approved_count integer;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    select max_capacity into capacity from public.going_out where id = new.status_id for update;
    if capacity is not null then
      select count(*) into approved_count
      from public.join_requests
      where status_id = new.status_id and status = 'approved' and id <> new.id;
      if approved_count >= capacity - 1 then
        raise exception 'This activity has reached its maximum group size.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_join_request_capacity on public.join_requests;
create trigger enforce_join_request_capacity
before update of status on public.join_requests
for each row execute function public.enforce_join_request_capacity();

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events(event_name, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "Authenticated users can record their own analytics" on public.analytics_events;
create policy "Authenticated users can record their own analytics" on public.analytics_events
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Admins can view analytics" on public.analytics_events;
create policy "Admins can view analytics" on public.analytics_events
for select to authenticated
using (exists (
  select 1
  from public.profiles
  where profiles.id = auth.uid()
    and profiles.is_admin = true
));

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
