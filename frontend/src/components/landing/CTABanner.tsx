'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowRight, QrCode, X } from 'lucide-react';

interface CTABannerProps {
  theme?: 'dark' | 'light';
}

export function CTABanner({ theme = 'dark' }: CTABannerProps) {
  const [showQRModal, setShowQRModal] = useState(false);
  const isDark = theme === 'dark';

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative w-full">
      <div
        className={`rounded-2xl border p-8 sm:p-14 text-center space-y-6 shadow-2xl relative overflow-hidden transition-colors duration-200 ${isDark
          ? 'bg-[#070A11] border-white/[0.08]'
          : 'bg-white border-slate-200 shadow-slate-200/60 text-slate-950'
          }`}
      >
        <h2 className={`text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
          Ready to Execute Gasless Social Payments?
        </h2>

        <p className={`text-base max-w-xl mx-auto font-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          Join over 250,000 active users executing instant passkey transfers and earning verified yield inside Telegram, WhatsApp, Discord, and Slack.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/auth"
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-[1.02] ${isDark
              ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
              : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
              }`}
          >
            <span>Start in 30 Seconds</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <button
            onClick={() => setShowQRModal(true)}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl border font-semibold text-sm transition ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-slate-200 hover:bg-slate-800'
              : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200 shadow-sm'
              }`}
          >
            <QrCode className="w-4 h-4 text-yellow-500" />
            <span>Scan Telegram QR Code</span>
          </button>
        </div>
      </div>

      {/* Telegram QR Code Modal */}
      <AnimatePresence>
        {showQRModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`border rounded-2xl p-6 max-w-sm w-full text-center space-y-5 shadow-2xl relative ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 text-slate-950'
                }`}
            >
              <button
                onClick={() => setShowQRModal(false)}
                className={`absolute top-4 right-4 p-1 rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Scan to Connect Mobile Telegram</h3>
                <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>@VeriAgentPayBot</p>
              </div>

              {/* QR Code Container */}
              <div className="w-44 h-44 bg-white p-3 rounded-xl mx-auto flex items-center justify-center shadow-inner border border-slate-200">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://t.me/VeriAgentPayBot"
                  alt="Telegram Bot QR Code"
                  className="w-full h-full object-contain"
                />
              </div>

              <a
                href="https://t.me/VeriAgentPayBot"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-[#F2D827] text-slate-950 hover:bg-[#E5A900] transition font-mono"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Launch @VeriAgentPayBot</span>
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
