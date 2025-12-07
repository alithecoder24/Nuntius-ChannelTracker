'use client';

import { useState, useEffect } from 'react';
import { supabase, getProfiles, getChannels, createProfile, removeChannel, addChannel, renameProfile, deleteProfile, getTags, updateChannelTag } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Sidebar from '@/components/Sidebar';
import FilterSection from '@/components/FilterSection';
import VideoResults from '@/components/VideoResults';
import ChannelsGrid from '@/components/ChannelsGrid';
import CreateProfileModal from '@/components/CreateProfileModal';
import AuthModal from '@/components/AuthModal';
import UserMenu from '@/components/UserMenu';
import AddChannelModal from '@/components/AddChannelModal';
import { Loader2, FolderOpen, TrendingUp, BarChart3, Plus, ArrowUpDown } from 'lucide-react';

interface Profile { id: string; name: string; }

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
  tag: string | null;
}

const mockVideos = [{
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
}];

type SortOption = 'name' | 'subscribers' | 'views28d' | 'newest';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [userTags, setUserTags] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    timeWindow: '48h', videoAmount: '10', minViews: '', maxViews: '', minLength: '', maxLength: '', searchQuery: '',
  });

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

  useEffect(() => {
    if (user) {
      loadProfiles();
      loadTags();
    }
    else { setProfiles([]); setChannels([]); setActiveProfile(null); setUserTags([]); }
  }, [user]);

  useEffect(() => {
    if (activeProfile) loadChannels(activeProfile);
    else setChannels([]);
  }, [activeProfile]);

  const loadProfiles = async () => {
    if (!user) return;
    try {
      const data = await getProfiles(user.id);
      setProfiles(data.map(p => ({ id: p.id, name: p.name })));
      if (data.length > 0 && !activeProfile) setActiveProfile(data[0].id);
    } catch (err) { console.error('Error loading profiles:', err); }
  };

  const loadChannels = async (profileId: string) => {
    try {
      const data = await getChannels(profileId);
      setChannels(data.map(ch => ({
        id: ch.id,
        channel_id: ch.channel_id,
        name: ch.name,
        thumbnail_url: ch.thumbnail_url || '',
        subscribers: ch.subscribers,
        video_count: ch.video_count || '0',
        views28d: ch.views_28d || '0',
        views48h: ch.views_48h || '0',
        language: ch.language,
        tag: ch.tag || null,
      })));
    } catch (err) { console.error('Error loading channels:', err); }
  };

  const loadTags = async () => {
    if (!user) return;
    try {
      const tags = await getTags(user.id);
      setUserTags(tags);
    } catch (err) { console.error('Error loading tags:', err); }
  };

  const handleCreateProfile = async (name: string) => {
    if (!user) return;
    try {
      const newProfile = await createProfile(user.id, name);
      setProfiles([...profiles, { id: newProfile.id, name: newProfile.name }]);
      setActiveProfile(newProfile.id);
    } catch (err) { console.error('Error creating profile:', err); }
  };

  const handleRenameProfile = async (id: string, newName: string) => {
    try {
      await renameProfile(id, newName);
      setProfiles(profiles.map(p => p.id === id ? { ...p, name: newName } : p));
    } catch (err) { console.error('Error renaming profile:', err); }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await deleteProfile(id);
      const remaining = profiles.filter(p => p.id !== id);
      setProfiles(remaining);
      if (activeProfile === id) {
        setActiveProfile(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) { console.error('Error deleting profile:', err); }
  };

  const handleAddChannel = async (channelData: {
    channel_id: string; name: string; thumbnail_url: string; subscribers: string;
    video_count: string; views_28d: string; views_48h: string; language: string; tag: string | null;
  }) => {
    if (!activeProfile) throw new Error('No profile selected');
    try {
      const newChannel = await addChannel(activeProfile, channelData);
      setChannels([{
        id: newChannel.id,
        channel_id: newChannel.channel_id,
        name: newChannel.name,
        thumbnail_url: newChannel.thumbnail_url || '',
        subscribers: newChannel.subscribers,
        video_count: newChannel.video_count || '0',
        views28d: newChannel.views_28d || '0',
        views48h: newChannel.views_48h || '0',
        language: newChannel.language,
        tag: channelData.tag,
      }, ...channels]);
      // Add new tag to userTags if it doesn't exist
      if (channelData.tag && !userTags.includes(channelData.tag)) {
        setUserTags([...userTags, channelData.tag]);
      }
    } catch (err) { console.error('Error adding channel:', err); throw err; }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await removeChannel(channelId);
      setChannels(channels.filter(ch => ch.id !== channelId));
    } catch (err) { console.error('Error removing channel:', err); }
  };

  const handleUpdateTag = async (channelId: string, tag: string | null) => {
    try {
      await updateChannelTag(channelId, tag);
      setChannels(channels.map(ch => ch.id === channelId ? { ...ch, tag } : ch));
      // Add new tag to userTags if it doesn't exist
      if (tag && !userTags.includes(tag)) {
        setUserTags([...userTags, tag]);
      }
    } catch (err) { console.error('Error updating tag:', err); }
  };

  const handleNewProfile = () => {
    if (!user) { setAuthMode('signup'); setIsAuthModalOpen(true); }
    else setIsCreateModalOpen(true);
  };

  const openLogin = () => { setAuthMode('login'); setIsAuthModalOpen(true); };
  const openSignup = () => { setAuthMode('signup'); setIsAuthModalOpen(true); };

  // Sort channels
  const sortedChannels = [...channels].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'subscribers':
        return parseFloat(b.subscribers.replace(/[^0-9.]/g, '')) - parseFloat(a.subscribers.replace(/[^0-9.]/g, ''));
      case 'views28d':
        return parseFloat(b.views28d.replace(/[^0-9.]/g, '')) - parseFloat(a.views28d.replace(/[^0-9.]/g, ''));
      case 'newest':
      default:
        return 0; // Keep original order (newest first from DB)
    }
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#a855f7] animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen relative z-[1] flex flex-col">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
        <header className="relative z-10 p-6 flex items-center justify-between">
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">Nuntius Niche Tracker</span>
          <div className="flex items-center gap-3">
            <button onClick={openLogin} className="px-5 py-2.5 text-[#f8fafc] font-medium hover:text-[#c084fc] transition-colors">Login</button>
            <button onClick={openSignup} className="btn btn-primary px-5 py-2.5">Get Started</button>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center max-w-3xl mx-auto">
            <div className="flex justify-center mb-6"><span className="badge"><span className="text-[#e879f9]">✦</span> Channel Tracker</span></div>
            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">Track Your YouTube Channels</span><br />
              <span className="text-[#f8fafc]">All In One Place</span>
            </h1>
            <p className="text-xl text-[#a1a1aa] mb-10 max-w-xl mx-auto leading-relaxed">Organize channels by niche, monitor growth trends, and discover viral content before it blows up.</p>
            <button onClick={openSignup} className="btn btn-primary text-lg px-8 py-4 inline-flex items-center gap-3">Get Started — It's Free</button>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]"><FolderOpen className="w-6 h-6 text-[#c084fc]" /></div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Organize by Niche</h3>
                <p className="text-sm text-[#71717a]">Create profiles for different niches and keep your research organized</p>
              </div>
              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]"><TrendingUp className="w-6 h-6 text-[#c084fc]" /></div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Track Growth</h3>
                <p className="text-sm text-[#71717a]">Monitor view growth and spot trending channels early</p>
              </div>
              <div className="glass-card p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-4 border border-[rgba(168,85,247,0.2)]"><BarChart3 className="w-6 h-6 text-[#c084fc]" /></div>
                <h3 className="font-semibold text-[#f8fafc] mb-2">Analyze Performance</h3>
                <p className="text-sm text-[#71717a]">Filter videos by views, engagement, and discover what works</p>
              </div>
            </div>
          </div>
        </main>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-[1]">
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      
      {/* Top Header - Centered Badge */}
      <header className="relative z-10 h-16 flex items-center justify-center">
        <span className="badge"><span className="text-[#e879f9]">✦</span> Channel Tracker</span>
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <UserMenu user={user} />
        </div>
      </header>

      {/* Main Layout - Sidebar + Content side by side */}
      <div className="flex gap-4 px-4 pb-6">
        {/* Sidebar */}
        <Sidebar 
          profiles={profiles} 
          activeProfile={activeProfile} 
          onProfileSelect={setActiveProfile} 
          onNewProfile={handleNewProfile}
          onRenameProfile={handleRenameProfile}
          onDeleteProfile={handleDeleteProfile}
        />

        {/* Main Content */}
        <main className="flex-1 relative z-[1]">
          <div className="max-w-[1600px] space-y-6">
            <FilterSection filters={filters} onFilterChange={setFilters} />
            <VideoResults videos={mockVideos} />
            {profiles.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">Channels</h2>
                  <div className="flex items-center gap-3">
                    {/* Sort Dropdown */}
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="appearance-none pl-9 pr-4 py-2.5 rounded-2xl text-[13px] font-medium text-[#a1a1aa] bg-[rgba(15,12,25,0.6)] backdrop-blur-xl border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.3)] focus:outline-none focus:border-[rgba(168,85,247,0.4)] cursor-pointer transition-colors"
                      >
                        <option value="newest">Newest</option>
                        <option value="name">Name A-Z</option>
                        <option value="subscribers">Most Subscribers</option>
                        <option value="views28d">Most Views (28d)</option>
                      </select>
                      <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a] pointer-events-none" />
                    </div>
                    
                    {/* Add Channel Button - Glassy */}
                    <button 
                      onClick={() => setIsAddChannelModalOpen(true)} 
                      className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[13px] font-semibold text-[#c084fc] bg-[rgba(168,85,247,0.1)] backdrop-blur-xl border border-[rgba(168,85,247,0.25)] hover:bg-[rgba(168,85,247,0.2)] hover:border-[rgba(168,85,247,0.4)] transition-all shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                    >
                      <Plus className="w-4 h-4" />
                      Add Channel
                    </button>
                  </div>
                </div>
                {channels.length > 0 ? (
                  <ChannelsGrid 
                    channels={sortedChannels} 
                    onRemoveChannel={handleRemoveChannel}
                    userTags={userTags}
                    onUpdateTag={handleUpdateTag}
                  />
                ) : (
                  <div className="glass-card p-12 text-center fade-in">
                    <div className="text-5xl mb-4 opacity-30">📺</div>
                    <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">No channels yet</h3>
                    <p className="text-[#71717a] mb-6">Start tracking YouTube channels by adding them to this profile</p>
                    <button onClick={() => setIsAddChannelModalOpen(true)} className="btn btn-primary inline-flex items-center gap-2"><Plus className="w-4 h-4" />Add Your First Channel</button>
                  </div>
                )}
              </>
            ) : (
              <div className="glass-card p-12 text-center fade-in">
                <div className="text-5xl mb-4 opacity-30">📁</div>
                <h3 className="text-xl font-semibold text-[#f8fafc] mb-2">No profiles yet</h3>
                <p className="text-[#71717a] mb-6">Create your first profile to start organizing channels by niche</p>
                <button onClick={() => setIsCreateModalOpen(true)} className="btn btn-primary">Create First Profile</button>
              </div>
            )}
          </div>
        </main>
      </div>
      
      <CreateProfileModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreateProfile={handleCreateProfile} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
      <AddChannelModal 
        isOpen={isAddChannelModalOpen} 
        onClose={() => setIsAddChannelModalOpen(false)} 
        profileName={profiles.find(p => p.id === activeProfile)?.name || 'this profile'}
        existingChannels={channels.map(ch => ({ channel_id: ch.channel_id, name: ch.name }))}
        userTags={userTags}
        onAddChannel={handleAddChannel} 
      />
    </div>
  );
}
