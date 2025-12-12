'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Video, Clock, CheckCircle2, XCircle, Loader2, Plus, Trash2, Download, 
  Upload, User, FileText, X, Settings, Save, Edit2, ChevronDown, Music,
  Palette, Type, Timer, Sparkles, Info
} from 'lucide-react';
import { 
  createVideoJob, getVideoJobs, deleteVideoJob, subscribeToVideoJobs, 
  getWorkerStatus, subscribeToWorkerStatus, type VideoJob, type WorkerHeartbeat,
  getRedditProfiles, createRedditProfile, updateRedditProfile, deleteRedditProfile, type RedditProfile
} from '@/lib/supabase';

// Types - Use RedditProfile from supabase
type Profile = RedditProfile;

interface PravusGeneratorProps {
  userId: string;
}

// Voice Provider Types
type VoiceProvider = 'elevenlabs' | 'ai33' | 'genpro';
type SubProvider = 'elevenlabs' | 'minimax';

// Constants
const FONTS = [
  { id: 'montserrat', name: 'Montserrat' },
  { id: 'lato', name: 'Lato' },
  { id: 'fredoka', name: 'Fredoka' },
  { id: 'grover', name: 'Grover' },
];

const VOICE_PROVIDERS = [
  { id: 'elevenlabs', name: 'ElevenLabs' },
  { id: 'ai33', name: 'AI33' },
  { id: 'genpro', name: 'GenPro' },
];

const SUB_PROVIDERS = [
  { id: 'elevenlabs', name: 'ElevenLabs' },
  { id: 'minimax', name: 'MiniMax' },
];

// ElevenLabs voices (direct)
const ELEVENLABS_VOICES = [
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

// AI33-ElevenLabs voices (custom)
const AI33_ELEVENLABS_VOICES = [
  { id: 'ErXwobaYiN019PkySvjV', name: 'Ali_Custom_EL' },
];

// AI33-MiniMax voices (placeholder)
const AI33_MINIMAX_VOICES = [
  { id: 'minimax_voice_1', name: 'MiniMax Voice 1' },
  { id: 'minimax_voice_2', name: 'MiniMax Voice 2' },
];

// ElevenLabs models
const ELEVENLABS_MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5' },
  { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
  { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1' },
];

// MiniMax models (placeholder)
const MINIMAX_MODELS = [
  { id: 'minimax_default', name: 'MiniMax Default' },
];

// Badge filenames must match exactly what's in src/assets/Badges/
const BADGES = [
  '5izbv4fn0md41_Wholesome.png',
  '0o2j782f00e41_WholesomeSuperpro 1.png',
  'b9ks3a5k7jj41_WholesomeSealofApproval.png',
  '12kz7a7j4v541_HeartEyes.png',
  'j3azv69qjfn51_LOVE.png',
  'Superheart_512.png',
  'v1mxw8i6wnf51_Heartwarming.png',
  '6vgr8y21i9741_PlusOne.png',
  '7atjjqpy1mc41_Updoot.png',
  'Updoot_512.png',
  '8ad2jffnclf41_Thanks.png',
  'klvxk1wggfd41_Helpful.png',
  'trfv6ems1md41_BlessUp.png',
  'xe5mw55w5v541_BlessUp.png',
  'wa987k0p4v541_MindBlown.png',
  'x52x5be57fd41_GOAT.png',
  'ey2iodron2s41_Facepalm.png',
  'fck3iedi2ug51_Shocked.png',
  'zc4a9vk5zmc51_BuffDoge.png',
  '9avdcwgupta41_GottheW.png',
  '71v56o5a5v541_AwesomeAnswer.png',
  '2jd92wtn25g41_ImDeceased 1.png',
  '18mwqw5th9e51_MURICA.png',
  '35d17tf5e5f61_oldrocketlike.png',
  '43zl6dfcg9e51_EvilCackle.png',
  '45aeu8mzvsj51_IllDrinktoThat.png',
  '4samff1ud5f61_olddisappoint.png',
  '5nswjpyy44551_Ally.png',
  '80j20o397jj41_NarwhalSalute.png',
  'a7dhg27hvnf51_Yummy.png',
  'Animated_Cake_512 1.png',
  'b8xt4z8yajz31_Original.png',
  'bph2png4ajz31_TodayILearned.png',
  'CrabRave_512.png',
  'fukjtec638u41_TreeHug.png',
  'g77c4oud7hb51_KeepCalm.png',
  'Giggle_512.png',
  'gold.png',
  'hwnbr9l67s941_MadeMeSmile.png',
  'Illuminati_512.png',
  'iq0sgwn5bzy41_LawyerUp.png',
  'kjpl76213ug51_Looking.png',
  'kthj3e4h3bm41_YasQueen.png',
  'lop66ut2wnf51_TearingUp.png',
  'Mithril.png',
  'n94bgm83in941_ItsCute.png',
  'nvfe4gyawnf51_Dread.png',
  'p4yzxkaed5f61_oldtakemyenergy.png',
  'platinum.png',
  'rc5iesz2z8t41_Snek.png',
  'ree13odobef41_StonksFalling.png',
  's5edqq9abef41_StonksRising.png',
  'SnooClapping_512.png',
  'SnooClappingPremium_512.png',
  'Spits_drink_512.png',
  'TableSlap_512.png',
  'TakeMyPower_512.png',
  'tcofsbf92md41_PressF.png',
  'Timeless_512.png',
  'Train_silver_512.png',
  'vu6om0xnb7e41_This.png',
  'wg3lzllyg9n41_PotoCoins.png',
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
  
  // Current profile/form state (saved to profile)
  const [channelName, setChannelName] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [font, setFont] = useState('montserrat');
  const [videoLength, setVideoLength] = useState(179);
  const [music, setMusic] = useState('none');
  const [backgroundVideo, setBackgroundVideo] = useState('');
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [highlightColor, setHighlightColor] = useState('#ffff00');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [badgeStyle, setBadgeStyle] = useState<'blue' | 'gold'>('blue');
  
  // Voice settings (NOT saved to profile - set per job)
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>('elevenlabs');
  const [subProvider, setSubProvider] = useState<SubProvider>('elevenlabs');
  const [voiceModel, setVoiceModel] = useState('eleven_turbo_v2_5');
  const [voice, setVoice] = useState('');
  
  // Upload setting (NOT saved to profile - set per job)
  const [uploadToDrive, setUploadToDrive] = useState(true);
  
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
  // Shared ClipMix library (C:\Nuntius-Clip-Mix\)
  // Add more entries here when you add new clips to the folder
  const [clipMixes, setClipMixes] = useState<{id: string; name: string; emoji: string}[]>([
    { id: 'Mix_1', name: 'Cookim', emoji: '🥐' },
  ]);

  // Get available voices based on provider selection
  const getAvailableVoices = () => {
    if (voiceProvider === 'elevenlabs') {
      return ELEVENLABS_VOICES;
    } else if (voiceProvider === 'ai33') {
      return subProvider === 'elevenlabs' ? AI33_ELEVENLABS_VOICES : AI33_MINIMAX_VOICES;
    } else if (voiceProvider === 'genpro') {
      // GenPro uses ElevenLabs voices via Labs API
      return [
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
    }
    return ELEVENLABS_VOICES;
  };

  // Get available models based on provider selection
  const getAvailableModels = () => {
    if (voiceProvider === 'elevenlabs') {
      return ELEVENLABS_MODELS;
    } else if (voiceProvider === 'ai33') {
      return subProvider === 'elevenlabs' ? ELEVENLABS_MODELS : MINIMAX_MODELS;
    } else if (voiceProvider === 'genpro') {
      // GenPro uses ElevenLabs models via Labs API
      return [
        { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2' },
        { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5' },
        { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5' },
        { id: 'eleven_v3', name: 'Eleven v3' },
      ];
    }
    return ELEVENLABS_MODELS;
  };

  // Reset voice/model when provider changes
  useEffect(() => {
    const voices = getAvailableVoices();
    const models = getAvailableModels();
    if (voices.length > 0 && !voices.find(v => v.id === voice)) {
      setVoice(voices[0].id);
    }
    if (models.length > 0 && !models.find(m => m.id === voiceModel)) {
      setVoiceModel(models[0].id);
    }
  }, [voiceProvider, subProvider]);

  // Loading state for profiles
  const [profilesLoading, setProfilesLoading] = useState(true);
  
  // Load profiles from Supabase on mount
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        setProfilesLoading(true);
        const dbProfiles = await getRedditProfiles(userId);
        console.log('[Profiles] Loaded from Supabase:', dbProfiles.map(p => p.channel_name));
        setProfiles(dbProfiles);
      } catch (e) {
        console.error('[Profiles] Error loading:', e);
      } finally {
        setProfilesLoading(false);
      }
    };
    
    loadProfiles();
  }, [userId]);

  // Load jobs and subscribe to updates
  useEffect(() => {
    let mounted = true;
    
    const loadJobs = async () => {
      try {
        const existingJobs = await getVideoJobs(userId);
        // Filter to only pravus jobs
        const pravusJobs = existingJobs.filter(j => j.tool_type === 'pravus-generator');
        
        // Auto-delete jobs older than 24 hours
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentJobs: typeof pravusJobs = [];
        for (const job of pravusJobs) {
          const jobDate = new Date(job.created_at);
          if (jobDate < twentyFourHoursAgo) {
            // Delete old job (async, don't wait)
            try {
              if (job.output_url) {
                fetch('/api/r2/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jobId: job.id }),
                }).catch(() => {}); // Ignore R2 delete errors
              }
              deleteVideoJob(job.id).catch(() => {});
            } catch {
              // Ignore deletion errors
            }
          } else {
            recentJobs.push(job);
          }
        }
        
        if (mounted) setJobs(recentJobs);
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
    setVideoLength(profile.video_length);
    setMusic(profile.music);
    setBackgroundVideo(profile.background_video);
    setSelectedBadges(profile.selected_badges);
    setHighlightColor(profile.highlight_color);
    setAnimationsEnabled(profile.animations_enabled);
    setBadgeStyle(profile.badge_style);
    // Note: voice settings are NOT loaded from profile - they're set per job
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
  const handleCreateProfile = async () => {
    if (!channelName.trim()) {
      setError('Channel name is required');
      return;
    }
    
    try {
      const newProfile = await createRedditProfile(userId, {
        channel_name: channelName,
        profile_pic: profilePic,
        font,
        video_length: videoLength,
        music,
        background_video: backgroundVideo,
        selected_badges: selectedBadges,
        highlight_color: highlightColor,
        animations_enabled: animationsEnabled,
        badge_style: badgeStyle,
      });
      
      console.log('[Profiles] Created:', newProfile.channel_name);
      setProfiles(prev => [...prev, newProfile]);
      setSelectedProfileId(newProfile.id);
      setIsCreatingProfile(false);
      setError(null);
    } catch (e: unknown) {
      console.error('[Profiles] Create error:', e);
      const errMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to create profile: ${errMsg}`);
    }
  };

  // Update existing profile
  const handleUpdateProfile = async () => {
    if (!selectedProfileId || !channelName.trim()) return;
    
    try {
      const updated = await updateRedditProfile(selectedProfileId, {
        channel_name: channelName,
        profile_pic: profilePic,
        font,
        video_length: videoLength,
        music,
        background_video: backgroundVideo,
        selected_badges: selectedBadges,
        highlight_color: highlightColor,
        animations_enabled: animationsEnabled,
        badge_style: badgeStyle,
      });
      
      console.log('[Profiles] Updated:', updated.channel_name);
      setProfiles(prev => prev.map(p => p.id === selectedProfileId ? updated : p));
      setIsEditingProfile(false);
    } catch (e) {
      console.error('[Profiles] Update error:', e);
      setError('Failed to update profile. Please try again.');
    }
  };

  // Delete profile
  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('Delete this profile?')) return;
    
    try {
      await deleteRedditProfile(profileId);
      console.log('[Profiles] Deleted:', profileId);
      setProfiles(prev => prev.filter(p => p.id !== profileId));
      if (selectedProfileId === profileId) {
        setSelectedProfileId('');
        setChannelName('');
      }
    } catch (e) {
      console.error('[Profiles] Delete error:', e);
      setError('Failed to delete profile. Please try again.');
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
        // Voice settings
        voice_provider: voiceProvider,
        sub_provider: voiceProvider !== 'elevenlabs' ? subProvider : null,
        voice,
        voice_model: voiceModel,
        // Other settings
        video_length: videoLength,
        music,
        background_video: backgroundVideo,
        selected_badges: selectedBadges,
        highlight_color: highlightColor,
        animations_enabled: animationsEnabled,
        badge_style: badgeStyle,
        scripts: scripts,
        script_names: scriptFiles.map(f => f.name),
        upload_to_drive: uploadToDrive,
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
              <div
                key={profile.id}
                onClick={() => handleProfileSelect(profile.id)}
                className={`relative p-3 rounded-xl border transition-all flex flex-col items-center gap-2 group cursor-pointer ${
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
                
                {/* Settings button */}
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleProfileSelect(profile.id);
                    setIsEditingProfile(true);
                  }}
                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-[rgba(168,85,247,0.3)] text-[#a1a1aa] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[rgba(168,85,247,0.5)] hover:text-white transition-all"
                  title="Edit profile settings"
                >
                  <Settings className="w-3 h-3" />
                </button>
                
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[rgba(248,113,113,0.3)] text-[#f87171] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#f87171] hover:text-white transition-all"
                  title="Delete profile"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            
            {profiles.length === 0 && !isCreatingProfile && (
              <div className="col-span-full text-center py-8 text-[#52525b]">
                <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No profiles yet. Create your first one!</p>
              </div>
            )}
          </div>
        </div>

        {/* Profile Editor (shown ONLY when creating or editing - not just selected) */}
        {(isCreatingProfile || isEditingProfile) && (
          <div className="border-t border-[rgba(168,85,247,0.1)] pt-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#f8fafc]">
                {isCreatingProfile ? 'New Profile' : 'Profile Settings'}
              </h3>
              {/* Close button */}
              <button
                onClick={() => { setIsEditingProfile(false); setIsCreatingProfile(false); }}
                className="p-1.5 rounded-lg text-[#71717a] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.2)] transition-all"
                title="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
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

                {/* Badge Selection */}
                <div>
                  <label className="block text-xs font-medium text-[#71717a] mb-2">Select Badges ({selectedBadges.length} selected)</label>
                  <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto p-3 bg-[rgba(15,12,25,0.4)] rounded-lg border border-[rgba(168,85,247,0.1)]">
                    {BADGES.map((badge) => {
                      const isSelected = selectedBadges.includes(badge);
                      const displayName = badge.split('_').pop()?.replace('.png', '').replace(' 1', '') || badge;
                      return (
                        <label
                          key={badge}
                          className={`relative cursor-pointer group ${(!isCreatingProfile && !isEditingProfile) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={displayName}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (!isCreatingProfile && !isEditingProfile) return;
                              if (isSelected) {
                                setSelectedBadges(selectedBadges.filter(b => b !== badge));
                              } else {
                                setSelectedBadges([...selectedBadges, badge]);
                              }
                            }}
                            disabled={!isCreatingProfile && !isEditingProfile}
                            className="sr-only"
                          />
                          <div className={`w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center overflow-hidden ${
                            isSelected
                              ? 'border-[#fb923c] bg-[rgba(234,88,12,0.2)] ring-2 ring-[rgba(234,88,12,0.3)]'
                              : 'border-[rgba(168,85,247,0.2)] bg-[rgba(15,12,25,0.6)] group-hover:border-[rgba(168,85,247,0.4)]'
                          }`}>
                            <img 
                              src={`/badges/${badge}`} 
                              alt={displayName}
                              className="w-8 h-8 object-contain"
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#fb923c] rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </label>
                      );
                    })}
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

        {/* Upload Setting */}
        <div className="border-t border-[rgba(168,85,247,0.1)] pt-6 mt-6">
          <h3 className="text-lg font-semibold text-[#f8fafc] mb-4">Upload Settings</h3>
          
          <div className="mb-4">
            <button
              onClick={() => setUploadToDrive(!uploadToDrive)}
              className={`w-full px-4 py-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-between ${
                uploadToDrive
                  ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)] text-[#fb923c]'
                  : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.15)] text-[#f8fafc] hover:border-[rgba(168,85,247,0.25)]'
              }`}
            >
              <span className="flex items-center gap-2">
                {uploadToDrive ? <Upload className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                {uploadToDrive ? 'Upload to Drive' : 'Local Only'}
              </span>
              <div className={`w-12 h-6 rounded-full transition-colors ${
                uploadToDrive ? 'bg-[#fb923c]' : 'bg-[#52525b]'
              }`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  uploadToDrive ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`} />
              </div>
            </button>
            <p className="text-xs text-[#71717a] mt-2">
              {uploadToDrive 
                ? 'Videos will be uploaded to cloud storage and available for download' 
                : 'Videos will only be saved locally on your PC'}
            </p>
          </div>
        </div>

        {/* Voice Settings (separate from profile) */}
        <div className="border-t border-[rgba(168,85,247,0.1)] pt-6 mt-6">
          <h3 className="text-lg font-semibold text-[#f8fafc] mb-4">Voice Settings</h3>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Voice Provider */}
            <div>
              <label className="block text-xs font-medium text-[#71717a] mb-1">Provider</label>
              <div className="flex flex-col gap-1">
                {VOICE_PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => setVoiceProvider(provider.id as VoiceProvider)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all ${
                      voiceProvider === provider.id
                        ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)] text-[#fb923c]'
                        : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.25)]'
                    }`}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-Provider (only for AI33) */}
            {voiceProvider === 'ai33' && (
              <div>
                <label className="block text-xs font-medium text-[#71717a] mb-1">
                  AI33 via
                </label>
                <div className="flex flex-col gap-1">
                  {SUB_PROVIDERS.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setSubProvider(sub.id as SubProvider)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all ${
                        subProvider === sub.id
                          ? 'bg-[rgba(234,88,12,0.15)] border-[rgba(234,88,12,0.4)] text-[#fb923c]'
                          : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.25)]'
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Voice Model */}
            <div>
              <label className="block text-xs font-medium text-[#71717a] mb-1">Voice Model</label>
              <StyledSelect
                value={voiceModel}
                onChange={setVoiceModel}
                options={getAvailableModels()}
                placeholder="Select model..."
              />
            </div>

            {/* Voice */}
            <div>
              <label className="block text-xs font-medium text-[#71717a] mb-1">Voice</label>
              <StyledSelect
                value={voice}
                onChange={setVoice}
                options={getAvailableVoices()}
                placeholder="Select voice..."
              />
            </div>
          </div>
        </div>

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

      {/* Jobs Queue - Split View */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#f8fafc]">Jobs</h2>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* In Queue Column */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-4 h-4 text-[#fbbf24]" />
                <h3 className="text-sm font-medium text-[#a1a1aa]">In Queue</h3>
                <span className="px-1.5 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[#fbbf24] text-xs">
                  {jobs.filter(j => j.status === 'pending' || j.status === 'processing').length}
                </span>
              </div>
              <div className="space-y-2">
                {jobs.filter(j => j.status === 'pending' || j.status === 'processing').length === 0 ? (
                  <div className="text-center py-8 text-[#52525b] border border-dashed border-[rgba(168,85,247,0.15)] rounded-xl">
                    <p className="text-sm">No jobs in queue</p>
                  </div>
                ) : (
                  jobs.filter(j => j.status === 'pending' || j.status === 'processing').map(job => {
                    const inputData = job.input_data as any;
                    const scriptCount = inputData.scripts?.length || 1;
                    const profilePic = inputData.profile_pic;
                    
                    return (
                      <div key={job.id} className="p-3 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.25)] transition-colors group">
                        <div className="flex items-center gap-3">
                          {/* Profile Picture */}
                          <div className="w-10 h-10 rounded-full bg-[rgba(168,85,247,0.2)] overflow-hidden border-2 border-[rgba(168,85,247,0.3)] flex-shrink-0">
                            {profilePic ? (
                              <img src={profilePic} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="w-5 h-5 text-[#71717a]" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[#f8fafc] font-medium text-sm truncate">{inputData.channel_name || 'Untitled'}</p>
                              {/* Status Badge */}
                              {job.status === 'processing' ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.15)] text-[#fb923c] text-xs">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Generating
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[#fbbf24] text-xs">
                                  Queued
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#71717a]">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {scriptCount} script{scriptCount > 1 ? 's' : ''}
                              </span>
                              <span>•</span>
                              <span>{formatTime(job.created_at)}</span>
                            </div>
                            {/* Progress bar for processing jobs */}
                            {job.status === 'processing' && (
                              <div className="mt-2">
                                <div className="h-1.5 bg-[rgba(168,85,247,0.1)] rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-[#fb923c] to-[#fbbf24] rounded-full transition-all duration-500"
                                    style={{ width: `${job.progress || 0}%` }}
                                  />
                                </div>
                                {/* Status message */}
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-xs text-[#a1a1aa] truncate">
                                    {job.status_message || 'Starting...'}
                                  </span>
                                  <span className="text-xs text-[#fb923c] font-medium ml-2">
                                    {job.progress || 0}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
            {/* Finished Column */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#4ade80]" />
                <h3 className="text-sm font-medium text-[#a1a1aa]">Finished</h3>
                <span className="px-1.5 py-0.5 rounded-full bg-[rgba(74,222,128,0.15)] text-[#4ade80] text-xs">
                  {jobs.filter(j => j.status === 'completed' || j.status === 'failed').length}
                </span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {jobs.filter(j => j.status === 'completed' || j.status === 'failed').length === 0 ? (
                  <div className="text-center py-8 text-[#52525b] border border-dashed border-[rgba(168,85,247,0.15)] rounded-xl">
                    <p className="text-sm">No finished jobs</p>
                  </div>
                ) : (
                  jobs.filter(j => j.status === 'completed' || j.status === 'failed').map(job => {
                    const inputData = job.input_data as any;
                    const scriptCount = inputData.scripts?.length || 1;
                    const profilePic = inputData.profile_pic;
                    
                    return (
                      <div key={job.id} className="p-3 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.15)] hover:border-[rgba(168,85,247,0.25)] transition-colors group">
                        <div className="flex items-center gap-3">
                          {/* Profile Picture */}
                          <div className="w-10 h-10 rounded-full bg-[rgba(168,85,247,0.2)] overflow-hidden border-2 border-[rgba(168,85,247,0.3)] flex-shrink-0">
                            {profilePic ? (
                              <img src={profilePic} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="w-5 h-5 text-[#71717a]" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[#f8fafc] font-medium text-sm truncate">{inputData.channel_name || 'Untitled'}</p>
                              {job.status === 'completed' ? (
                                <span className="px-2 py-0.5 rounded-full bg-[rgba(74,222,128,0.15)] text-[#4ade80] text-xs">
                                  Ready
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-[rgba(248,113,113,0.15)] text-[#f87171] text-xs">
                                  Failed
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#71717a]">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {scriptCount} script{scriptCount > 1 ? 's' : ''}
                              </span>
                              <span>•</span>
                              <span>{formatTime(job.created_at)}</span>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            {job.status === 'completed' && job.output_url && (
                              <a
                                href={job.output_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg text-[#4ade80] hover:bg-[rgba(74,222,128,0.15)] transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
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
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

