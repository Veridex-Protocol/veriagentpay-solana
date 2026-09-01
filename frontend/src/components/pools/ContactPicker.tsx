'use client';

import React, { useState } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { Plus, X, UserCheck } from 'lucide-react';
import { useContacts } from '../../hooks/use-contacts';

export interface ContactItem {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
}

interface ContactPickerProps {
  selectedMembers: string[];
  onChange: (members: string[]) => void;
}

export const ContactPicker: React.FC<ContactPickerProps> = ({ selectedMembers, onChange }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [typedInput, setTypedInput] = useState('');

  // Fetch real contacts from API
  const { data: realContacts = [], isLoading } = useContacts();

  // Map API contacts to ContactItem format
  const contacts: ContactItem[] = realContacts.map((c) => ({
    id: c.id,
    name: c.name,
    handle: c.identifier.startsWith('@') ? c.identifier : `@${c.identifier}`,
    avatarUrl: undefined,
  }));

  const handleAddMember = (handle: string) => {
    const cleanHandle = handle.trim();
    if (!cleanHandle) return;
    const formatted = cleanHandle.startsWith('@') || cleanHandle.startsWith('+') || cleanHandle.startsWith('0x')
      ? cleanHandle
      : `@${cleanHandle}`;

    if (!selectedMembers.includes(formatted)) {
      onChange([...selectedMembers, formatted]);
    }
    setTypedInput('');
  };

  const handleRemoveMember = (handle: string) => {
    onChange(selectedMembers.filter((m) => m !== handle));
  };

  return (
    <div className="space-y-3">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className={`text-xs font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Pool Members ({selectedMembers.length} Selected)
        </label>
        <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Tap to add or type custom @handle
        </span>
      </div>

      {/* Horizontally Scrollable Saved Contact Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {isLoading ? (
          <div className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Loading contacts...
          </div>
        ) : contacts.length === 0 ? (
          <div className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            No contacts yet. Type a handle below to add members.
          </div>
        ) : (
          contacts.map((c) => {
            const isSelected = selectedMembers.includes(c.handle);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => isSelected ? handleRemoveMember(c.handle) : handleAddMember(c.handle)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono whitespace-nowrap transition-all shrink-0 ${isSelected
                  ? 'bg-[#F2D827]/10 border-[#F2D827]/30 text-[#D4A106] dark:text-[#F2D827] font-bold'
                  : isDark
                    ? 'bg-slate-950/90 border-white/[0.08] text-slate-300 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
              >
                <div className="w-5 h-5 rounded-full bg-[#F2D827] text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {c.name.charAt(0)}
                </div>
                <span>{c.handle}</span>
                {isSelected ? <UserCheck className="w-3.5 h-3.5 text-[#F2D827]" /> : <Plus className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            );
          })
        )}
      </div>

      {/* Manual Input for custom handle */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Type @username, phone, or 0x address..."
          value={typedInput}
          onChange={(e) => setTypedInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddMember(typedInput);
            }
          }}
          className={`flex-1 p-2.5 rounded-xl border font-mono text-xs transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-white focus:border-[#F2D827]' : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-[#F2D827]'
            }`}
        />
        <button
          type="button"
          onClick={() => handleAddMember(typedInput)}
          disabled={!typedInput.trim()}
          className="px-3.5 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] disabled:opacity-50 text-slate-950 font-bold text-xs font-mono transition flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      {/* Selected Member Removable Pills */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedMembers.map((m) => (
            <span
              key={m}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-bold ${isDark ? 'bg-[#F2D827]/10 text-[#F2D827] border-[#F2D827]/20' : 'bg-amber-50 text-amber-900 border-[#F2D827]/30'
                }`}
            >
              <span>{m}</span>
              <button
                type="button"
                onClick={() => handleRemoveMember(m)}
                className="hover:text-rose-500 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
