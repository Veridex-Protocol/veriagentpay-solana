'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { AddContactModal } from '../../components/AddContactModal';
import { Users, Search, Send, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useContacts } from '../../hooks/use-contacts';
import Link from 'next/link';

export default function ContactsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { data: contacts = [], isLoading } = useContacts();

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.identifier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-8 relative pb-12">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
              <Users className="w-4 h-4" />
              <span>ADDRESS BOOK</span>
            </div>
            <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Contacts & Handles
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Save handles and phone numbers for 1-tap payments across Telegram, WhatsApp, and Discord.
            </p>
          </div>

          {/* Desktop/Tablet Header CTA */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="hidden sm:inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold font-mono text-xs shadow-md transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search name, @handle, or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-mono text-xs ${isDark ? 'bg-slate-950 border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-950 shadow-sm'
              }`}
          />
        </div>

        {/* Contacts Directory List */}
        <div className={`rounded-2xl border divide-y overflow-hidden transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08] divide-white/[0.08]' : 'bg-white border-slate-200 divide-slate-200 shadow-sm'
          }`}>
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 bg-slate-950/40 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users className={`w-12 h-12 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
              <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {searchQuery ? 'No contacts match your search.' : 'No contacts saved yet. Add your first contact to get started.'}
              </p>
            </div>
          ) : (
            filteredContacts.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F2D827] text-slate-950 font-bold flex items-center justify-center text-xs font-mono">
                    {c.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{c.name}</div>
                    <div className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {c.identifier} • {c.platform}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block font-mono">
                    <div className="text-[10px] text-[#D4A106] dark:text-[#F2D827] font-bold">{c.walletAddress ? 'Resolved' : 'Pending'}</div>
                    {c.walletAddress && (
                      <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {c.walletAddress.slice(0, 6)}...{c.walletAddress.slice(-4)}
                      </div>
                    )}
                  </div>

                  <Link href={`/send?to=${c.identifier}`}>
                    <button className="p-2 rounded-lg bg-[#F2D827]/10 hover:bg-[#F2D827]/20 text-[#F2D827] border border-[#F2D827]/20 transition">
                      <Send className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Mobile Floating Action Button (FAB) - Elevated at bottom-20 right-4 */}
        <motion.button
          onClick={() => setIsAddModalOpen(true)}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="fixed bottom-20 right-4 z-40 sm:hidden bg-[#F2D827] text-slate-950 shadow-lg shadow-amber-950/30 p-4 rounded-full flex items-center justify-center active:scale-95 font-bold"
          aria-label="Add New Handle"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </motion.button>

        {/* Add Contact Modal */}
        <AddContactModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />
      </div>
    </AppLayout>
  );
}
