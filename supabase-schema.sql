-- Nuntius Channel Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (for organizing channels by niche)
create table profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Channels table (YouTube channels being tracked)
create table channels (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references profiles(id) on delete cascade not null,
  channel_id text not null,
  name text not null,
  subscribers text default '0',
  subs_growth_28d text default '0',
  subs_growth_48h text default '0',
  language text default 'English',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table profiles enable row level security;
alter table channels enable row level security;

-- Profiles policies: users can only see/edit their own profiles
create policy "Users can view their own profiles"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can create their own profiles"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profiles"
  on profiles for update
  using (auth.uid() = user_id);

create policy "Users can delete their own profiles"
  on profiles for delete
  using (auth.uid() = user_id);

-- Channels policies: users can only see/edit channels in their profiles
create policy "Users can view channels in their profiles"
  on channels for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can create channels in their profiles"
  on channels for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can update channels in their profiles"
  on channels for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can delete channels in their profiles"
  on channels for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and profiles.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
create index profiles_user_id_idx on profiles(user_id);
create index channels_profile_id_idx on channels(profile_id);

