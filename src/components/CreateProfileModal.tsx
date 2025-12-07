'use client';

import { useState } from 'react';
import Modal from './Modal';
import { FolderPlus } from 'lucide-react';

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (name: string) => void;
}

export default function CreateProfileModal({ isOpen, onClose, onCreateProfile }: CreateProfileModalProps) {
  const [profileName, setProfileName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (profileName.trim()) {
      onCreateProfile(profileName.trim());
      setProfileName('');
      onClose();
    }
  };

  const handleClose = () => {
    setProfileName('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Profile">
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
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
          <p className="text-xs text-[#71717a] mt-2">
            Create a profile to organize channels by niche or topic
          </p>
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

