'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Loader2, TrendingUp, Users, Video, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ChannelStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: {
    id: string;
    channel_id: string;
    name: string;
    thumbnail_url: string;
    subscribers: string;
    video_count: string;
  } | null;
}

interface DailyData {
  date: string;
  fullDate: string;
  views: number;
  subscribers: number;
  viewsGained: number;
  subsGained: number;
}

const timeRanges = [
  { label: '7D', days: 7 },
  { label: '28D', days: 28 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'Max', days: 9999 },
];

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChannelStatsModal({ isOpen, onClose, channel }: ChannelStatsModalProps) {
  const [timeRange, setTimeRange] = useState(28);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'views' | 'subscribers'>('views');

  useEffect(() => {
    if (isOpen && channel) {
      loadSnapshots();
    }
  }, [isOpen, channel, timeRange]);

  const loadSnapshots = async () => {
    if (!channel) return;
    setLoading(true);

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange - 1); // Get one extra day for calculating first day's diff

      const { data, error } = await supabase
        .from('channel_snapshots')
        .select('view_count, subscriber_count, created_at')
        .eq('channel_id', channel.channel_id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Calculate daily gains (difference between consecutive days)
      const processed: DailyData[] = [];
      const rawData = data || [];
      
      for (let i = 1; i < rawData.length; i++) {
        const current = rawData[i];
        const previous = rawData[i - 1];
        
        const currentViews = parseInt(current.view_count) || 0;
        const previousViews = parseInt(previous.view_count) || 0;
        const currentSubs = parseInt(current.subscriber_count) || 0;
        const previousSubs = parseInt(previous.subscriber_count) || 0;
        
        processed.push({
          date: formatDate(current.created_at),
          fullDate: current.created_at,
          views: currentViews,
          subscribers: currentSubs,
          viewsGained: Math.max(0, currentViews - previousViews), // Views gained that day
          subsGained: currentSubs - previousSubs, // Subs gained that day
        });
      }

      setDailyData(processed);
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!channel) return null;

  // Calculate totals for the period
  const totalViewsGained = dailyData.reduce((sum, d) => sum + d.viewsGained, 0);
  const totalSubsGained = dailyData.reduce((sum, d) => sum + d.subsGained, 0);
  const avgDailyViews = dailyData.length > 0 ? Math.round(totalViewsGained / dailyData.length) : 0;

  // Get chart data key based on view mode
  const chartDataKey = viewMode === 'views' ? 'viewsGained' : 'subsGained';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Channel Analytics" size="large">
      <div className="space-y-6">
        {/* Channel Header */}
        <div className="flex items-center gap-4">
          {channel.thumbnail_url ? (
            <img src={channel.thumbnail_url} alt={channel.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center">
              <span className="text-white text-xl font-bold">{channel.name.charAt(0)}</span>
            </div>
          )}
          <div>
            <h3 className="font-bold text-lg text-[#f8fafc]">{channel.name}</h3>
            <div className="flex items-center gap-4 text-sm text-[#a1a1aa]">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {channel.subscribers}
              </span>
              <span className="flex items-center gap-1">
                <Video className="w-4 h-4" />
                {channel.video_count}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Summary - Shows GAINED in period */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-panel rounded-xl p-4">
            <div className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">
              Views Gained ({timeRanges.find(t => t.days === timeRange)?.label})
            </div>
            <div className="text-xl font-bold text-[#86efac]">
              +{formatNumber(totalViewsGained)}
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">
              Subs Gained ({timeRanges.find(t => t.days === timeRange)?.label})
            </div>
            <div className={`text-xl font-bold ${totalSubsGained >= 0 ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>
              {totalSubsGained >= 0 ? '+' : ''}{formatNumber(totalSubsGained)}
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">
              Avg Daily Views
            </div>
            <div className="text-xl font-bold text-[#c084fc]">
              {formatNumber(avgDailyViews)}
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('views')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'views'
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[rgba(168,85,247,0.1)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.2)]'
              }`}
            >
              <Eye className="w-4 h-4" />
              Daily Views
            </button>
            <button
              onClick={() => setViewMode('subscribers')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'subscribers'
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[rgba(168,85,247,0.1)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.2)]'
              }`}
            >
              <Users className="w-4 h-4" />
              Daily Subs
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-1">
            {timeRanges.map((range) => (
              <button
                key={range.days}
                onClick={() => setTimeRange(range.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  timeRange === range.days
                    ? 'bg-[#a855f7] text-white'
                    : 'bg-[rgba(168,85,247,0.1)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.2)]'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart - Bar chart for daily gains */}
        <div className="glass-panel rounded-xl p-4 h-[280px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#a855f7] animate-spin" />
            </div>
          ) : dailyData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <defs>
                  <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.4}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickFormatter={(value) => formatNumber(value)}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(20, 16, 32, 0.98)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value: number) => [
                    `+${formatNumber(value)}`, 
                    viewMode === 'views' ? 'Views Gained' : 'Subs Gained'
                  ]}
                />
                <Bar
                  dataKey={chartDataKey}
                  fill="url(#colorBar)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-[#71717a]">
              <div className="text-4xl mb-3 opacity-30">📊</div>
              <p className="text-sm">Need at least 2 days of data</p>
              <p className="text-xs mt-1">Daily tracking shows views gained each day</p>
            </div>
          )}
        </div>

        <p className="text-xs text-[#71717a] text-center">
          📈 Shows views/subs <span className="text-[#c084fc]">gained per day</span> • Updates daily at midnight (German time)
        </p>
      </div>
    </Modal>
  );
}
