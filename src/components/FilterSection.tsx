'use client';

import { Search } from 'lucide-react';

interface FilterState {
  timeWindow: string;
  videoAmount: string;
  minViews: string;
  maxViews: string;
  minLength: string;
  maxLength: string;
  searchQuery: string;
}

interface FilterSectionProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export default function FilterSection({ filters, onFilterChange }: FilterSectionProps) {
  const timeWindows = ['24h', '48h', '7d', '28d', '90d', 'all'];
  const videoAmounts = ['10', '25', '50', 'all'];

  const updateFilter = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="glass-card p-6 fade-in">
      <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white via-[#c084fc] to-[#e879f9] bg-clip-text text-transparent">
        Filter
      </h2>
      
      {/* Time Window */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
          Time Window
        </label>
        <div className="flex gap-2 flex-wrap">
          {timeWindows.map((tw) => (
            <button
              key={tw}
              onClick={() => updateFilter('timeWindow', tw)}
              className={`px-5 py-2.5 rounded-lg border transition-all ${
                filters.timeWindow === tw
                  ? 'toggle-active'
                  : 'border-[rgba(168,85,247,0.15)] text-[#f8fafc] hover:border-[rgba(168,85,247,0.3)] bg-[rgba(30,24,48,0.8)]'
              }`}
            >
              {tw}
            </button>
          ))}
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search channels or videos..."
              value={filters.searchQuery}
              onChange={(e) => updateFilter('searchQuery', e.target.value)}
              className="input-field w-full h-full pl-4 pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a855f7]" />
          </div>
        </div>
      </div>

      {/* Video Amount */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">
          Video Amount
        </label>
        <div className="flex gap-2">
          {videoAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => updateFilter('videoAmount', amount)}
              className={`px-5 py-2.5 rounded-lg border transition-all ${
                filters.videoAmount === amount
                  ? 'toggle-active'
                  : 'border-[rgba(168,85,247,0.15)] text-[#f8fafc] hover:border-[rgba(168,85,247,0.3)] bg-[rgba(30,24,48,0.8)]'
              }`}
            >
              {amount === 'all' ? 'all' : amount}
            </button>
          ))}
        </div>
      </div>

      {/* View & Length Filters */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Min Views
          </label>
          <input
            type="text"
            placeholder="0"
            value={filters.minViews}
            onChange={(e) => updateFilter('minViews', e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Max Views
          </label>
          <input
            type="text"
            placeholder="∞"
            value={filters.maxViews}
            onChange={(e) => updateFilter('maxViews', e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Min Length
          </label>
          <input
            type="text"
            placeholder="0:00"
            value={filters.minLength}
            onChange={(e) => updateFilter('minLength', e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">
            Max Length
          </label>
          <input
            type="text"
            placeholder="∞"
            value={filters.maxLength}
            onChange={(e) => updateFilter('maxLength', e.target.value)}
            className="input-field"
          />
        </div>
      </div>
    </div>
  );
}
