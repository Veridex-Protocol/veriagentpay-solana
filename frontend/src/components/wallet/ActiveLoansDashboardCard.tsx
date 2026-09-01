'use client';

import React from 'react';
import Link from 'next/link';
import { useMyPoolLoans } from '../../hooks/use-pools';
import { useTheme } from '../providers/ThemeProvider';
import { Zap, Clock, ExternalLink, ArrowRight } from 'lucide-react';

export function ActiveLoansDashboardCard() {
  const { data: myLoans = [], isLoading } = useMyPoolLoans();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (isLoading || !myLoans || myLoans.length === 0) {
    return null;
  }

  // Active loans currently disbursed and awaiting repayment
  const activeLoans = myLoans.filter((l: any) => l.status === 'EXECUTED' || l.status === 'APPROVED');
  const pendingApplications = myLoans.filter((l: any) => l.status === 'PENDING');

  if (activeLoans.length === 0 && pendingApplications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-base font-bold font-mono uppercase tracking-wider flex items-center space-x-2 ${
          isDark ? 'text-white' : 'text-slate-950'
        }`}>
          <Zap className="w-4 h-4 text-[#F2D827]" />
          <span>My Pool Loans & Repayments</span>
        </h3>
        {activeLoans.length > 0 && (
          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20">
            {activeLoans.length} Active {activeLoans.length === 1 ? 'Loan' : 'Loans'}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Active Disbursed Loans */}
        {activeLoans.map((loan: any) => {
          const pool = loan.pool || {};
          const poolName = pool.name || 'Group Pool';
          const token = pool.token || 'USDT';
          const poolId = loan.poolId || pool.id;

          let deadlineText = '';
          let isOverdue = false;
          if (loan.repaymentDeadline) {
            const deadline = new Date(loan.repaymentDeadline);
            const now = new Date();
            const diffMs = deadline.getTime() - now.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
              isOverdue = true;
              deadlineText = `Overdue by ${Math.abs(diffDays)}d`;
            } else if (diffDays === 0) {
              deadlineText = 'Due Today';
            } else {
              deadlineText = `Due in ${diffDays}d (${deadline.toLocaleDateString()})`;
            }
          }

          return (
            <div
              key={loan.id}
              className={`rounded-2xl border p-5 space-y-3 transition shadow-sm ${
                isDark
                  ? 'bg-slate-950/90 border-[#F2D827]/35 text-white'
                  : 'bg-amber-50/70 border-[#F2D827]/30 text-slate-950'
              }`}
            >
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-extrabold text-slate-950 dark:text-white">
                      ${loan.amount} {token}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isOverdue
                        ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                        : 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20'
                    }`}>
                      {isOverdue ? 'Overdue Repayment' : 'Active Loan'}
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Borrowed from pool: <strong className={`font-semibold ${isDark ? 'text-[#F2D827]' : 'text-amber-700'}`}>{poolName}</strong>
                  </p>
                </div>

                <div className="text-right text-xs font-mono">
                  <span className={`font-bold ${isOverdue ? 'text-red-600' : 'text-[#D4A106] dark:text-[#F2D827]'}`}>
                    {deadlineText || 'Active'}
                  </span>
                  <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                    Earn +10 ⭐ Reputation
                  </p>
                </div>
              </div>

              <div className={`pt-3 border-t flex items-center justify-between flex-wrap gap-2 ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="text-xs font-mono">
                  {loan.txHash && (
                    <a
                      href={`https://scan.bohr.life/tx/${loan.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:underline inline-flex items-center space-x-1"
                    >
                      <span>Tx: {loan.txHash.slice(0, 8)}...</span>
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>

                <Link
                  href={`/pools/${poolId}`}
                  className="px-4 py-2 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs inline-flex items-center space-x-1.5 transition shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Repay in {poolName}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}

        {/* Pending Loan Applications */}
        {pendingApplications.map((loan: any) => {
          const pool = loan.pool || {};
          const poolName = pool.name || 'Group Pool';
          const token = pool.token || 'USDT';
          const poolId = loan.poolId || pool.id;

          return (
            <div
              key={loan.id}
              className={`rounded-2xl border p-4 flex items-center justify-between flex-wrap gap-2 shadow-sm ${
                isDark
                  ? 'bg-slate-950/60 border-amber-500/20 text-white'
                  : 'bg-amber-50/60 border-amber-200 text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold">${loan.amount} {token} Application</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Awaiting Approvals
                    </span>
                  </div>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Pool: <strong className="font-semibold">{poolName}</strong> • {loan.durationDays} days duration
                  </p>
                </div>
              </div>

              <Link
                href={`/pools/${poolId}`}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-teal-300 hover:bg-slate-800'
                    : 'bg-white border-slate-200 text-teal-700 hover:bg-slate-50'
                }`}
              >
                View Pool →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
