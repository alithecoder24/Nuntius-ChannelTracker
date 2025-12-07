-- Nuntius Channel Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- TEAM MEMBERS TABLE
-- Controls who has access to the tool
-- ============================================
create table if not exists team_members (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  email text not null unique,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Profiles table (for organizing channels by niche)
-- visibility: 'private' = only creator sees it, 'team' = all team members see it
create table if not exists profiles (
  id uuid default uuid_generate_v4() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  name text not null,
  visibility text default 'team' check (visibility in ('private', 'team')),
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
alter table team_members enable row level security;
alter table profiles enable row level security;
alter table channels enable row level security;
alter table youtube_channels_cache enable row level security;

-- ============================================
-- TEAM MEMBERS POLICIES
-- ============================================
-- Everyone can check if they're a team member
create policy "Users can view team members"
  on team_members for select
  using (
    exists (select 1 from team_members where user_id = auth.uid())
  );

-- Only owner/admin can add team members
create policy "Admins can add team members"
  on team_members for insert
  with check (
    exists (
      select 1 from team_members 
      where user_id = auth.uid() 
      and role in ('owner', 'admin')
    )
  );

-- Only owner/admin can remove team members (but not themselves)
create policy "Admins can remove team members"
  on team_members for delete
  using (
    exists (
      select 1 from team_members 
      where user_id = auth.uid() 
      and role in ('owner', 'admin')
    )
    and user_id != auth.uid()
  );

-- ============================================
-- PROFILES POLICIES (Team + Private visibility)
-- ============================================
-- Users can view: their own private profiles OR any team profile (if they're a team member)
create policy "Users can view accessible profiles"
  on profiles for select
  using (
    -- Must be a team member first
    exists (select 1 from team_members where user_id = auth.uid())
    and (
      -- Can see their own private profiles
      (visibility = 'private' and created_by = auth.uid())
      or
      -- Can see all team profiles
      (visibility = 'team')
    )
  );

-- Team members can create profiles
create policy "Team members can create profiles"
  on profiles for insert
  with check (
    exists (select 1 from team_members where user_id = auth.uid())
    and created_by = auth.uid()
  );

-- Users can update their own profiles, admins can update any team profile
create policy "Users can update accessible profiles"
  on profiles for update
  using (
    exists (select 1 from team_members where user_id = auth.uid())
    and (
      -- Can update own profiles
      created_by = auth.uid()
      or
      -- Admins can update any team profile
      (
        visibility = 'team' 
        and exists (
          select 1 from team_members 
          where user_id = auth.uid() 
          and role in ('owner', 'admin')
        )
      )
    )
  );

-- Users can delete their own profiles
create policy "Users can delete their own profiles"
  on profiles for delete
  using (
    exists (select 1 from team_members where user_id = auth.uid())
    and created_by = auth.uid()
  );

-- ============================================
-- CHANNELS POLICIES (inherit from profile)
-- ============================================
create policy "Users can view channels in accessible profiles"
  on channels for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and exists (select 1 from team_members where user_id = auth.uid())
      and (
        (profiles.visibility = 'private' and profiles.created_by = auth.uid())
        or profiles.visibility = 'team'
      )
    )
  );

create policy "Users can create channels in accessible profiles"
  on channels for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and exists (select 1 from team_members where user_id = auth.uid())
      and (
        (profiles.visibility = 'private' and profiles.created_by = auth.uid())
        or profiles.visibility = 'team'
      )
    )
  );

create policy "Users can update channels in accessible profiles"
  on channels for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and exists (select 1 from team_members where user_id = auth.uid())
      and (
        (profiles.visibility = 'private' and profiles.created_by = auth.uid())
        or profiles.visibility = 'team'
      )
    )
  );

create policy "Users can delete channels in accessible profiles"
  on channels for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = channels.profile_id
      and exists (select 1 from team_members where user_id = auth.uid())
      and (
        (profiles.visibility = 'private' and profiles.created_by = auth.uid())
        or profiles.visibility = 'team'
      )
    )
  );

-- YouTube Cache policies: team members can read (it's shared data)
create policy "Team members can view cached YouTube data"
  on youtube_channels_cache for select
  using (
    exists (select 1 from team_members where user_id = auth.uid())
  );

-- Create indexes for better performance
create index if not exists team_members_user_id_idx on team_members(user_id);
create index if not exists team_members_email_idx on team_members(email);
create index if not exists profiles_created_by_idx on profiles(created_by);
create index if not exists profiles_visibility_idx on profiles(visibility);
create index if not exists channels_profile_id_idx on channels(profile_id);
create index if not exists youtube_cache_handle_idx on youtube_channels_cache(handle);
create index if not exists youtube_cache_custom_url_idx on youtube_channels_cache(custom_url);

-- ============================================
-- MIGRATION: Run this if you have existing data
-- ============================================

-- Add missing columns to channels table
ALTER TABLE channels ADD COLUMN IF NOT EXISTS thumbnail_url text DEFAULT '';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS video_count text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS views_28d text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS views_48h text DEFAULT '0';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tag text;

-- Add new columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'team';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by uuid;

-- Migrate: rename user_id to created_by if it exists
-- (Run this manually if you have existing profiles)
-- UPDATE profiles SET created_by = user_id WHERE created_by IS NULL;

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

-- ============================================
-- FIRST TIME SETUP: Add yourself as owner
-- Replace 'your-email@example.com' with your actual email
-- ============================================
-- INSERT INTO team_members (email, role) VALUES ('your-email@example.com', 'owner');
