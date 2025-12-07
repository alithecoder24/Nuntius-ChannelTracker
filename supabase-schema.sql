-- Nuntius Channel Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (for organizing channels by niche)
create table if not exists profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Channels table (YouTube channels being tracked by users)
create table if not exists channels (
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

-- YouTube Channels Cache (shared across ALL users to save API calls)
-- This stores the actual YouTube data fetched from the API
create table if not exists youtube_channels_cache (
  channel_id text primary key,
  handle text,
  name text not null,
  description text,
  thumbnail_url text,
  subscriber_count text default '0',
  video_count text default '0',
  view_count text default '0',
  country text,
  custom_url text,
  cached_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table profiles enable row level security;
alter table channels enable row level security;
alter table youtube_channels_cache enable row level security;

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

-- YouTube Cache policies: everyone can read (it's shared data)
-- Only service role can write (via API route)
create policy "Anyone can view cached YouTube data"
  on youtube_channels_cache for select
  using (true);

-- Create indexes for better performance
create index if not exists profiles_user_id_idx on profiles(user_id);
create index if not exists channels_profile_id_idx on channels(profile_id);
create index if not exists youtube_cache_handle_idx on youtube_channels_cache(handle);
create index if not exists youtube_cache_custom_url_idx on youtube_channels_cache(custom_url);

-- ============================================
-- MIGRATION: Add missing columns to channels table
-- Run this if you already have the channels table
-- ============================================

-- Add all missing columns
ALTER TABLE channels ADD COLUMN IF NOT EXISTS thumbnail_url text DEFAULT '';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS video_count text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS views_28d text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS views_48h text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tag text;

-- Channel Snapshots table (for tracking historical data)
CREATE TABLE IF NOT EXISTS channel_snapshots (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id text NOT NULL,
  subscriber_count bigint DEFAULT 0,
  video_count bigint DEFAULT 0,
  view_count bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster snapshot queries
CREATE INDEX IF NOT EXISTS channel_snapshots_channel_id_idx ON channel_snapshots(channel_id);
CREATE INDEX IF NOT EXISTS channel_snapshots_created_at_idx ON channel_snapshots(created_at DESC);
