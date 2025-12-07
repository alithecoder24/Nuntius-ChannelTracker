'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import FilterSection from '@/components/FilterSection';
import VideoResults from '@/components/VideoResults';
import ChannelsGrid from '@/components/ChannelsGrid';

// Mock data for demonstration
const mockProfiles = [
  { id: '1', name: 'Profile 1' },
  { id: '2', name: 'Profile 2' },
  { id: '3', name: 'Profile 3' },
  { id: '4', name: 'Profile 4' },
];

const mockVideos = [
  {
    id: 'aB3dE9_fGh1',
    title: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    thumbnail: '',
    channelName: 'ChannelName',
    channelAvatar: '',
    channelSubs: '24.0M',
    likes: '1.4K',
    views: '1.4M',
    comments: 428,
    publishedAt: '2024-01-15',
  },
];

const mockChannels = [
  { id: 'ch1', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch2', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch3', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'Spanish' },
  { id: 'ch4', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch5', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'German' },
  { id: 'ch6', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch7', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'French' },
  { id: 'ch8', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch9', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch10', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'Japanese' },
  { id: 'ch11', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch12', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch13', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'Korean' },
  { id: 'ch14', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
  { id: 'ch15', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
];

export default function Home() {
  const [activeProfile, setActiveProfile] = useState<string | null>('1');
  const [filters, setFilters] = useState({
    timeWindow: '48h',
    videoAmount: '10',
    minViews: '',
    maxViews: '',
    minLength: '',
    maxLength: '',
    searchQuery: '',
  });
  const [channels, setChannels] = useState(mockChannels);

  const handleNewProfile = () => {
    // In a real app, this would open a modal or navigate to profile creation
    console.log('Create new profile');
  };

  const handleRemoveChannel = (id: string) => {
    setChannels(channels.filter(ch => ch.id !== id));
  };

  return (
    <div className="min-h-screen relative z-[1]">
      {/* Decorative orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <Sidebar
        profiles={mockProfiles}
        activeProfile={activeProfile}
        onProfileSelect={setActiveProfile}
        onNewProfile={handleNewProfile}
      />
      
      {/* Main Content */}
      <main className="ml-[220px] p-6 relative z-[1]">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* Header Badge */}
          <div className="flex justify-center mb-8">
            <span className="badge">
              <span className="text-[#e879f9]">✦</span>
              Channel Tracker
            </span>
          </div>

          <FilterSection 
            filters={filters} 
            onFilterChange={setFilters} 
          />
          
          <VideoResults videos={mockVideos} />
          
          <ChannelsGrid 
            channels={channels}
            onRemoveChannel={handleRemoveChannel}
          />
        </div>
      </main>
    </div>
  );
}
