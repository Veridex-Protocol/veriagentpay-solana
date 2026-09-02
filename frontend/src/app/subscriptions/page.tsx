'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PasskeyPrompt } from '../../components/ui/PasskeyPrompt';
import { useSubscriptions, useCreateSubscription, useDeleteSubscription } from '../../hooks/useApi';
import { Repeat, Plus, Trash2, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SubscriptionsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: subsData, isLoading } = useSubscriptions();
  const createSubMutation = useCreateSubscription();
  const deleteSubMutation = useDeleteSubscription();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'Weekly' | 'Monthly'>('Monthly');
  const [isPasskeyOpen, setIsPasskeyOpen] = useState(false);

  const subscriptions = subsData || [];

  const handleCreateSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    setIsPasskeyOpen(true);
  };

  const handlePasskeySuccess = async (_signature: string) => {
    setIsPasskeyOpen(false);
    try {
      await createSubMutation.mutateAsync({
        to: recipient,
        token: 'USDC',
        amount: parseFloat(amount) || 10,
        frequency,
      });
      setIsModalOpen(false);
      setRecipient('');
      setAmount('');
    } catch (err) {
      console.error('Create subscription failed:', err);
    }
  };

  const handleCancelSub = async (id: string) => {
    try {
      await deleteSubMutation.mutateAsync(id);
    } catch (err) {
      console.error('Cancel subscription failed:', err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto relative pb-12">
        {/* Header */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
              <Repeat className="w-4 h-4" />
              <span>RECURRING PAYMENTS</span>
            </div>
            <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Auto-Pay Subscriptions
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Manage automated recurring payments authorized once with your fingerprint.
            </p>
          </div>

          {/* Desktop/Tablet Header CTA */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold font-mono text-xs shadow-md transition-all hover:scale-105 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950"
          >
            <Plus className="w-4 h-4" />
            <span>New Subscription</span>
          </button>
        </div>

        {/* Subscriptions Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className={`h-40 rounded-2xl animate-pulse border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Repeat className={`w-16 h-16 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
            <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              No active subscriptions. Create your first recurring payment to automate bills!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subscriptions.map((sub: any) => (
              <div
                key={sub.id}
                className={`rounded-2xl border p-5 space-y-4 transition-colors ${
                  isDark ? 'bg-[#070A11] border-white/[0.08] text-white' : 'bg-white border-slate-200 shadow-sm text-slate-950'
                }`}
              >
                <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] font-bold flex items-center justify-center text-xs">
                      {(sub.recipient || sub.to || '@')[1]?.toUpperCase() || 'S'}
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{sub.recipient || sub.to}</h4>
                      <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{sub.frequency} debit</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#D4A106] dark:text-[#F2D827] bg-[#F2D827]/10 border border-[#F2D827]/30 px-2.5 py-1 rounded-full">
                    {sub.status || 'Active'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm font-mono">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Amount per billing:</span>
                  <span className="font-extrabold text-[#D4A106] dark:text-[#F2D827]">
                    ${(sub.amount ?? 0).toFixed(2)} {sub.token || 'USDC'}
                  </span>
                </div>

                <div className={`flex items-center justify-between text-xs font-mono pt-2 border-t ${
                  isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
                }`}>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#F2D827]" /> Next: {sub.nextPayment ? new Date(sub.nextPayment).toLocaleDateString() : 'Pending'}
                  </span>
                  <button
                    onClick={() => handleCancelSub(sub.id)}
                    className="text-rose-500 hover:text-rose-400 font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mobile Floating Action Button (FAB) */}
        <motion.button
          onClick={() => setIsModalOpen(true)}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="fixed bottom-20 right-4 z-40 sm:hidden bg-[#F2D827] text-slate-950 shadow-lg shadow-amber-950/30 p-4 rounded-full flex items-center justify-center active:scale-95 font-bold"
          aria-label="Create Subscription"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </motion.button>

        {/* Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Create Recurring Subscription"
        >
          <form onSubmit={handleCreateSub} className="space-y-4">
            <Input
              label="Recipient Handle / Contract"
              placeholder="@streaming_bot"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />

            <Input
              label="Billing Amount (USDT)"
              type="number"
              placeholder="10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="space-y-2">
              <label className={`text-xs font-semibold uppercase tracking-wider ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>Frequency</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Weekly', 'Monthly'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                      frequency === f
                        ? 'bg-[#F2D827] text-slate-950 border-[#F2D827] shadow-sm'
                        : isDark
                          ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2 font-mono">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={`flex-1 py-3 rounded-xl text-xs font-bold transition border ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!recipient || !amount}
                className="flex-1 py-3 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 text-xs font-bold transition shadow-md disabled:opacity-50"
              >
                Authorize Passkey
              </button>
            </div>
          </form>
        </Modal>

        <PasskeyPrompt
          isOpen={isPasskeyOpen}
          onClose={() => setIsPasskeyOpen(false)}
          amount={`$${amount} / ${frequency}`}
          recipient={recipient}
          onSuccess={handlePasskeySuccess}
        />
      </div>
    </AppLayout>
  );
}
