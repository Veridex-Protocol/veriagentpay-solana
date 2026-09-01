'use client';

import React, { useState } from 'react';
import { Info, Split } from 'lucide-react';
import { useCreateSplit } from '../hooks/useApi';
import { useTheme } from './providers/ThemeProvider';

export interface CreateSplitFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreateSplitForm({ onSuccess, onCancel }: CreateSplitFormProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [token, setToken] = useState('USDT');
  const [participantsText, setParticipantsText] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customAmountsText, setCustomAmountsText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const createSplitMutation = useCreateSplit();

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const total = parseFloat(totalAmount);
    if (!total || total <= 0) {
      setErrorMsg('Please enter a valid total amount.');
      return;
    }

    const participants = participantsText
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (participants.length === 0) {
      setErrorMsg('Please enter at least one recipient handle (e.g. @alice).');
      return;
    }

    let customAmounts: number[] | undefined;
    if (isCustomMode) {
      const parsedCustoms = customAmountsText
        .split(/[\s,]+/)
        .map((a) => parseFloat(a.trim()))
        .filter((a) => !isNaN(a) && a > 0);

      if (parsedCustoms.length !== participants.length) {
        setErrorMsg(`Custom amounts count (${parsedCustoms.length}) must match participants count (${participants.length}).`);
        return;
      }
      customAmounts = parsedCustoms;
    }

    try {
      await createSplitMutation.mutateAsync({
        description: description || 'Group Bill Split',
        totalAmount: total,
        token,
        participants,
        customAmounts,
      });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create bill split. Please try again.');
    }
  };

  const parsedParticipants = participantsText
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const total = parseFloat(totalAmount) || 0;
  const equalShare = parsedParticipants.length > 0 ? (total / parsedParticipants.length).toFixed(2) : '0.00';

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      <div>
        <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${
          isDark ? 'text-slate-300' : 'text-slate-700'
        }`}>
          Description / Event
        </label>
        <input
          type="text"
          placeholder="e.g. Group Dinner, Apartment Rent, Road Trip"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`w-full px-4 py-3 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#F2D827] transition border ${
            isDark
              ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
              : 'bg-slate-50 border-slate-200 text-slate-950 placeholder-slate-400'
          }`}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Total Amount
          </label>
          <input
            type="number"
            step="any"
            placeholder="120.00"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F2D827] transition border ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-950 placeholder-slate-400'
            }`}
          />
        </div>

        <div>
          <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Token
          </label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={`w-full px-3 py-3 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F2D827] transition border ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-slate-50 border-slate-200 text-slate-950'
            }`}
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
            <option value="BOT">BOT</option>
          </select>
        </div>
      </div>

      <div>
        <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${
          isDark ? 'text-slate-300' : 'text-slate-700'
        }`}>
          Participants (Handles or Wallet Addresses)
        </label>
        <input
          type="text"
          placeholder="@alice, @bob, @charlie"
          value={participantsText}
          onChange={(e) => setParticipantsText(e.target.value)}
          className={`w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none focus:border-[#F2D827] transition border ${
            isDark
              ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
              : 'bg-slate-50 border-slate-200 text-slate-950 placeholder-slate-400'
          }`}
        />
        <span className={`text-[11px] mt-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Separate multiple recipients with commas or spaces.
        </span>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center justify-between pt-1">
        <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Custom Share Amounts</span>
        <button
          type="button"
          onClick={() => setIsCustomMode(!isCustomMode)}
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
            isCustomMode
              ? 'bg-[#F2D827] justify-end'
              : isDark
                ? 'bg-slate-800 justify-start'
                : 'bg-slate-300 justify-start'
          }`}
        >
          <div className="w-4 h-4 rounded-full bg-slate-950 shadow-md" />
        </button>
      </div>

      {isCustomMode ? (
        <div>
          <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Custom Amounts ({token})
          </label>
          <input
            type="text"
            placeholder="50, 40, 30"
            value={customAmountsText}
            onChange={(e) => setCustomAmountsText(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none focus:border-[#F2D827] transition border ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-950 placeholder-slate-400'
            }`}
          />
          <span className={`text-[11px] mt-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Provide values matching participant order.
          </span>
        </div>
      ) : (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
          isDark
            ? 'bg-[#F2D827]/10 border-[#F2D827]/20 text-[#D4A106] dark:text-[#F2D827]'
            : 'bg-amber-50/70 border-[#F2D827]/30 text-slate-800'
        }`}>
          <Info className="w-4 h-4 flex-shrink-0 text-[#F2D827]" />
          <span>
            {parsedParticipants.length > 0
              ? `Equal split calculation: $${equalShare} ${token} each across ${parsedParticipants.length} recipients.`
              : 'Enter total amount and recipients to calculate equal shares.'}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 py-3 rounded-xl text-xs font-bold transition border ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={createSplitMutation.isPending}
          className="flex-1 py-3 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 text-xs font-bold transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Split className="w-4 h-4" />
          <span>{createSplitMutation.isPending ? 'Creating Split...' : 'Create Split Request'}</span>
        </button>
      </div>
    </form>
  );
}
