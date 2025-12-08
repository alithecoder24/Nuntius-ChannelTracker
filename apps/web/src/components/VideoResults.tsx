'use client';

import { ExternalLink } from 'lucide-react';

interface Video {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar: string;
  channelSubs: string;
  likes: string;
  views: string;
  comments: number;
  publishedAt: string;
}

interface VideoResultsProps {
  videos: Video[];
}

export default function VideoResults({ videos }: VideoResultsProps) {
  return (
    <div className="glass-card p-6 fade-in" style={{ animationDelay: '0.1s' }}>
      <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
        Video Results
      </h2>
      
      <div className="space-y-4">
        {videos.map((video, index) => (
          <div 
            key={video.id}
            className="flex items-center gap-4 p-4 rounded-xl glass-panel card-hover"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {/* Thumbnail */}
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
              <div className="w-full h-full bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center border border-[rgba(168,85,247,0.2)]">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#a855f7]/50" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>

            {/* Video Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[#f8fafc] truncate pr-4">
                {video.title}
              </h3>
              <p className="text-sm text-[#71717a] mt-1">
                {video.id}
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[#c084fc] font-bold">+{video.likes}</span>
                <span className="stat-label">Likes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#c084fc] font-bold">+{video.views}</span>
                <span className="stat-label">Views</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#f8fafc] font-bold">{video.comments}</span>
                <span className="stat-label">Comments</span>
              </div>
            </div>

            {/* Channel Info */}
            <div className="flex items-center gap-3 flex-shrink-0 pl-4 border-l border-[rgba(168,85,247,0.15)]">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center flex-shrink-0 shadow-glow">
                <span className="text-white font-semibold text-sm">
                  {video.channelName.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-semibold text-sm text-[#f8fafc]">{video.channelName}</p>
                <p className="text-xs text-[#c084fc]">+{video.channelSubs}</p>
              </div>
              <button className="ml-2 w-8 h-8 rounded-lg bg-[rgba(168,85,247,0.1)] hover:bg-[rgba(168,85,247,0.2)] flex items-center justify-center transition-colors border border-[rgba(168,85,247,0.2)]">
                <ExternalLink className="w-4 h-4 text-[#c084fc]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
