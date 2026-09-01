'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { useActivityPage } from '../../hooks/useApi';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

type Filter = 'all' | 'sent' | 'received';

export default function ActivityPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');

  const { data, isLoading, isFetching } = useActivityPage(page, 20);
  const activities = data?.activities ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.totalCount ?? 0;

  // Filtering is client-side over the current page only, so the label says
  // "on this page" rather than implying it searched the whole history.
  const visible = filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'sent', label: 'Sent' },
    { id: 'received', label: 'Received' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className={`text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Activity
            </h1>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {totalCount > 0
                ? `${totalCount} transaction${totalCount === 1 ? '' : 's'} across all your linked accounts.`
                : 'Payments, deposits and claims will appear here.'}
            </p>
          </div>

          <div className={`inline-flex gap-1 rounded-xl border p-1 ${isDark ? 'border-white/[0.08] bg-[#070A11]' : 'border-slate-200 bg-white'}`}>
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition ${
                  filter === f.id
                    ? 'bg-yellow-500 text-black'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div
          className={`divide-y overflow-hidden rounded-2xl border transition-colors ${
            isDark
              ? 'divide-white/[0.08] border-white/[0.08] bg-[#070A11]'
              : 'divide-slate-200 border-slate-200 bg-white shadow-sm'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <VeriAgentLoader
                variant="inline"
                text="Syncing on-chain activity"
                speed="fast"
              />
            </div>
          ) : visible.length === 0 ? (
            <div className={`space-y-2 p-12 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <div className="text-2xl">📭</div>
              <div className="font-mono text-xs">
                {activities.length === 0
                  ? 'No transactions yet. Send or receive crypto to see activity here.'
                  : `No ${filter} transactions on this page.`}
              </div>
            </div>
          ) : (
            visible.map((act) => (
              <div key={act.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      act.type === 'sent'
                        ? 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {act.type === 'sent' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`truncate text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                      {act.activity}
                    </div>
                    <div className={`flex items-center gap-1.5 font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span className="truncate">{act.recipient}</span>
                      <span>•</span>
                      <span className="shrink-0">{act.time}</span>
                      {act.external && (
                        <span className="flex shrink-0 items-center gap-0.5 text-amber-500">
                          <Globe className="h-2.5 w-2.5" /> external
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 space-y-0.5 text-right font-mono">
                  <div className={`text-xs font-bold ${act.type === 'sent' ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {act.amount}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-500">{act.status}</span>
                    {act.explorerUrl && (
                      <a
                        href={act.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View on explorer"
                        className={`transition ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                isDark
                  ? 'border-white/[0.08] bg-[#070A11] text-slate-300 hover:bg-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            <span className={`font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                isDark
                  ? 'border-white/[0.08] bg-[#070A11] text-slate-300 hover:bg-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
