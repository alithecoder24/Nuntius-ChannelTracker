import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Profile {
  id: string;
  user_id: string;
  name: string;
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

export async function getProfiles(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data as Profile[];
}

export async function createProfile(userId: string, name: string) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, name })
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

export async function getTags(userId: string): Promise<string[]> {
  // Get all unique tags from user's channels across all profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId);
  
  if (profileError) throw profileError;
  
  if (!profiles || profiles.length === 0) return [];
  
  const profileIds = profiles.map(p => p.id);
  
  const { data: channels, error: channelError } = await supabase
    .from('channels')
    .select('tag')
    .in('profile_id', profileIds)
    .not('tag', 'is', null);
  
  if (channelError) throw channelError;
  
  // Get unique tags
  const allTags = (channels || []).map(c => c.tag).filter(Boolean) as string[];
  const uniqueTags = Array.from(new Set(allTags));
  return uniqueTags;
}
