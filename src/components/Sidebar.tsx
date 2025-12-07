'use client';

import { useState } from 'react';
import { 
  PenLine, 
  Archive, 
  Mic2, 
  FileText, 
  BookOpen,
  Plus,
  ChevronDown
} from 'lucide-react';

interface Profile {
  id: string;
  name: string;
}

interface SidebarProps {
  profiles: Profile[];
  activeProfile: string | null;
  onProfileSelect: (id: string) => void;
  onNewProfile: () => void;
}

export default function Sidebar({ 
  profiles, 
  activeProfile, 
  onProfileSelect,
  onNewProfile 
}: SidebarProps) {
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const tools = [
    { id: 'script', name: 'Script Writing', icon: PenLine },
    { id: 'prompts', name: 'Prompt Vault', icon: Archive },
    { id: 'voice', name: 'Voice Generation', icon: Mic2 },
    { id: 'transcription', name: 'Transcription', icon: FileText },
    { id: 'resources', name: 'Resources', icon: BookOpen },
  ];

  return (
    <aside className="w-[220px] h-screen glass-panel fixed left-0 top-0 flex flex-col z-10 border-r border-[rgba(168,85,247,0.15)]">
      {/* Logo */}
      <div className="p-5 border-b border-[rgba(168,85,247,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e879f9] via-[#c084fc] to-[#a855f7] flex items-center justify-center shadow-glow">
            <svg 
              viewBox="0 0 24 24" 
              className="w-5 h-5 text-white"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
            Nuntius
          </span>
        </div>
      </div>

      {/* Niche Research Section */}
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
          Niche Research
        </h3>
        <nav className="space-y-1">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => onProfileSelect(profile.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg sidebar-link ${
                activeProfile === profile.id 
                  ? 'active' 
                  : 'text-[#f8fafc] hover:text-white'
              }`}
            >
              {profile.name}
            </button>
          ))}
          <button
            onClick={onNewProfile}
            className="w-full text-left px-3 py-2.5 rounded-lg text-[#71717a] hover:text-[#c084fc] flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Profile
          </button>
        </nav>

        {/* Tools Section */}
        <div className="mt-8">
          <button 
            onClick={() => setToolsExpanded(!toolsExpanded)}
            className="flex items-center justify-between w-full text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3"
          >
            Tools
            <ChevronDown 
              className={`w-4 h-4 transition-transform ${toolsExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {toolsExpanded && (
            <nav className="space-y-1">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  className="w-full text-left px-3 py-2.5 rounded-lg sidebar-link text-[#f8fafc] hover:text-white flex items-center gap-3"
                >
                  <tool.icon className="w-4 h-4 text-[#a1a1aa]" />
                  {tool.name}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="h-20 bg-gradient-to-t from-[rgba(15,12,25,0.9)] to-transparent pointer-events-none" />
    </aside>
  );
}
