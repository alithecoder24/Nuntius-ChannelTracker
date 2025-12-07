'use client';

import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  danger = true,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          {danger && (
            <div className="w-10 h-10 rounded-xl bg-[rgba(239,68,68,0.15)] flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-[#fca5a5]" />
            </div>
          )}
          <p className="text-[#a1a1aa] text-[15px] leading-relaxed pt-2">{message}</p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-[14px] font-medium text-[#a1a1aa] hover:text-[#f8fafc] bg-[rgba(113,113,122,0.1)] hover:bg-[rgba(113,113,122,0.15)] border border-[rgba(113,113,122,0.2)] transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
              danger
                ? 'text-white bg-[#ef4444] hover:bg-[#dc2626]'
                : 'text-white bg-[#a855f7] hover:bg-[#9333ea]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

