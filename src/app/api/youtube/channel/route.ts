import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const youtubeApiKey = process.env.YOUTUBE_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CACHE_DURATION_HOURS = 12; // Refresh cache every 12 hours

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

function formatGrowth(growth: number): string {
  if (growth >= 1000000) {
    return (growth / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (growth >= 1000) {
    return (growth / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return growth.toString();
}

function isCacheValid(cachedAt: string): boolean {
  const cacheTime = new Date(cachedAt).getTime();
  const now = Date.now();
  const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);
  return hoursDiff < CACHE_DURATION_HOURS;
}

async function fetchFromYouTube(identifier: string): Promise<YouTubeChannelData | null> {
  if (!youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  let channelId = identifier;
  
  // If it's a handle, search for it first
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

// Save a snapshot of channel stats for tracking growth
async function saveSnapshot(channelId: string, subscriberCount: string, videoCount: string, viewCount: string) {
  try {
    await supabase
      .from('channel_snapshots')
      .insert({
        channel_id: channelId,
        subscriber_count: subscriberCount,
        video_count: videoCount,
        view_count: viewCount,
      });
  } catch (e) {
    console.error('Error saving snapshot:', e);
  }
}

// Calculate growth by comparing current stats with historical snapshots
async function calculateGrowth(channelId: string, currentSubs: string) {
  const now = new Date();
  const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const days28Ago = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Get snapshot from ~48 hours ago
  const { data: snapshot48h } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count')
    .eq('channel_id', channelId)
    .lte('created_at', hours48Ago.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Get snapshot from ~28 days ago
  const { data: snapshot28d } = await supabase
    .from('channel_snapshots')
    .select('subscriber_count')
    .eq('channel_id', channelId)
    .lte('created_at', days28Ago.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const currentSubsNum = parseInt(currentSubs) || 0;
  
  let growth48h = 0;
  let growth28d = 0;

  if (snapshot48h) {
    const oldSubs = parseInt(snapshot48h.subscriber_count) || 0;
    growth48h = currentSubsNum - oldSubs;
  }

  if (snapshot28d) {
    const oldSubs = parseInt(snapshot28d.subscriber_count) || 0;
    growth28d = currentSubsNum - oldSubs;
  }

  return {
    growth_48h: growth48h,
    growth_28d: growth28d,
    growth_48h_formatted: formatGrowth(Math.max(0, growth48h)),
    growth_28d_formatted: formatGrowth(Math.max(0, growth28d)),
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

    let channelData: YouTubeChannelData | null = null;
    let fromCache = false;

    if (cached && isCacheValid(cached.cached_at)) {
      channelData = cached as YouTubeChannelData;
      fromCache = true;
    } else {
      // Fetch from YouTube API
      channelData = await fetchFromYouTube(identifier);
      
      if (!channelData) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
      }

      // Save to cache
      await supabase
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

      // Save snapshot for growth tracking
      await saveSnapshot(
        channelData.channel_id,
        channelData.subscriber_count,
        channelData.video_count,
        channelData.view_count
      );
    }

    // Calculate growth stats
    const growth = await calculateGrowth(channelData.channel_id, channelData.subscriber_count);

    return NextResponse.json({
      ...channelData,
      subscriber_count_formatted: formatCount(channelData.subscriber_count),
      video_count_formatted: formatCount(channelData.video_count),
      view_count_formatted: formatCount(channelData.view_count),
      growth_48h: growth.growth_48h_formatted,
      growth_28d: growth.growth_28d_formatted,
      from_cache: fromCache,
    });
  } catch (error: any) {
    console.error('YouTube API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch channel' }, { status: 500 });
  }
}
