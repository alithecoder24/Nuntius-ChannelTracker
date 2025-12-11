import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// TYPES
// ============================================

export interface TeamMember {
  id: string;
  user_id: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  invited_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  created_by: string;
  name: string;
  visibility: 'private' | 'team';
  created_at: string;
}

export interface Channel {
  id: string;
  profile_id: string;
  channel_id: string;
  name: string;
  thumbnail_url: string;
  subscribers: string;
  video_count: string;
  views_28d: string;
  views_48h: string;
  language: string;
  tag: string | null;
  created_at: string;
}

// ============================================
// TEAM MEMBER FUNCTIONS
// ============================================

export async function checkTeamMembership(userId: string): Promise<TeamMember | null> {
  // TEMPORARY: Allow ALL logged-in users as owners
  // Just return a fake owner object - no database calls
  if (userId) {
    return {
      id: 'temp-' + userId,
      user_id: userId,
      email: 'owner@temp.com',
      role: 'owner',
      invited_by: null,
      created_at: new Date().toISOString()
    } as TeamMember;
  }
  return null;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data as TeamMember[];
}

export async function inviteTeamMember(email: string, role: 'admin' | 'member', invitedBy: string): Promise<TeamMember> {
  const { data, error } = await supabase
    .from('team_members')
    .insert({ email: email.toLowerCase(), role, invited_by: invitedBy })
    .select()
    .single();
  
  if (error) throw error;
  return data as TeamMember;
}

export async function removeTeamMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId);
  
  if (error) throw error;
}

export async function updateTeamMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('id', memberId);
  
  if (error) throw error;
}

export async function linkUserToTeamMember(userId: string, email: string): Promise<void> {
  // When a user signs up, link them to their team_members record if it exists
  const { error } = await supabase
    .from('team_members')
    .update({ user_id: userId })
    .eq('email', email.toLowerCase());
  
  if (error) throw error;
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

export async function getProfiles(userId: string) {
  // RLS handles visibility - just fetch all accessible profiles
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data as Profile[];
}

export async function createProfile(userId: string, name: string, visibility: 'private' | 'team' = 'team') {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ created_by: userId, name, visibility })
    .select()
    .single();
  
  if (error) throw error;
  return data as Profile;
}

export async function deleteProfile(profileId: string) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', profileId);
  
  if (error) throw error;
}

export async function renameProfile(profileId: string, newName: string) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ name: newName })
    .eq('id', profileId)
    .select()
    .single();
  
  if (error) throw error;
  return data as Profile;
}

export async function updateProfileVisibility(profileId: string, visibility: 'private' | 'team') {
  const { data, error } = await supabase
    .from('profiles')
    .update({ visibility })
    .eq('id', profileId)
    .select()
    .single();
  
  if (error) throw error;
  return data as Profile;
}

export async function getChannels(profileId: string) {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Channel[];
}

export async function addChannel(profileId: string, channel: {
  channel_id: string;
  name: string;
  thumbnail_url?: string;
  subscribers: string;
  video_count?: string;
  views_28d: string;
  views_48h: string;
  language: string;
  tag?: string | null;
}) {
  const { data, error } = await supabase
    .from('channels')
    .insert({ 
      profile_id: profileId,
      channel_id: channel.channel_id,
      name: channel.name,
      thumbnail_url: channel.thumbnail_url || '',
      subscribers: channel.subscribers,
      video_count: channel.video_count || '0',
      views_28d: channel.views_28d,
      views_48h: channel.views_48h,
      language: channel.language,
      tag: channel.tag || null,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as Channel;
}

export async function removeChannel(channelId: string) {
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);
  
  if (error) throw error;
}

export async function updateChannelTag(channelId: string, tag: string | null) {
  const { error } = await supabase
    .from('channels')
    .update({ tag })
    .eq('id', channelId);
  
  if (error) throw error;
}

export async function getTags(): Promise<string[]> {
  // Get all unique tags from accessible channels (RLS handles permissions)
  const { data: channels, error: channelError } = await supabase
    .from('channels')
    .select('tag')
    .not('tag', 'is', null);
  
  if (channelError) throw channelError;
  
  // Get unique tags
  const allTags = (channels || []).map(c => c.tag).filter(Boolean) as string[];
  const uniqueTags = Array.from(new Set(allTags));
  return uniqueTags;
}

export async function deleteTagFromAllChannels(tagToDelete: string): Promise<void> {
  // Get all accessible profiles (RLS handles permissions)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id');
  
  if (profileError) throw profileError;
  if (!profiles || profiles.length === 0) return;
  
  const profileIds = profiles.map(p => p.id);
  
  // Set tag to null for all channels with this tag
  const { error } = await supabase
    .from('channels')
    .update({ tag: null })
    .in('profile_id', profileIds)
    .eq('tag', tagToDelete);
  
  if (error) throw error;
}

// ============================================
// VIDEO JOBS FUNCTIONS
// ============================================

export interface VideoJob {
  id: string;
  user_id: string;
  tool_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input_data: {
    project_name: string;
    script?: string;
    dark_mode?: boolean;
    language?: string;
    people?: { id: string; name: string; voice: string; image?: string | null }[];
    // Pravus-specific fields
    profile_image?: string;
    video_count?: number;
  };
  output_url: string | null;
  error_message: string | null;
  status_message: string | null; // Granular status like "Generating audio...", "Rendering video..."
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function createVideoJob(userId: string, inputData: Record<string, unknown>): Promise<VideoJob> {
  const toolType = (inputData.tool_type as string) || 'imessage-generator';
  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      user_id: userId,
      tool_type: toolType,
      status: 'pending',
      input_data: inputData,
      progress: 0,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as VideoJob;
}

export async function getVideoJobs(userId: string): Promise<VideoJob[]> {
  const { data, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return data as VideoJob[];
}

export async function deleteVideoJob(jobId: string): Promise<void> {
  // Note: R2 file deletion happens via lifecycle rules (24h auto-delete)
  // or could be handled by a separate cleanup worker
  const { error } = await supabase
    .from('video_jobs')
    .delete()
    .eq('id', jobId);
  
  if (error) throw error;
}

export async function subscribeToVideoJobs(userId: string, callback: (job: VideoJob) => void) {
  return supabase
    .channel('video_jobs_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'video_jobs',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new as VideoJob);
      }
    )
    .subscribe();
}

// ============================================
// WORKER HEARTBEAT FUNCTIONS
// ============================================

export interface WorkerHeartbeat {
  id: string;
  worker_type: string;
  last_heartbeat: string;
  status: 'online' | 'busy' | 'offline';
}

export async function getWorkerStatus(workerType: string = 'imessage-generator'): Promise<WorkerHeartbeat | null> {
  const { data, error } = await supabase
    .from('worker_heartbeats')
    .select('*')
    .eq('worker_type', workerType)
    .single();
  
  if (error) return null;
  return data as WorkerHeartbeat;
}

export async function subscribeToWorkerStatus(workerType: string, callback: (heartbeat: WorkerHeartbeat | null) => void) {
  // Initial fetch
  const initial = await getWorkerStatus(workerType);
  callback(initial);
  
  // Subscribe to changes
  return supabase
    .channel('worker_heartbeat_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'worker_heartbeats',
        filter: `worker_type=eq.${workerType}`,
      },
      (payload) => {
        callback(payload.new as WorkerHeartbeat);
      }
    )
    .subscribe();
}
