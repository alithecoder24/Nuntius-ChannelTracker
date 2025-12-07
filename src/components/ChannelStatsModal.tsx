'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
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

interface Snapshot {
  date: string;
  views: number;
  subscribers: number;
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
  return num.toString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChannelStatsModal({ isOpen, onClose, channel }: ChannelStatsModalProps) {
  const [timeRange, setTimeRange] = useState(28);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
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
      startDate.setDate(startDate.getDate() - timeRange);

      const { data, error } = await supabase
        .from('channel_snapshots')
        .select('view_count, subscriber_count, created_at')
        .eq('channel_id', channel.channel_id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedData = (data || []).map(s => ({
        date: formatDate(s.created_at),
        views: parseInt(s.view_count) || 0,
        subscribers: parseInt(s.subscriber_count) || 0,
      }));

      setSnapshots(formattedData);
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!channel) return null;

  // Calculate growth
  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];
  const viewsGrowth = firstSnapshot && lastSnapshot ? lastSnapshot.views - firstSnapshot.views : 0;
  const subsGrowth = firstSnapshot && lastSnapshot ? lastSnapshot.subscribers - firstSnapshot.subscribers : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Channel Analytics">
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

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-panel rounded-xl p-4">
            <div className="text-xs text-[#71717a] uppercase mb-1">Views ({timeRanges.find(t => t.days === timeRange)?.label})</div>
            <div className="text-2xl font-bold text-[#c084fc]">
              {lastSnapshot ? formatNumber(lastSnapshot.views) : '-'}
            </div>
            {viewsGrowth !== 0 && (
              <div className={`text-sm flex items-center gap-1 ${viewsGrowth > 0 ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>
                <TrendingUp className="w-3 h-3" />
                {viewsGrowth > 0 ? '+' : ''}{formatNumber(viewsGrowth)}
              </div>
            )}
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-xs text-[#71717a] uppercase mb-1">Subs ({timeRanges.find(t => t.days === timeRange)?.label})</div>
            <div className="text-2xl font-bold text-[#c084fc]">
              {lastSnapshot ? formatNumber(lastSnapshot.subscribers) : '-'}
            </div>
            {subsGrowth !== 0 && (
              <div className={`text-sm flex items-center gap-1 ${subsGrowth > 0 ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>
                <TrendingUp className="w-3 h-3" />
                {subsGrowth > 0 ? '+' : ''}{formatNumber(subsGrowth)}
              </div>
            )}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('views')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'views'
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[rgba(168,85,247,0.1)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.2)]'
              }`}
            >
              <Eye className="w-4 h-4 inline mr-1" />
              Views
            </button>
            <button
              onClick={() => setViewMode('subscribers')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'subscribers'
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[rgba(168,85,247,0.1)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.2)]'
              }`}
            >
              <Users className="w-4 h-4 inline mr-1" />
              Subscribers
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

        {/* Chart */}
        <div className="glass-panel rounded-xl p-4 h-[300px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#a855f7] animate-spin" />
            </div>
          ) : snapshots.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  tickFormatter={(value) => formatNumber(value)}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(20, 16, 32, 0.95)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
                  formatter={(value: number) => [formatNumber(value), viewMode === 'views' ? 'Views' : 'Subscribers']}
                />
                <Area
                  type="monotone"
                  dataKey={viewMode}
                  stroke="#a855f7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViews)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-[#71717a]">
              <div className="text-4xl mb-3 opacity-30">📊</div>
              <p className="text-sm">No data yet</p>
              <p className="text-xs mt-1">Snapshots will appear after daily updates</p>
            </div>
          )}
        </div>

        <p className="text-xs text-[#71717a] text-center">
          Data updates daily at midnight (German time)
        </p>
      </div>
    </Modal>
  );
}

