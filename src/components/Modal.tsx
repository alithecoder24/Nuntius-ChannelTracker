'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'default' | 'large';
}

export default function Modal({ isOpen, onClose, title, children, size = 'default' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className={`relative glass-card p-6 mx-4 fade-in ${
        size === 'large' ? 'w-full max-w-2xl' : 'w-full max-w-md'
      }`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[rgba(113,113,122,0.1)] hover:bg-[rgba(239,68,68,0.15)] text-[#a1a1aa] hover:text-[#fca5a5] transition-colors border border-[rgba(113,113,122,0.2)] hover:border-[rgba(239,68,68,0.3)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {children}
      </div>
    </div>
  );
}
