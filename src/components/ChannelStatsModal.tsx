'use client';

import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, Users, Video, Eye, Tag, Check, X } from 'lucide-react';
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
    tag?: string | null;
  } | null;
  userTags?: string[];
  onUpdateTag?: (channelId: string, tag: string | null) => void;
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

export default function ChannelStatsModal({ isOpen, onClose, channel, userTags = [], onUpdateTag }: ChannelStatsModalProps) {
  const [timeRange, setTimeRange] = useState(28);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'views' | 'subscribers'>('views');
  const [editingTag, setEditingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && channel) {
      loadSnapshots();
      setTagInput(channel.tag || '');
    }
  }, [isOpen, channel, timeRange]);

  useEffect(() => {
    if (editingTag && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [editingTag]);

  const loadSnapshots = async () => {
    if (!channel) return;
    setLoading(true);

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange - 1);

      const { data, error } = await supabase
        .from('channel_snapshots')
        .select('view_count, subscriber_count, created_at')
        .eq('channel_id', channel.channel_id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      const processed: DailyData[] = [];
      const rawData = data || [];
      
      for (let i = 1; i < rawData.length; i++) {
        const current = rawData[i];
        const previous = rawData[i - 1];
        
        const currentViews = parseInt(current.view_count) || 0;
        const previousViews = parseInt(previous.view_count) || 0;
        const currentSubs = parseInt(current.subscriber_count) || 0;
        const previousSubs = parseInt(previous.subscriber_count) || 0;
        
        // Use the PREVIOUS snapshot's date since that's when the views were generated
        // (the current snapshot just records the accumulated total)
        processed.push({
          date: formatDate(previous.created_at),
          fullDate: previous.created_at,
          views: currentViews,
          subscribers: currentSubs,
          viewsGained: Math.max(0, currentViews - previousViews),
          subsGained: currentSubs - previousSubs,
        });
      }

      setDailyData(processed);
    } catch (err) {
      console.error('Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTag = () => {
    if (channel && onUpdateTag) {
      onUpdateTag(channel.id, tagInput.trim() || null);
    }
    setEditingTag(false);
  };

  const handleRemoveTag = () => {
    if (channel && onUpdateTag) {
      onUpdateTag(channel.id, null);
      setTagInput('');
    }
    setEditingTag(false);
  };

  if (!channel) return null;

  const totalViewsGained = dailyData.reduce((sum, d) => sum + d.viewsGained, 0);
  const totalSubsGained = dailyData.reduce((sum, d) => sum + d.subsGained, 0);
  const avgDailyViews = dailyData.length > 0 ? Math.round(totalViewsGained / dailyData.length) : 0;
  const chartDataKey = viewMode === 'views' ? 'viewsGained' : 'subsGained';

  const filteredTags = userTags.filter(t => 
    t.toLowerCase().includes(tagInput.toLowerCase()) && t.toLowerCase() !== tagInput.toLowerCase()
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Channel Analytics" size="large">
      <div className="space-y-6">
        {/* Channel Header with Tag */}
        <div className="flex items-start justify-between gap-4">
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

          {/* Tag Section */}
          <div className="relative">
            {editingTag ? (
              <div className="flex items-center gap-1 bg-[rgba(20,16,32,0.98)] rounded-lg border border-[rgba(168,85,247,0.3)] p-1">
                <Tag className="w-4 h-4 text-[#71717a] ml-2" />
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onFocus={() => setShowTagSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTag();
                    if (e.key === 'Escape') {
                      setEditingTag(false);
                      setTagInput(channel.tag || '');
                    }
                  }}
                  placeholder="Add tag..."
                  className="w-28 px-2 py-1 text-sm bg-transparent text-[#f8fafc] focus:outline-none placeholder:text-[#71717a]"
                />
                <button
                  onClick={handleSaveTag}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(168,85,247,0.2)] text-[#86efac]"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingTag(false);
                    setTagInput(channel.tag || '');
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(239,68,68,0.2)] text-[#fca5a5]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : channel.tag ? (
              <button
                onClick={() => setEditingTag(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(168,85,247,0.2)] border border-[rgba(168,85,247,0.3)] hover:bg-[rgba(168,85,247,0.3)] transition-colors group"
              >
                <Tag className="w-3.5 h-3.5 text-[#c084fc]" />
                <span className="text-sm font-medium text-[#c084fc]">{channel.tag}</span>
                <X 
                  className="w-3.5 h-3.5 text-[#fca5a5] opacity-0 group-hover:opacity-100 transition-opacity" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTag();
                  }}
                />
              </button>
            ) : (
              <button
                onClick={() => setEditingTag(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(113,113,122,0.1)] border border-dashed border-[rgba(113,113,122,0.3)] hover:border-[rgba(168,85,247,0.4)] hover:bg-[rgba(168,85,247,0.1)] transition-colors text-[#71717a] hover:text-[#c084fc]"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="text-sm">Add tag</span>
              </button>
            )}

            {/* Tag Suggestions */}
            {editingTag && showTagSuggestions && filteredTags.length > 0 && (
              <div className="absolute top-full right-0 mt-1 py-1 bg-[rgba(20,16,32,0.98)] rounded-xl border border-[rgba(168,85,247,0.2)] shadow-xl z-10 min-w-[140px] max-h-32 overflow-y-auto">
                {filteredTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={() => {
                      setTagInput(t);
                      setShowTagSuggestions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats Summary */}
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

        {/* Chart */}
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
