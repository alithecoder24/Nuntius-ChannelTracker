'use client';

import { useState } from 'react';
import { X, Users, UserPlus, Trash2, Shield, ShieldCheck, Crown, AlertCircle, Mail } from 'lucide-react';

interface TeamMember {
  id: string;
  user_id: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: TeamMember[];
  currentUserRole: 'owner' | 'admin' | 'member';
  onInvite: (email: string, role: 'admin' | 'member') => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
}

export default function TeamManagementModal({ isOpen, onClose, members, currentUserRole, onInvite, onRemove }: TeamManagementModalProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    
    setInviteError('');
    setIsInviting(true);
    
    try {
      await onInvite(inviteEmail.trim().toLowerCase(), inviteRole);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err: any) {
      if (err?.message?.includes('duplicate')) {
        setInviteError('This email is already invited');
      } else {
        setInviteError('Failed to invite. Please try again.');
      }
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    setIsDeleting(true);
    try {
      await onRemove(memberId);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-[#fbbf24]" />;
      case 'admin': return <ShieldCheck className="w-4 h-4 text-[#c084fc]" />;
      default: return <Shield className="w-4 h-4 text-[#71717a]" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Owner';
      case 'admin': return 'Admin';
      default: return 'Member';
    }
  };

  const canRemove = (member: TeamMember) => {
    // Owner can remove anyone except themselves
    if (currentUserRole === 'owner') return member.role !== 'owner';
    // Admin can only remove members
    if (currentUserRole === 'admin') return member.role === 'member';
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg glass-card p-6 fade-in max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center border border-[rgba(168,85,247,0.2)]">
              <Users className="w-5 h-5 text-[#c084fc]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f8fafc]">Team Members</h2>
              <p className="text-sm text-[#71717a]">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.05)] text-[#71717a] hover:text-[#f8fafc] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} className="mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); }}
                placeholder="Email address"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(168,85,247,0.15)] text-[#f8fafc] placeholder:text-[#52525b] focus:outline-none focus:border-[rgba(168,85,247,0.4)]"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className="px-3 py-2.5 rounded-xl text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(168,85,247,0.15)] text-[#a1a1aa] focus:outline-none focus:border-[rgba(168,85,247,0.4)]"
            >
              <option value="member">Member</option>
              {currentUserRole === 'owner' && <option value="admin">Admin</option>}
            </select>
            <button
              type="submit"
              disabled={isInviting || !inviteEmail.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-[rgba(168,85,247,0.15)] text-[#c084fc] hover:bg-[rgba(168,85,247,0.25)] border border-[rgba(168,85,247,0.2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {isInviting ? 'Inviting...' : 'Invite'}
            </button>
          </div>
          {inviteError && (
            <p className="mt-2 text-xs text-[#fca5a5] flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {inviteError}
            </p>
          )}
        </form>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {members.map((member) => (
            <div key={member.id} className="group">
              {confirmDelete === member.id ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
                  <span className="text-sm text-[#fca5a5]">Remove {member.email}?</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-xs font-medium text-[#a1a1aa] hover:text-[#f8fafc] transition-colors"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRemove(member.id)}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(239,68,68,0.2)] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.3)] transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] border border-[rgba(168,85,247,0.1)] hover:border-[rgba(168,85,247,0.2)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#a855f7]/20 to-[#e879f9]/20 flex items-center justify-center border border-[rgba(168,85,247,0.15)]">
                      {getRoleIcon(member.role)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f8fafc]">{member.email}</span>
                        {!member.user_id && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[rgba(251,191,36,0.15)] text-[#fbbf24] border border-[rgba(251,191,36,0.2)]">
                            Pending
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#71717a]">{getRoleLabel(member.role)}</span>
                    </div>
                  </div>
                  {canRemove(member) && (
                    <button
                      onClick={() => setConfirmDelete(member.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[rgba(239,68,68,0.1)] text-[#71717a] hover:text-[#fca5a5] transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p className="text-xs text-[#52525b] mt-4 text-center">
          Invited members get access when they sign up with their email
        </p>
      </div>
    </div>
  );
}

