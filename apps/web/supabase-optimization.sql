-- ============================================
-- DISK IO OPTIMIZATION SCRIPT
-- Run this in your Supabase SQL Editor immediately
-- ============================================

-- 1. CREATE FAST AUTH CHECK FUNCTION
-- This replaces expensive RLS subqueries with a single function call
CREATE OR REPLACE FUNCTION auth.is_team_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE user_id = auth.uid()
  );
$$;

-- Cache the result for the duration of the transaction
CREATE OR REPLACE FUNCTION auth.get_team_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.team_members 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. DROP OLD EXPENSIVE RLS POLICIES
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Admins can add team members" ON team_members;
DROP POLICY IF EXISTS "Admins can remove team members" ON team_members;
DROP POLICY IF EXISTS "Users can view accessible profiles" ON profiles;
DROP POLICY IF EXISTS "Team members can create profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update accessible profiles" ON profiles;
DROP POLICY IF EXISTS "Users can delete their own profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view channels in accessible profiles" ON channels;
DROP POLICY IF EXISTS "Users can create channels in accessible profiles" ON channels;
DROP POLICY IF EXISTS "Users can update channels in accessible profiles" ON channels;
DROP POLICY IF EXISTS "Users can delete channels in accessible profiles" ON channels;
DROP POLICY IF EXISTS "Team members can view cached YouTube data" ON youtube_channels_cache;

-- 3. CREATE OPTIMIZED RLS POLICIES (using the fast function)

-- Team Members policies
CREATE POLICY "team_members_select" ON team_members FOR SELECT
  USING (auth.is_team_member());

CREATE POLICY "team_members_insert" ON team_members FOR INSERT
  WITH CHECK (auth.get_team_role() IN ('owner', 'admin'));

CREATE POLICY "team_members_delete" ON team_members FOR DELETE
  USING (auth.get_team_role() IN ('owner', 'admin') AND user_id != auth.uid());

-- Profiles policies (simplified)
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (
    auth.is_team_member() AND (
      (visibility = 'private' AND created_by = auth.uid())
      OR visibility = 'team'
    )
  );

CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (auth.is_team_member() AND created_by = auth.uid());

CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (
    auth.is_team_member() AND (
      created_by = auth.uid()
      OR (visibility = 'team' AND auth.get_team_role() IN ('owner', 'admin'))
    )
  );

CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  USING (auth.is_team_member() AND created_by = auth.uid());

-- Channels policies (use JOIN instead of subquery for profile check)
CREATE POLICY "channels_select" ON channels FOR SELECT
  USING (
    auth.is_team_member() AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = channels.profile_id
      AND ((p.visibility = 'private' AND p.created_by = auth.uid()) OR p.visibility = 'team')
    )
  );

CREATE POLICY "channels_insert" ON channels FOR INSERT
  WITH CHECK (
    auth.is_team_member() AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = channels.profile_id
      AND ((p.visibility = 'private' AND p.created_by = auth.uid()) OR p.visibility = 'team')
    )
  );

CREATE POLICY "channels_update" ON channels FOR UPDATE
  USING (
    auth.is_team_member() AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = channels.profile_id
      AND ((p.visibility = 'private' AND p.created_by = auth.uid()) OR p.visibility = 'team')
    )
  );

CREATE POLICY "channels_delete" ON channels FOR DELETE
  USING (
    auth.is_team_member() AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = channels.profile_id
      AND ((p.visibility = 'private' AND p.created_by = auth.uid()) OR p.visibility = 'team')
    )
  );

-- YouTube cache - simple policy
CREATE POLICY "youtube_cache_select" ON youtube_channels_cache FOR SELECT
  USING (auth.is_team_member());

-- 4. ADD CRITICAL COMPOSITE INDEXES FOR SNAPSHOT QUERIES
-- These dramatically speed up the views calculation

-- Composite index for snapshot lookups (most important!)
DROP INDEX IF EXISTS channel_snapshots_lookup_idx;
CREATE INDEX channel_snapshots_lookup_idx 
  ON channel_snapshots(channel_id, created_at DESC);

-- Index for faster profile visibility checks  
DROP INDEX IF EXISTS profiles_visibility_created_by_idx;
CREATE INDEX profiles_visibility_created_by_idx 
  ON profiles(visibility, created_by);

-- Composite index for channels by profile
DROP INDEX IF EXISTS channels_profile_channel_idx;
CREATE INDEX channels_profile_channel_idx 
  ON channels(profile_id, channel_id);

-- 5. CLEANUP OLD SNAPSHOTS (Keep only last 30 days to reduce IO)
-- This deletes old data that's causing excessive disk reads
DELETE FROM channel_snapshots 
WHERE created_at < NOW() - INTERVAL '30 days';

-- 6. ADD INDEX ON VIDEO_JOBS for faster polling
DROP INDEX IF EXISTS video_jobs_pending_idx;
CREATE INDEX video_jobs_pending_idx 
  ON video_jobs(status, created_at) 
  WHERE status IN ('pending', 'processing');

-- 7. ANALYZE TABLES to update query planner statistics
ANALYZE team_members;
ANALYZE profiles;
ANALYZE channels;
ANALYZE channel_snapshots;
ANALYZE youtube_channels_cache;
ANALYZE video_jobs;

-- 8. CREATE WORKER_HEARTBEATS TABLE (for job pollers)
-- This table tracks worker status (imessage-generator, pravus-generator, etc.)
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_type text PRIMARY KEY,
  status text NOT NULL DEFAULT 'online',
  last_heartbeat timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable RLS on worker_heartbeats to allow workers (using anon key) to insert/update
-- Workers are not authenticated users, so they need direct access
ALTER TABLE worker_heartbeats DISABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS worker_heartbeats_status_idx ON worker_heartbeats(status);
CREATE INDEX IF NOT EXISTS worker_heartbeats_last_heartbeat_idx ON worker_heartbeats(last_heartbeat DESC);

-- Done! Your queries should now be much faster.

