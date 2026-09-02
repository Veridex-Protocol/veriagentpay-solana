'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Bell,
  Plus,
  PlusCircle,
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  XCircle,
  ArrowDownCircle,
  Copy,
  CheckCircle2,
  Check,
} from 'lucide-react';
import {
  useRequests,
  usePayRequest,
  useCancelRequest,
  useRemindRequest,
  useCreateRequest,
} from '../../hooks/use-requests';
import { PasskeyPrompt } from '../../components/ui/PasskeyPrompt';
import { motion } from 'framer-motion';
import { useToast, useConfirm } from '../../components/providers/NotificationProvider';

export default function RequestsListPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'received' | 'sent' | 'create'>('received');
  const [selectedPayRequest, setSelectedPayRequest] = useState<any>(null);
  const [showPasskey, setShowPasskey] = useState(false);

  // Create request form state
  const [recipient, setRecipient] = useState('');
  const [token, setToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [createdRequest, setCreatedRequest] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const { data: requests = [], isLoading, refetch } = useRequests({ filter: activeTab === 'create' ? 'sent' : activeTab });
  const payMutation = usePayRequest();
  const cancelMutation = useCancelRequest();
  const remindMutation = useRemindRequest();
  const createMutation = useCreateRequest();

  const handlePayConfirm = async () => {
    if (!selectedPayRequest) return;
    try {
      await payMutation.mutateAsync(selectedPayRequest.id);
      setShowPasskey(false);
      setSelectedPayRequest(null);
      toast.success('Payment settled successfully!', {
        title: 'Payment Completed',
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Payment error', { title: 'Payment Failed' });
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;

    try {
      const res = await createMutation.mutateAsync({
        recipientIdentifier: recipient,
        token,
        amount: parseFloat(amount),
        note: note || undefined,
      });

      if (res && res.request) {
        setCreatedRequest(res.request);
        toast.success('Payment request created!', {
          title: 'Request Created',
        });
        // Switch to sent tab after creating
        setTimeout(() => {
          setActiveTab('sent');
          refetch();
        }, 2000);
      }
    } catch (err: any) {
      console.error('Failed to create request:', err);
      toast.error(err.message || 'Failed to create payment request', {
        title: 'Request Failed',
      });
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = createdRequest
    ? `${baseUrl}/requests/${createdRequest.id}`
    : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Payment request link copied!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 relative pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className={`p-2 rounded-xl border transition ${isDark ? 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950'
                }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className={`text-2xl font-extrabold tracking-tight flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <CreditCard className="w-6 h-6 text-[#F2D827]" />
                <span>Payment Requests</span>
              </h1>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage incoming and outgoing requests
              </p>
            </div>
          </div>
          <Link
            href="/request"
            className="hidden sm:inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs font-mono transition shadow-lg"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Request</span>
          </Link>
        </div>

        {/* Tabs */}
        <div className={`flex p-1.5 rounded-xl border transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-slate-100 border-slate-200'
          }`}>
          <button
            onClick={() => setActiveTab('received')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'received'
                ? 'bg-[#F2D827] text-slate-950 shadow-md'
                : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Received</span>
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'sent'
                ? 'bg-[#F2D827] text-slate-950 shadow-md'
                : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Sent</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-2 transition ${activeTab === 'create'
                ? 'bg-[#F2D827] text-slate-950 shadow-md'
                : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create</span>
          </button>
        </div>

        {/* Request List or Create Form */}
        {activeTab === 'create' ? (
          !createdRequest ? (
            <form
              onSubmit={handleRequestSubmit}
              className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl transition-colors duration-200 ${isDark
                ? 'bg-white/[0.02] border-white/[0.08]'
                : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
                }`}
            >
              {/* Recipient Input */}
              <div className="space-y-2">
                <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Request From (@handle or Phone)
                </label>
                <input
                  type="text"
                  placeholder="@bob_smith or +15550192"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                  className={`w-full p-3.5 rounded-xl border font-mono text-sm transition-colors ${isDark
                    ? 'bg-slate-950 border-white/[0.08] text-white focus:border-yellow-500/50'
                    : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-yellow-500'
                    }`}
                />
              </div>

              {/* Amount & Asset Selector */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Amount
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className={`w-full p-3.5 rounded-xl border font-mono text-2xl font-bold transition-colors ${isDark
                      ? 'bg-slate-950 border-white/[0.08] text-white focus:border-yellow-500/50'
                      : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-yellow-500'
                      }`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Asset
                  </label>
                  <select
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className={`w-full p-4 rounded-xl border font-mono text-sm font-bold transition-colors ${isDark
                      ? 'bg-slate-950 border-white/[0.08] text-yellow-400'
                      : 'bg-slate-50 border-slate-300 text-yellow-600'
                      }`}
                  >
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                    <option value="BOT">BOT</option>
                  </select>
                </div>
              </div>

              {/* Note Input */}
              <div className="space-y-2">
                <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Payment Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Dinner last night 🍕"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`w-full p-3.5 rounded-xl border font-mono text-sm transition-colors ${isDark
                    ? 'bg-slate-950 border-white/[0.08] text-white focus:border-yellow-500/50'
                    : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-yellow-500'
                    }`}
                />
              </div>

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={createMutation.isPending}
                className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 ${isDark
                  ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
                  }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                <span>{createMutation.isPending ? 'Creating...' : 'Generate Payment Request'}</span>
              </button>
            </form>
          ) : (
            /* Request Created Card */
            <div
              className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl text-center ${isDark
                ? 'bg-[#070A11] border-yellow-500/30'
                : 'bg-white border-yellow-300 text-slate-950 shadow-slate-200/50'
                }`}
            >
              <div className="w-12 h-12 rounded-full bg-[#F2D827]/10 text-[#F2D827] flex items-center justify-center mx-auto border border-[#F2D827]/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Request Link Ready!</h2>
                <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {createdRequest.amount} {createdRequest.token} requested from {createdRequest.recipientIdentifier}
                </p>
              </div>

              <div className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between gap-2 ${isDark ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]' : 'bg-slate-100 border-slate-300 text-slate-950'
                }`}>
                <span className="truncate">{shareUrl}</span>
                <button
                  onClick={copyToClipboard}
                  className="p-1.5 rounded bg-[#F2D827] text-slate-950 font-bold hover:bg-[#E5A900] transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCreatedRequest(null)}
                  className={`w-full py-3 rounded-xl border font-bold text-xs ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  Create Another Request
                </button>
              </div>
            </div>
          )
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 bg-slate-950/40 rounded-2xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className={`rounded-2xl border p-12 text-center space-y-3 transition-colors ${isDark ? 'bg-[#070A11]/60 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <Clock className="w-10 h-10 text-slate-500 mx-auto" />
            <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>No {activeTab} payment requests found.</p>
            <Link
              href="/request"
              className="inline-block text-xs font-mono text-[#D4A106] dark:text-[#F2D827] hover:underline font-bold"
            >
              Create a request now &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req: any) => {
              const isReceived = activeTab === 'received';
              const isPending = req.status === 'PENDING';
              const isPaid = req.status === 'PAID';

              return (
                <div
                  key={req.id}
                  className={`rounded-2xl border p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition shadow-md ${isDark
                      ? 'bg-[#070A11] border-white/[0.08] hover:border-[#F2D827]/30'
                      : 'bg-white border-slate-200 text-slate-950 shadow-sm hover:border-[#F2D827]/40'
                    }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-3 rounded-xl bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20 shrink-0">
                      {isReceived ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`font-extrabold font-mono text-base ${isDark ? 'text-white' : 'text-slate-950'}`}>
                          {req.amount} {req.token}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isPending
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : isPaid
                                ? 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {isReceived ? 'From: ' : 'To: '}{' '}
                        <span className="text-[#D4A106] dark:text-[#F2D827] font-semibold">
                          {req.recipientIdentifier || req.requesterId}
                        </span>
                      </p>
                      {req.note && <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>&quot;{req.note}&quot;</p>}
                    </div>
                  </div>

                  <div className={`flex items-center space-x-2 pt-2 md:pt-0 border-t md:border-t-0 ${isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                    {isReceived && isPending && (
                      <button
                        onClick={() => {
                          setSelectedPayRequest(req);
                          setShowPasskey(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs font-mono flex items-center space-x-1.5 transition shadow-md"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Pay Now</span>
                      </button>
                    )}

                    {!isReceived && isPending && (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await remindMutation.mutateAsync(req.id);
                              toast.success('Payment reminder sent!');
                            } catch (err: any) {
                              toast.error(err.message || 'Failed to send reminder');
                            }
                          }}
                          disabled={remindMutation.isPending}
                          className={`px-3 py-2 rounded-xl border text-xs font-mono font-semibold flex items-center space-x-1 transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-amber-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-amber-700 hover:bg-slate-200'
                            }`}
                        >
                          <Bell className="w-3.5 h-3.5" />
                          <span>Remind</span>
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Cancel Payment Request',
                              message: `Cancel this request for ${req.amount} ${req.token}?`,
                              description: 'The recipient will no longer be able to settle this request.',
                              badge: `${req.amount} ${req.token}`,
                              confirmText: 'Cancel Request',
                              cancelText: 'Keep Active',
                              variant: 'danger',
                            });
                            if (ok) {
                              try {
                                await cancelMutation.mutateAsync(req.id);
                                toast.success('Payment request cancelled.');
                              } catch (err: any) {
                                toast.error(err.message || 'Failed to cancel request');
                              }
                            }
                          }}
                          disabled={cancelMutation.isPending}
                          className={`px-3 py-2 rounded-xl border text-xs font-mono font-semibold flex items-center space-x-1 transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-rose-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-rose-600 hover:bg-slate-200'
                            }`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}

                    <Link
                      href={`/requests/${req.id}`}
                      className={`px-3 py-2 rounded-xl border text-xs font-mono font-semibold transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      Details &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile Floating Action Button (FAB) - Elevated at bottom-20 right-4 */}
        <motion.button
          onClick={() => router.push('/request')}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="fixed bottom-20 right-4 z-40 sm:hidden bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 p-4 rounded-full flex items-center justify-center active:scale-95"
          aria-label="New Payment Request"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </motion.button>
      </div>

      {/* Passkey Payment Modal */}
      {showPasskey && selectedPayRequest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl ${isDark ? 'bg-[#070A11] border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-950'
            }`}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto border border-yellow-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Approve Payment Request</h3>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                You are paying <span className="font-bold text-[#D4A106] dark:text-[#F2D827]">{selectedPayRequest.amount} {selectedPayRequest.token}</span> to{' '}
                <span className="text-[#D4A106] dark:text-[#F2D827] font-semibold">{selectedPayRequest.requesterId}</span>
              </p>
            </div>

            <PasskeyPrompt
              onSuccess={handlePayConfirm}
              onCancel={() => setShowPasskey(false)}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
