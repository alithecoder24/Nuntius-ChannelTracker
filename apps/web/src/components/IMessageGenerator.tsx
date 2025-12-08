'use client';

import { useState } from 'react';
import { MessageSquare, Clock, CheckCircle2, XCircle, Loader2, Moon, Sun, Plus, Trash2, Upload, Globe } from 'lucide-react';

interface Person {
  id: string;
  name: string;
  voice: string;
}

interface Job {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  createdAt: string;
  error?: string;
  videoUrl?: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
];

// These would come from ElevenLabs API in the real implementation
const SAMPLE_VOICES = [
  { id: 'voice1', name: 'Rachel' },
  { id: 'voice2', name: 'Drew' },
  { id: 'voice3', name: 'Clyde' },
  { id: 'voice4', name: 'Paul' },
  { id: 'voice5', name: 'Domi' },
  { id: 'voice6', name: 'Dave' },
  { id: 'voice7', name: 'Fin' },
  { id: 'voice8', name: 'Sarah' },
];

export default function IMessageGenerator() {
  const [projectName, setProjectName] = useState('');
  const [script, setScript] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [people, setPeople] = useState<Person[]>([
    { id: 'a', name: '', voice: '' },
    { id: 'b', name: '', voice: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);

  const addPerson = () => {
    if (people.length >= 10) return;
    const nextId = String.fromCharCode(97 + people.length); // a, b, c, ...
    setPeople([...people, { id: nextId, name: '', voice: '' }]);
  };

  const removePerson = (id: string) => {
    if (people.length <= 2) return;
    setPeople(people.filter(p => p.id !== id));
  };

  const updatePerson = (id: string, field: 'name' | 'voice', value: string) => {
    setPeople(people.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async () => {
    if (!projectName.trim() || !script.trim()) {
      alert('Please enter a project name and script');
      return;
    }

    // Check that at least first two people have names and voices
    if (!people[0].name || !people[0].voice || !people[1].name || !people[1].voice) {
      alert('Please configure at least the first two people (names and voices)');
      return;
    }

    setIsSubmitting(true);
    
    // TODO: Submit to Supabase video_jobs table
    const newJob: Job = {
      id: crypto.randomUUID(),
      name: projectName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    setJobs([newJob, ...jobs]);
    
    // Simulate job creation
    setTimeout(() => {
      setIsSubmitting(false);
      setProjectName('');
      // Don't clear script - user might want to generate variations
    }, 500);
  };

  const getStatusIcon = (status: Job['status']) => {
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

  const getStatusText = (job: Job) => {
    switch (job.status) {
      case 'pending':
        return 'Waiting for worker...';
      case 'processing':
        return `Processing${job.progress ? ` (${job.progress}%)` : '...'}`;
      case 'completed':
        return 'Ready to download';
      case 'failed':
        return job.error || 'Failed';
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#22c55e]/20 to-[#4ade80]/20 flex items-center justify-center border border-[rgba(34,197,94,0.3)] shadow-[0_0_20px_rgba(34,197,94,0.15)]">
            <MessageSquare className="w-7 h-7 text-[#4ade80]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#f8fafc]">iMessage Generator</h1>
            <p className="text-[#71717a] text-sm">Generate realistic iMessage conversation videos with AI voices</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Top Row: Project Name + Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
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
            
            {/* Settings */}
            <div className="flex gap-3">
              {/* Dark Mode Toggle */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Theme</label>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`w-full px-4 py-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                    darkMode
                      ? 'bg-[rgba(30,30,40,0.8)] border-[rgba(100,100,120,0.4)] text-[#a1a1aa]'
                      : 'bg-[rgba(255,255,255,0.1)] border-[rgba(255,255,255,0.2)] text-[#f8fafc]'
                  }`}
                >
                  {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {darkMode ? 'Dark' : 'Light'}
                </button>
              </div>

              {/* Language */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] focus:outline-none focus:border-[rgba(34,197,94,0.4)] transition-colors appearance-none cursor-pointer"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* People/Voices Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-[#a1a1aa]">People & Voices</label>
              {people.length < 10 && (
                <button
                  onClick={addPerson}
                  className="text-xs text-[#4ade80] hover:text-[#22c55e] flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Person
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {people.map((person, idx) => (
                <div
                  key={person.id}
                  className="p-3 rounded-xl bg-[rgba(15,12,25,0.4)] border border-[rgba(168,85,247,0.1)] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#4ade80] uppercase">
                      Person {person.id.toUpperCase()}
                    </span>
                    {people.length > 2 && (
                      <button
                        onClick={() => removePerson(person.id)}
                        className="text-[#71717a] hover:text-[#f87171] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={person.name}
                    onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                    placeholder="Name"
                    maxLength={25}
                    className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.1)] text-[#f8fafc] text-sm placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.3)]"
                  />
                  <select
                    value={person.voice}
                    onChange={(e) => updatePerson(person.id, 'voice', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.1)] text-[#f8fafc] text-sm focus:outline-none focus:border-[rgba(34,197,94,0.3)] appearance-none cursor-pointer"
                  >
                    <option value="">Select voice...</option>
                    {SAMPLE_VOICES.map(voice => (
                      <option key={voice.id} value={voice.id}>{voice.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Script */}
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Conversation Script</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={`Enter your conversation script...

Format:
A: Hey, what's up?
B: Not much, just chilling
x-A: This message is from the sender (blue bubble)
A: This is from the receiver (gray bubble)

Special features:
- x- prefix = sender (blue/green bubble)
- undelivered- prefix = undelivered message
- [!image.png!] = insert image
- ##text## = censor/blur text
- |b|sound| = play sound before
- |a|sound| = play sound after`}
              className="w-full h-56 px-4 py-3 rounded-xl bg-[rgba(15,12,25,0.6)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder-[#52525b] focus:outline-none focus:border-[rgba(34,197,94,0.4)] resize-none font-mono text-sm transition-colors"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !projectName.trim() || !script.trim()}
              className="btn btn-primary px-8 py-3.5 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#15803d] border-0 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4" />
              )}
              Generate Video
            </button>
            <div className="flex items-center gap-2 text-[#52525b] text-sm">
              <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
              <span>Your PC worker must be running</span>
            </div>
          </div>
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
                    <p className="text-[#f8fafc] font-medium">{job.name}</p>
                    <p className="text-[#71717a] text-sm">{getStatusText(job)}</p>
                  </div>
                </div>
                
                {job.status === 'completed' && (
                  <button className="px-4 py-2 rounded-xl text-sm font-medium text-[#4ade80] bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.25)] hover:bg-[rgba(34,197,94,0.2)] transition-colors">
                    Download
                  </button>
                )}
                
                {job.status === 'processing' && job.progress !== undefined && (
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

      {/* Help Section */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-[#f8fafc] mb-4">Script Syntax Guide</h2>
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
        </div>
      </div>
    </div>
  );
}

