'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Clock, CheckCircle2, XCircle, Loader2, Moon, Sun, Plus, Trash2, Download, Upload, User, FileText, X } from 'lucide-react';
import { createVideoJob, getVideoJobs, subscribeToVideoJobs, type VideoJob } from '@/lib/supabase';

interface Person {
  id: string;
  name: string;
  voice: string;
  image: string | null; // base64 encoded image
}

interface IMessageGeneratorProps {
  userId: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
];

// ElevenLabs voice IDs
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing jobs on mount
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
    
    // Subscribe to real-time updates
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

  const handleImageUpload = (personId: string, file: File) => {
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
      setUploadedFileName(file.name);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleScriptFileUpload(file);
    }
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
      });
      
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
      case 'pending':
        return <Clock className="w-5 h-5 text-[#fbbf24]" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-[#60a5fa] animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-[#4ade80]" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-[#f87171]" />;
    }
  };

  const getStatusText = (job: VideoJob) => {
    switch (job.status) {
      case 'pending':
        return 'Waiting for worker...';
      case 'processing':
        return `Processing${job.progress > 0 ? ` (${job.progress}%)` : '...'}`;
      case 'completed':
        return 'Ready to download';
      case 'failed':
        return job.error_message || 'Failed';
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
          
          {/* Generate Button - Top Right */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !projectName.trim() || !script.trim()}
            className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#15803d] shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all inline-flex items-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MessageSquare className="w-5 h-5" />
            )}
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
          {/* Left Column - Settings & Script */}
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

            {/* Language & Dark Mode Row */}
            <div className="flex items-end gap-4">
              {/* Language Flags */}
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

              {/* Dark Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Darkmode</label>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`w-16 h-10 rounded-full p-1 transition-all ${
                    darkMode
                      ? 'bg-[rgba(34,197,94,0.3)]'
                      : 'bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)]'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      darkMode
                        ? 'translate-x-6 bg-[#4ade80]'
                        : 'translate-x-0 bg-[#52525b]'
                    }`}
                  >
                    {darkMode ? <Moon className="w-4 h-4 text-[#0f0f0f]" /> : <Sun className="w-4 h-4 text-[#a1a1aa]" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Script Upload Area */}
            <div>
              <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Script</label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative mb-3 p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                  isDragging
                    ? 'border-[#4ade80] bg-[rgba(34,197,94,0.1)]'
                    : 'border-[rgba(168,85,247,0.2)] bg-[rgba(15,12,25,0.3)] hover:border-[rgba(168,85,247,0.4)]'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleScriptFileUpload(file);
                  }}
                />
                <div className="flex flex-col items-center gap-2 py-2">
                  <Upload className={`w-8 h-8 ${isDragging ? 'text-[#4ade80]' : 'text-[#60a5fa]'}`} />
                  <p className="text-[#a1a1aa] text-sm">
                    {uploadedFileName ? (
                      <span className="text-[#4ade80] flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {uploadedFileName}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFileName(null);
                            setScript('');
                          }}
                          className="text-[#f87171] hover:text-[#ef4444]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ) : (
                      <>Drag and drop <span className="text-[#f8fafc]">.txt file</span> or click to browse</>
                    )}
                  </p>
                </div>
              </div>

              {/* Script Textarea */}
              <textarea
                value={script}
                onChange={(e) => {
                  setScript(e.target.value);
                  setUploadedFileName(null);
                }}
                placeholder={`A: Hey, what's up?
B: Not much, just chilling
x-A: This is from sender (blue bubble)
-$-
text: typing indicator...
-$-
B: Cool!`}
                className="w-full h-48 px-4 py-3 rounded-xl bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.4)] resize-none font-mono text-sm transition-colors"
              />
            </div>
          </div>

          {/* Right Column - People Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-[#a1a1aa]">People & Voices</label>
              <span className="text-xs text-[#52525b]">{people.length}/10</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {people.map((person) => (
                <div
                  key={person.id}
                  className="p-4 rounded-xl bg-[rgba(15,12,25,0.5)] border border-[rgba(168,85,247,0.15)] space-y-3 relative group"
                >
                  {/* Person Label */}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[#f8fafc]">
                      {person.id.toUpperCase()}
                    </span>
                    {people.length > 2 && (
                      <button
                        onClick={() => removePerson(person.id)}
                        className="opacity-0 group-hover:opacity-100 text-[#71717a] hover:text-[#f87171] transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Profile Picture & Name Row */}
                  <div className="flex gap-3">
                    {/* Profile Picture Upload */}
                    <label className="cursor-pointer flex-shrink-0">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(person.id, file);
                        }}
                      />
                      <div className={`w-12 h-12 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${
                        person.image
                          ? 'border-[#4ade80]'
                          : 'border-[rgba(96,165,250,0.4)] hover:border-[#60a5fa]'
                      }`}>
                        {person.image ? (
                          <img src={person.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-[#60a5fa]" />
                        )}
                      </div>
                    </label>

                    {/* Name Input */}
                    <input
                      type="text"
                      value={person.name}
                      onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                      placeholder="Name"
                      maxLength={25}
                      className="flex-1 px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.1)] text-[#f8fafc] text-sm placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.3)]"
                    />
                  </div>

                  {/* Voice Dropdown */}
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

              {/* Add Person Card */}
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

        {/* Worker Status */}
        <div className="mt-6 flex items-center gap-2 text-[#52525b] text-sm">
          <div className="w-2 h-2 rounded-full bg-[#fbbf24] animate-pulse" />
          <span>Worker must be running on your PC</span>
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
              <div
                key={job.id}
                className="flex items-center justify-between p-4 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)] transition-colors"
              >
                <div className="flex items-center gap-4">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-[#f8fafc] font-medium">{job.input_data.project_name}</p>
                    <p className="text-[#71717a] text-sm">
                      {getStatusText(job)} • {formatTime(job.created_at)}
                    </p>
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
                    <div
                      className="h-full bg-gradient-to-r from-[#60a5fa] to-[#3b82f6] transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Section - Collapsible */}
      <details className="glass-card">
        <summary className="p-6 cursor-pointer text-lg font-semibold text-[#f8fafc] hover:text-[#4ade80] transition-colors">
          Script Syntax Guide
        </summary>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#4ade80]">A: Hello</code>
              <p className="text-[#71717a] mt-1">Person A sends a message (receiver/gray)</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#60a5fa]">x-A: Hello</code>
              <p className="text-[#71717a] mt-1">Person A as sender (blue bubble)</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#f87171]">undelivered-A: Failed</code>
              <p className="text-[#71717a] mt-1">Undelivered message (green + error)</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#fbbf24]">[!photo.png!]</code>
              <p className="text-[#71717a] mt-1">Insert an image in chat</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#c084fc]">##secret##</code>
              <p className="text-[#71717a] mt-1">Blur/censor text</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#71717a]">-$-</code>
              <p className="text-[#71717a] mt-1">New image/segment separator</p>
            </div>
            <div className="p-3 rounded-lg bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)]">
              <code className="text-[#71717a]">text: typing...</code>
              <p className="text-[#71717a] mt-1">Show typing indicator text</p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
