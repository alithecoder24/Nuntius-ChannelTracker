'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Video, Clock, CheckCircle2, XCircle, Loader2, Plus, Trash2, Download, 
  Upload, User, FileText, X, Settings, Save, Edit2, ChevronDown, Music,
  Palette, Type, Timer, Sparkles, Info
} from 'lucide-react';
import { 
  createVideoJob, getVideoJobs, deleteVideoJob, subscribeToVideoJobs, 
  getWorkerStatus, subscribeToWorkerStatus, type VideoJob, type WorkerHeartbeat 
} from '@/lib/supabase';

// Types
interface Profile {
  id: string;
  channel_name: string;
  profile_pic: string | null;
  font: string;
  voice: string;
  voice_model: string;
  video_length: number;
  music: string;
  background_video: string;
  selected_badges: string[];
  highlight_color: string;
  animations_enabled: boolean;
  badge_style: 'blue' | 'gold';
}

interface PravusGeneratorProps {
  userId: string;
}

// Constants
const FONTS = [
  { id: 'montserrat', name: 'Montserrat' },
  { id: 'lato', name: 'Lato' },
  { id: 'fredoka', name: 'Fredoka' },
  { id: 'grover', name: 'Grover' },
];

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
];

const VOICE_MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5' },
  { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
  { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1' },
];

const BADGES = [
  'Wholesome.png', 'HeartEyes.png', 'LOVE.png', 'PlusOne.png', 'Updoot.png',
  'Thanks.png', 'Helpful.png', 'BlessUp.png', 'MindBlown.png', 'GOAT.png',
  'Facepalm.png', 'Shocked.png', 'BuffDoge.png', 'GottheW.png', 'AwesomeAnswer.png'
];

// Custom styled select
function StyledSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] text-sm focus:outline-none focus:border-[rgba(234,88,12,0.4)] transition-colors flex items-center justify-between gap-2"
      >
        <span className={selectedOption ? 'text-[#f8fafc]' : 'text-[#52525b]'}>
          {selectedOption?.name || placeholder || 'Select...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#71717a] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-1 rounded-lg bg-[rgba(20,15,35,0.98)] border border-[rgba(168,85,247,0.25)] shadow-xl backdrop-blur-sm max-h-48 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => { onChange(option.id); setIsOpen(false); }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                value === option.id
                  ? 'bg-[rgba(234,88,12,0.15)] text-[#fb923c]'
                  : 'text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)]'
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PravusGenerator({ userId }: PravusGeneratorProps) {
  // Profiles state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  
  // Current profile/form state
  const [channelName, setChannelName] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [font, setFont] = useState('montserrat');
  const [voice, setVoice] = useState('');
  const [voiceModel, setVoiceModel] = useState('eleven_turbo_v2_5');
  const [videoLength, setVideoLength] = useState(179);
  const [music, setMusic] = useState('none');
  const [backgroundVideo, setBackgroundVideo] = useState('');
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [highlightColor, setHighlightColor] = useState('#ffff00');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [badgeStyle, setBadgeStyle] = useState<'blue' | 'gold'>('blue');
  
  // Script upload
  const [scriptFiles, setScriptFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Jobs & worker
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<'online' | 'busy' | 'offline'>('offline');
  
  // Background videos (ClipMix)
  const [clipMixes, setClipMixes] = useState<{id: string; name: string; emoji: string}[]>([
    { id: 'Mix_2', name: 'Cookim', emoji: '🥐' },
    { id: 'Mix_3', name: 'CakeTown', emoji: '🎂' },
    { id: 'Mix_4', name: 'Satisfying', emoji: '😌' },
    { id: 'Mix_5', name: 'MoreLife', emoji: '💰' },
    { id: 'Mix_6', name: 'Prosper', emoji: '💸' },
    { id: 'Mix_7', name: 'Green', emoji: '🐸' },
    { id: 'Mix_8', name: 'Views', emoji: '💔' },
    { id: 'Mix_9', name: 'Broken', emoji: '💗' },
    { id: 'Mix_10', name: 'FuckOddly', emoji: '🖕' },
    { id: 'Mix_11', name: 'Minecraft', emoji: '🎮' },
  ]);

  // Load profiles from localStorage (in real app, this would be Supabase)
  useEffect(() => {
    const saved = localStorage.getItem('pravus_profiles');
    if (saved) {
      try {
        setProfiles(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading profiles:', e);
      }
    }
  }, []);

  // Save profiles to localStorage
  const saveProfiles = (newProfiles: Profile[]) => {
    setProfiles(newProfiles);
    localStorage.setItem('pravus_profiles', JSON.stringify(newProfiles));
  };

  // Load jobs and subscribe to updates
  useEffect(() => {
    let mounted = true;
    
    const loadJobs = async () => {
      try {
        const existingJobs = await getVideoJobs(userId);
        // Filter to only pravus jobs
        const pravusJobs = existingJobs.filter(j => j.tool_type === 'pravus-generator');
        if (mounted) setJobs(pravusJobs);
      } catch (err) {
        console.error('Error loading jobs:', err);
      }
    };
    
    loadJobs();
    
    const subscription = subscribeToVideoJobs(userId, (updatedJob) => {
      if (updatedJob.tool_type !== 'pravus-generator') return;
      setJobs(prev => {
        const exists = prev.find(j => j.id === updatedJob.id);
        if (exists) {
          return prev.map(j => j.id === updatedJob.id ? updatedJob : j);
        }
        return [updatedJob, ...prev];
      });
    });
    
    return () => {
      mounted = false;
      subscription.then(sub => sub.unsubscribe());
    };
  }, [userId]);

  // Subscribe to worker status
  useEffect(() => {
    let mounted = true;
    
    const checkWorkerStatus = (heartbeat: WorkerHeartbeat | null) => {
      if (!mounted) return;
      
      if (!heartbeat) {
        setWorkerStatus('offline');
        return;
      }
      
      const lastBeat = new Date(heartbeat.last_heartbeat);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastBeat.getTime()) / 1000;
      
      if (diffSeconds > 30) {
        setWorkerStatus('offline');
      } else {
        setWorkerStatus(heartbeat.status || 'online');
      }
    };
    
    const subscription = subscribeToWorkerStatus('pravus-generator', checkWorkerStatus);
    
    const interval = setInterval(async () => {
      const status = await getWorkerStatus('pravus-generator');
      checkWorkerStatus(status);
    }, 10000);
    
    return () => {
      mounted = false;
      subscription.then(sub => sub.unsubscribe());
      clearInterval(interval);
    };
  }, []);

  // Load profile into form
  const loadProfile = (profile: Profile) => {
    setChannelName(profile.channel_name);
    setProfilePic(profile.profile_pic);
    setFont(profile.font);
    setVoice(profile.voice);
    setVoiceModel(profile.voice_model);
    setVideoLength(profile.video_length);
    setMusic(profile.music);
    setBackgroundVideo(profile.background_video);
    setSelectedBadges(profile.selected_badges);
    setHighlightColor(profile.highlight_color);
    setAnimationsEnabled(profile.animations_enabled);
    setBadgeStyle(profile.badge_style);
  };

  // Handle profile selection
  const handleProfileSelect = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      loadProfile(profile);
      setIsEditingProfile(false);
      setIsCreatingProfile(false);
    }
  };

  // Create new profile
  const handleCreateProfile = () => {
    if (!channelName.trim()) {
      setError('Channel name is required');
      return;
    }
    
    const newProfile: Profile = {
      id: `profile_${Date.now()}`,
      channel_name: channelName,
      profile_pic: profilePic,
      font,
      voice,
      voice_model: voiceModel,
      video_length: videoLength,
      music,
      background_video: backgroundVideo,
      selected_badges: selectedBadges,
      highlight_color: highlightColor,
      animations_enabled: animationsEnabled,
      badge_style: badgeStyle,
    };
    
    const newProfiles = [...profiles, newProfile];
    saveProfiles(newProfiles);
    setSelectedProfileId(newProfile.id);
    setIsCreatingProfile(false);
    setError(null);
  };

  // Update existing profile
  const handleUpdateProfile = () => {
    if (!selectedProfileId || !channelName.trim()) return;
    
    const updatedProfiles = profiles.map(p => 
      p.id === selectedProfileId 
        ? {
            ...p,
            channel_name: channelName,
            profile_pic: profilePic,
            font,
            voice,
            voice_model: voiceModel,
            video_length: videoLength,
            music,
            background_video: backgroundVideo,
            selected_badges: selectedBadges,
            highlight_color: highlightColor,
            animations_enabled: animationsEnabled,
            badge_style: badgeStyle,
          }
        : p
    );
    
    saveProfiles(updatedProfiles);
    setIsEditingProfile(false);
  };

  // Delete profile
  const handleDeleteProfile = (profileId: string) => {
    if (!confirm('Delete this profile?')) return;
    const newProfiles = profiles.filter(p => p.id !== profileId);
    saveProfiles(newProfiles);
    if (selectedProfileId === profileId) {
      setSelectedProfileId('');
      setChannelName('');
    }
  };

  // Handle file drop
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt'));
    if (files.length > 0) {
      setScriptFiles(prev => [...prev, ...files]);
    }
  };

  // Handle profile picture upload
  const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePic(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit job
  const handleSubmit = async () => {
    if (scriptFiles.length === 0) {
      setError('Please upload at least one script file');
      return;
    }
    if (!selectedProfileId && !channelName.trim()) {
      setError('Please select a profile or create a new one');
      return;
    }
    if (!voice) {
      setError('Please select a voice');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      // Read script files
      const scripts = await Promise.all(
        scriptFiles.map(file => file.text())
      );
      
      const newJob = await createVideoJob(userId, {
        tool_type: 'pravus-generator',
        profile_id: selectedProfileId,
        channel_name: channelName,
        profile_pic: profilePic,
        font,
        voice,
        voice_model: voiceModel,
        video_length: videoLength,
        music,
        background_video: backgroundVideo,
        selected_badges: selectedBadges,
        highlight_color: highlightColor,
        animations_enabled: animationsEnabled,
        badge_style: badgeStyle,
        scripts: scripts,
        script_names: scriptFiles.map(f => f.name),
      } as any);
      
      setJobs([newJob, ...jobs]);
      setScriptFiles([]);
    } catch (err) {
      console.error('Error creating job:', err);
      setError('Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: VideoJob['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-5 h-5 text-[#fbbf24]" />;
      case 'processing': return <Loader2 className="w-5 h-5 text-[#fb923c] animate-spin" />;
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-[#4ade80]" />;
      case 'failed': return <XCircle className="w-5 h-5 text-[#f87171]" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getWorkerStatusDisplay = () => {
    switch (workerStatus) {
      case 'online': return { color: 'bg-[#4ade80]', text: 'Worker Online', textColor: 'text-[#4ade80]' };
      case 'busy': return { color: 'bg-[#fbbf24]', text: 'Worker Busy', textColor: 'text-[#fbbf24]' };
      case 'offline': return { color: 'bg-[#f87171]', text: 'Worker Offline', textColor: 'text-[#f87171]' };
    }
  };

  const workerDisplay = getWorkerStatusDisplay();

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ea580c]/20 to-[#fb923c]/20 flex items-center justify-center border border-[rgba(234,88,12,0.3)] shadow-[0_0_20px_rgba(234,88,12,0.15)]">
              <Video className="w-7 h-7 text-[#fb923c]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#f8fafc]">Reddit Video Generator</h1>
              <p className="text-[#71717a] text-sm">Generate Reddit-style story videos with TTS</p>
            </div>
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || scriptFiles.length === 0 || workerStatus === 'offline'}
            className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all inline-flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
            Generate Videos
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#f87171] text-sm">
            {error}
          </div>
        )}

        {/* Profile Selector */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-[#a1a1aa]">Channel Profile</label>
            <button
              onClick={() => { setIsCreatingProfile(true); setIsEditingProfile(false); setSelectedProfileId(''); setChannelName(''); }}
              className="text-xs text-[#fb923c] hover:text-[#fdba74] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> New Profile
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => handleProfileSelect(profile.id)}
                className={`relative p-3 rounded-xl border transition-all flex flex-col items-center gap-2 group ${
                  selectedProfileId === profile.id
                    ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)]'
                    : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.25)]'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[rgba(168,85,247,0.2)] overflow-hidden border-2 border-[rgba(168,85,247,0.3)]">
                  {profile.profile_pic ? (
                    <img src={profile.profile_pic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-6 h-6 text-[#a1a1aa]" />
                    </div>
                  )}
                </div>
                <span className="text-xs text-[#f8fafc] truncate max-w-full">{profile.channel_name}</span>
                
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id); }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#f87171] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
            ))}
            
            {profiles.length === 0 && !isCreatingProfile && (
              <div className="col-span-full text-center py-8 text-[#52525b]">
                <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No profiles yet. Create your first one!</p>
              </div>
            )}
          </div>
        </div>

        {/* Profile Editor (shown when creating/editing) */}
        {(isCreatingProfile || isEditingProfile || selectedProfileId) && (
          <div className="border-t border-[rgba(168,85,247,0.1)] pt-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#f8fafc]">
                {isCreatingProfile ? 'New Profile' : 'Profile Settings'}
              </h3>
              {selectedProfileId && !isCreatingProfile && (
                <button
                  onClick={() => setIsEditingProfile(!isEditingProfile)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isEditingProfile
                      ? 'bg-[rgba(234,88,12,0.15)] text-[#fb923c]'
                      : 'bg-[rgba(15,12,25,0.4)] text-[#71717a] hover:text-[#a1a1aa]'
                  }`}
                >
                  <Edit2 className="w-3 h-3 inline mr-1" />
                  {isEditingProfile ? 'Editing' : 'Edit'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                {/* Channel Name & Profile Pic */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Avatar</label>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfilePicUpload} disabled={!isCreatingProfile && !isEditingProfile} />
                      <div className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${
                        profilePic ? 'border-[#fb923c]' : 'border-[rgba(168,85,247,0.3)] hover:border-[#fb923c]'
                      }`}>
                        {profilePic ? (
                          <img src={profilePic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Upload className="w-5 h-5 text-[#71717a]" />
                        )}
                      </div>
                    </label>
                  </div>
                  
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Channel Name</label>
                    <input
                      type="text"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      disabled={!isCreatingProfile && !isEditingProfile}
                      placeholder="MyChannel"
                      className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder-[#52525b] text-sm focus:outline-none focus:border-[rgba(234,88,12,0.4)] disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Voice & Model */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Voice</label>
                    <StyledSelect
                      value={voice}
                      onChange={setVoice}
                      options={VOICES}
                      placeholder="Select voice..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Voice Model</label>
                    <StyledSelect
                      value={voiceModel}
                      onChange={setVoiceModel}
                      options={VOICE_MODELS}
                    />
                  </div>
                </div>

                {/* Font & Length */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Font</label>
                    <StyledSelect
                      value={font}
                      onChange={setFont}
                      options={FONTS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Max Length (sec)</label>
                    <input
                      type="number"
                      value={videoLength}
                      onChange={(e) => setVideoLength(parseInt(e.target.value) || 0)}
                      disabled={!isCreatingProfile && !isEditingProfile}
                      className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] text-sm focus:outline-none focus:border-[rgba(234,88,12,0.4)] disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Highlight Color & Animation */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Highlight Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={highlightColor}
                        onChange={(e) => setHighlightColor(e.target.value)}
                        disabled={!isCreatingProfile && !isEditingProfile}
                        className="w-10 h-9 rounded-lg border-0 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={highlightColor}
                        onChange={(e) => setHighlightColor(e.target.value)}
                        disabled={!isCreatingProfile && !isEditingProfile}
                        className="flex-1 px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] text-sm focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#71717a] mb-1">Animation</label>
                    <button
                      onClick={() => (isCreatingProfile || isEditingProfile) && setAnimationsEnabled(!animationsEnabled)}
                      disabled={!isCreatingProfile && !isEditingProfile}
                      className={`w-full px-3 py-2 rounded-lg border text-sm transition-all ${
                        animationsEnabled
                          ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)] text-[#fb923c]'
                          : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.15)] text-[#71717a]'
                      } disabled:opacity-50`}
                    >
                      <Sparkles className="w-4 h-4 inline mr-2" />
                      {animationsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* Background Video */}
                <div>
                  <label className="block text-xs font-medium text-[#71717a] mb-2">Background Video</label>
                  <div className="grid grid-cols-5 gap-2">
                    {clipMixes.map(mix => (
                      <button
                        key={mix.id}
                        onClick={() => (isCreatingProfile || isEditingProfile) && setBackgroundVideo(mix.id)}
                        disabled={!isCreatingProfile && !isEditingProfile}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          backgroundVideo === mix.id
                            ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)]'
                            : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.25)]'
                        } disabled:opacity-50`}
                      >
                        <span className="text-lg">{mix.emoji}</span>
                        <p className="text-[10px] text-[#a1a1aa] truncate">{mix.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Badge Style */}
                <div>
                  <label className="block text-xs font-medium text-[#71717a] mb-2">Badge Style</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => (isCreatingProfile || isEditingProfile) && setBadgeStyle('blue')}
                      disabled={!isCreatingProfile && !isEditingProfile}
                      className={`flex-1 p-2 rounded-lg border transition-all ${
                        badgeStyle === 'blue'
                          ? 'bg-[rgba(59,130,246,0.15)] border-[rgba(59,130,246,0.4)]'
                          : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)]'
                      } disabled:opacity-50`}
                    >
                      <span className="text-2xl">✓</span>
                      <p className="text-xs text-[#a1a1aa]">Blue</p>
                    </button>
                    <button
                      onClick={() => (isCreatingProfile || isEditingProfile) && setBadgeStyle('gold')}
                      disabled={!isCreatingProfile && !isEditingProfile}
                      className={`flex-1 p-2 rounded-lg border transition-all ${
                        badgeStyle === 'gold'
                          ? 'bg-[rgba(234,179,8,0.15)] border-[rgba(234,179,8,0.4)]'
                          : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)]'
                      } disabled:opacity-50`}
                    >
                      <span className="text-2xl">✓</span>
                      <p className="text-xs text-[#a1a1aa]">Gold</p>
                    </button>
                  </div>
                </div>

                {/* Save/Create Button */}
                {(isCreatingProfile || isEditingProfile) && (
                  <button
                    onClick={isCreatingProfile ? handleCreateProfile : handleUpdateProfile}
                    className="w-full px-4 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {isCreatingProfile ? 'Create Profile' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Script Upload */}
        <div className="border-t border-[rgba(168,85,247,0.1)] pt-6 mt-6">
          <label className="block text-sm font-medium text-[#a1a1aa] mb-3">Script Files (.txt)</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
              isDragging
                ? 'border-[#fb923c] bg-[rgba(234,88,12,0.1)]'
                : 'border-[rgba(168,85,247,0.2)] bg-[rgba(15,12,25,0.3)] hover:border-[rgba(168,85,247,0.4)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setScriptFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                }
              }}
            />
            <div className="text-center">
              <FileText className={`w-10 h-10 mx-auto mb-2 ${isDragging ? 'text-[#fb923c]' : 'text-[#71717a]'}`} />
              <p className="text-sm text-[#a1a1aa]">Drop .txt files here or click to browse</p>
              <p className="text-xs text-[#52525b] mt-1">{scriptFiles.length} file{scriptFiles.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          
          {/* File List */}
          {scriptFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {scriptFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
                  <span className="text-sm text-[#f8fafc] truncate">{file.name}</span>
                  <button
                    onClick={() => setScriptFiles(prev => prev.filter((_, i) => i !== idx))}
                    className="text-[#71717a] hover:text-[#f87171]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Worker Status */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${workerDisplay.color} ${workerStatus === 'online' ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-medium ${workerDisplay.textColor}`}>{workerDisplay.text}</span>
          </div>
          {workerStatus === 'offline' && (
            <span className="text-xs text-[#52525b]">Start the Pravus worker on your PC</span>
          )}
        </div>
      </div>

      {/* Jobs Queue */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#f8fafc]">Recent Jobs</h2>
          <div className="flex items-center gap-1.5 text-xs text-[#52525b]">
            <Info className="w-3.5 h-3.5" />
            <span>Videos auto-delete after 24h</span>
          </div>
        </div>
        
        {jobs.length === 0 ? (
          <div className="text-center py-12 text-[#52525b]">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-[#71717a]">No jobs yet</p>
            <p className="text-sm">Upload scripts and generate videos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-4 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)] transition-colors group">
                <div className="flex items-center gap-4">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-[#f8fafc] font-medium">{(job.input_data as any).channel_name || 'Untitled'}</p>
                    <p className="text-[#71717a] text-sm">
                      {job.status === 'completed' ? 'Ready to download' : job.status} • {formatTime(job.created_at)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {job.status === 'completed' && job.output_url && (
                    <a
                      href={job.output_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-sm font-medium text-[#fb923c] bg-[rgba(234,88,12,0.1)] border border-[rgba(234,88,12,0.25)] hover:bg-[rgba(234,88,12,0.2)] transition-colors inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  )}
                  
                  <button
                    onClick={async () => {
                      if (confirm('Delete this job?')) {
                        try {
                          if (job.output_url) {
                            await fetch('/api/r2/delete', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ jobId: job.id }),
                            });
                          }
                          await deleteVideoJob(job.id);
                          setJobs(prev => prev.filter(j => j.id !== job.id));
                        } catch (err) {
                          console.error('Error deleting job:', err);
                        }
                      }
                    }}
                    className="p-2 rounded-lg text-[#71717a] hover:text-[#f87171] hover:bg-[rgba(248,113,113,0.1)] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

