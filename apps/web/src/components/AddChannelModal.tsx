'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from './Modal';
import { Plus, Link, Loader2, CheckCircle, AlertCircle, Tag } from 'lucide-react';

interface ExistingChannel {
  channel_id: string;
  name: string;
}

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileName: string;
  existingChannels: ExistingChannel[];
  userTags: string[];
  onAddChannel: (channelData: {
    channel_id: string;
    name: string;
    thumbnail_url: string;
    subscribers: string;
    video_count: string;
    views_28d: string;
    views_48h: string;
    language: string;
    tag: string | null;
  }) => Promise<void>;
}

interface YouTubeChannelData {
  channel_id: string;
  handle: string | null;
  name: string;
  thumbnail_url: string;
  subscriber_count_formatted: string;
  video_count_formatted: string;
  view_count_formatted: string;
  views_48h: string;
  views_28d: string;
  from_cache: boolean;
}

function parseYouTubeUrl(url: string): { type: string; id: string } | null {
  let cleanUrl = url.trim();
  
  if (cleanUrl.startsWith('@')) {
    return { type: 'handle', id: cleanUrl };
  }
  
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

    const channelMatch = cleanPath.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    if (channelMatch) return { type: 'channel', id: channelMatch[1] };

    const handleMatch = cleanPath.match(/\/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch) return { type: 'handle', id: '@' + handleMatch[1] };

    const customMatch = cleanPath.match(/\/c\/([a-zA-Z0-9_.-]+)/);
    if (customMatch) return { type: 'custom', id: customMatch[1] };

    const userMatch = cleanPath.match(/\/user\/([a-zA-Z0-9_.-]+)/);
    if (userMatch) return { type: 'user', id: userMatch[1] };

    const directMatch = cleanPath.match(/^\/([a-zA-Z0-9_.-]+)$/);
    if (directMatch && !['watch', 'feed', 'gaming', 'music', 'premium', 'results'].includes(directMatch[1])) {
      return { type: 'handle', id: '@' + directMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

export default function AddChannelModal({ isOpen, onClose, profileName, existingChannels, userTags, onAddChannel }: AddChannelModalProps) {
  const [channelUrl, setChannelUrl] = useState('');
  const [language, setLanguage] = useState('English');
  const [tag, setTag] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [channelData, setChannelData] = useState<YouTubeChannelData | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const checkDuplicate = (channelId: string): string | null => {
    const existing = existingChannels.find(ch => ch.channel_id === channelId);
    if (existing) {
      return `"${existing.name}" is already in "${profileName}"`;
    }
    return null;
  };

  const fetchChannelData = async (identifier: string) => {
    setFetching(true);
    setError('');
    setDuplicateError(null);
    setChannelData(null);

    try {
      const resp = await fetch(`/api/youtube/channel?id=${encodeURIComponent(identifier)}`);
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to fetch channel');
      }

      // Check for duplicate
      const duplicate = checkDuplicate(data.channel_id);
      if (duplicate) {
        setDuplicateError(duplicate);
      }

      setChannelData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch channel data');
    } finally {
      setFetching(false);
    }
  };

  const handleUrlChange = (value: string) => {
    setChannelUrl(value);
    setChannelData(null);
    setError('');
    setDuplicateError(null);

    const parsed = parseYouTubeUrl(value);
    if (parsed) {
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

    if (duplicateError) {
      return; // Don't submit if it's a duplicate
    }

    setLoading(true);

    try {
      await onAddChannel({
        channel_id: channelData.channel_id,
        name: channelData.name,
        thumbnail_url: channelData.thumbnail_url || '',
        subscribers: channelData.subscriber_count_formatted,
        video_count: channelData.video_count_formatted,
        views_28d: channelData.views_28d || '0',
        views_48h: channelData.views_48h || '0',
        language: language,
        tag: tag.trim() || null,
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
    setTag('');
    setError('');
    setDuplicateError(null);
    setChannelData(null);
    setShowTagSuggestions(false);
    onClose();
  };

  const filteredTags = userTags.filter(t => 
    t.toLowerCase().includes(tag.toLowerCase()) && t.toLowerCase() !== tag.toLowerCase()
  );

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
            {fetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a855f7] animate-spin" />}
            {channelData && !fetching && !duplicateError && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86efac]" />}
            {(error || duplicateError) && !fetching && parsed && <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#fca5a5]" />}
          </div>
          <p className="text-xs text-[#71717a] mt-2">Paste any YouTube channel link or @handle</p>
        </div>

        {/* Duplicate Error */}
        {duplicateError && channelData && (
          <div className="p-4 rounded-xl bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.3)]">
            <div className="flex items-center gap-4">
              {channelData.thumbnail_url ? (
                <img src={channelData.thumbnail_url} alt={channelData.name} className="w-14 h-14 rounded-full object-cover opacity-60" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center opacity-60">
                  <span className="text-white text-lg font-bold">{channelData.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[#fbbf24] truncate">{channelData.name}</h4>
                <p className="text-sm text-[#fbbf24] mt-1">
                  ⚠️ {duplicateError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Channel Preview (non-duplicate) */}
        {channelData && !duplicateError && (
          <div className="p-4 rounded-xl bg-[rgba(34,197,94,0.05)] border border-[rgba(34,197,94,0.2)]">
            <div className="flex items-center gap-4">
              {channelData.thumbnail_url ? (
                <img src={channelData.thumbnail_url} alt={channelData.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#a855f7] to-[#e879f9] flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{channelData.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[#f8fafc] truncate">{channelData.name}</h4>
                <div className="flex items-center gap-4 mt-1 text-xs text-[#71717a]">
                  <span><strong className="text-[#c084fc]">{channelData.subscriber_count_formatted}</strong> subs</span>
                  <span><strong>{channelData.video_count_formatted}</strong> videos</span>
                  <span><strong>{channelData.view_count_formatted}</strong> views</span>
                </div>
                {(channelData.views_28d !== '0' || channelData.views_48h !== '0') && (
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-[#86efac]">+{channelData.views_28d} views (28d)</span>
                    <span className="text-[#86efac]">+{channelData.views_48h} views (48h)</span>
                  </div>
                )}
              </div>
            </div>
            {channelData.from_cache && (
              <p className="text-xs text-[#71717a] mt-3 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#86efac]"></span>
                Loaded from cache
              </p>
            )}
          </div>
        )}

        {error && !channelData && channelUrl && parsed && (
          <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5] text-sm">
            {error}
          </div>
        )}

        {channelUrl && !parsed && (
          <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#fca5a5] text-sm">
            Invalid YouTube URL format
          </div>
        )}

        {/* Language & Tag Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
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
          
          <div className="relative">
            <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
              Tag <span className="text-[#71717a] font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
              <input
                ref={tagInputRef}
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                placeholder="e.g. competitor"
                className="input-field pl-10"
              />
            </div>
            
            {/* Tag Suggestions */}
            {showTagSuggestions && filteredTags.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[rgba(20,16,32,0.98)] rounded-xl border border-[rgba(168,85,247,0.2)] shadow-xl z-10 max-h-32 overflow-y-auto">
                {filteredTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTag(t);
                      setShowTagSuggestions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-[#a1a1aa] hover:text-[#f8fafc] hover:bg-[rgba(168,85,247,0.1)] transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose} className="flex-1 btn btn-ghost">Cancel</button>
          <button 
            type="submit" 
            disabled={loading || fetching || !channelData || !!duplicateError} 
            className="flex-1 btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Channel
          </button>
        </div>
      </form>
    </Modal>
  );
}
