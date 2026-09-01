'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../providers/ThemeProvider';
import { ContactPicker } from './ContactPicker';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { useCreatePool } from '../../hooks/use-pools';
import { VeriAgentLogoMark } from '../ui/VeriAgentLoader';

interface CreatePoolSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (poolData: { id: string; name: string; inviteLink: string }) => void;
}

export const CreatePoolSheet: React.FC<CreatePoolSheetProps> = ({ isOpen, onClose, onSuccess }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('25000');
  const [token, setToken] = useState<'USDC' | 'USDT' | 'BOT'>('USDT');
  const [interestRate, setInterestRate] = useState('4.2');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  /** Mirrors `PoolsService.MIN_POOL_MEMBERS`, which mirrors the contract's quorum. */
  const MIN_POOL_MEMBERS = 3;
  // The creator is a member too, and is not part of the picker's selection.
  const memberCount = selectedMembers.length + 1;
  const hasQuorum = memberCount >= MIN_POOL_MEMBERS;
  const [inviteMessage, setInviteMessage] = useState(
    "Hey! I'm starting a group lending pool on VeriAgent Pay. Join here to deposit and earn yield together:"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createPoolMutation = useCreatePool();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await createPoolMutation.mutateAsync({
        name: name.trim(),
        targetAmount: parseFloat(targetAmount) || 25000,
        token,
        interestRate: parseFloat(interestRate) || 4.2,
        members: selectedMembers,
        inviteMessage,
      });

      const poolId = data.poolId || data.pool?.id;
      if (!poolId || !data.inviteLink) {
        throw new Error('The pool was not confirmed by the server. Please try again.');
      }
      onSuccess({ id: poolId, name: data.pool?.name || name.trim(), inviteLink: data.inviteLink });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The pool could not be created. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Slide-Up Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className={`relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto border-t sm:border z-50 transition-colors duration-200 ${isDark
              ? 'bg-[#070A11] border-white/[0.08] text-slate-100'
              : 'bg-white border-slate-200 text-slate-950 shadow-slate-200/60'
              }`}
          >
            {/* Top Handle */}
            <div className="w-12 h-1 bg-slate-500/30 rounded-full mx-auto mb-4 cursor-grab" />

            <div className="flex items-center justify-between border-b pb-4 mb-5 border-slate-800/60">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#F2D827]" />
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Start a Group Pool</h2>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 text-left">
              {error && (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-3 text-sm text-red-500" role="alert">
                  {error}
                </div>
              )}
              {/* Field 1: Pool Name */}
              <div className="space-y-1.5">
                <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Pool Name *
                </label>
                <input
                  type="text"
                  placeholder='e.g., "ETH London Builder Pool"'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={`w-full p-3.5 rounded-xl border font-sans text-sm transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-white focus:border-[#F2D827]' : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-[#F2D827]'
                    }`}
                />
              </div>

              {/* Field 2: Target Amount & Token Selector */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Target Balance
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="25000"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className={`w-full p-3 rounded-xl border font-mono text-sm font-bold transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-white' : 'bg-slate-50 border-slate-300 text-slate-950'
                      }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Asset
                  </label>
                  <select
                    value={token}
                    onChange={(e) => setToken(e.target.value as any)}
                    className={`w-full p-3 rounded-xl border font-mono text-sm font-bold transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]' : 'bg-slate-50 border-slate-300 text-slate-950'
                      }`}
                  >
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="BOT">BOT</option>
                  </select>
                </div>
              </div>

              {/* Field 3: Interest Rate / APY */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Annual Interest Rate (APY)
                  </label>
                  <span className={`text-[10px] font-mono italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    0% = interest-free peer loan
                  </span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  placeholder="4.2"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-mono text-sm font-bold transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]' : 'bg-slate-50 border-slate-300 text-slate-950'
                    }`}
                />
              </div>

              {/* Field 4: Member Contact Picker */}
              <ContactPicker selectedMembers={selectedMembers} onChange={setSelectedMembers} />

              {/*
                The quorum rule, stated before it can be violated.

                A loan needs a majority of members *other than* the borrower, so
                two people can never approve one. More can join afterwards, but
                only until the first deposit: `memberCount` sets the vote
                threshold, so the contract freezes the member set once the pool
                holds money.
              */}
              <div
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
                  hasQuorum
                    ? isDark
                      ? 'bg-[#F2D827]/5 border-[#F2D827]/20 text-[#F2D827]'
                      : 'bg-amber-50 border-[#F2D827]/30 text-amber-900'
                    : isDark
                      ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <span aria-hidden className="mt-0.5">{hasQuorum ? '✓' : '!'}</span>
                <p className="leading-relaxed">
                  {hasQuorum ? (
                    <>
                      <span className="font-bold">{memberCount} members.</span>{' '}
                      Loans will need {Math.floor((memberCount - 1) / 2) + 1} approvals from members
                      other than the borrower. More can join until the first deposit.
                    </>
                  ) : (
                    <>
                      <span className="font-bold">
                        Add {MIN_POOL_MEMBERS - memberCount} more{' '}
                        {MIN_POOL_MEMBERS - memberCount === 1 ? 'member' : 'members'}.
                      </span>{' '}
                      A pool needs at least {MIN_POOL_MEMBERS} people, because loans are approved by
                      a majority of members other than the borrower. Others can still join later,
                      but only until someone deposits, after which the member list is locked.
                    </>
                  )}
                </p>
              </div>

              {/* Field 5: Pre-filled Invite Message */}
              <div className="space-y-1.5">
                <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Custom Invite Message
                </label>
                <textarea
                  rows={2}
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-sans text-xs transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                />
              </div>

              {/* Form Action Cluster */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className={`w-1/3 py-3.5 rounded-xl border font-mono font-bold text-xs transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!name.trim() || loading || !hasQuorum}
                  className={`w-2/3 py-3.5 rounded-xl font-bold text-xs font-mono shadow-lg transition flex items-center justify-center gap-2 ${name.trim() && !loading && hasQuorum
                    ? 'bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 shadow-amber-950/20'
                    : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  {loading ? (
                    <>
                      <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
                      <span>Creating Pool...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Pool</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
