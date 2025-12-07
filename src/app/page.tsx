'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import FilterSection from '@/components/FilterSection';
import VideoResults from '@/components/VideoResults';
import ChannelsGrid from '@/components/ChannelsGrid';
import CreateProfileModal from '@/components/CreateProfileModal';

interface Profile {
  id: string;
  name: string;
  channels: Channel[];
}

interface Channel {
  id: string;
  name: string;
  avatar: string;
  subscribers: string;
  subsGrowth28d: string;
  subsGrowth48h: string;
  language: string;
}

// Initial demo data
const initialProfiles: Profile[] = [
  {
    id: '1',
    name: 'Profile 1',
    channels: [
      { id: 'ch1', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
      { id: 'ch2', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
      { id: 'ch3', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'Spanish' },
      { id: 'ch4', name: 'Channel Name', avatar: '', subscribers: '24.0M', subsGrowth28d: '24.0M', subsGrowth48h: '5.0M', language: 'English' },
    ]
  },
  { id: '2', name: 'Profile 2', channels: [] },
  { id: '3', name: 'Profile 3', channels: [] },
  { id: '4', name: 'Profile 4', channels: [] },
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

export default function Home() {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [activeProfile, setActiveProfile] = useState<string | null>('1');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    timeWindow: '48h',
    videoAmount: '10',
    minViews: '',
    maxViews: '',
    minLength: '',
    maxLength: '',
    searchQuery: '',
  });

  // Get current profile's channels
  const currentProfile = profiles.find(p => p.id === activeProfile);
  const currentChannels = currentProfile?.channels || [];

  const handleCreateProfile = (name: string) => {
    const newProfile: Profile = {
      id: Date.now().toString(),
      name,
      channels: [],
    };
    setProfiles([...profiles, newProfile]);
    setActiveProfile(newProfile.id);
  };

  const handleRemoveChannel = (channelId: string) => {
    setProfiles(profiles.map(profile => {
      if (profile.id === activeProfile) {
        return {
          ...profile,
          channels: profile.channels.filter(ch => ch.id !== channelId)
        };
      }
      return profile;
    }));
  };

  return (
    <div className="min-h-screen relative z-[1]">
      {/* Decorative orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <Sidebar
        profiles={profiles.map(p => ({ id: p.id, name: p.name }))}
        activeProfile={activeProfile}
        onProfileSelect={setActiveProfile}
        onNewProfile={() => setIsCreateModalOpen(true)}
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
            channels={currentChannels}
            onRemoveChannel={handleRemoveChannel}
          />

          {/* Empty state for new profiles */}
          {currentChannels.length === 0 && (
            <div className="glass-card p-12 text-center fade-in">
              <div className="text-5xl mb-4 opacity-30">📺</div>
              <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">No channels yet</h3>
              <p className="text-[#71717a]">
                Start tracking channels by searching above or adding them manually
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Profile Modal */}
      <CreateProfileModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateProfile={handleCreateProfile}
      />
    </div>
  );
}
