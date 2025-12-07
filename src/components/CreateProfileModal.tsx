'use client';

import { useState } from 'react';
import Modal from './Modal';
import { FolderPlus, Users, Lock } from 'lucide-react';

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (name: string, visibility: 'private' | 'team') => void;
}

export default function CreateProfileModal({ isOpen, onClose, onCreateProfile }: CreateProfileModalProps) {
  const [profileName, setProfileName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'team'>('team');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (profileName.trim()) {
      onCreateProfile(profileName.trim(), visibility);
      setProfileName('');
      setVisibility('team');
      onClose();
    }
  };

  const handleClose = () => {
    setProfileName('');
    setVisibility('team');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Profile">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Profile Name
          </label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g., Gaming Niche, Tech Reviews..."
            className="input-field"
            autoFocus
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Visibility
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVisibility('team')}
              className={`p-3 rounded-xl border text-left transition-all ${
                visibility === 'team'
                  ? 'bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.4)]'
                  : 'bg-[rgba(255,255,255,0.02)] border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Users className={`w-4 h-4 ${visibility === 'team' ? 'text-[#c084fc]' : 'text-[#71717a]'}`} />
                <span className={`text-sm font-medium ${visibility === 'team' ? 'text-[#f8fafc]' : 'text-[#a1a1aa]'}`}>
                  Team
                </span>
              </div>
              <p className="text-xs text-[#71717a]">All team members can see</p>
            </button>
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`p-3 rounded-xl border text-left transition-all ${
                visibility === 'private'
                  ? 'bg-[rgba(168,85,247,0.15)] border-[rgba(168,85,247,0.4)]'
                  : 'bg-[rgba(255,255,255,0.02)] border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Lock className={`w-4 h-4 ${visibility === 'private' ? 'text-[#c084fc]' : 'text-[#71717a]'}`} />
                <span className={`text-sm font-medium ${visibility === 'private' ? 'text-[#f8fafc]' : 'text-[#a1a1aa]'}`}>
                  Private
                </span>
              </div>
              <p className="text-xs text-[#71717a]">Only you can see</p>
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 btn btn-ghost"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!profileName.trim()}
            className="flex-1 btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            <FolderPlus className="w-4 h-4" />
            Create Profile
          </button>
        </div>
      </form>
    </Modal>
  );
}

