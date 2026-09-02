-- ============================================================
-- COMPLETE SCHEMA WITH EMAIL VERIFICATION & PASSWORD AUTH
-- ============================================================

-- 1. Create PROFILES table (with all fields)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  photo_url text,
  tower text,
  floor integer,
  major text,
  instagram_handle text,
  interests text[],
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create GOING_OUT table
create table public.going_out (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text,
  other_details text,
  capacity integer,
  keywords text,
  capacity_joins integer default 0,
  note text,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create EVENTS table
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text check (category in ('rave', 'concert', 'party', 'other')),
  area_label text,
  event_date timestamp with time zone not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create POSTS table (replacing NIGHTS)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  vibe_tags text[],
  description text,
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create CONNECTIONS table
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Create BLOCKS table
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(blocker_id, blocked_id)
);

-- 7. Create GOING_OUT_JOINS table (for join requests)
create table public.going_out_joins (
  id uuid primary key default gen_random_uuid(),
  going_out_id uuid not null references public.going_out(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(going_out_id, user_id)
);

-- 8. Create PUSH_SUBSCRIPTIONS table
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  auth text not null,
  p256dh text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, endpoint)
);

-- 9. Create ANALYTICS_EVENTS table
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

----------------------------------------------------
-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.going_out enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.going_out_joins enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.analytics_events enable row level security;

----------------------------------------------------
-- RLS POLICIES
----------------------------------------------------

-- PROFILES
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- GOING_OUT
create policy "Going out status viewable by same tower"
  on public.going_out for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles viewer_prof
      join public.profiles status_prof on status_prof.id = going_out.user_id
      where viewer_prof.id = auth.uid()
        and viewer_prof.tower = status_prof.tower
    )
  );

create policy "Users can insert their own going_out status"
  on public.going_out for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own going_out status"
  on public.going_out for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own going_out status"
  on public.going_out for delete
  to authenticated
  using (auth.uid() = user_id);

-- EVENTS
create policy "Events viewable by authenticated users"
  on public.events for select
  to authenticated
  using (true);

create policy "Authenticated users can create events"
  on public.events for insert
  to authenticated
  with check (auth.role() = 'authenticated');

-- POSTS
create policy "Posts viewable by authenticated users"
  on public.posts for select
  to authenticated
  using (true);

create policy "Users can insert their own posts"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- CONNECTIONS
create policy "Users can view connections they are part of"
  on public.connections for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy "Users can create connection requests"
  on public.connections for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "Users can update connection status"
  on public.connections for update
  to authenticated
  using (auth.uid() = recipient_id or auth.uid() = requester_id);

-- BLOCKS
create policy "Users can view their own blocks"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy "Users can block others"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "Users can unblock"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- GOING_OUT_JOINS
create policy "Users can view join requests for their own posts"
  on public.going_out_joins for select
  to authenticated
  using (
    exists (
      select 1 from public.going_out
      where going_out.id = going_out_joins.going_out_id
        and going_out.user_id = auth.uid()
    )
    or auth.uid() = user_id
  );

create policy "Users can create join requests"
  on public.going_out_joins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Going out creator can approve/reject joins"
  on public.going_out_joins for update
  to authenticated
  using (
    exists (
      select 1 from public.going_out
      where going_out.id = going_out_joins.going_out_id
        and going_out.user_id = auth.uid()
    )
  );

-- PUSH_SUBSCRIPTIONS
create policy "Users can manage their own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ANALYTICS_EVENTS
create policy "Users can view their own analytics"
  on public.analytics_events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert analytics events"
  on public.analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id);

----------------------------------------------------
-- CONSTRAINT TRIGGER FOR JOIN CAPACITY
----------------------------------------------------
create or replace function public.enforce_going_out_capacity()
returns trigger as $$
begin
  declare
    v_capacity integer;
    v_current_joins integer;
  begin
    select capacity into v_capacity from public.going_out where id = new.going_out_id;
    select count(*) into v_current_joins from public.going_out_joins 
    where going_out_id = new.going_out_id and status = 'approved';
    
    if v_current_joins >= v_capacity then
      raise exception 'This activity is at capacity';
    end if;
    
    return new;
  end;
$$ language plpgsql;

create trigger going_out_capacity_check
  before insert on public.going_out_joins
  for each row
  execute function public.enforce_going_out_capacity();

----------------------------------------------------
-- ENFORCE @uci.edu DOMAIN ON SIGNUP
----------------------------------------------------
create or replace function public.check_email_domain()
returns trigger as $$
begin
  if split_part(new.email, '@', 2) != 'uci.edu' then
    raise exception 'Unauthorized: Only @uci.edu emails are allowed.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_uci_domain on auth.users;

create trigger enforce_uci_domain
  before insert on auth.users
  for each row
  execute function public.check_email_domain();
