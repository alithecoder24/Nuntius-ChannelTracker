-- ============================================
-- VIDEO JOBS TABLE
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS video_jobs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tool_type text NOT NULL DEFAULT 'imessage-generator',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  input_data jsonb NOT NULL,
  output_url text,
  error_message text,
  progress integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS video_jobs_user_id_idx ON video_jobs(user_id);
CREATE INDEX IF NOT EXISTS video_jobs_status_idx ON video_jobs(status);
CREATE INDEX IF NOT EXISTS video_jobs_created_at_idx ON video_jobs(created_at DESC);

-- Disable RLS for simplicity (like other tables in your project)
ALTER TABLE video_jobs DISABLE ROW LEVEL SECURITY;

-- Enable realtime for this table (for live updates in the UI)
ALTER PUBLICATION supabase_realtime ADD TABLE video_jobs;

