'use client';

import { useState } from 'react';
import Modal from './Modal';
import { Plus, Link, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

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

interface YouTubeChannelData {
  channel_id: string;
  handle: string | null;
  name: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: string;
  subscriber_count_formatted: string;
  video_count_formatted: string;
  view_count_formatted: string;
  country: string | null;
  from_cache: boolean;
}

// Parse various YouTube URL formats to extract channel identifier
function parseYouTubeUrl(url: string): { type: string; id: string } | null {
  let cleanUrl = url.trim();
  
  // If it's just a handle like @MrBeast
  if (cleanUrl.startsWith('@')) {
    return { type: 'handle', id: cleanUrl };
  }
  
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
    if (directMatch && !['watch', 'feed', 'gaming', 'music', 'premium', 'results'].includes(directMatch[1])) {
      return { type: 'handle', id: '@' + directMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

export default function AddChannelModal({ isOpen, onClose, onAddChannel }: AddChannelModalProps) {
  const [channelUrl, setChannelUrl] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [channelData, setChannelData] = useState<YouTubeChannelData | null>(null);

  // Fetch channel data from YouTube API
  const fetchChannelData = async (identifier: string) => {
    setFetching(true);
    setError('');
    setChannelData(null);

    try {
      const resp = await fetch(`/api/youtube/channel?id=${encodeURIComponent(identifier)}`);
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to fetch channel');
      }

      setChannelData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch channel data');
    } finally {
      setFetching(false);
    }
  };

  // When URL changes, try to fetch channel data
  const handleUrlChange = (value: string) => {
    setChannelUrl(value);
    setChannelData(null);
    setError('');

    const parsed = parseYouTubeUrl(value);
    if (parsed) {
      // Debounce the fetch
      const timeoutId = setTimeout(() => {
        fetchChannelData(parsed.id);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!channelData) {
      setError('Please enter a valid YouTube channel URL');
      return;
    }

    setLoading(true);

    try {
      await onAddChannel({
        channel_id: channelData.channel_id,
        name: channelData.name,
        subscribers: channelData.subscriber_count_formatted,
        subs_growth_28d: '0',
        subs_growth_48h: '0',
        language: language,
      });
      
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add channel');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setChannelUrl('');
    setLanguage('English');
    setError('');
    setChannelData(null);
    onClose();
  };

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
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://youtube.com/@channelname"
              className="input-field pl-11 pr-10"
              autoFocus
            />
            {fetching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a855f7] animate-spin" />
            )}
            {channelData && !fetching && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86efac]" />
            )}
            {error && !fetching && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#fca5a5]" />
            )}
          </div>
          <p className="text-xs text-[#71717a] mt-2">
            Paste any YouTube channel link or @handle
          </p>
        </div>

        {/* Channel Preview */}
        {channelData && (
          <div className="p-4 rounded-xl bg-[rgba(34,197,94,0.05)] border border-[rgba(34,197,94,0.2)]">
            <div className="flex items-center gap-4">
              {channelData.thumbnail_url && (
                <img 
                  src={channelData.thumbnail_url} 
                  alt={channelData.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[#f8fafc] truncate">{channelData.name}</h4>
                <p className="text-sm text-[#a1a1aa]">{channelData.handle || channelData.channel_id}</p>
                <div className="flex items-center gap-4 mt-1 text-xs text-[#71717a]">
                  <span><strong className="text-[#c084fc]">{channelData.subscriber_count_formatted}</strong> subscribers</span>
                  <span><strong>{channelData.video_count_formatted}</strong> videos</span>
                </div>
              </div>
            </div>
            {channelData.from_cache && (
              <p className="text-xs text-[#71717a] mt-3 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#86efac]"></span>
                Loaded from cache (saves API calls!)
              </p>
            )}
          </div>
        )}

        {/* Error for API issues */}
        {error && !channelData && channelUrl && parsed && (
          <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5] text-sm">
            {error}
          </div>
        )}

        {/* Invalid URL error */}
        {channelUrl && !parsed && (
          <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5] text-sm">
            Invalid YouTube URL format
          </div>
        )}

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
            disabled={loading || fetching || !channelData}
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
