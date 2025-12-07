'use client';

import { useState, useEffect } from 'react';
import { supabase, getProfiles, getChannels, createProfile, removeChannel } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Sidebar from '@/components/Sidebar';
import FilterSection from '@/components/FilterSection';
import VideoResults from '@/components/VideoResults';
import ChannelsGrid from '@/components/ChannelsGrid';
import CreateProfileModal from '@/components/CreateProfileModal';
import AuthModal from '@/components/AuthModal';
import UserMenu from '@/components/UserMenu';
import { LogIn, Loader2, Youtube, TrendingUp, BarChart3, FolderOpen } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    timeWindow: '48h',
    videoAmount: '10',
    minViews: '',
    maxViews: '',
    minLength: '',
    maxLength: '',
    searchQuery: '',
  });

  // Listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profiles when user logs in
  useEffect(() => {
    if (user) {
      loadProfiles();
    } else {
      setProfiles([]);
      setChannels([]);
      setActiveProfile(null);
    }
  }, [user]);

  // Load channels when active profile changes
  useEffect(() => {
    if (activeProfile) {
      loadChannels(activeProfile);
    } else {
      setChannels([]);
    }
  }, [activeProfile]);

  const loadProfiles = async () => {
    if (!user) return;
    try {
      const data = await getProfiles(user.id);
      setProfiles(data.map(p => ({ id: p.id, name: p.name })));
      if (data.length > 0 && !activeProfile) {
        setActiveProfile(data[0].id);
      }
    } catch (err) {
      console.error('Error loading profiles:', err);
    }
  };

  const loadChannels = async (profileId: string) => {
    try {
      const data = await getChannels(profileId);
      setChannels(data.map(ch => ({
        id: ch.id,
        name: ch.name,
        avatar: '',
        subscribers: ch.subscribers,
        subsGrowth28d: ch.subs_growth_28d,
        subsGrowth48h: ch.subs_growth_48h,
        language: ch.language,
      })));
    } catch (err) {
      console.error('Error loading channels:', err);
    }
  };

  const handleCreateProfile = async (name: string) => {
    if (!user) return;
    try {
      const newProfile = await createProfile(user.id, name);
      setProfiles([...profiles, { id: newProfile.id, name: newProfile.name }]);
      setActiveProfile(newProfile.id);
    } catch (err) {
      console.error('Error creating profile:', err);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await removeChannel(channelId);
      setChannels(channels.filter(ch => ch.id !== channelId));
    } catch (err) {
      console.error('Error removing channel:', err);
    }
  };

  const handleNewProfile = () => {
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      setIsCreateModalOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#a855f7] animate-spin" />
      </div>
    );
  }

  // Landing page for non-authenticated users
  if (!user) {
    return (
      <div className="min-h-screen relative z-[1] flex flex-col">
        {/* Decorative orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Header */}
        <header className="relative z-10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e879f9] via-[#c084fc] to-[#a855f7] flex items-center justify-center shadow-glow">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
              Nuntius
            </span>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 btn btn-primary"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <span className="badge">
                <span className="text-[#e879f9]">✦</span>
                Channel Tracker
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
                Track YouTube Channels
              </span>
              <br />
              <span className="text-[#f8fafc]">Like a Pro</span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-[#a1a1aa] mb-10 max-w-xl mx-auto leading-relaxed">
              Organize channels by niche, monitor growth trends, and discover viral content before it blows up.
            </p>

            {/* CTA Button */}
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="btn btn-primary text-lg px-8 py-4 inline-flex items-center gap-3"
            >
              <LogIn className="w-5 h-5" />
              Get Started — It's Free
            </button>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]">
                  <FolderOpen className="w-6 h-6 text-[#c084fc]" />
                </div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Organize by Niche</h3>
                <p className="text-sm text-[#71717a]">Create profiles for different niches and keep your research organized</p>
              </div>

              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]">
                  <TrendingUp className="w-6 h-6 text-[#c084fc]" />
                </div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Track Growth</h3>
                <p className="text-sm text-[#71717a]">Monitor subscriber growth and spot trending channels early</p>
              </div>

              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]">
                  <BarChart3 className="w-6 h-6 text-[#c084fc]" />
                </div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Analyze Performance</h3>
                <p className="text-sm text-[#71717a]">Filter videos by views, engagement, and discover what works</p>
              </div>
            </div>
          </div>
        </main>

        {/* Auth Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
      </div>
    );
  }

  // Authenticated user view
  return (
    <div className="min-h-screen relative z-[1]">
      {/* Decorative orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <Sidebar
        profiles={profiles}
        activeProfile={activeProfile}
        onProfileSelect={setActiveProfile}
        onNewProfile={handleNewProfile}
      />
      
      {/* Main Content */}
      <main className="ml-[220px] p-6 relative z-[1]">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1 flex justify-center">
              <span className="badge">
                <span className="text-[#e879f9]">✦</span>
                Channel Tracker
              </span>
            </div>
            
            {/* User Menu */}
            <div className="absolute right-6 top-6">
              <UserMenu user={user} />
            </div>
          </div>

          <FilterSection 
            filters={filters} 
            onFilterChange={setFilters} 
          />
          
          <VideoResults videos={mockVideos} />
          
          {profiles.length > 0 ? (
            <>
              <ChannelsGrid 
                channels={channels}
                onRemoveChannel={handleRemoveChannel}
              />

              {channels.length === 0 && (
                <div className="glass-card p-12 text-center fade-in">
                  <div className="text-5xl mb-4 opacity-30">📺</div>
                  <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">No channels yet</h3>
                  <p className="text-[#71717a]">
                    Start tracking channels by searching above or adding them manually
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card p-12 text-center fade-in">
              <div className="text-5xl mb-4 opacity-30">📁</div>
              <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">No profiles yet</h3>
              <p className="text-[#71717a] mb-6">
                Create your first profile to start organizing channels by niche
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-primary"
              >
                Create First Profile
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateProfileModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateProfile={handleCreateProfile}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}
