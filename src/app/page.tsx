'use client';

import { useState, useEffect } from 'react';
import { supabase, getProfiles, getChannels, createProfile, removeChannel, addChannel, renameProfile, deleteProfile, getTags, updateChannelTag, deleteTagFromAllChannels, checkTeamMembership, getTeamMembers, inviteTeamMember, removeTeamMember, linkUserToTeamMember, updateProfileVisibility, type TeamMember } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Sidebar from '@/components/Sidebar';
import FilterSection from '@/components/FilterSection';
import VideoResults from '@/components/VideoResults';
import ChannelsGrid from '@/components/ChannelsGrid';
import CreateProfileModal from '@/components/CreateProfileModal';
import AuthModal from '@/components/AuthModal';
import UserMenu from '@/components/UserMenu';
import AddChannelModal from '@/components/AddChannelModal';
import TagManagementModal from '@/components/TagManagementModal';
import TeamManagementModal from '@/components/TeamManagementModal';
import { Loader2, FolderOpen, TrendingUp, BarChart3, Plus, Tag, Users, ShieldX, Flame } from 'lucide-react';

interface Profile { id: string; name: string; visibility: 'private' | 'team'; createdBy: string; }

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

type SortOption = 'name' | 'views28d' | 'views1d' | 'newest';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamMember, setTeamMember] = useState<TeamMember | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);
  const [isTeamManagementOpen, setIsTeamManagementOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [sortBy, setSortBy] = useState<SortOption>('views1d');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [userTags, setUserTags] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    timeWindow: '48h', videoAmount: '10', minViews: '', maxViews: '', minLength: '', maxLength: '', searchQuery: '',
  });

  // Initialize auth - runs once
  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    };
    
    initAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
      }
    });
    
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // When user changes, check access and load data
  useEffect(() => {
    let mounted = true;
    
    const loadUserData = async () => {
      if (!user) {
        setTeamMember(null);
        setTeamMembers([]);
        setProfiles([]);
        setChannels([]);
        setActiveProfile(null);
        setUserTags([]);
        return;
      }
      
      try {
        // Try to link user to team member record
        if (user.email) {
          try {
            await linkUserToTeamMember(user.id, user.email);
          } catch (e) {
            // Ignore
          }
        }
        
        // Check team membership
        const member = await checkTeamMembership(user.id);
        if (!mounted) return;
        
        setTeamMember(member);
        
        if (member) {
          // Load profiles
          const profilesData = await getProfiles(user.id);
          if (!mounted) return;
          
          const mappedProfiles = profilesData.map(p => ({
            id: p.id,
            name: p.name,
            visibility: (p.visibility || 'team') as 'private' | 'team',
            createdBy: p.created_by || user.id
          }));
          setProfiles(mappedProfiles);
          
          // Set first profile as active if none selected
          if (mappedProfiles.length > 0) {
            setActiveProfile(prev => prev || mappedProfiles[0].id);
          }
          
          // Load tags
          try {
            const tags = await getTags();
            if (mounted) setUserTags(tags);
          } catch (e) {
            console.error('Error loading tags:', e);
          }
          
          // Load team members for admin/owner
          if (member.role === 'owner' || member.role === 'admin') {
            try {
              const members = await getTeamMembers();
              if (mounted) setTeamMembers(members);
            } catch (e) {
              console.error('Error loading team members:', e);
            }
          }
        }
      } catch (err) {
        console.error('Error loading user data:', err);
        if (mounted) setTeamMember(null);
      }
    };
    
    loadUserData();
    
    return () => { mounted = false; };
  }, [user?.id]);

  // Load channels when active profile changes
  useEffect(() => {
    let mounted = true;
    
    const loadChannelData = async () => {
      if (!activeProfile) {
        setChannels([]);
        return;
      }
      
      try {
        const data = await getChannels(activeProfile);
        if (!mounted) return;

        // Base channel data
        const baseChannels = data.map(ch => ({
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
          views1d: 0,
        }));

        // Compute total views gained from all snapshots (sum of all daily gains)
        const channelIds = baseChannels.map(c => c.channel_id);
        let views1dMap: Record<string, number> = {};
        if (channelIds.length > 0) {
          const { data: snaps, error: snapError } = await supabase
            .from('channel_snapshots')
            .select('channel_id, view_count, created_at')
            .in('channel_id', channelIds)
            .order('created_at', { ascending: true }); // Oldest first for proper diff calculation

          if (!snapError && snaps) {
            // Group snapshots by channel
            const grouped: Record<string, { view_count: number; created_at: string }[]> = {};
            snaps.forEach(s => {
              if (!grouped[s.channel_id]) grouped[s.channel_id] = [];
              grouped[s.channel_id].push({
                view_count: Number(s.view_count || '0'),
                created_at: s.created_at,
              });
            });
            
            // Calculate total views gained (sum of all consecutive differences)
            views1dMap = Object.fromEntries(
              Object.entries(grouped).map(([id, snapshots]) => {
                let totalGain = 0;
                for (let i = 1; i < snapshots.length; i++) {
                  const diff = snapshots[i].view_count - snapshots[i - 1].view_count;
                  totalGain += Math.max(0, diff);
                }
                return [id, totalGain];
              })
            );
          }
        }

        const merged = baseChannels.map(ch => ({
          ...ch,
          views1d: views1dMap[ch.channel_id] ?? 0,
        }));

        setChannels(merged);
      } catch (err) {
        console.error('Error loading channels:', err);
      }
    };
    
    loadChannelData();
    
    return () => { mounted = false; };
  }, [activeProfile]);

  const handleCreateProfile = async (name: string, visibility: 'private' | 'team' = 'team') => {
    if (!user) return;
    try {
      const newProfile = await createProfile(user.id, name, visibility);
      setProfiles([...profiles, { 
        id: newProfile.id, 
        name: newProfile.name, 
        visibility: newProfile.visibility || 'team',
        createdBy: newProfile.created_by 
      }]);
      setActiveProfile(newProfile.id);
      setIsCreateModalOpen(false);
    } catch (err) { 
      console.error('Error creating profile:', err); 
      alert('Failed to create profile. Check console for details.');
    }
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

  const handleToggleVisibility = async (id: string, visibility: 'private' | 'team') => {
    try {
      await updateProfileVisibility(id, visibility);
      setProfiles(profiles.map(p => p.id === id ? { ...p, visibility } : p));
    } catch (err) { 
      console.error('Error updating visibility:', err); 
      alert('Failed to update visibility. Check console for details.');
    }
  };

  const handleAddChannel = async (channelData: {
    channel_id: string; name: string; thumbnail_url: string; subscribers: string;
    video_count: string; views_28d: string; views_48h: string; language: string; tag: string | null;
  }) => {
    if (!activeProfile) {
      alert('No profile selected');
      throw new Error('No profile selected');
    }
    
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
      views1d: 0,
      language: newChannel.language,
      tag: channelData.tag,
    }, ...channels]);
    // Add new tag to userTags if it doesn't exist
    if (channelData.tag && !userTags.includes(channelData.tag)) {
      setUserTags([...userTags, channelData.tag]);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      await removeChannel(channelId);
      setChannels(channels.filter(ch => ch.id !== channelId));
    } catch (err) { console.error('Error removing channel:', err); }
  };

  const handleUpdateTag = async (channelId: string, tag: string | null) => {
    await updateChannelTag(channelId, tag);
    setChannels(channels.map(ch => ch.id === channelId ? { ...ch, tag } : ch));
    // Add new tag to userTags if it doesn't exist
    if (tag && !userTags.includes(tag)) {
      setUserTags([...userTags, tag]);
    }
  };

  const handleDeleteTag = async (tagToDelete: string) => {
    await deleteTagFromAllChannels(tagToDelete);
    // Remove tag from all channels in state
    setChannels(channels.map(ch => ch.tag === tagToDelete ? { ...ch, tag: null } : ch));
    // Remove from userTags
    setUserTags(userTags.filter(t => t !== tagToDelete));
  };

  const handleInviteMember = async (email: string, role: 'admin' | 'member') => {
    if (!user) return;
    try {
      const newMember = await inviteTeamMember(email, role, user.id);
      setTeamMembers([...teamMembers, newMember]);
    } catch (err) { 
      console.error('Error inviting member:', err);
      throw err;
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeTeamMember(memberId);
      setTeamMembers(teamMembers.filter(m => m.id !== memberId));
    } catch (err) { console.error('Error removing member:', err); }
  };

  const handleNewProfile = () => {
    if (!user) { setAuthMode('signup'); setIsAuthModalOpen(true); }
    else setIsCreateModalOpen(true);
  };

  const openLogin = () => { setAuthMode('login'); setIsAuthModalOpen(true); };
  const openSignup = () => { setAuthMode('signup'); setIsAuthModalOpen(true); };

  // Helper to parse formatted numbers like "1.2K", "3.5M" into raw numbers
  const parseFormattedNumber = (str: string): number => {
    if (!str) return 0;
    const cleaned = str.replace(/[^0-9.KMBkmb]/g, '');
    const match = cleaned.match(/^([\d.]+)([KMBkmb]?)$/);
    if (!match) return parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    const num = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();
    if (suffix === 'K') return num * 1_000;
    if (suffix === 'M') return num * 1_000_000;
    if (suffix === 'B') return num * 1_000_000_000;
    return num;
  };

  // Sort channels
  const sortedChannels = [...channels].sort((a, b) => {
    switch (sortBy) {
      case 'name': {
        const cmp = a.name.localeCompare(b.name);
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      case 'views28d':
        return parseFormattedNumber(b.views28d) - parseFormattedNumber(a.views28d);
      case 'views1d':
        return (b.views1d ?? 0) - (a.views1d ?? 0);
      case 'newest':
      default:
        // For newest/oldest, use original array index
        const idxA = channels.findIndex(c => c.id === a.id);
        const idxB = channels.findIndex(c => c.id === b.id);
        return sortDirection === 'desc' ? idxA - idxB : idxB - idxA;
    }
  });

  // Compute ranking by 24h views for highlighting - ONLY channels with >0 views compete
  const channelsWithViews = channels.filter(ch => (ch.views1d ?? 0) > 0);
  const rankedBy1d = [...channelsWithViews].sort((a, b) => (b.views1d ?? 0) - (a.views1d ?? 0));
  const topRanks: Record<string, number> = {};
  rankedBy1d.slice(0, 3).forEach((ch, idx) => {
    topRanks[ch.id] = idx + 1; // Only Top 3 get ranks (1, 2, 3)
  });

  // Pass down a helper to get rank-based highlight
  const channelHighlights = topRanks;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#a855f7] animate-spin" /></div>;

  // User is logged in but not a team member
  if (user && !teamMember) {
    return (
      <div className="min-h-screen relative z-[1] flex flex-col">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
        <header className="relative z-10 p-6 flex items-center justify-between">
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">Nuntius Niche Tracker</span>
          <UserMenu user={user} />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center mx-auto mb-6 border border-[rgba(168,85,247,0.2)]">
              <ShieldX className="w-10 h-10 text-[#c084fc]" />
            </div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-4">Access Restricted</h1>
            <p className="text-[#a1a1aa] mb-2">This tool is for team members only.</p>
            <p className="text-[#71717a] text-sm mb-8">
              Logged in as: <span className="text-[#c084fc]">{user.email}</span>
            </p>
            <p className="text-[#52525b] text-sm">
              If you should have access, ask an admin to invite you.
            </p>
          </div>
        </main>
      </div>
    );
  }

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
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
          {/* Team Management - Only for owner/admin */}
          {(teamMember?.role === 'owner' || teamMember?.role === 'admin') && (
            <button
              onClick={() => setIsTeamManagementOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-[#a1a1aa] hover:text-[#c084fc] bg-[rgba(15,12,25,0.6)] backdrop-blur-xl border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.3)] transition-all"
            >
              <Users className="w-4 h-4" />
              Team
            </button>
          )}
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
          onToggleVisibility={handleToggleVisibility}
        />

        {/* Main Content */}
        <main className="flex-1 relative z-[1]">
          <div className="max-w-[1600px] space-y-6">
            <FilterSection filters={filters} onFilterChange={setFilters} />
            <VideoResults videos={mockVideos} />
            {profiles.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">Channels</h2>
                    <span className="text-[12px] text-[#71717a]">Top 3 highlighted by 24h performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Sort Buttons - Glassmorphism Style */}
                    <button
                      onClick={() => setSortBy('views1d')}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium backdrop-blur-xl border transition-all ${
                        sortBy === 'views1d'
                          ? 'bg-[rgba(251,146,60,0.15)] border-[rgba(251,146,60,0.4)] text-[#fb923c] shadow-[0_0_16px_rgba(251,146,60,0.2)]'
                          : 'bg-[rgba(15,12,25,0.6)] border-[rgba(168,85,247,0.15)] text-[#a1a1aa] hover:border-[rgba(251,146,60,0.3)] hover:text-[#fb923c]'
                      }`}
                    >
                      <Flame className="w-4 h-4" />
                      Most Views (24h)
                    </button>

                    <button
                      onClick={() => setSortBy('views28d')}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium backdrop-blur-xl border transition-all ${
                        sortBy === 'views28d'
                          ? 'bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.4)] text-[#c084fc]'
                          : 'bg-[rgba(15,12,25,0.6)] border-[rgba(168,85,247,0.15)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.3)] hover:text-[#c084fc]'
                      }`}
                    >
                      Most Views (28d)
                    </button>

                    <button
                      onClick={() => {
                        if (sortBy === 'newest') {
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        } else {
                          setSortBy('newest');
                          setSortDirection('desc');
                        }
                      }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium backdrop-blur-xl border transition-all ${
                        sortBy === 'newest'
                          ? 'bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.4)] text-[#c084fc]'
                          : 'bg-[rgba(15,12,25,0.6)] border-[rgba(168,85,247,0.15)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.3)] hover:text-[#c084fc]'
                      }`}
                    >
                      {sortBy === 'newest' && sortDirection === 'asc' ? 'Oldest' : 'Newest'}
                    </button>

                    <button
                      onClick={() => {
                        if (sortBy === 'name') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('name');
                          setSortDirection('asc');
                        }
                      }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium backdrop-blur-xl border transition-all ${
                        sortBy === 'name'
                          ? 'bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.4)] text-[#c084fc]'
                          : 'bg-[rgba(15,12,25,0.6)] border-[rgba(168,85,247,0.15)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.3)] hover:text-[#c084fc]'
                      }`}
                    >
                      {sortBy === 'name' && sortDirection === 'desc' ? 'Z-A' : 'A-Z'}
                    </button>

                    <div className="w-px h-6 bg-[rgba(168,85,247,0.2)] mx-1" />

                    {/* Manage Tags Button */}
                    <button 
                      onClick={() => setIsTagManagementOpen(true)} 
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium text-[#a1a1aa] bg-[rgba(15,12,25,0.6)] backdrop-blur-xl border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.3)] hover:text-[#c084fc] transition-all"
                    >
                      <Tag className="w-4 h-4" />
                      Tags
                    </button>
                    
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
                    channelHighlights={channelHighlights}
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
      <TagManagementModal
        isOpen={isTagManagementOpen}
        onClose={() => setIsTagManagementOpen(false)}
        tags={userTags}
        onDeleteTag={handleDeleteTag}
      />
      <TeamManagementModal
        isOpen={isTeamManagementOpen}
        onClose={() => setIsTeamManagementOpen(false)}
        members={teamMembers}
        currentUserRole={teamMember?.role || 'member'}
        onInvite={handleInviteMember}
        onRemove={handleRemoveMember}
      />
    </div>
  );
}
