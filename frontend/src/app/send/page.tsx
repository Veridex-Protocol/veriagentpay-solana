'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { useBalances, useTransfer, useUserTokens } from '../../hooks/useApi';
import { Send, CheckCircle2, ShieldCheck, Bot, Sparkles, ExternalLink, AlertTriangle, Fingerprint, Plus } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getExplorerTxUrl, formatTxHash } from '../../lib/explorer';
import { api } from '../../lib/api';
import { RankedContactPicker } from '../../components/ui/RankedContactPicker';
import { transferWithPasskey, isSpendingLimitError } from '../../lib/passkey-actions';
import { SentPaymentsPanel } from '../../components/payments/SentPaymentsPanel';
import { VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';

function SendContent() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState(searchParams.get('to') || '');
  const [amount, setAmount] = useState(searchParams.get('amount') || '');
  const [token, setToken] = useState<string>('USDC');
  const [note, setNote] = useState('');
  // Arriving from a chat escalation: the bot already collected the payment and
  // signed the parameters, so skip straight to review rather than making the
  // user re-enter what they just typed in Telegram.
  const isEscalated = searchParams.get('escalated') === '1';
  const [step, setStep] = useState<'form' | 'review' | 'success'>(
    isEscalated && searchParams.get('to') && searchParams.get('amount') ? 'review' : 'form',
  );
  const [naturalPrompt, setNaturalPrompt] = useState('');
  const [txHash, setTxHash] = useState('');
  const [transferMethod, setTransferMethod] = useState<'session_key' | 'passkey'>('session_key');

  const { data: balanceData } = useBalances();
  const { data: tokenList = [] } = useUserTokens();
  const transferMutation = useTransfer();

  const availableTokens = tokenList.length > 0
    ? tokenList.map((t) => t.symbol)
    : ['USDC'];

  const balances = balanceData?.balances || { USDC: '0.00', USDT: '0.00', BOT: '0.00' };
  const activeTokenBalance = parseFloat(balances[token] || '0');

  const handleParseNaturalPrompt = async () => {
    if (!naturalPrompt) return;

    try {
      const res = await api.parseIntent(naturalPrompt);
      if (res?.params) {
        if (res.params.amount) setAmount(String(res.params.amount));
        if (res.params.token) {
          setToken(res.params.token.toUpperCase());
        }
        if (res.params.recipient) setRecipient(res.params.recipient);
        if (res.params.note) setNote(res.params.note);
      }
    } catch {
      // Enhanced natural language parser supporting 0x EVM addresses, handles, phone numbers
      const regex = /(?:send|pay|transfer)\s+\$?(\d+(?:\.\d+)?)\s*([A-Za-z0-9]+)?\s+(?:to\s+)?(0x[a-fA-F0-9]{40}|@?[\w\.]+|\+?\d[\d\s\-\(\)]{6,})/i;
      const matches = naturalPrompt.match(regex);
      if (matches) {
        if (matches[1]) setAmount(matches[1]);
        if (matches[2]) {
          setToken(matches[2].toUpperCase());
        }
        if (matches[3]) setRecipient(matches[3].trim());
      } else {
        const simpleMatch = naturalPrompt.match(/(\d+(?:\.\d+)?)\s*([A-Za-z0-9]+)?/i);
        if (simpleMatch) {
          if (simpleMatch[1]) setAmount(simpleMatch[1]);
          if (simpleMatch[2]) {
            setToken(simpleMatch[2].toUpperCase());
          }
        }
        const addrMatch = naturalPrompt.match(/(0x[a-fA-F0-9]{40}|@\w+|\+\d+)/i);
        if (addrMatch) {
          setRecipient(addrMatch[1]);
        }
      }
    }
  };

  /**
   * An escalated link means the user already confirmed the payment in chat and
   * tapped through specifically to approve it. Prompt for the passkey on
   * arrival instead of making them press another button.
   *
   * The parameters are checked against the server's signature first. They
   * arrive in a URL that may have been forwarded into a group chat and edited,
   * and this effect fires a biometric prompt without any further interaction:
   * so an unverified link would turn "tap to approve your payment" into "tap to
   * approve someone else's". On failure the auto-prompt is skipped and the user
   * lands on the form with the reason shown, rather than on a payment they did
   * not compose.
   */
  useEffect(() => {
    if (!isEscalated || step !== 'review' || !recipient || !amount) return;
    if (hasAutoPrompted.current) return;
    hasAutoPrompted.current = true;

    void (async () => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('escalated');

      try {
        const result = await api.verifyEscalation(params.toString());
        if (!result?.valid) {
          setError(
            result?.reason === 'expired'
              ? 'This approval link has expired. Send the payment again from your chat.'
              : 'This approval link could not be verified. Enter the payment below if you still want to send it.',
          );
          setStep('form');
          return;
        }
      } catch {
        setError('Could not verify this approval link. Enter the payment below if you still want to send it.');
        setStep('form');
        return;
      }

      await handlePasskeyTransfer();
    })();
    // Intentionally runs once on arrival; handlePasskeyTransfer guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEscalated, step, recipient, amount]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    setStep('review');
  };

  const [error, setError] = useState('');
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const hasAutoPrompted = useRef(false);

  /**
   * Send with the user's passkey, verified on-chain.
   *
   * The challenge commits to this exact transfer (vault, chain, payload,
   * nonce), and `PayVault.executeWithPasskey` checks it. The backend only
   * submits and pays gas, so it cannot move funds on the user's behalf.
   *
   * Guarded by `isPasskeyPending` because each prepare reads the vault's live
   * nonce: two overlapping prompts would share one, and only the first
   * assertion could land.
   */
  const handlePasskeyTransfer = async () => {
    if (isPasskeyPending) return;

    setError('');
    setIsPasskeyPending(true);
    try {
      const res = await transferWithPasskey({
        to: recipient,
        token,
        amount: parseFloat(amount),
        note: note || undefined,
      });

      if (!res?.txHash) {
        setError('Transfer failed: no transaction hash returned.');
        return;
      }

      setTxHash(res.txHash);
      setTransferMethod('passkey');
      setStep('success');
      queryClient.invalidateQueries({ queryKey: ['sentPayments'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.message?.includes('cancelled')) {
        setError('Biometric authentication was cancelled.');
      } else {
        setError(e?.message || 'Passkey transfer failed. Please try again.');
      }
    } finally {
      setIsPasskeyPending(false);
    }
  };

  const handleExecuteTransfer = async () => {
    setError('');

    try {
      const res = await transferMutation.mutateAsync({
        to: recipient,
        token,
        amount: parseFloat(amount),
      });

      if (!res?.txHash) {
        setError('Transfer failed: no transaction hash returned.');
        return;
      }

      setTxHash(res.txHash);
      setTransferMethod((res as any).method || 'session_key');
      setStep('success');

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e: any) {
      const code = e?.code;

      // A payment over the session-key allowance is the expected case for
      // anything large, not a failure. Escalate straight to the passkey rather
      // than making the user read an error and pick a different button:
      // below the limit stays frictionless, above it costs one prompt.
      if (
        code !== 'SESSION_EXPIRED' &&
        code !== 'SESSION_KEY_REQUIRED' &&
        !e?.message?.includes('Insufficient') &&
        isSpendingLimitError(e)
      ) {
        await handlePasskeyTransfer();
        return;
      }

      if (code === 'SESSION_EXPIRED' || e?.message?.includes('expired') || e?.message?.includes('revoked')) {
        setError('SESSION_EXPIRED');
      } else if (code === 'SESSION_KEY_REQUIRED' || e?.message?.includes('No active session key')) {
        setError('SESSION_KEY_REQUIRED');
      } else if (e?.message?.includes('Insufficient')) {
        setError('INSUFFICIENT_FUNDS');
      } else if (e?.name === 'NotAllowedError' || e?.message?.includes('cancelled')) {
        setError('Biometric authentication was cancelled. Please try again.');
      } else {
        setError(e?.message || 'Transfer failed. Please try again.');
      }
    }
  };

  return (
    <AppLayout>
      <div className="va-product-narrow space-y-8">
        {/* Header Title */}
        <div className="va-product-page-header">
          <div className="va-product-eyebrow flex items-center gap-2">
            <Send className="w-4 h-4" />
            <span>Instant transfers</span>
          </div>
          <h1 className="va-product-title">
            Send Money
          </h1>
          <p className="va-product-lede">
            Pay anyone using their handle, phone number, or wallet address. Zero gas fees, authorized with your fingerprint.
          </p>
        </div>

        {/* Agent Command Bar (AI Payment Assistant) */}
        <div
          className="va-product-surface p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] font-bold">
            <Bot className="w-4 h-4" />
            <span>AI Payment Assistant</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder='Type naturally, e.g. "Send $50 to @alice for lunch"'
              value={naturalPrompt}
              onChange={(e) => setNaturalPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleParseNaturalPrompt()}
              className="va-product-input min-w-0 flex-1 py-2.5 text-xs"
            />
            <button
              onClick={handleParseNaturalPrompt}
              className="va-product-action va-product-action--primary shrink-0 px-4 py-2.5 text-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Parse Command</span>
            </button>
          </div>
        </div>

        {/* Main Form Container */}
        {step === 'form' && (
          <form
            onSubmit={handleFormSubmit}
            className="va-product-surface p-6 md:p-8 space-y-6"
          >
            {/* Recipient Input */}
            <div className="space-y-2">
              <label className="va-product-label block">
                Recipient (@username, phone number, or 0x address)
              </label>
              <RankedContactPicker
                value={recipient}
                onChange={(value) => setRecipient(value)}
                placeholder="@username, phone, or wallet address"
                accentColor="yellow"
              />
            </div>

            {/* Asset Selector Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="va-product-label block">
                  Select Asset
                </label>
                <span className="text-xs font-mono text-[#D4A106] dark:text-[#F2D827] font-bold">
                  Max: {activeTokenBalance.toFixed(2)} {token}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableTokens.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setToken(t)}
                    className={`va-product-action px-4 py-2.5 font-mono text-xs ${token === t
                      ? isDark
                        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40'
                        : 'bg-yellow-50 text-yellow-800 border-yellow-300 font-extrabold'
                      : isDark
                        ? 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    {t}
                  </button>
                ))}
                <Link
                  href="/tokens"
                  className="px-3 py-2 text-xs font-mono text-slate-400 hover:text-[#F2D827] border border-dashed border-slate-300 dark:border-white/[0.1] rounded-xl flex items-center gap-1 transition-colors"
                  title="Add custom token"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Watch</span>
                </Link>
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="va-product-label block">
                  Amount to Send
                </label>
                <button
                  type="button"
                  onClick={() => setAmount(activeTokenBalance.toString())}
                  className="text-xs font-mono text-[#D4A106] dark:text-[#F2D827] underline"
                >
                  Use Max
                </button>
              </div>

              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="va-product-input font-mono text-2xl font-bold"
              />
            </div>

            {/* Note Input */}
            <div className="space-y-2">
              <label className="va-product-label block">
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="Dinner last night 🍕"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="va-product-input font-mono text-sm"
              />
            </div>

            {/* Sponsored Gas Banner */}
            <div className="va-product-status p-3 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#F2D827]" />
                <span>Network Gas Fee: $0.00 (Sponsored)</span>
              </div>
              <span className="font-bold">SPONSORED</span>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              className="va-product-action va-product-action--primary w-full py-3.5 flex items-center justify-center gap-2"
            >
              <span>Review Transfer</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Step 2: Review Screen */}
        {step === 'review' && (
          <div
            className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl text-left transition-colors duration-200 ${isDark
              ? 'bg-[#070A11] border-white/[0.08]'
              : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
              }`}
          >
            <div className="flex items-center justify-between border-b pb-4 border-slate-800">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Review Transfer</h2>
              <span className="text-xs font-mono text-[#D4A106] dark:text-[#F2D827] font-bold bg-[#F2D827]/10 px-2.5 py-1 rounded-full flex items-center gap-1 border border-[#F2D827]/20">
                <ShieldCheck className="w-3 h-3" />
                <span>Session Key Active</span>
              </span>
            </div>

            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Recipient:</span>
                <span className="font-bold text-[#D4A106] dark:text-[#F2D827]">{recipient}</span>
              </div>

              <div className="flex justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Amount:</span>
                <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{amount} {token}</span>
              </div>

              {note && (
                <div className="flex justify-between">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Note:</span>
                  <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{note}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>L1 Gas Fee:</span>
                <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">$0.00 (Sponsored)</span>
              </div>
            </div>

            {error && error !== 'BIOMETRICS_REQUIRED' && (
              <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-mono space-y-2">
                {error === 'SESSION_EXPIRED' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-bold">Session Key Expired</span>
                    </div>
                    <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>Your session key has expired. Use biometric authentication to send this payment.</p>
                    <button
                      onClick={handlePasskeyTransfer}
                      disabled={isPasskeyPending}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-bold hover:bg-blue-500/30 transition disabled:opacity-50"
                    >
                      <Fingerprint className="w-4 h-4" />
                      {isPasskeyPending ? 'Verifying...' : 'Authenticate & Send'}
                    </button>
                  </div>
                ) : error === 'SESSION_KEY_REQUIRED' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-bold">Session Key Required</span>
                    </div>
                    <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>No session key found. Use biometric authentication to send this payment, or set up a session key for instant transfers.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePasskeyTransfer}
                        disabled={isPasskeyPending}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-bold hover:bg-blue-500/30 transition disabled:opacity-50"
                      >
                        <Fingerprint className="w-4 h-4" />
                        {isPasskeyPending ? 'Verifying...' : 'Authenticate & Send'}
                      </button>
                      <a href="/keys" className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#F2D827]/20 text-[#F2D827] font-bold hover:bg-[#F2D827]/30 transition">
                        Setup Keys →
                      </a>
                    </div>
                  </div>
                ) : error === 'INSUFFICIENT_FUNDS' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-bold">Insufficient Balance</span>
                    </div>
                    <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>You don&apos;t have enough {token} to complete this transfer. Top up your wallet.</p>
                  </div>
                ) : (
                  <span className="text-red-400">{error}</span>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep('form'); setError(''); }}
                className={`w-1/3 py-3 rounded-xl border font-bold text-xs ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
              >
                Back
              </button>

              <button
                onClick={handleExecuteTransfer}
                disabled={transferMutation.isPending || isPasskeyPending}
                className="w-2/3 py-3 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition hover:scale-[1.01] disabled:opacity-50 cursor-pointer"
              >
                {transferMutation.isPending || isPasskeyPending ? (
                  <>
                    <VeriAgentLogoMark size={18} speed="fast" withSquircle={false} glow={false} />
                    <span>Processing On-Chain...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>Instant Transfer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success Screen */}
        {step === 'success' && (
          <div
            className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl text-center ${isDark
              ? 'bg-[#070A11] border-[#F2D827]/30'
              : 'bg-white border-[#F2D827]/40 text-slate-950 shadow-slate-200/50'
              }`}
          >
            <div className="w-12 h-12 rounded-full bg-[#F2D827]/10 text-[#F2D827] flex items-center justify-center mx-auto border border-[#F2D827]/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                {transferMethod === 'session_key' ? '⚡ Instant Transfer Complete!' : 'Payment Sent!'}
              </h2>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {amount} {token} transferred to {recipient} {transferMethod === 'session_key' ? 'via session key' : 'via passkey'}
              </p>
            </div>

            <div className={`p-3 rounded-xl border font-mono text-xs space-y-2 ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-100 border-slate-300'
              }`}>
              <div className="flex items-center justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Transaction Hash:</span>
                <a
                  href={getExplorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D4A106] dark:text-[#F2D827] hover:underline font-bold flex items-center gap-1"
                >
                  {formatTxHash(txHash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Method:</span>
                <span className={`font-bold ${transferMethod === 'session_key' ? 'text-[#D4A106] dark:text-[#F2D827]' : 'text-blue-400'}`}>
                  {transferMethod === 'session_key' ? '⚡ Session Key (Instant)' : '🔐 Passkey'}
                </span>
              </div>
            </div>

            <button
              onClick={() => { setStep('form'); setRecipient(''); setAmount(''); setNote(''); }}
              className="w-full py-3.5 rounded-xl font-bold text-xs bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 transition font-mono"
            >
              Send Another Payment
            </button>
          </div>
        )}

        <SentPaymentsPanel />
      </div>
    </AppLayout>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-mono text-xs">Loading...</div>}>
      <SendContent />
    </Suspense>
  );
}
