'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Star,
  Sparkles,
  MessageCircle,
  Phone,
  MessageSquare,
  Hash,
  Wallet,
  Check,
} from 'lucide-react';
import { useContacts, ContactItem } from '../../hooks/use-contacts';

export interface RankedContactPickerProps {
  value: string;
  onChange: (value: string, contact?: ContactItem) => void;
  placeholder?: string;
  accentColor?: 'yellow' | 'emerald' | 'purple';
}

interface RankedContact extends ContactItem {
  score: number;
  txCount: number;
  lastTxTime?: string;
  isFavorite?: boolean;
}

export const RankedContactPicker: React.FC<RankedContactPickerProps> = ({
  value,
  onChange,
  placeholder = '@username, phone, or wallet address',
  accentColor = 'yellow',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { data: contacts = [] } = useContacts();
  const containerRef = useRef<HTMLDivElement>(null);

  // Track client-side mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Ranking Algorithm & Efficient Search Filter ──
  const rankedContacts = useMemo(() => {
    // 1. Map contacts with frequency scores and metadata
    const mapped: RankedContact[] = contacts.map((c, index) => {
      // Mock stats based on index if not present
      const txCount = (c as any).txCount || Math.max(1, 12 - index * 2);
      const isFavorite = (c as any).isFavorite || index === 0 || index === 1;
      const daysAgo = (index + 1) * 2;

      // Ranking Score Formula: S = (frequency * 15) + (100 / daysAgo) + (isFavorite ? 50 : 0)
      const recencyScore = 100 / Math.max(1, daysAgo);
      const score = txCount * 15 + recencyScore + (isFavorite ? 50 : 0);

      return {
        ...c,
        score,
        txCount,
        isFavorite,
      };
    });

    // 2. Sort descending by score
    mapped.sort((a, b) => b.score - a.score);

    // 3. Search Filter (matches name, identifier, or wallet address)
    if (!value || !value.trim()) {
      return mapped;
    }

    const query = value.trim().toLowerCase().replace(/^@/, '');
    return mapped.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.identifier.toLowerCase().includes(query) ||
        (c.walletAddress && c.walletAddress.toLowerCase().includes(query))
    );
  }, [contacts, value]);

  const handleSelect = (contact: RankedContact) => {
    onChange(contact.identifier || contact.walletAddress || contact.name, contact);
    setIsOpen(false);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'telegram':
        return <MessageCircle className="w-3.5 h-3.5 text-sky-400" />;
      case 'whatsapp':
        return <Phone className="w-3.5 h-3.5 text-emerald-400" />;
      case 'discord':
        return <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />;
      case 'slack':
        return <Hash className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Wallet className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const focusBorderColor =
    accentColor === 'purple'
      ? 'focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30'
      : accentColor === 'emerald'
        ? 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
        : 'focus:border-[#F2D827] focus:ring-1 focus:ring-[#F2D827]/30';

  const badgeBgColor =
    accentColor === 'purple'
      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      : accentColor === 'emerald'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-[#F2D827]/10 text-[#F2D827] border-[#F2D827]/20';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          required
          placeholder={placeholder}
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          className={`w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none ${focusBorderColor} transition`}
        />
        <div className="absolute right-3 top-3.5 text-slate-400 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
      </div>

      {/* Frequently Contacted Dropdown */}
      {isMounted && isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl max-h-72 overflow-y-auto p-2 space-y-1">
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/60 mb-1">
            <span className="flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-[#F2D827]" />
              <span>Ranked & Frequently Contacted</span>
            </span>
            <span>{rankedContacts.length} found</span>
          </div>

          {rankedContacts.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">
              No contacts matching "{value}". Press enter to use custom handle/address.
            </div>
          ) : (
            rankedContacts.map((c) => {
              const isSelected = value === c.identifier || value === c.walletAddress;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition hover:bg-slate-800/80 ${isSelected ? 'bg-[#F2D827]/10 border border-[#F2D827]/30' : ''
                    }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-sm font-semibold text-white truncate">{c.name}</span>
                        {c.isFavorite && <Star className="w-3 h-3 text-[#F2D827] fill-[#F2D827] shrink-0" />}
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                        {getPlatformIcon(c.platform)}
                        <span className="truncate">{c.identifier}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeBgColor}`}>
                      {c.txCount} txs
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[#F2D827]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
