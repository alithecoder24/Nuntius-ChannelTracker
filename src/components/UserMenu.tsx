'use client';

import { useState, useRef, useEffect } from 'react';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface UserMenuProps {
  user: SupabaseUser;
}

export default function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsOpen(false);
  };

  const displayName = user.user_metadata?.name || user.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(168,85,247,0.1)] hover:bg-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.2)] transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center">
          <span className="text-white text-sm font-semibold">{initial}</span>
        </div>
        <span className="text-sm font-medium text-[#f8fafc] max-w-[120px] truncate">
          {displayName}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#a1a1aa] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 glass-card p-2 fade-in z-50">
          <div className="px-3 py-2 border-b border-[rgba(168,85,247,0.15)] mb-2">
            <p className="text-sm font-medium text-[#f8fafc] truncate">{displayName}</p>
            <p className="text-xs text-[#71717a] truncate">{user.email}</p>
          </div>
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#fca5a5] hover:bg-[rgba(239,68,68,0.1)] transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

