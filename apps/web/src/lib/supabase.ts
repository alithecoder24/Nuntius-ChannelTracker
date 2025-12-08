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
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) return null;
  return data as TeamMember;
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
    script: string;
    dark_mode: boolean;
    language: string;
    people: { id: string; name: string; voice: string }[];
  };
  output_url: string | null;
  error_message: string | null;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function createVideoJob(userId: string, inputData: VideoJob['input_data']): Promise<VideoJob> {
  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      user_id: userId,
      tool_type: 'imessage-generator',
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
