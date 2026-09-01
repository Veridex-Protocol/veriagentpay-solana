'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import {
  Gift,
  Copy,
  Check,
  ChevronDown,
  X,
  Link2,
  XCircle,
  Dices,
  Scale,
  Sparkles,
  Users,
  UserCheck,
  MessageSquare,
} from 'lucide-react';
import { useEnvelopes, useCreateEnvelope, useCancelEnvelope } from '../../hooks/use-envelopes';
import { useBalances } from '../../hooks/useApi';
import { VeriAgentLoader, VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';
import { useConfirm, useToast } from '../../components/providers/NotificationProvider';

const SUPPORTED_TOKENS = [
  { symbol: 'USDT', name: 'Tether USD', icon: '💲' },
  { symbol: 'USDC', name: 'USD Coin', icon: '💵' },
  { symbol: 'BOT', name: 'BOT Token', icon: '🤖' },
];

function EnvelopesPageInner() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const confirm = useConfirm();
  const toast = useToast();

  const searchParams = useSearchParams();
  const isEscalated = searchParams.get('escalated') === '1';
  const prefilledAmount = searchParams.get('amount');
  const prefilledCount = searchParams.get('count');
  const prefilledToken = searchParams.get('token');
  const isKnownToken = SUPPORTED_TOKENS.some((t) => t.symbol === prefilledToken);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState(
    isEscalated && prefilledAmount ? prefilledAmount : '100',
  );
  const [maxClaimers, setMaxClaimers] = useState(
    isEscalated && prefilledCount ? prefilledCount : '10',
  );
  const [selectedToken, setSelectedToken] = useState(
    isEscalated && isKnownToken ? (prefilledToken as string) : 'USDT',
  );
  const [distributionMode, setDistributionMode] = useState<'random' | 'equal'>('random');
  const [envelopeType, setEnvelopeType] = useState<'OPEN' | 'CUSTOM'>('OPEN');
  const [customRecipient, setCustomRecipient] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('🧧 Happy Red Envelope!');
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ envelope: any; deepLink: string } | null>(null);
  const [claimLinkPending, setClaimLinkPending] = useState(false);

  const { data: envelopes = [], isLoading } = useEnvelopes();
  const createEnvelope = useCreateEnvelope();
  const cancelEnvelope = useCancelEnvelope();
  const { data: balancesData } = useBalances();

  const balances = balancesData?.balances || {};
  const selectedTokenBalance = parseFloat(balances[selectedToken] || '0');
  const parsedTotalAmount = parseFloat(totalAmount) || 0;
  const parsedMaxClaimers = envelopeType === 'CUSTOM' ? 1 : parseInt(maxClaimers) || 1;
  const isInsufficientBalance = parsedTotalAmount > selectedTokenBalance;

  const perClaimAverage =
    parsedMaxClaimers > 0 ? (parsedTotalAmount / parsedMaxClaimers).toFixed(2) : '0.00';

  const handleCopyLink = (id: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast.success('Claim link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateEnvelope = async () => {
    if (parsedTotalAmount <= 0) {
      toast.error('Please enter a total amount greater than 0.');
      return;
    }

    if (isInsufficientBalance) {
      toast.error(`Insufficient ${selectedToken} balance. You have ${selectedTokenBalance.toFixed(2)} ${selectedToken}`);
      return;
    }

    if (envelopeType === 'CUSTOM' && !customRecipient.trim()) {
      toast.error('Please provide a recipient username, Telegram handle, or wallet address.');
      return;
    }

    try {
      const result = await createEnvelope.mutateAsync({
        token: selectedToken,
        totalAmount: parsedTotalAmount,
        numRecipients: parsedMaxClaimers,
        type: envelopeType,
        isRandom: envelopeType === 'OPEN' ? distributionMode === 'random' : false,
        customRecipientId: envelopeType === 'CUSTOM' ? customRecipient.trim() : undefined,
        message: greetingMessage.trim() || '🧧 Happy Red Envelope!',
      });
      setCreatedResult(result);
      setClaimLinkPending(true);
      // The TX is submitted but may not be indexed yet; recipients following the
      // link in the first ~30 seconds will still see the correct envelope data
      // because the backend stores it in the DB before the TX confirms. Clear
      // the pending indicator after 30s so it doesn't linger forever.
      setTimeout(() => setClaimLinkPending(false), 30_000);
      setTotalAmount('100');
      setMaxClaimers('10');
      setCustomRecipient('');
      toast.success('Packet drop created successfully!', {
        title: 'Red Envelope Created',
      });
    } catch (err: any) {
      console.error('Failed to create envelope:', err);
      toast.error(err.message || 'Failed to create envelope', {
        title: 'Creation Failed',
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-500 uppercase tracking-wider font-bold">
            <Gift className="w-4 h-4" />
            <span>GROUP GIFT DROPS & SMART HONGBAO</span>
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Red Envelopes
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Drop claimable cash packets directly into group chats with customized random or equal distribution.
          </p>
        </div>

        {/* Create Envelope Form Card */}
        <div
          className={`rounded-3xl border p-6 md:p-8 space-y-6 shadow-xl transition-all duration-200 ${
            isDark
              ? 'bg-[#070A11]/90 border-white/[0.08]'
              : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 border-slate-200 dark:border-white/[0.06]">
            <div>
              <h3 className={`text-base font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Create New Red Envelope Drop
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                Escrowed on-chain via BOTChain SocialPayments
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1 font-semibold">
                <Sparkles className="w-3 h-3" /> Zero Gas Fees
              </span>
            </div>
          </div>

          {/* Type & Distribution Mode Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Envelope Kind (Open vs Custom) */}
            <div className="space-y-2">
              <label className={`text-xs font-mono font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Drop Target
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEnvelopeType('OPEN')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    envelopeType === 'OPEN'
                      ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/20'
                      : isDark
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Group Link Drop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEnvelopeType('CUSTOM')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    envelopeType === 'CUSTOM'
                      ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/20'
                      : isDark
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Direct Recipient</span>
                </button>
              </div>
            </div>

            {/* Distribution Mode (Random / Lucky Draw vs Equal Split) */}
            {envelopeType === 'OPEN' ? (
              <div className="space-y-2">
                <label className={`text-xs font-mono font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Distribution Mode
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setDistributionMode('random')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                      distributionMode === 'random'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-950 shadow-md shadow-amber-500/20'
                        : isDark
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Dices className="w-4 h-4" />
                    <span>🎲 Lucky Draw</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionMode('equal')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                      distributionMode === 'equal'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-950 shadow-md shadow-amber-500/20'
                        : isDark
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Scale className="w-4 h-4" />
                    <span>⚖️ Equal Split</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className={`text-xs font-mono font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Recipient Identifier
                </label>
                <input
                  type="text"
                  placeholder="@username, phone, or 0x address"
                  value={customRecipient}
                  onChange={(e) => setCustomRecipient(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border font-mono text-xs ${
                    isDark
                      ? 'bg-slate-950 border-white/[0.08] text-white placeholder-slate-600'
                      : 'bg-slate-100 border-slate-300 text-slate-950 placeholder-slate-400'
                  }`}
                />
              </div>
            )}
          </div>

          {/* Amount, Token, and Claimers Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Token Selector */}
            <div className="space-y-1 relative">
              <label className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Token
              </label>
              <button
                type="button"
                onClick={() => setShowTokenSelector(!showTokenSelector)}
                className={`w-full p-3 rounded-xl border font-mono text-xs flex items-center justify-between ${
                  isDark
                    ? 'bg-slate-950 border-white/[0.08] text-white hover:border-amber-500/30'
                    : 'bg-slate-100 border-slate-300 text-slate-950 hover:border-amber-400'
                } transition`}
              >
                <span className="flex items-center gap-2 font-bold">
                  <span>{SUPPORTED_TOKENS.find((t) => t.symbol === selectedToken)?.icon}</span>
                  <span>{selectedToken}</span>
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Token Dropdown */}
              {showTokenSelector && (
                <div
                  className={`absolute top-full mt-1 w-full rounded-xl border shadow-xl z-20 overflow-hidden ${
                    isDark ? 'bg-slate-950 border-white/[0.12]' : 'bg-white border-slate-300'
                  }`}
                >
                  {SUPPORTED_TOKENS.map((token) => (
                    <button
                      key={token.symbol}
                      type="button"
                      onClick={() => {
                        setSelectedToken(token.symbol);
                        setShowTokenSelector(false);
                      }}
                      className={`w-full p-3 text-left flex items-center justify-between hover:bg-amber-500/10 transition ${
                        token.symbol === selectedToken ? 'bg-amber-500/20' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-base">{token.icon}</span>
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{token.symbol}</span>
                        <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {token.name}
                        </span>
                      </span>
                      <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {parseFloat(balances[token.symbol] || '0').toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-1">
              <label className={`text-xs font-mono flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <span>Total Amount</span>
                {selectedTokenBalance > 0 && (
                  <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Balance: {selectedTokenBalance.toFixed(2)}
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className={`w-full p-3 rounded-xl border font-mono text-xs font-bold ${
                  isInsufficientBalance
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : isDark
                      ? 'bg-slate-950 border-white/[0.08] text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-950'
                }`}
              />
              {isInsufficientBalance && (
                <span className="text-[10px] text-red-500 font-mono">Insufficient balance</span>
              )}
            </div>

            {/* Max Claimers Input (Disabled if CUSTOM) */}
            <div className="space-y-1">
              <label className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {envelopeType === 'CUSTOM' ? 'Recipients' : 'Max Claimers'}
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                disabled={envelopeType === 'CUSTOM'}
                value={envelopeType === 'CUSTOM' ? '1' : maxClaimers}
                onChange={(e) => setMaxClaimers(e.target.value)}
                className={`w-full p-3 rounded-xl border font-mono text-xs font-bold ${
                  isDark
                    ? 'bg-slate-950 border-white/[0.08] text-white disabled:opacity-50'
                    : 'bg-slate-100 border-slate-300 text-slate-950 disabled:opacity-50'
                }`}
              />
            </div>
          </div>

          {/* Greeting Message & Note */}
          <div className="space-y-1">
            <label className={`text-xs font-mono flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Greeting Note / Blessing (Optional)</span>
            </label>
            <input
              type="text"
              maxLength={80}
              placeholder="🧧 Happy Red Envelope!"
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className={`w-full p-3 rounded-xl border font-mono text-xs ${
                isDark
                  ? 'bg-slate-950 border-white/[0.08] text-white placeholder-slate-600'
                  : 'bg-slate-100 border-slate-300 text-slate-950 placeholder-slate-400'
              }`}
            />
          </div>

          {/* Distribution Live Preview & CTA Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            {/* Breakdown Pill */}
            <div className={`text-xs font-mono px-4 py-2.5 rounded-xl border flex items-center gap-2 ${
              isDark ? 'bg-slate-950/60 border-white/[0.06] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              {envelopeType === 'CUSTOM' ? (
                <>
                  <UserCheck className="w-4 h-4 text-amber-500" />
                  <span>Direct payout of <strong>${parsedTotalAmount.toFixed(2)} {selectedToken}</strong> to custom recipient</span>
                </>
              ) : distributionMode === 'random' ? (
                <>
                  <Dices className="w-4 h-4 text-amber-500" />
                  <span>Lucky draw: <strong>{parsedMaxClaimers} random packets</strong> (avg ~${perClaimAverage} {selectedToken})</span>
                </>
              ) : (
                <>
                  <Scale className="w-4 h-4 text-[#F2D827]" />
                  <span>Equal split: <strong>{parsedMaxClaimers} claims</strong> of <strong>${perClaimAverage} {selectedToken}</strong> each</span>
                </>
              )}
            </div>

            {/* Action Button */}
            <button
              onClick={handleCreateEnvelope}
              disabled={createEnvelope.isPending || isInsufficientBalance || parsedTotalAmount <= 0}
              className="px-6 py-3 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-amber-950/20 cursor-pointer"
            >
              {createEnvelope.isPending ? (
                <>
                  <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
                  <span>Deploying Escrow Drop...</span>
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4" />
                  <span>Create Escrow Drop</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active Drops Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Active Community Packet Drops
            </h3>
            <span className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {envelopes.length} total created
            </span>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <VeriAgentLoader
                variant="card"
                size="md"
                text="Loading Red Envelopes"
                subtext="Fetching on-chain escrow drops..."
                showProgress={true}
              />
            </div>
          ) : envelopes.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <Gift className={`w-16 h-16 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
              <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No red envelopes created yet. Create your first drop above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {envelopes.map((envelope: any) => {
                const maxClaims = envelope.maxClaims ?? envelope.numRecipients ?? 0;
                const claimCount = envelope.claimCount ?? envelope.claims?.length ?? 0;
                const totalClaimed = envelope.totalClaimed ?? 0;
                const claimProgress = maxClaims > 0 ? (claimCount / maxClaims) * 100 : 0;
                const status = envelope.status === 'ACTIVE' ? 'Active' : envelope.status === 'CANCELLED' ? 'Cancelled' : 'Completed';
                const claimLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/envelopes/${envelope.id}`;
                const isLucky = envelope.isRandom !== false && envelope.type !== 'CUSTOM';
                const isCustom = envelope.type === 'CUSTOM';

                return (
                  <div
                    key={envelope.id}
                    className={`rounded-2xl border p-6 space-y-4 text-left transition-colors ${
                      isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                        <div>
                          <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            {envelope.message || 'Red Envelope Drop'}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isCustom ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                🎯 Direct Gift
                              </span>
                            ) : isLucky ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <Dices className="w-3 h-3" /> Lucky Draw
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20 flex items-center gap-1">
                                <Scale className="w-3 h-3" /> Equal Split
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          status === 'Active'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : status === 'Cancelled'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="space-y-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Total Pool:</span>
                        <span className="font-bold text-amber-500">{envelope.totalAmount} {envelope.token}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Claim Progress:</span>
                        <span className={isDark ? 'text-white' : 'text-slate-950'}>
                          {claimCount} / {maxClaims} Claimed
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-yellow-500 h-full rounded-full transition-all"
                          style={{ width: `${claimProgress}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] pt-1">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Remaining:</span>
                        <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">
                          {Math.max(0, envelope.remainingBalance ?? (envelope.totalAmount - totalClaimed)).toFixed(2)} {envelope.token}
                        </span>
                      </div>
                    </div>

                    {/* Visible Claim Link */}
                    {status === 'Active' && (
                      <div className="space-y-1.5">
                        <label className={`text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          <Link2 className="w-3 h-3" /> Claim Link
                        </label>
                        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? 'bg-slate-950/60 border-white/[0.06]' : 'bg-slate-50 border-slate-200'}`}>
                          <span className={`flex-1 text-[11px] font-mono truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            {claimLink}
                          </span>
                          <button
                            onClick={() => handleCopyLink(envelope.id, claimLink)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                              isDark
                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                                : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
                            }`}
                          >
                            {copiedId === envelope.id ? (
                              <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span>
                            ) : (
                              <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cancel & Refund Button */}
                    {status === 'Active' && (
                      <button
                        onClick={async () => {
                          const refundAmount = envelope.remainingBalance ?? envelope.totalAmount;
                          const ok = await confirm({
                            title: 'Cancel Envelope & Refund',
                            message: `Cancel this envelope and refund ${refundAmount} ${envelope.token} to your wallet?`,
                            description: 'The claim link will be deactivated immediately and remaining tokens will be credited back to your balance.',
                            badge: `${refundAmount} ${envelope.token}`,
                            confirmText: 'Cancel & Refund',
                            cancelText: 'Keep Active',
                            variant: 'danger',
                          });
                          if (ok) {
                            try {
                              await cancelEnvelope.mutateAsync(envelope.id);
                              toast.success(`Refunded ${refundAmount} ${envelope.token} to your wallet!`, {
                                title: 'Envelope Cancelled',
                              });
                            } catch (err: any) {
                              toast.error(err.message || 'Failed to cancel envelope', {
                                title: 'Cancellation Error',
                              });
                            }
                          }
                        }}
                        disabled={cancelEnvelope.isPending}
                        className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          isDark
                            ? 'bg-red-950/30 hover:bg-red-950/50 text-red-400 border border-red-500/20'
                            : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {cancelEnvelope.isPending ? 'Cancelling...' : 'Cancel & Refund'}
                      </button>
                    )}

                    {/* TX Hash */}
                    {envelope.txHash && (
                      <div className={`text-center text-[10px] font-mono ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                        TX: {envelope.txHash.slice(0, 10)}...{envelope.txHash.slice(-8)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Success Modal with Share Link ── */}
      {createdResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`relative w-full max-w-md rounded-2xl border p-6 space-y-5 shadow-2xl ${isDark ? 'bg-[#0A0E17] border-white/10' : 'bg-white border-slate-200'}`}>
            {/* Close button */}
            <button
              onClick={() => setCreatedResult(null)}
              className={`absolute top-4 right-4 p-1 rounded-full transition ${isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Success header */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#F2D827]/10 flex items-center justify-center">
                <Gift className="w-7 h-7 text-[#F2D827]" />
              </div>
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                🧧 Escrow Drop Created!
              </h3>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {createdResult.envelope.totalAmount} {createdResult.envelope.token} ·{' '}
                {createdResult.envelope.isRandom !== false ? '🎲 Lucky Draw' : '⚖️ Equal Split'} ·{' '}
                {createdResult.envelope.numRecipients || createdResult.envelope.remainingClaims} claims
              </p>
            </div>

            {/* Claim link */}
            <div className="space-y-2">
              <label className={`text-xs font-mono uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Share this link to let people claim
              </label>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${isDark ? 'bg-slate-950 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`flex-1 text-sm font-mono truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {createdResult.deepLink}
                </span>
                <button
                  onClick={() => handleCopyLink('created', createdResult.deepLink)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    isDark
                      ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                      : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  {copiedId === 'created' ? (
                    <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Copied!</span>
                  ) : (
                    <span className="flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</span>
                  )}
                </button>
              </div>
            </div>

            {/* On-chain confirmation status */}
            {claimLinkPending ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
                Confirming on-chain — link is live but may take ~30s to index for new visitors.
              </div>
            ) : createdResult.envelope.txHash ? (
              <div className={`text-center text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                TX: {createdResult.envelope.txHash.slice(0, 10)}...{createdResult.envelope.txHash.slice(-8)}
              </div>
            ) : null}

            {/* Done button */}
            <button
              onClick={() => setCreatedResult(null)}
              className="w-full py-3 rounded-xl font-bold text-sm bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 transition font-mono"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function EnvelopesPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="md"
          text="Red Envelopes"
          subtext="Loading gift drops..."
          showProgress={true}
        />
      }
    >
      <EnvelopesPageInner />
    </Suspense>
  );
}

