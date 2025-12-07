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
import { LogIn, Loader2 } from 'lucide-react';

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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
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
            
            {/* Auth Button / User Menu */}
            <div className="absolute right-6 top-6">
              {user ? (
                <UserMenu user={user} />
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 btn btn-primary"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              )}
            </div>
          </div>

          {/* Show login prompt if not authenticated */}
          {!user && (
            <div className="glass-card p-8 text-center fade-in mb-6">
              <div className="text-5xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">Sign in to get started</h3>
              <p className="text-[#71717a] mb-6">
                Create an account to save your profiles and track YouTube channels
              </p>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign In or Create Account
              </button>
            </div>
          )}

          {user && (
            <>
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

                  {/* Empty state for profiles with no channels */}
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
            </>
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
