'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
}

interface SidebarProps {
  profiles: Profile[];
  activeProfile: string | null;
  onProfileSelect: (id: string) => void;
  onNewProfile: () => void;
  onRenameProfile?: (id: string, newName: string) => void;
  onDeleteProfile?: (id: string) => void;
}

export default function Sidebar({ 
  profiles, 
  activeProfile, 
  onProfileSelect,
  onNewProfile,
  onRenameProfile,
  onDeleteProfile,
}: SidebarProps) {
  const [hoveredProfile, setHoveredProfile] = useState<string | null>(null);
  const [menuOpenProfile, setMenuOpenProfile] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleStartEdit = (profile: Profile) => {
    setEditingProfile(profile.id);
    setEditName(profile.name);
    setMenuOpenProfile(null);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim() && onRenameProfile) {
      onRenameProfile(id, editName.trim());
    }
    setEditingProfile(null);
    setEditName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') handleSaveEdit(id);
    if (e.key === 'Escape') {
      setEditingProfile(null);
      setEditName('');
    }
  };

  return (
    <aside className="sidebar-glass w-[200px] flex-shrink-0 flex flex-col rounded-2xl overflow-hidden self-start">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <span className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider">
          Niche Research
        </span>
      </div>

      {/* Profiles List */}
      <div className="flex-1 px-2 overflow-y-auto">
        <nav className="space-y-1">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="relative"
              onMouseEnter={() => setHoveredProfile(profile.id)}
              onMouseLeave={() => {
                setHoveredProfile(null);
                if (menuOpenProfile === profile.id) setMenuOpenProfile(null);
              }}
            >
              {editingProfile === profile.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleSaveEdit(profile.id)}
                  onKeyDown={(e) => handleKeyDown(e, profile.id)}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl bg-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.3)] text-[14px] text-[#f8fafc] focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => onProfileSelect(profile.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 flex items-center justify-between group ${
                    activeProfile === profile.id 
                      ? 'bg-[rgba(168,85,247,0.2)] text-[#c084fc] border border-[rgba(168,85,247,0.3)]' 
                      : 'text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                  }`}
                >
                  <span className="truncate">{profile.name}</span>
                  
                  {/* Settings button on hover */}
                  {(hoveredProfile === profile.id || menuOpenProfile === profile.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenProfile(menuOpenProfile === profile.id ? null : profile.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[rgba(168,85,247,0.2)] text-[#71717a] hover:text-[#c084fc] transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  )}
                </button>
              )}

              {/* Dropdown menu */}
              {menuOpenProfile === profile.id && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-xl bg-[rgba(20,16,32,0.98)] border border-[rgba(168,85,247,0.2)] shadow-xl backdrop-blur-xl">
                  <button
                    onClick={() => handleStartEdit(profile)}
                    className="w-full px-3 py-2 text-left text-[13px] text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] flex items-center gap-2 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Rename
                  </button>
                  {onDeleteProfile && (
                    <button
                      onClick={() => {
                        onDeleteProfile(profile.id);
                        setMenuOpenProfile(null);
                      }}
                      className="w-full px-3 py-2 text-left text-[13px] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.1)] flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Separator */}
      <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-[rgba(168,85,247,0.2)] to-transparent" />

      {/* New Profile Button */}
      <div className="p-3">
        <button
          onClick={onNewProfile}
          className="w-full h-10 rounded-xl text-[14px] font-medium text-[#71717a] hover:text-[#c084fc] inline-flex items-center justify-center gap-2 transition-all duration-150 border border-dashed border-[rgba(113,113,122,0.3)] hover:border-[rgba(168,85,247,0.4)] hover:bg-[rgba(168,85,247,0.05)]"
        >
          <Plus className="w-4 h-4" />
          New Profile
        </button>
      </div>
    </aside>
  );
}
