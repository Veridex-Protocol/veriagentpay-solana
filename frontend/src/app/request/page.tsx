'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import {
  ArrowDownCircle,
  Copy,
  CheckCircle2,
  Check,
  Bot,
  Sparkles,
} from 'lucide-react';
import { useCreateRequest } from '../../hooks/use-requests';
import { api } from '../../lib/api';
import { RankedContactPicker } from '../../components/ui/RankedContactPicker';
import { useToast } from '../../components/providers/NotificationProvider';

const isSupportedToken = (value: string | null): value is 'USDC' | 'USDT' | 'BOT' =>
  value === 'USDC' || value === 'USDT' || value === 'BOT';

export default function RequestMoneyPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();

  const [recipient, setRecipient] = useState('');
  const [token, setToken] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [naturalPrompt, setNaturalPrompt] = useState('');
  const [createdRequest, setCreatedRequest] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateRequest();

  const handleParseNaturalPrompt = async () => {
    if (!naturalPrompt) return;

    try {
      const res = await (api as any).parseIntent(naturalPrompt);
      if (res?.params) {
        if (res.params.amount) setAmount(String(res.params.amount));
        if (res.params.token && isSupportedToken(res.params.token.toUpperCase())) {
          setToken(res.params.token.toUpperCase() as any);
        }
        if (res.params.recipient) setRecipient(res.params.recipient);
        if (res.params.note) setNote(res.params.note);
        toast.success('Prompt parsed by AI agent!');
      }
    } catch {
      // Enhanced natural language parser supporting 0x EVM addresses, handles, phone numbers
      // Supports patterns like:
      // - "request 50 USDT from 0x123..."
      // - "ask @alice for 100 USDC"
      // - "request 20 from +1234567890"

      // First, extract wallet address (highest priority for recipient)
      const walletMatch = naturalPrompt.match(/0x[a-fA-F0-9]{40}/);
      if (walletMatch) {
        setRecipient(walletMatch[0]);
      }

      // Extract amount and token
      const amountTokenRegex = /(?:request|ask)\s+(?:(?:\$|€|£)?(\d+(?:\.\d+)?)\s*([A-Za-z]+)?|([A-Za-z]+)?\s*(?:\$|€|£)?(\d+(?:\.\d+)?))/i;
      const amountTokenMatch = naturalPrompt.match(amountTokenRegex);

      if (amountTokenMatch) {
        const amount = amountTokenMatch[1] || amountTokenMatch[4];
        const token = amountTokenMatch[2] || amountTokenMatch[3];

        if (amount) setAmount(amount);
        if (token && isSupportedToken(token.toUpperCase())) {
          setToken(token.toUpperCase() as any);
        }
      } else {
        // Fallback: try to extract just amount and token
        const simpleMatch = naturalPrompt.match(/(?:\$|€|£)?(\d+(?:\.\d+)?)\s*(USDC|USDT|BOT)?/i);
        if (simpleMatch) {
          if (simpleMatch[1]) setAmount(simpleMatch[1]);
          if (simpleMatch[2] && isSupportedToken(simpleMatch[2].toUpperCase())) {
            setToken(simpleMatch[2].toUpperCase() as any);
          }
        }
      }

      // Extract recipient if not already set (for @handle or phone number)
      if (!walletMatch) {
        const recipientRegex = /(?:from)\s+(0x[a-fA-F0-9]{40}|@[\w\.]+|\+?\d[\d\s\-\(\)]{7,})/i;
        const recipientMatch = naturalPrompt.match(recipientRegex);

        if (recipientMatch) {
          setRecipient(recipientMatch[1].trim());
        } else {
          // Try without "from" prefix
          const handleMatch = naturalPrompt.match(/@[\w\.]+/);
          const phoneMatch = naturalPrompt.match(/\+?\d{10,15}/);
          if (handleMatch) setRecipient(handleMatch[0]);
          else if (phoneMatch) setRecipient(phoneMatch[0]);
        }
      }
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
      }
    } catch (err: any) {
      console.error('Failed to create request:', err);
      toast.error(err.message || 'Failed to create payment request', {
        title: 'Request Error',
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
    toast.success('Payment request link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
            <ArrowDownCircle className="w-4 h-4" />
            <span>PAYMENT LINKS</span>
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Request Money
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Create a payment link or send a direct request to any Telegram, WhatsApp, or Discord handle.
          </p>
        </div>

        {/* Agent Command Bar (AI Request Assistant) */}
        <div
          className={`rounded-2xl border p-4 space-y-2 transition-colors ${isDark
            ? 'bg-slate-950 border-white/[0.08]'
            : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}
        >
          <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] font-bold">
            <Bot className="w-4 h-4" />
            <span>AI Request Assistant</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder='Type naturally, e.g. "Request 50 USDT from @alice" or "request 100 from 0x123..."'
              value={naturalPrompt}
              onChange={(e) => setNaturalPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleParseNaturalPrompt()}
              className={`flex-1 p-2.5 rounded-xl border font-mono text-xs ${isDark ? 'bg-slate-950 border-white/[0.08] text-white' : 'bg-slate-100 border-slate-300 text-slate-950'
                }`}
            />
            <button
              onClick={handleParseNaturalPrompt}
              className="px-4 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Parse Command</span>
            </button>
          </div>
        </div>

        {/* Request Form Container */}
        {!createdRequest ? (
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
                Request From (@username, Phone, or 0x Address)
              </label>
              <RankedContactPicker
                value={recipient}
                onChange={(value) => setRecipient(value)}
                placeholder="@username, phone, or wallet address"
                accentColor="yellow"
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
                    ? 'bg-slate-950 border-white/[0.08] text-white focus:border-[#F2D827]'
                    : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-[#F2D827]'
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
                    ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]'
                    : 'bg-slate-50 border-slate-300 text-slate-950'
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
                  ? 'bg-slate-950 border-white/[0.08] text-white focus:border-[#F2D827]'
                  : 'bg-slate-50 border-slate-300 text-slate-950 focus:border-[#F2D827]'
                  }`}
              />
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 shadow-amber-950/20"
            >
              <ArrowDownCircle className="w-4 h-4" />
              <span>Generate Payment Request</span>
            </button>
          </form>
        ) : (
          /* Request Created Card */
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
        )}
      </div>
    </AppLayout>
  );
}
