import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const youtubeApiKey = process.env.YOUTUBE_API_KEY!;

// Use service role for server-side operations (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache duration in hours
const CACHE_DURATION_HOURS = 24;

interface YouTubeChannelData {
  channel_id: string;
  handle: string | null;
  name: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: string;
  video_count: string;
  view_count: string;
  country: string | null;
  custom_url: string | null;
  cached_at: string;
}

// Format subscriber count (e.g., 1500000 -> "1.5M")
function formatCount(count: string): string {
  const num = parseInt(count);
  if (isNaN(num)) return '0';
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

// Check if cache is still valid
function isCacheValid(cachedAt: string): boolean {
  const cacheTime = new Date(cachedAt).getTime();
  const now = Date.now();
  const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);
  return hoursDiff < CACHE_DURATION_HOURS;
}

// Fetch channel data from YouTube API
async function fetchFromYouTube(identifier: string): Promise<YouTubeChannelData | null> {
  if (!youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  let channelId = identifier;
  
  // If it's a handle (@username), we need to search for it first
  if (identifier.startsWith('@')) {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(identifier)}&key=${youtubeApiKey}`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    
    if (searchData.error) {
      throw new Error(searchData.error.message || 'YouTube API error');
    }
    
    if (!searchData.items || searchData.items.length === 0) {
      return null;
    }
    
    channelId = searchData.items[0].snippet.channelId;
  }
  
  // Fetch channel details
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${youtubeApiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'YouTube API error');
  }
  
  if (!data.items || data.items.length === 0) {
    // Try searching by username/custom URL
    const forUsernameUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&forHandle=${identifier.replace('@', '')}&key=${youtubeApiKey}`;
    const forUsernameResp = await fetch(forUsernameUrl);
    const forUsernameData = await forUsernameResp.json();
    
    if (forUsernameData.items && forUsernameData.items.length > 0) {
      const item = forUsernameData.items[0];
      return {
        channel_id: item.id,
        handle: identifier.startsWith('@') ? identifier : null,
        name: item.snippet.title,
        description: item.snippet.description?.slice(0, 500) || '',
        thumbnail_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
        subscriber_count: item.statistics.subscriberCount || '0',
        video_count: item.statistics.videoCount || '0',
        view_count: item.statistics.viewCount || '0',
        country: item.snippet.country || null,
        custom_url: item.snippet.customUrl || null,
        cached_at: new Date().toISOString(),
      };
    }
    
    return null;
  }
  
  const item = data.items[0];
  return {
    channel_id: item.id,
    handle: item.snippet.customUrl || null,
    name: item.snippet.title,
    description: item.snippet.description?.slice(0, 500) || '',
    thumbnail_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
    subscriber_count: item.statistics.subscriberCount || '0',
    video_count: item.statistics.videoCount || '0',
    view_count: item.statistics.viewCount || '0',
    country: item.snippet.country || null,
    custom_url: item.snippet.customUrl || null,
    cached_at: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('id');
    
    if (!identifier) {
      return NextResponse.json({ error: 'Missing channel identifier' }, { status: 400 });
    }

    // Check cache first
    const { data: cached } = await supabase
      .from('youtube_channels_cache')
      .select('*')
      .or(`channel_id.eq.${identifier},handle.eq.${identifier},custom_url.eq.${identifier}`)
      .single();

    if (cached && isCacheValid(cached.cached_at)) {
      return NextResponse.json({
        ...cached,
        subscriber_count_formatted: formatCount(cached.subscriber_count),
        video_count_formatted: formatCount(cached.video_count),
        view_count_formatted: formatCount(cached.view_count),
        from_cache: true,
      });
    }

    // Fetch from YouTube API
    const channelData = await fetchFromYouTube(identifier);
    
    if (!channelData) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Save to cache (upsert)
    const { error: upsertError } = await supabase
      .from('youtube_channels_cache')
      .upsert({
        channel_id: channelData.channel_id,
        handle: channelData.handle,
        name: channelData.name,
        description: channelData.description,
        thumbnail_url: channelData.thumbnail_url,
        subscriber_count: channelData.subscriber_count,
        video_count: channelData.video_count,
        view_count: channelData.view_count,
        country: channelData.country,
        custom_url: channelData.custom_url,
        cached_at: channelData.cached_at,
      }, {
        onConflict: 'channel_id',
      });

    if (upsertError) {
      console.error('Cache upsert error:', upsertError);
    }

    return NextResponse.json({
      ...channelData,
      subscriber_count_formatted: formatCount(channelData.subscriber_count),
      video_count_formatted: formatCount(channelData.video_count),
      view_count_formatted: formatCount(channelData.view_count),
      from_cache: false,
    });
  } catch (error: any) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch channel' }, { status: 500 });
  }
}

