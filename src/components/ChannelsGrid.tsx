'use client';

import { useState } from 'react';
import { Youtube, Trash2, Video, Users, Eye } from 'lucide-react';
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
  language: string;
}

interface ChannelsGridProps {
  channels: Channel[];
  onRemoveChannel: (id: string) => void;
}

export default function ChannelsGrid({ channels, onRemoveChannel }: ChannelsGridProps) {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Channel | null>(null);

  const openStats = (channel: Channel) => {
    setSelectedChannel(channel);
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

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 fade-in">
        {channels.map((channel, index) => (
          <div
            key={channel.id}
            className={`glass-panel rounded-xl p-4 card-hover fade-in stagger-${(index % 8) + 1} cursor-pointer`}
            onClick={() => openStats(channel)}
          >
            {/* Channel Header */}
            <div className="flex items-start gap-3 mb-3">
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
              <div className="flex-1 min-w-0">
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

            {/* Views Stats */}
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

            {/* Actions Row */}
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
        ))}
      </div>

      {/* Stats Modal */}
      <ChannelStatsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        channel={selectedChannel}
      />

      {/* Delete Confirmation Modal */}
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
