'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Coins,
  Plus,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Search,
  Info,
  Layers,
} from 'lucide-react';
import { useUserTokens, useAddToken, useRemoveToken } from '../../hooks/useApi';
import { motion, AnimatePresence } from 'framer-motion';
import { VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';
import { useConfirm, useToast } from '../../components/providers/NotificationProvider';

export default function WatchedTokensPage() {
  const { data: tokens = [], isLoading, refetch } = useUserTokens();
  const addTokenMutation = useAddToken();
  const removeTokenMutation = useRemoveToken();
  const confirm = useConfirm();
  const toast = useToast();

  const [addressInput, setAddressInput] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCopy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    toast.success('Contract address copied!');
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleAddToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const clean = addressInput.trim();
    if (!clean.startsWith('0x') || clean.length !== 42) {
      const err = 'Please enter a valid 42-character hex contract address (0x...)';
      setErrorMsg(err);
      toast.error(err);
      return;
    }

    try {
      const res = await addTokenMutation.mutateAsync(clean);
      const msg = `Successfully added ${res.token?.symbol || 'token'} to your watchlist!`;
      setSuccessMsg(msg);
      toast.success(msg);
      setAddressInput('');
      refetch();
    } catch (err: any) {
      const msg = err.message || 'Failed to add token. Ensure it is a valid ERC-20 contract.';
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  const handleRemoveToken = async (addr: string, symbol: string) => {
    const ok = await confirm({
      title: 'Remove Watched Token',
      message: `Are you sure you want to stop watching ${symbol}?`,
      description: `Token address: ${addr.slice(0, 8)}...${addr.slice(-6)}`,
      badge: symbol,
      confirmText: 'Remove Token',
      cancelText: 'Keep Watching',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await removeTokenMutation.mutateAsync(addr);
      toast.success(`Removed ${symbol} from watchlist`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove token');
    }
  };

  const builtInTokens = tokens.filter((t) => !t.custom);
  const customTokens = tokens.filter((t) => t.custom);

  const filteredCustom = customTokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#F2D827]/10 text-[#F2D827]">
                <Coins className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Watched Tokens & Assets
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Watch arbitrary ERC-20 tokens on BOTChain. Track incoming transfers, execute transfers, and create red envelopes in any token.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </div>

        {/* Add Token Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.08] shadow-sm backdrop-blur-xl">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
            <Plus className="w-4 h-4 text-[#F2D827]" />
            Watch a New ERC-20 Token
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
            Paste any ERC-20 contract address. We will automatically inspect <code className="text-slate-700 dark:text-slate-300">symbol()</code>, <code className="text-slate-700 dark:text-slate-300">name()</code>, and <code className="text-slate-700 dark:text-slate-300">decimals()</code> on-chain and start tracking deposits immediately.
          </p>

          <form onSubmit={handleAddToken} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="0x... (ERC-20 Token Contract Address)"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.12] text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F2D827]/50 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={addTokenMutation.isPending || !addressInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] disabled:opacity-50 text-slate-950 font-semibold text-sm transition-all flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-amber-950/20 cursor-pointer"
              >
                {addTokenMutation.isPending ? (
                  <>
                    <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
                    <span>Inspecting Contract...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Watch Token
                  </>
                )}
              </button>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-[#F2D827]/10 border border-[#F2D827]/30 text-[#D4A106] dark:text-[#F2D827] text-xs flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </form>
        </div>

        {/* Verified Protocol Assets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#F2D827]" />
              Verified Protocol Assets (Built-In)
            </h3>
            <span className="text-xs text-slate-500">Always supported • Precedence in chat</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {builtInTokens.map((t) => (
              <div
                key={t.symbol}
                className="p-4 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-base">
                        {t.symbol}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20">
                        <ShieldCheck className="w-3 h-3" />
                        Verified
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.name}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{t.decimals} dec</span>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    {t.address.startsWith('0x0000000000000000000000000000000000000000')
                      ? 'Native Token'
                      : `${t.address.slice(0, 6)}...${t.address.slice(-4)}`}
                  </span>
                  {t.address && !t.address.startsWith('0x0000000000000000000000000000000000000000') && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(t.address)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        title="Copy contract address"
                      >
                        {copiedAddress === t.address ? (
                          <Check className="w-3.5 h-3.5 text-[#F2D827]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={`https://scan.bohr.life/address/${t.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="View on BohrScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Watched Tokens */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-500" />
                Custom Watched Tokens ({customTokens.length})
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Arbitrary ERC-20s added by contract address. Tracked for you in real-time.
              </p>
            </div>

            {customTokens.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by symbol, name, or 0x..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#F2D827]"
                />
              </div>
            )}
          </div>

          {customTokens.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.1] text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center mx-auto text-slate-400">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  No Custom Tokens Watched Yet
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Add any token contract address above (or type <code className="text-slate-700 dark:text-slate-300">/addtoken 0x...</code> in the bots) to start tracking deposits and sending funds.
                </p>
              </div>
            </div>
          ) : filteredCustom.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No custom tokens match &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AnimatePresence>
                {filteredCustom.map((t) => (
                  <motion.div
                    key={t.address}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between space-y-3 hover:border-slate-300 dark:hover:border-white/[0.12] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-base">
                            {t.symbol}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Unverified
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.name}</p>
                      </div>

                      <button
                        onClick={() => handleRemoveToken(t.address, t.symbol)}
                        disabled={removeTokenMutation.isPending}
                        className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Unwatch token"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-white/[0.04] space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span>Contract Address:</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span>{`${t.address.slice(0, 8)}...${t.address.slice(-6)}`}</span>
                          <button
                            onClick={() => handleCopy(t.address)}
                            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            title="Copy full address"
                          >
                            {copiedAddress === t.address ? (
                              <Check className="w-3 h-3 text-[#F2D827]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={`https://scan.bohr.life/address/${t.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title="View on BohrScan"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span>Decimals:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{t.decimals}</span>
                      </div>

                      {t.lastBalanceRaw && (
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span>Last Synced Balance:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {t.lastBalanceRaw}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Security & Architecture Explainer */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Info className="w-4 h-4 text-[#F2D827]" />
            How Token Watching Works
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">⚡ Real-Time Ingress</p>
              <p>The deposit listener scans Transfer event logs on every block. Adding a contract gives the listener permission and decimals to credit it instantly.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">🔄 Daily Reconciliation</p>
              <p>A daily cron queries on-chain <code className="text-slate-700 dark:text-slate-300">balanceOf</code> directly from the contract, ensuring vault balances stay strictly accurate regardless of history.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">🛡️ Anti-Collision Security</p>
              <p>Built-in tokens (USDC, USDT, BOT) always win symbol lookups. If multiple custom tokens share a symbol, the system asks you to pick the contract address.</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
