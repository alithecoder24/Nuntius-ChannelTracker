'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Clock, CheckCircle2, XCircle, Loader2, Moon, Sun, Plus, Trash2, Download, Upload, User, FileText, X, Image, Wifi, WifiOff } from 'lucide-react';
import { createVideoJob, getVideoJobs, subscribeToVideoJobs, getWorkerStatus, subscribeToWorkerStatus, type VideoJob, type WorkerHeartbeat } from '@/lib/supabase';

interface Person {
  id: string;
  name: string;
  voice: string;
  image: string | null;
}

interface UploadedImage {
  name: string;
  data: string; // base64
}

interface IMessageGeneratorProps {
  userId: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
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
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi' },
];

export default function IMessageGenerator({ userId }: IMessageGeneratorProps) {
  const [projectName, setProjectName] = useState('');
  const [script, setScript] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [people, setPeople] = useState<Person[]>([
    { id: 'a', name: '', voice: '', image: null },
    { id: 'b', name: '', voice: '', image: null },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Script upload
  const [isDraggingScript, setIsDraggingScript] = useState(false);
  const [uploadedScriptName, setUploadedScriptName] = useState<string | null>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  
  // Images upload
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  
  // Worker status
  const [workerStatus, setWorkerStatus] = useState<'online' | 'busy' | 'offline'>('offline');
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  // Load jobs and subscribe to updates
  useEffect(() => {
    let mounted = true;
    
    const loadJobs = async () => {
      try {
        const existingJobs = await getVideoJobs(userId);
        if (mounted) setJobs(existingJobs);
      } catch (err) {
        console.error('Error loading jobs:', err);
      }
    };
    
    loadJobs();
    
    const subscription = subscribeToVideoJobs(userId, (updatedJob) => {
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
        setLastHeartbeat(null);
        return;
      }
      
      const lastBeat = new Date(heartbeat.last_heartbeat);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastBeat.getTime()) / 1000;
      
      setLastHeartbeat(lastBeat);
      
      // If last heartbeat was more than 30 seconds ago, consider offline
      if (diffSeconds > 30) {
        setWorkerStatus('offline');
      } else {
        setWorkerStatus(heartbeat.status || 'online');
      }
    };
    
    const subscription = subscribeToWorkerStatus('imessage-generator', checkWorkerStatus);
    
    // Also poll every 10 seconds as backup
    const interval = setInterval(async () => {
      const status = await getWorkerStatus('imessage-generator');
      checkWorkerStatus(status);
    }, 10000);
    
    return () => {
      mounted = false;
      subscription.then(sub => sub.unsubscribe());
      clearInterval(interval);
    };
  }, []);

  const addPerson = () => {
    if (people.length >= 10) return;
    const nextId = String.fromCharCode(97 + people.length);
    setPeople([...people, { id: nextId, name: '', voice: '', image: null }]);
  };

  const removePerson = (id: string) => {
    if (people.length <= 2) return;
    setPeople(people.filter(p => p.id !== id));
  };

  const updatePerson = (id: string, field: keyof Person, value: string | null) => {
    setPeople(people.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleProfileImageUpload = (personId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      updatePerson(personId, 'image', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleScriptFileUpload = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Please upload a .txt file');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setScript(reader.result as string);
      setUploadedScriptName(file.name);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleImagesUpload = (files: FileList) => {
    const newImages: UploadedImage[] = [];
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImages(prev => [...prev, {
          name: file.name,
          data: reader.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeUploadedImage = (name: string) => {
    setUploadedImages(prev => prev.filter(img => img.name !== name));
  };

  const handleSubmit = async () => {
    if (!projectName.trim() || !script.trim()) {
      setError('Please enter a project name and script');
      return;
    }

    if (!people[0].name || !people[0].voice || !people[1].name || !people[1].voice) {
      setError('Please configure at least the first two people (names and voices)');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      const newJob = await createVideoJob(userId, {
        project_name: projectName,
        script: script,
        dark_mode: darkMode,
        language: language,
        people: people.filter(p => p.name && p.voice).map(p => ({
          id: p.id,
          name: p.name,
          voice: p.voice,
          image: p.image,
        })),
        images: uploadedImages,
      } as any);
      
      setJobs([newJob, ...jobs]);
      setProjectName('');
    } catch (err) {
      console.error('Error creating job:', err);
      setError('Failed to create job. Make sure the video_jobs table exists in Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: VideoJob['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-5 h-5 text-[#fbbf24]" />;
      case 'processing': return <Loader2 className="w-5 h-5 text-[#60a5fa] animate-spin" />;
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-[#4ade80]" />;
      case 'failed': return <XCircle className="w-5 h-5 text-[#f87171]" />;
    }
  };

  const getStatusText = (job: VideoJob) => {
    switch (job.status) {
      case 'pending': return 'Waiting for worker...';
      case 'processing': return `Processing${job.progress > 0 ? ` (${job.progress}%)` : '...'}`;
      case 'completed': return 'Ready to download';
      case 'failed': return job.error_message || 'Failed';
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
      case 'online':
        return { color: 'bg-[#4ade80]', text: 'Worker Online', textColor: 'text-[#4ade80]' };
      case 'busy':
        return { color: 'bg-[#fbbf24]', text: 'Worker Busy', textColor: 'text-[#fbbf24]' };
      case 'offline':
        return { color: 'bg-[#f87171]', text: 'Worker Offline', textColor: 'text-[#f87171]' };
    }
  };

  const workerDisplay = getWorkerStatusDisplay();

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#22c55e]/20 to-[#4ade80]/20 flex items-center justify-center border border-[rgba(34,197,94,0.3)] shadow-[0_0_20px_rgba(34,197,94,0.15)]">
              <MessageSquare className="w-7 h-7 text-[#4ade80]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#f8fafc]">Chat Video Generator</h1>
              <p className="text-[#71717a] text-sm">Generate realistic iMessage conversation videos with AI voices</p>
            </div>
          </div>
          
          {/* Generate Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !projectName.trim() || !script.trim() || workerStatus === 'offline'}
            className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#15803d] shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all inline-flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
            Generate Video
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#f87171] text-sm">
            {error}
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Conversation"
                maxLength={25}
                className="w-full px-4 py-3 rounded-xl bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.4)] transition-colors"
              />
            </div>

            {/* Language & Dark Mode */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Language</label>
                <div className="flex gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`px-4 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${
                        language === lang.code
                          ? 'bg-[rgba(34,197,94,0.15)] border-[rgba(34,197,94,0.4)] text-[#4ade80]'
                          : 'bg-[rgba(15,12,25,0.4)] border-[rgba(168,85,247,0.1)] text-[#a1a1aa] hover:border-[rgba(168,85,247,0.25)]'
                      }`}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-sm font-medium">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Darkmode</label>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`w-16 h-10 rounded-full p-1 transition-all ${
                    darkMode ? 'bg-[rgba(34,197,94,0.3)]' : 'bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    darkMode ? 'translate-x-6 bg-[#4ade80]' : 'translate-x-0 bg-[#52525b]'
                  }`}>
                    {darkMode ? <Moon className="w-4 h-4 text-[#0f0f0f]" /> : <Sun className="w-4 h-4 text-[#a1a1aa]" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Script & Images Upload Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Script Upload */}
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Script File</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingScript(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingScript(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingScript(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleScriptFileUpload(file);
                  }}
                  onClick={() => scriptInputRef.current?.click()}
                  className={`p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all h-24 flex flex-col items-center justify-center ${
                    isDraggingScript
                      ? 'border-[#4ade80] bg-[rgba(34,197,94,0.1)]'
                      : 'border-[rgba(168,85,247,0.2)] bg-[rgba(15,12,25,0.3)] hover:border-[rgba(168,85,247,0.4)]'
                  }`}
                >
                  <input
                    ref={scriptInputRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleScriptFileUpload(file); }}
                  />
                  <FileText className={`w-6 h-6 mb-1 ${isDraggingScript ? 'text-[#4ade80]' : 'text-[#60a5fa]'}`} />
                  <p className="text-xs text-[#71717a] text-center">
                    {uploadedScriptName ? (
                      <span className="text-[#4ade80] flex items-center gap-1">
                        {uploadedScriptName}
                        <button onClick={(e) => { e.stopPropagation(); setUploadedScriptName(null); setScript(''); }} className="text-[#f87171]">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : 'Drop .txt or click'}
                  </p>
                </div>
              </div>

              {/* Images Upload */}
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Images</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingImages(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingImages(false);
                    handleImagesUpload(e.dataTransfer.files);
                  }}
                  onClick={() => imagesInputRef.current?.click()}
                  className={`p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all h-24 flex flex-col items-center justify-center ${
                    isDraggingImages
                      ? 'border-[#4ade80] bg-[rgba(34,197,94,0.1)]'
                      : 'border-[rgba(168,85,247,0.2)] bg-[rgba(15,12,25,0.3)] hover:border-[rgba(168,85,247,0.4)]'
                  }`}
                >
                  <input
                    ref={imagesInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleImagesUpload(e.target.files); }}
                  />
                  <Image className={`w-6 h-6 mb-1 ${isDraggingImages ? 'text-[#4ade80]' : 'text-[#c084fc]'}`} />
                  <p className="text-xs text-[#71717a] text-center">
                    {uploadedImages.length > 0 ? (
                      <span className="text-[#c084fc]">{uploadedImages.length} image{uploadedImages.length > 1 ? 's' : ''}</span>
                    ) : 'Drop images or click'}
                  </p>
                </div>
              </div>
            </div>

            {/* Uploaded Images Preview */}
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((img) => (
                  <div key={img.name} className="relative group">
                    <img src={img.data} alt={img.name} className="w-12 h-12 rounded-lg object-cover border border-[rgba(168,85,247,0.2)]" />
                    <button
                      onClick={() => removeUploadedImage(img.name)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f87171] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-[10px] text-[#71717a] truncate max-w-12 text-center">{img.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Script Textarea */}
            <div>
              <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Script</label>
              <textarea
                value={script}
                onChange={(e) => { setScript(e.target.value); setUploadedScriptName(null); }}
                placeholder={`A: Hey, what's up?
B: Not much, just chilling
x-A: This is from sender (blue bubble)
-$-
text: typing indicator...
-$-
B: Cool!`}
                className="w-full h-40 px-4 py-3 rounded-xl bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.4)] resize-none font-mono text-sm"
              />
            </div>
          </div>

          {/* Right Column - People */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-[#a1a1aa]">People & Voices</label>
              <span className="text-xs text-[#52525b]">{people.length}/10</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {people.map((person) => (
                <div key={person.id} className="p-4 rounded-xl bg-[rgba(15,12,25,0.5)] border border-[rgba(168,85,247,0.15)] space-y-3 relative group">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[#f8fafc]">{person.id.toUpperCase()}</span>
                    {people.length > 2 && (
                      <button onClick={() => removePerson(person.id)} className="opacity-0 group-hover:opacity-100 text-[#71717a] hover:text-[#f87171] transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <label className="cursor-pointer flex-shrink-0">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleProfileImageUpload(person.id, file); }}
                      />
                      <div className={`w-12 h-12 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${
                        person.image ? 'border-[#4ade80]' : 'border-[rgba(96,165,250,0.4)] hover:border-[#60a5fa]'
                      }`}>
                        {person.image ? (
                          <img src={person.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-[#60a5fa]" />
                        )}
                      </div>
                    </label>

                    <input
                      type="text"
                      value={person.name}
                      onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                      placeholder="Name"
                      maxLength={25}
                      className="flex-1 px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.1)] text-[#f8fafc] text-sm placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.3)]"
                    />
                  </div>

                  <select
                    value={person.voice}
                    onChange={(e) => updatePerson(person.id, 'voice', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.1)] text-[#f8fafc] text-sm focus:outline-none focus:border-[rgba(34,197,94,0.3)] appearance-none cursor-pointer"
                  >
                    <option value="">Select voice...</option>
                    {VOICES.map(voice => (
                      <option key={voice.id} value={voice.id}>{voice.name}</option>
                    ))}
                  </select>
                </div>
              ))}

              {people.length < 10 && (
                <button
                  onClick={addPerson}
                  className="p-4 rounded-xl border-2 border-dashed border-[rgba(168,85,247,0.2)] hover:border-[rgba(34,197,94,0.4)] hover:bg-[rgba(34,197,94,0.05)] transition-all flex items-center justify-center min-h-[140px]"
                >
                  <Plus className="w-8 h-8 text-[#52525b]" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Worker Status Indicator */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${workerDisplay.color} ${workerStatus === 'online' ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-medium ${workerDisplay.textColor}`}>{workerDisplay.text}</span>
          </div>
          {workerStatus === 'offline' && (
            <span className="text-xs text-[#52525b]">Start the worker on your PC to generate videos</span>
          )}
          {workerStatus === 'online' && (
            <span className="text-xs text-[#52525b]">Ready to process jobs</span>
          )}
          {workerStatus === 'busy' && (
            <span className="text-xs text-[#52525b]">Processing another job...</span>
          )}
        </div>
      </div>

      {/* Job Queue */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-[#f8fafc] mb-4">Recent Jobs</h2>
        
        {jobs.length === 0 ? (
          <div className="text-center py-12 text-[#52525b]">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-[#71717a]">No jobs yet</p>
            <p className="text-sm">Submit a script to start generating videos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-4 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)] transition-colors">
                <div className="flex items-center gap-4">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-[#f8fafc] font-medium">{job.input_data.project_name}</p>
                    <p className="text-[#71717a] text-sm">{getStatusText(job)} • {formatTime(job.created_at)}</p>
                  </div>
                </div>
                
                {job.status === 'completed' && job.output_url && (
                  <a
                    href={job.output_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl text-sm font-medium text-[#4ade80] bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.25)] hover:bg-[rgba(34,197,94,0.2)] transition-colors inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                )}
                
                {job.status === 'processing' && job.progress > 0 && (
                  <div className="w-24 h-2 bg-[rgba(15,12,25,0.6)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#60a5fa] to-[#3b82f6] transition-all duration-300" style={{ width: `${job.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Section */}
      <details className="glass-card">
        <summary className="p-6 cursor-pointer text-lg font-semibold text-[#f8fafc] hover:text-[#4ade80] transition-colors">
          Script Syntax Guide
        </summary>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#4ade80]">A: Hello</code>
              <p className="text-[#71717a] mt-1">Person A sends (receiver/gray)</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#60a5fa]">x-A: Hello</code>
              <p className="text-[#71717a] mt-1">Person A as sender (blue)</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#fbbf24]">[!photo.png!]</code>
              <p className="text-[#71717a] mt-1">Insert uploaded image</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#c084fc]">##secret##</code>
              <p className="text-[#71717a] mt-1">Blur/censor text</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#71717a]">-$-</code>
              <p className="text-[#71717a] mt-1">New segment separator</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#71717a]">text: typing...</code>
              <p className="text-[#71717a] mt-1">Typing indicator</p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
