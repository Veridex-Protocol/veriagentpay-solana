'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppLayout } from '../../../components/layout/AppLayout';
import { useTheme } from '../../../components/providers/ThemeProvider';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Bell,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Share2,
  Copy,
} from 'lucide-react';
import { getAppBaseUrl } from '../../../lib/app-url';
import {
  useRequestDetails,
  usePayRequest,
  useCancelRequest,
  useRemindRequest,
} from '../../../hooks/use-requests';
import { PasskeyPrompt } from '../../../components/ui/PasskeyPrompt';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';
import { useToast, useConfirm } from '../../../components/providers/NotificationProvider';

export default function RequestDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();
  const confirm = useConfirm();

  const params = useParams();
  const id = params?.id as string;
  const { data: request, isLoading, refetch } = useRequestDetails(id);

  const [showPasskey, setShowPasskey] = useState(false);
  const [copied, setCopied] = useState(false);

  const payMutation = usePayRequest();
  const cancelMutation = useCancelRequest();
  const remindMutation = useRemindRequest();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto p-12 flex justify-center">
          <VeriAgentLoader size="md" subtext="Fetching payment request details..." />
        </div>
      </AppLayout>
    );
  }

  if (!request) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto text-center py-12 space-y-4">
          <p className="text-red-400 font-mono">Payment request not found.</p>
          <Link href="/requests" className="text-emerald-500 hover:underline text-sm font-semibold font-mono">
            &larr; Back to requests
          </Link>
        </div>
      </AppLayout>
    );
  }

  const isPending = request.status === 'PENDING';
  const isPaid = request.status === 'PAID';

  const baseUrl = getAppBaseUrl();
  const shareUrl = `${baseUrl}/requests/${request.id}`;
  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Payment request link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePaySuccess = async () => {
    try {
      await payMutation.mutateAsync(request.id);
      setShowPasskey(false);
      toast.success('Payment settled successfully!', {
        title: 'Payment Completed',
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Payment failed', { title: 'Payment Error' });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Link
            href="/requests"
            className={`p-2 rounded-xl border transition ${isDark ? 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950'
              }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Payment Request Details
            </h1>
            <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>ID: {request.id}</p>
          </div>
        </div>

        {/* Card Main Info */}
        <div className={`rounded-2xl border p-6 space-y-6 shadow-xl transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
          }`}>
          <div className={`flex items-center justify-between border-b pb-5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div>
              <p className={`text-xs font-mono uppercase tracking-wider font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Requested Amount</p>
              <p className={`text-3xl font-extrabold font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
                {request.amount} <span className="text-emerald-500">{request.token}</span>
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${isPending
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                : isPaid
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}
            >
              {request.status}
            </span>
          </div>

          {/* Key Details */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className={`p-3.5 rounded-xl border space-y-1 ${isDark ? 'bg-slate-950/60 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className={`font-bold uppercase text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Requested From</span>
              <p className="text-emerald-500 font-bold truncate">
                {request.recipientIdentifier || request.recipientId || 'Any Contact'}
              </p>
            </div>
            <div className={`p-3.5 rounded-xl border space-y-1 ${isDark ? 'bg-slate-950/60 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className={`font-bold uppercase text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Requester</span>
              <p className={`font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{request.requesterId}</p>
            </div>
          </div>

          {request.note && (
            <div className={`p-4 rounded-xl border space-y-1 ${isDark ? 'bg-slate-950/60 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className={`text-xs font-mono font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Note</span>
              <p className={`text-sm italic ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>&quot;{request.note}&quot;</p>
            </div>
          )}

          {/* Share Link */}
          <div className={`p-4 rounded-xl border space-y-2 ${isDark ? 'bg-slate-950/60 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}>
            <span className={`text-xs font-mono font-bold uppercase flex items-center space-x-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <Share2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Share Request Link</span>
            </span>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className={`w-full rounded-lg px-3 py-2 text-xs font-mono font-bold border ${isDark ? 'bg-slate-950 border-white/[0.08] text-emerald-400' : 'bg-white border-slate-300 text-emerald-800'
                  }`}
              />
              <button
                onClick={copyToClipboard}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-mono rounded-lg flex items-center space-x-1 transition shrink-0"
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* On-Chain Transaction Hash */}
          {request.txHash && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-500">On-Chain Transaction Hash</span>
                <p className={`text-xs font-mono truncate max-w-[220px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{request.txHash}</p>
              </div>
              <a
                href={`https://etherscan.io/tx/${request.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Action Buttons */}
          {isPending && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 font-mono">
              <button
                onClick={() => setShowPasskey(true)}
                className="flex-1 py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay Now</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await remindMutation.mutateAsync(request.id);
                    toast.success('Payment reminder sent!');
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to send reminder');
                  }
                }}
                disabled={remindMutation.isPending}
                className={`py-3.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-amber-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-amber-700 hover:bg-slate-200'
                  }`}
              >
                <Bell className="w-4 h-4" />
                <span>{remindMutation.isPending ? 'Sending...' : 'Remind'}</span>
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Cancel Payment Request',
                    message: `Cancel this payment request for ${request.amount} ${request.token}?`,
                    description: 'The recipient will no longer be able to settle this request.',
                    badge: `${request.amount} ${request.token}`,
                    confirmText: 'Cancel Request',
                    cancelText: 'Keep Active',
                    variant: 'danger',
                  });
                  if (ok) {
                    try {
                      await cancelMutation.mutateAsync(request.id);
                      toast.success('Payment request cancelled.');
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to cancel request');
                    }
                  }
                }}
                disabled={cancelMutation.isPending}
                className={`py-3.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-rose-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-rose-600 hover:bg-slate-200'
                  }`}
              >
                <XCircle className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Passkey Payment Modal */}
      {showPasskey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl ${isDark ? 'bg-[#070A11] border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-950'
            }`}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Confirm Payment</h3>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                You are paying <span className="font-bold text-emerald-500">{request.amount} {request.token}</span> to{' '}
                <span className="text-emerald-500 font-semibold">{request.requesterId}</span>
              </p>
            </div>

            <PasskeyPrompt
              onSuccess={handlePaySuccess}
              onCancel={() => setShowPasskey(false)}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
