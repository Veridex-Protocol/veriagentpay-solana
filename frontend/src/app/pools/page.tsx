'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { CreatePoolSheet } from '../../components/pools/CreatePoolSheet';
import { SharePoolSheet } from '../../components/pools/SharePoolSheet';
import { Users, Plus, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePools } from '../../hooks/use-pools';
import { ActiveLoansDashboardCard } from '../../components/wallet/ActiveLoansDashboardCard';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';
import Link from 'next/link';

export default function PoolsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdPoolData, setCreatedPoolData] = useState<{ id: string; name: string; inviteLink: string } | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { data: pools = [], isLoading } = usePools();

  const handlePoolCreated = (poolData: { id: string; name: string; inviteLink: string }) => {
    setIsCreateOpen(false);
    setCreatedPoolData(poolData);
    setIsShareOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-8 relative pb-12">
        {/* Desktop/Tablet Header Title & CTA Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
              <Users className="w-4 h-4" />
              <span>COMMUNITY LENDING</span>
            </div>
            <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Group Pools
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Form micro-lending circles with trusted friends. Borrow interest-free or pool funds to earn yield together.
            </p>
          </div>

          {/* Desktop/Tablet Header CTA */}
          <button
            onClick={() => setIsCreateOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold font-mono text-xs shadow-md transition-all hover:scale-105 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950"
          >
            <Plus className="w-4 h-4" />
            <span>Create Pool</span>
          </button>
        </div>

        {/* User's Outstanding Loans & Repayments Alert */}
        <ActiveLoansDashboardCard />

        {/* Pools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            <div className="col-span-full py-8">
              <VeriAgentLoader
                variant="card"
                size="md"
                text="Loading Community Pools"
                subtext="Connecting to smart lending vaults..."
                showProgress={true}
              />
            </div>
          ) : pools.length === 0 ? (
            <div className="col-span-full text-center py-16 space-y-4">
              <Users className={`w-16 h-16 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
              <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No lending pools yet. Create the first one to start building community credit.
              </p>
            </div>
          ) : (
            pools.map((pool: any) => {
              // The pools endpoint returns the canonical persisted relations. Derive the
              // summary from them instead of relying on list-only placeholder fields.
              const members = Array.isArray(pool.members) ? pool.members : [];
              const loans = Array.isArray(pool.loans) ? pool.loans : [];
              const poolBalance = Number(pool.poolBalance ?? 0);
              const averageReputation = members.length > 0
                ? Math.round(members.reduce((total: number, member: any) => total + Number(member.reputationPoints ?? 0), 0) / members.length)
                : 0;
              // Only an executed loan has left the pool and remains outstanding. Pending
              // and approved applications are shown in the pool detail workflow instead.
              const activeLoanCount = loans.filter((loan: any) => loan.status === 'EXECUTED').length;

              return (
                <Link
                  key={pool.id}
                  href={`/pools/${pool.id}`}
                  className={`rounded-2xl border p-6 space-y-4 text-left transition-colors ${isDark
                      ? 'bg-[#070A11] border-white/[0.08] hover:border-[#F2D827]/30'
                      : 'bg-white border-slate-200 shadow-sm hover:border-[#F2D827]/40'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#F2D827]" />
                      <span className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{pool.name}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#D4A106] dark:text-[#F2D827] bg-[#F2D827]/10 px-2.5 py-1 rounded-lg border border-[#F2D827]/20">
                      Interest-free
                    </span>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Total Pool Balance:</span>
                      <span className="font-bold text-[#D4A106] dark:text-[#F2D827]">${poolBalance.toFixed(2)} {pool.token || 'USDT'}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Avg Credit Score:</span>
                      <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">{averageReputation}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Active Members:</span>
                      <span className={isDark ? 'text-white' : 'text-slate-950'}>{members.length}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Active Loans:</span>
                      <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{activeLoanCount}</span>
                    </div>
                  </div>

                  <div
                    className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition hover:scale-[1.01] bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 shadow-lg shadow-amber-950/10"
                  >
                    <span>View Pool Details</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Mobile Floating Action Button (FAB) - Elevated at bottom-20 right-4 */}
        <motion.button
          onClick={() => setIsCreateOpen(true)}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="fixed bottom-20 right-4 z-40 sm:hidden bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 p-4 rounded-full flex items-center justify-center active:scale-95"
          aria-label="Create New Pool"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </motion.button>

        {/* Create Pool Bottom Sheet Modal */}
        <CreatePoolSheet
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={handlePoolCreated}
        />

        {/* Post-Creation Share Sheet Modal */}
        <SharePoolSheet
          isOpen={isShareOpen}
          poolData={createdPoolData}
          onClose={() => setIsShareOpen(false)}
        />
      </div>
    </AppLayout>
  );
}
