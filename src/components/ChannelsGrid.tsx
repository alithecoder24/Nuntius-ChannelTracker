'use client';

import { Youtube, Trash2 } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  avatar: string;
  subscribers: string;
  subsGrowth28d: string;
  subsGrowth48h: string;
  language: string;
}

interface ChannelsGridProps {
  channels: Channel[];
  onRemoveChannel: (id: string) => void;
}

export default function ChannelsGrid({ channels, onRemoveChannel }: ChannelsGridProps) {
  return (
    <div className="glass-card p-6 fade-in" style={{ animationDelay: '0.2s' }}>
      <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
        Channels
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {channels.map((channel, index) => (
          <div
            key={channel.id}
            className={`glass-panel rounded-xl p-4 card-hover fade-in stagger-${(index % 8) + 1}`}
          >
            {/* Channel Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center flex-shrink-0 shadow-glow">
                <span className="text-white font-bold">
                  {channel.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#f8fafc] truncate">{channel.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm flex-wrap">
                  <span className="text-[#c084fc] font-bold">+{channel.subscribers}</span>
                  <span className="text-[#71717a]">(28d)</span>
                  <span className="text-[#86efac] font-semibold">+{channel.subsGrowth48h}</span>
                  <span className="text-[#71717a]">(48h)</span>
                </div>
              </div>
            </div>

            {/* Actions Row */}
            <div className="flex items-center gap-2">
              <span className="badge text-xs">
                {channel.language}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <a
                  href={`https://youtube.com/channel/${channel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-[rgba(168,85,247,0.1)] hover:bg-[rgba(168,85,247,0.2)] rounded-lg transition-colors border border-[rgba(168,85,247,0.2)]"
                >
                  <Youtube className="w-4 h-4 text-[#c084fc]" />
                </a>
              </div>
              <button
                onClick={() => onRemoveChannel(channel.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.2)] text-[#fca5a5] transition-colors border border-[rgba(239,68,68,0.2)]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
