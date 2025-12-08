'use client';

import { useState, useRef, useEffect } from 'react';
import { Youtube, Trash2, Video, Users, Eye, Tag, X, Check, Flame } from 'lucide-react';
import ChannelStatsModal from './ChannelStatsModal';
import ConfirmModal from './ConfirmModal';

interface Channel {
  id: string;
  channel_id: string;
  name: string;
  thumbnail_url: string;
  subscribers: string;
  video_count: string;
  views28d: string;
  views48h: string;
  views1d?: number;
  language: string;
  tag: string | null;
}

interface ChannelsGridProps {
  channels: Channel[];
  onRemoveChannel: (id: string) => void;
  userTags: string[];
  onUpdateTag: (channelId: string, tag: string | null) => Promise<void>;
  channelHighlights?: Record<string, number>;
}

export default function ChannelsGrid({ channels, onRemoveChannel, userTags, onUpdateTag, channelHighlights }: ChannelsGridProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Channel | null>(null);
  const [editingTagChannel, setEditingTagChannel] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  const selectedChannel = selectedChannelId ? channels.find(c => c.id === selectedChannelId) || null : null;

  const formatNumber = (num?: number | string) => {
    if (num === undefined || num === null) return '0';
    const n = typeof num === 'string' ? parseFloat(num.replace(/[^0-9.-]/g, '')) : num;
    if (Number.isNaN(n)) return '0';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.round(n).toString();
  };

  useEffect(() => {
    if (editingTagChannel && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [editingTagChannel]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setEditingTagChannel(null);
        setTagInput('');
      }
    };
    if (editingTagChannel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingTagChannel]);

  const openStats = (channel: Channel) => {
    setSelectedChannelId(channel.id);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, channel: Channel) => {
    e.stopPropagation();
    setDeleteConfirm(channel);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      onRemoveChannel(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  };

  const handleTagClick = (e: React.MouseEvent, channel: Channel) => {
    e.stopPropagation();
    setEditingTagChannel(channel.id);
    setTagInput(channel.tag || '');
  };

  const handleTagSave = async (channelId: string) => {
    const trimmedTag = tagInput.trim();
    try {
      await onUpdateTag(channelId, trimmedTag || null);
      setEditingTagChannel(null);
      setTagInput('');
    } catch (err) {
      console.error('Failed to save tag:', err);
      alert('Failed to save tag.');
    }
  };

  const handleTagSelect = async (channelId: string, tag: string) => {
    try {
      await onUpdateTag(channelId, tag);
      setEditingTagChannel(null);
      setTagInput('');
    } catch (err) {
      console.error('Failed to save tag:', err);
      alert('Failed to save tag.');
    }
  };

  const filteredTags = userTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && t !== tagInput);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-4 fade-in">
        {channels.map((channel, index) => {
          const rank = channelHighlights?.[channel.id];
          const isTop3 = rank && rank <= 3;
          
          // Glow intensity based on rank (Top 3 only)
          const glowClass = isTop3
            ? rank === 1
              ? 'border-[rgba(251,146,60,0.55)] shadow-[0_0_28px_rgba(251,146,60,0.45)] bg-[rgba(251,146,60,0.04)]'
              : rank === 2
                ? 'border-[rgba(251,146,60,0.45)] shadow-[0_0_22px_rgba(251,146,60,0.35)] bg-[rgba(251,146,60,0.03)]'
                : 'border-[rgba(251,146,60,0.35)] shadow-[0_0_16px_rgba(251,146,60,0.25)] bg-[rgba(251,146,60,0.02)]'
            : '';
          
          // Number of flames based on rank (3 for #1, 2 for #2, 1 for #3)
          const flameCount = isTop3 ? (4 - rank) : 0;

          return (
            <div
              key={channel.id}
              className={`glass-panel rounded-xl p-4 card-hover fade-in stagger-${(index % 8) + 1} cursor-pointer relative group border ${glowClass}`}
              onClick={() => openStats(channel)}
            >
              {/* Top 3 flame badge */}
              {isTop3 && (
                <div className="absolute -left-1 -top-2 z-10">
                  <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 bg-[rgba(251,146,60,0.2)] text-[#fb923c] border border-[rgba(251,146,60,0.4)] shadow-[0_0_12px_rgba(251,146,60,0.3)]">
                    {Array.from({ length: flameCount }).map((_, i) => (
                      <Flame key={i} className="w-3.5 h-3.5" />
                    ))}
                    <span className="ml-0.5">{formatNumber(channel.views1d)} (24h)</span>
                  </div>
                </div>
              )}
              
              {/* Non-top-3 channels with 24h views - no flame, just views text */}
              {!isTop3 && (channel.views1d ?? 0) > 0 && (
                <div className="absolute -left-1 -top-2 z-10">
                  <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[rgba(168,85,247,0.12)] text-[#c084fc] border border-[rgba(168,85,247,0.25)]">
                    <span>{formatNumber(channel.views1d)} (24h)</span>
                  </div>
                </div>
              )}

              <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                {editingTagChannel === channel.id ? (
                  <div ref={tagMenuRef} className="relative">
                    <div className="flex items-center gap-1 bg-[rgba(20,16,32,0.98)] rounded-lg border border-[rgba(168,85,247,0.3)] p-1">
                      <input
                        ref={tagInputRef}
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleTagSave(channel.id);
                          if (e.key === 'Escape') {
                            setEditingTagChannel(null);
                            setTagInput('');
                          }
                        }}
                        placeholder="Add tag..."
                        className="w-24 px-2 py-1 text-xs bg-transparent text-[#f8fafc] focus:outline-none placeholder:text-[#71717a]"
                      />
                      <button
                        onClick={() => handleTagSave(channel.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(168,85,247,0.2)] text-[#86efac]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {filteredTags.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[rgba(20,16,32,0.98)] rounded-lg border border-[rgba(168,85,247,0.2)] shadow-xl max-h-32 overflow-y-auto">
                        {filteredTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => handleTagSelect(channel.id, tag)}
                            className="w-full px-3 py-1.5 text-left text-xs text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : channel.tag ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(168,85,247,0.25)] border border-[rgba(168,85,247,0.4)]">
                    <Tag className="w-3 h-3 text-[#c084fc]" />
                    <span
                      className="text-[11px] font-semibold text-[#c084fc] cursor-pointer"
                      onClick={(e) => handleTagClick(e, channel)}
                    >
                      {channel.tag}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => handleTagClick(e, channel)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-[rgba(113,113,122,0.1)] hover:bg-[rgba(168,85,247,0.15)] border border-transparent hover:border-[rgba(168,85,247,0.2)] text-[#71717a] hover:text-[#c084fc] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-start gap-3 mb-3 group">
                {channel.thumbnail_url ? (
                  <img
                    src={channel.thumbnail_url}
                    alt={channel.name}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center flex-shrink-0 shadow-glow">
                    <span className="text-white font-bold">{channel.name.charAt(0)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0 pr-8">
                  <h3 className="font-semibold text-[#f8fafc] truncate">{channel.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-[#71717a]" />
                      <span className="text-[#c084fc] font-bold">{channel.subscribers}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Video className="w-3 h-3 text-[#71717a]" />
                      <span className="text-[#a1a1aa]">{channel.video_count}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-3 px-1">
                <div className="flex items-center gap-1 text-xs">
                  <Eye className="w-3 h-3 text-[#71717a]" />
                  <span className="text-[#86efac] font-semibold">+{channel.views28d}</span>
                  <span className="text-[#71717a]">(28d)</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-[#86efac] font-semibold">+{channel.views48h}</span>
                  <span className="text-[#71717a]">(48h)</span>
                </div>
              </div>

              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="badge text-xs">{channel.language}</span>
                <div className="flex-1">
                  <a
                    href={`https://youtube.com/channel/${channel.channel_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 bg-[rgba(168,85,247,0.1)] hover:bg-[rgba(168,85,247,0.2)] rounded-lg transition-colors border border-[rgba(168,85,247,0.2)]"
                  >
                    <Youtube className="w-4 h-4 text-[#c084fc]" />
                    <span className="text-xs text-[#c084fc] font-medium">Visit Channel</span>
                  </a>
                </div>
                <button
                  onClick={(e) => handleDeleteClick(e, channel)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.2)] text-[#fca5a5] transition-colors border border-[rgba(239,68,68,0.2)]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ChannelStatsModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedChannelId(null);
        }}
        channel={selectedChannel}
        userTags={userTags}
        onUpdateTag={onUpdateTag}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Channel"
        message={`Are you sure you want to remove "${deleteConfirm?.name}" from this profile? This will also delete all tracking history for this channel.`}
        confirmText="Remove Channel"
      />
    </>
  );
}
