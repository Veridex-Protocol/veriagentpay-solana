'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, ArrowRight, Menu, X, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LandingHeaderProps {
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export function LandingHeader({ theme = 'dark', onToggleTheme }: LandingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <div
        className={`flex items-center justify-between backdrop-blur-xl border rounded-full px-6 py-3 shadow-2xl transition-colors duration-200 ${isDark
          ? 'bg-[#070A11]/80 border-white/[0.08]'
          : 'bg-white/90 border-slate-200 shadow-slate-200/50'
          }`}
      >
        {/* Brand Emblem */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-6 w-6 md:h-9 md:w-9 items-center justify-center rounded-xl bg-yellow-500 text-black font-extrabold text-sm md:text-lg shadow-md shadow-yellow-500/20 transition-transform group-hover:scale-105">
            V
          </div>
          <div className="flex flex-col">
            <span className={`font-extrabold text-sm md:text-base tracking-tight flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              VeriAgent <span className={isDark ? 'text-yellow-400 font-bold' : 'text-amber-700 font-bold'}>Pay</span>
            </span>
            <div className={`flex items-center gap-1.5 text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              </div>
              <span>Mainnet Active • BOTChain & Stellar</span>
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav aria-label="Main Navigation" className={`hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          <a href="#how-it-works" className="hover:text-yellow-400 transition-colors">How It Works</a>
          <a href="#features" className="hover:text-yellow-400 transition-colors">Features</a>
          <a href="#yield" className="hover:text-yellow-400 transition-colors">Yield Vaults</a>
          <a href="#ecosystem" className="hover:text-yellow-400 transition-colors">Ecosystem</a>
        </nav>

        {/* Actions & Theme Toggle */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Theme Toggle Button */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label="Toggle theme mode"
              className={`p-2 rounded-xl border transition-colors ${isDark
                ? 'bg-slate-950 border-white/[0.08] text-amber-400 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
            >
              <motion.div
                key={theme}
                initial={{ scale: 0.8, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.15 }}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </motion.div>
            </button>
          )}

          <a
            href="https://t.me/VeriAgentPayBot"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors ${isDark
              ? 'bg-slate-950 hover:bg-slate-800 border-white/[0.08] text-slate-200'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-yellow-400" />
            <span>Telegram Bot</span>
          </a>

          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all hover:scale-105 ${isDark
              ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
              : 'bg-yellow-500 hover:bg-yellow-400 text-black'
              }`}
          >
            <span>Launch App, It’s Free</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Controls */}
        <div className="flex items-center gap-2 sm:hidden">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label="Toggle theme mode"
              className={`p-1.5 rounded-lg ${isDark ? 'text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'}`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className={`p-1.5 ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-slate-950'}`}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`sm:hidden backdrop-blur-xl border rounded-2xl mt-2 p-5 space-y-4 shadow-2xl ${isDark
              ? 'bg-[#070A11]/95 border-white/[0.08]'
              : 'bg-white/95 border-slate-200 text-slate-950'
              }`}
          >
            <nav aria-label="Mobile Navigation" className={`flex flex-col space-y-3 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#F2D827]">How It Works</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#F2D827]">Features</a>
              <a href="#yield" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#F2D827]">Yield Vaults</a>
              <a href="#ecosystem" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#F2D827]">Ecosystem</a>
            </nav>
            <div className="pt-2 flex flex-col gap-2">
              <a
                href="https://t.me/VeriAgentPayBot"
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-2.5 text-center rounded-xl border text-xs font-semibold ${isDark ? 'bg-slate-950 border-white/[0.08] text-white' : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
              >
                Open Telegram Bot
              </a>
              <Link
                href="/dashboard"
                className="w-full py-2.5 text-center rounded-xl font-bold text-xs bg-[#F2D827] text-slate-950 hover:bg-[#E5A900] transition"
              >
                Launch App, It’s Free
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

