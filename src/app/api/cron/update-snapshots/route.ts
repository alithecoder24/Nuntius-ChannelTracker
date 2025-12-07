import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const youtubeApiKey = process.env.YOUTUBE_API_KEY!;
const cronSecret = process.env.CRON_SECRET; // Optional security

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Fetch channel stats from YouTube API
async function fetchChannelStats(channelId: string) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${youtubeApiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  
  if (data.error || !data.items || data.items.length === 0) {
    return null;
  }
  
  const stats = data.items[0].statistics;
  return {
    subscriber_count: stats.subscriberCount || '0',
    video_count: stats.videoCount || '0',
    view_count: stats.viewCount || '0',
  };
}

// Save snapshot to database
async function saveSnapshot(channelId: string, stats: { subscriber_count: string; video_count: string; view_count: string }) {
  const { error } = await supabase
    .from('channel_snapshots')
    .insert({
      channel_id: channelId,
      subscriber_count: stats.subscriber_count,
      video_count: stats.video_count,
      view_count: stats.view_count,
    });
  
  return !error;
}

// Update cache with fresh data
async function updateCache(channelId: string, stats: { subscriber_count: string; video_count: string; view_count: string }) {
  await supabase
    .from('youtube_channels_cache')
    .update({
      subscriber_count: stats.subscriber_count,
      video_count: stats.video_count,
      view_count: stats.view_count,
      cached_at: new Date().toISOString(),
    })
    .eq('channel_id', channelId);
}

export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all unique channel IDs from user's tracked channels
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('channel_id')
      .not('channel_id', 'is', null);

    if (channelsError) {
      throw new Error('Failed to fetch channels: ' + channelsError.message);
    }

    // Get unique channel IDs
    const uniqueChannelIds = [...new Set(channels?.map(c => c.channel_id) || [])];
    
    console.log(`[CRON] Starting daily snapshot for ${uniqueChannelIds.length} channels`);

    let successCount = 0;
    let errorCount = 0;

    // Process each channel
    for (const channelId of uniqueChannelIds) {
      try {
        const stats = await fetchChannelStats(channelId);
        
        if (stats) {
          await saveSnapshot(channelId, stats);
          await updateCache(channelId, stats);
          successCount++;
          console.log(`[CRON] ✅ Snapshot saved for ${channelId}`);
        } else {
          errorCount++;
          console.log(`[CRON] ❌ Failed to fetch ${channelId}`);
        }

        // Small delay to avoid rate limiting (YouTube allows 10,000 units/day)
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        errorCount++;
        console.error(`[CRON] Error processing ${channelId}:`, e);
      }
    }

    const summary = {
      message: 'Daily snapshot complete',
      timestamp: new Date().toISOString(),
      total_channels: uniqueChannelIds.length,
      success: successCount,
      errors: errorCount,
    };

    console.log('[CRON] Summary:', summary);

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[CRON] Fatal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

