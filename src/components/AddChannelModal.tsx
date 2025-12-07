'use client';

import { useState } from 'react';
import Modal from './Modal';
import { Plus, Link, Loader2 } from 'lucide-react';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChannel: (channelData: {
    channel_id: string;
    name: string;
    subscribers: string;
    subs_growth_28d: string;
    subs_growth_48h: string;
    language: string;
  }) => Promise<void>;
}

// Parse various YouTube URL formats to extract channel identifier
function parseYouTubeUrl(url: string): { type: string; id: string } | null {
  // Clean up the URL
  let cleanUrl = url.trim();
  
  // Add https if missing
  if (!cleanUrl.startsWith('http')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  try {
    const urlObj = new URL(cleanUrl);
    const hostname = urlObj.hostname.replace('www.', '');
    
    if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
      return null;
    }

    const pathname = urlObj.pathname;

    // Remove trailing segments like /videos, /shorts, /streams, /playlists, /community, /about, /featured
    const cleanPath = pathname.replace(/\/(videos|shorts|streams|playlists|community|about|featured|live)?\/?$/, '');

    // Format: youtube.com/channel/UC...
    const channelMatch = cleanPath.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    if (channelMatch) {
      return { type: 'channel', id: channelMatch[1] };
    }

    // Format: youtube.com/@handle
    const handleMatch = cleanPath.match(/\/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch) {
      return { type: 'handle', id: '@' + handleMatch[1] };
    }

    // Format: youtube.com/c/customname
    const customMatch = cleanPath.match(/\/c\/([a-zA-Z0-9_.-]+)/);
    if (customMatch) {
      return { type: 'custom', id: customMatch[1] };
    }

    // Format: youtube.com/user/username
    const userMatch = cleanPath.match(/\/user\/([a-zA-Z0-9_.-]+)/);
    if (userMatch) {
      return { type: 'user', id: userMatch[1] };
    }

    // Direct handle without @ (youtube.com/MrBeast)
    const directMatch = cleanPath.match(/^\/([a-zA-Z0-9_.-]+)$/);
    if (directMatch && !['watch', 'feed', 'gaming', 'music', 'premium'].includes(directMatch[1])) {
      return { type: 'handle', id: '@' + directMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

export default function AddChannelModal({ isOpen, onClose, onAddChannel }: AddChannelModalProps) {
  const [channelUrl, setChannelUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Parse the URL
    const parsed = parseYouTubeUrl(channelUrl);
    if (!parsed) {
      setError('Invalid YouTube channel URL. Please enter a valid channel link.');
      return;
    }

    if (!channelName.trim()) {
      setError('Please enter a channel name.');
      return;
    }

    setLoading(true);

    try {
      await onAddChannel({
        channel_id: parsed.id,
        name: channelName.trim(),
        subscribers: '0',
        subs_growth_28d: '0',
        subs_growth_48h: '0',
        language: language,
      });
      
      // Reset form
      setChannelUrl('');
      setChannelName('');
      setLanguage('English');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add channel');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setChannelUrl('');
    setChannelName('');
    setLanguage('English');
    setError('');
    onClose();
  };

  // Preview the parsed URL
  const parsed = channelUrl ? parseYouTubeUrl(channelUrl) : null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Channel">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            YouTube Channel URL
          </label>
          <div className="relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#71717a]" />
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://youtube.com/@channelname"
              className="input-field pl-11"
              autoFocus
            />
          </div>
          <p className="text-xs text-[#71717a] mt-2">
            Supports: @handle, /channel/ID, /c/name, /user/name
          </p>
          
          {/* URL Preview */}
          {channelUrl && (
            <div className={`mt-2 p-2 rounded-lg text-xs ${parsed ? 'bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-[#86efac]' : 'bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5]'}`}>
              {parsed ? (
                <>✓ Detected: <span className="font-mono">{parsed.id}</span> ({parsed.type})</>
              ) : (
                <>✗ Could not parse URL</>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Channel Name
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g., MrBeast, Marques Brownlee"
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="input-field"
          >
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="German">German</option>
            <option value="French">French</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Chinese">Chinese</option>
            <option value="Hindi">Hindi</option>
            <option value="Arabic">Arabic</option>
            <option value="Russian">Russian</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5] text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 btn btn-ghost"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !parsed || !channelName.trim()}
            className="flex-1 btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Channel
          </button>
        </div>
      </form>
    </Modal>
  );
}

