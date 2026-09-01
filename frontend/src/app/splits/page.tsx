'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Modal } from '../../components/ui/Modal';
import { SplitCard } from '../../components/SplitCard';
import { CreateSplitForm } from '../../components/CreateSplitForm';
import { useSplits } from '../../hooks/useApi';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SplitsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: splitsData, isLoading, refetch } = useSplits();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');

  const splits = Array.isArray(splitsData) ? splitsData : (splitsData?.splits || []);

  const filteredSplits = splits.filter((s: any) => {
    const isCompleted = s.status === 'COMPLETED' || (s.participants && s.participants.every((p: any) => p.paid || p.hasPaid));
    if (activeTab === 'active') return !isCompleted;
    if (activeTab === 'completed') return isCompleted;
    return true;
  });

  const totalCollected = splits.reduce((acc: number, s: any) => acc + (s.amountCollected || 0), 0);
  const activeCount = splits.filter((s: any) => s.status !== 'COMPLETED').length;

  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto relative pb-16">
        {/* Header */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
              <Users className="w-4 h-4" />
              <span>BATCH & SOCIAL PAYMENTS</span>
            </div>
            <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Split Bills
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Split dining, housing, or trip expenses directly in chat. Real-time tracking & 1-click execution.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700 shadow-sm'
              }`}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold font-mono text-xs shadow-md transition-all hover:scale-105 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Split</span>
            </button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono">
          <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Active Splits</span>
            <div className={`text-2xl font-extrabold mt-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>{activeCount}</div>
          </div>
          <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Collected</span>
            <div className="text-2xl font-extrabold text-[#D4A106] dark:text-[#F2D827] mt-1">${totalCollected.toFixed(2)} USDT</div>
          </div>
          <div className={`p-4 rounded-2xl border col-span-2 sm:col-span-1 ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Created</span>
            <div className={`text-2xl font-extrabold mt-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>{splits.length}</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={`flex items-center justify-between border-b pb-3 font-mono text-xs ${
          isDark ? 'border-slate-800/80' : 'border-slate-200'
        }`}>
          <div className="flex gap-2">
            {(['all', 'active', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl font-bold uppercase transition ${
                  activeTab === tab
                    ? 'bg-[#F2D827]/10 border border-[#F2D827]/30 text-[#D4A106] dark:text-[#F2D827]'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {tab} ({tab === 'all' ? splits.length : tab === 'active' ? activeCount : splits.length - activeCount})
              </button>
            ))}
          </div>
        </div>

        {/* Splits List */}
        {isLoading ? (
          <div className="space-y-4">
            <div className={`h-44 rounded-2xl animate-pulse border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
            <div className={`h-44 rounded-2xl animate-pulse border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
          </div>
        ) : filteredSplits.length === 0 ? (
          <div className={`text-center py-16 space-y-4 border border-dashed rounded-3xl ${
            isDark ? 'border-slate-800 bg-slate-950/20' : 'border-slate-300 bg-slate-50'
          }`}>
            <Users className={`w-14 h-14 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
            <div className="space-y-1">
              <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No bill splits found</h3>
              <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Create a split request here or send <code className="font-mono text-[#D4A106] dark:text-[#F2D827]">/split 120 USDT @alice @bob @charlie</code> inside Telegram, WhatsApp, Discord, or Slack.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#F2D827] text-slate-950 hover:bg-[#E5A900] transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Split</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSplits.map((split: any) => (
              <SplitCard key={split.id} split={split} />
            ))}
          </div>
        )}

        {/* Mobile FAB */}
        <motion.button
          onClick={() => setIsModalOpen(true)}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="fixed bottom-20 right-4 z-40 sm:hidden bg-[#F2D827] text-slate-950 shadow-lg shadow-amber-950/30 p-4 rounded-full flex items-center justify-center active:scale-95 font-bold"
          aria-label="Create New Bill Split"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </motion.button>

        {/* Create Split Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Create Group Bill Split"
        >
          <CreateSplitForm
            onSuccess={() => {
              setIsModalOpen(false);
              refetch();
            }}
            onCancel={() => setIsModalOpen(false)}
          />
        </Modal>
      </div>
    </AppLayout>
  );
}
