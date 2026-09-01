'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../providers/ThemeProvider';
import { CheckCircle2, Copy, Check, MessageCircle, Phone, Share2, ArrowRight } from 'lucide-react';
import { appUrl } from '../../lib/app-url';

interface SharePoolSheetProps {
  isOpen: boolean;
  poolData: { id: string; name: string; inviteLink: string } | null;
  onClose: () => void;
}

export const SharePoolSheet: React.FC<SharePoolSheetProps> = ({ isOpen, poolData, onClose }) => {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  if (!poolData) return null;

  const inviteLink = poolData.inviteLink || appUrl(`/pools/${poolData.id}?join=1`);
  const shareText = `Join my group lending pool "${poolData.name}" on VeriAgent Pay! Earn yield together: ${inviteLink}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTelegramShare = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(`Join my group lending pool "${poolData.name}" on VeriAgent Pay!`)}`, '_blank');
  };

  const handleWhatsAppShare = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Group Pool: ${poolData.name}`,
          text: shareText,
          url: inviteLink,
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleNavigateToPool = () => {
    onClose();
    router.push(`/pools/${poolData.id}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl z-50 text-center border transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08] text-slate-100' : 'bg-white border-slate-200 text-slate-950 shadow-slate-200/60'
              }`}
          >
            {/* Header Success Badge */}
            <div className="w-14 h-14 rounded-full bg-[#F2D827]/10 border border-[#F2D827]/20 text-[#F2D827] flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Group Pool Ready!
              </h3>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                &quot;{poolData.name}&quot; is active on BOTChain L1
              </p>
            </div>

            {/* Invite Deep Link Card */}
            <div className={`p-3.5 rounded-2xl border space-y-2 text-left font-mono ${isDark ? 'bg-slate-950/90 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Shareable Pool Invite Deep-Link
              </span>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className={`flex-1 p-2 rounded-lg border text-xs font-mono font-bold ${isDark ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]' : 'bg-white border-slate-300 text-slate-950'
                    }`}
                />
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded-lg bg-[#F2D827] text-slate-950 font-bold hover:bg-[#E5A900] transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Social Share Cluster */}
            <div className="space-y-2 text-left">
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                1-Tap Social Dispatch
              </span>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <button
                  onClick={handleTelegramShare}
                  className="p-2.5 rounded-xl bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] font-bold flex items-center justify-center gap-1.5 hover:bg-[#229ED9]/20 transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Telegram</span>
                </button>

                <button
                  onClick={handleWhatsAppShare}
                  className="p-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold flex items-center justify-center gap-1.5 hover:bg-[#25D366]/20 transition"
                >
                  <Phone className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={handleNativeShare}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  <Share2 className="w-4 h-4" />
                  <span>More</span>
                </button>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={handleNavigateToPool}
              className="w-full py-3.5 rounded-xl font-bold font-mono text-xs flex items-center justify-center gap-2 transition bg-[#F2D827] text-slate-950 hover:bg-[#E5A900]"
            >
              <span>View Pool Details</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
