'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Lock, Users, MessageSquare, Wrench } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface Profile {
  id: string;
  name: string;
  visibility?: 'private' | 'team';
  createdBy?: string;
}

interface SidebarProps {
  profiles: Profile[];
  activeProfile: string | null;
  activeTool: string | null;
  onProfileSelect: (id: string) => void;
  onToolSelect: (tool: string) => void;
  onNewProfile: () => void;
  onRenameProfile?: (id: string, newName: string) => void;
  onDeleteProfile?: (id: string) => void;
  onToggleVisibility?: (id: string, visibility: 'private' | 'team') => void;
}

export default function Sidebar({ 
  profiles, 
  activeProfile, 
  activeTool,
  onProfileSelect,
  onToolSelect,
  onNewProfile,
  onRenameProfile,
  onDeleteProfile,
  onToggleVisibility,
}: SidebarProps) {
  const [menuOpenProfile, setMenuOpenProfile] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenProfile(null);
      }
    };

    if (menuOpenProfile) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpenProfile]);

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

  const handleDeleteClick = (profile: Profile) => {
    setMenuOpenProfile(null);
    setDeleteConfirm({ id: profile.id, name: profile.name });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm && onDeleteProfile) {
      onDeleteProfile(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  };

  return (
    <>
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
              <div key={profile.id} className="relative">
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
                  <div className="group relative">
                    <button
                      onClick={() => onProfileSelect(profile.id)}
                      className={`w-full text-left px-3 py-2.5 pr-9 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                        activeProfile === profile.id 
                          ? 'bg-[rgba(168,85,247,0.2)] text-[#c084fc] border border-[rgba(168,85,247,0.3)]' 
                          : 'text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {profile.visibility === 'private' ? (
                          <Lock className="w-3 h-3 flex-shrink-0 opacity-60" />
                        ) : (
                          <Users className="w-3 h-3 flex-shrink-0 opacity-60" />
                        )}
                        <span className="truncate">{profile.name}</span>
                      </span>
                    </button>
                    
                    {/* Settings button - always visible on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenProfile(menuOpenProfile === profile.id ? null : profile.id);
                      }}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
                        menuOpenProfile === profile.id
                          ? 'bg-[rgba(168,85,247,0.2)] text-[#c084fc]'
                          : 'opacity-0 group-hover:opacity-100 hover:bg-[rgba(168,85,247,0.2)] text-[#71717a] hover:text-[#c084fc]'
                      }`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Dropdown menu */}
                {menuOpenProfile === profile.id && (
                  <div 
                    ref={menuRef}
                    className="absolute left-0 right-0 top-full mt-1 z-50 py-1 rounded-xl bg-[rgba(20,16,32,0.98)] border border-[rgba(168,85,247,0.2)] shadow-xl backdrop-blur-xl"
                  >
                    {/* Visibility Toggle */}
                    <button
                      onClick={() => {
                        if (onToggleVisibility) {
                          const newVisibility = profile.visibility === 'private' ? 'team' : 'private';
                          onToggleVisibility(profile.id, newVisibility);
                        }
                        setMenuOpenProfile(null);
                      }}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] flex items-center gap-2.5 transition-colors"
                    >
                      {profile.visibility === 'private' ? (
                        <>
                          <Users className="w-3.5 h-3.5" />
                          Make Team
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          Make Private
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleStartEdit(profile)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] flex items-center gap-2.5 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteClick(profile)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.1)] flex items-center gap-2.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Separator */}
        <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-[rgba(168,85,247,0.2)] to-transparent" />

        {/* New Profile Button */}
        <div className="px-3 pb-3">
          <button
            onClick={onNewProfile}
            className="w-full h-10 rounded-xl text-[14px] font-medium text-[#71717a] hover:text-[#c084fc] inline-flex items-center justify-center gap-2 transition-all duration-150 border border-dashed border-[rgba(113,113,122,0.3)] hover:border-[rgba(168,85,247,0.4)] hover:bg-[rgba(168,85,247,0.05)]"
          >
            <Plus className="w-4 h-4" />
            New Profile
          </button>
        </div>

        {/* Separator */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-[rgba(168,85,247,0.2)] to-transparent" />

        {/* Tools Section */}
        <div className="px-4 pt-4 pb-2">
          <span className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider flex items-center gap-1.5">
            <Wrench className="w-3 h-3" />
            Tools
          </span>
        </div>

        {/* Tools List */}
        <div className="px-2 pb-4">
          <nav className="space-y-1">
            <button
              onClick={() => onToolSelect('imessage-generator')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 flex items-center gap-2 ${
                activeTool === 'imessage-generator'
                  ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80] border border-[rgba(34,197,94,0.3)]'
                  : 'text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              iMessage Gen
            </button>
          </nav>
        </div>
      </aside>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Profile"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? All channels in this profile will also be deleted. This action cannot be undone.`}
        confirmText="Delete Profile"
      />
    </>
  );
}
