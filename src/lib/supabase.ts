import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
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
  subscribers: string;
  subs_growth_28d: string;
  subs_growth_48h: string;
  language: string;
  created_at: string;
}

// Profile functions
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

// Channel functions
export async function getChannels(profileId: string) {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Channel[];
}

export async function addChannel(profileId: string, channel: Omit<Channel, 'id' | 'profile_id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('channels')
    .insert({ profile_id: profileId, ...channel })
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

