'use client';

import { useState } from 'react';
import { X, Tag, Trash2, AlertCircle } from 'lucide-react';

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: string[];
  onDeleteTag: (tag: string) => Promise<void>;
}

export default function TagManagementModal({ isOpen, onClose, tags, onDeleteTag }: TagManagementModalProps) {
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async (tag: string) => {
    setDeletingTag(tag);
    try {
      await onDeleteTag(tag);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Failed to delete tag:', err);
      alert('Failed to delete tag');
    } finally {
      setDeletingTag(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md glass-card p-6 fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center border border-[rgba(168,85,247,0.2)]">
              <Tag className="w-5 h-5 text-[#c084fc]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f8fafc]">Manage Tags</h2>
              <p className="text-sm text-[#71717a]">{tags.length} tag{tags.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.05)] text-[#71717a] hover:text-[#f8fafc] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tags List */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {tags.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3 opacity-30">🏷️</div>
              <p className="text-[#71717a]">No tags yet</p>
              <p className="text-sm text-[#52525b] mt-1">Tags will appear here once you add them to channels</p>
            </div>
          ) : (
            tags.map((tag) => (
              <div key={tag} className="group">
                {confirmDelete === tag ? (
                  // Confirm delete state
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-[#fca5a5]" />
                      <span className="text-[#fca5a5]">Delete "{tag}" from all channels?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-3 py-1.5 text-xs font-medium text-[#a1a1aa] hover:text-[#f8fafc] transition-colors"
                        disabled={deletingTag === tag}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(tag)}
                        disabled={deletingTag === tag}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(239,68,68,0.2)] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.3)] transition-colors disabled:opacity-50"
                      >
                        {deletingTag === tag ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  // Normal state
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] border border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)] transition-all">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#c084fc]" />
                      <span className="text-[#f8fafc] font-medium">{tag}</span>
                    </div>
                    <button
                      onClick={() => setConfirmDelete(tag)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[rgba(239,68,68,0.1)] text-[#71717a] hover:text-[#fca5a5] transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        {tags.length > 0 && (
          <p className="text-xs text-[#52525b] mt-4 text-center">
            Deleting a tag removes it from all channels that use it
          </p>
        )}
      </div>
    </div>
  );
}

