'use client';

import React, { useState } from 'react';
import { MessageCircle, Phone, MessageSquare, Hash, Copy, Check, Share2 } from 'lucide-react';
import { useTheme } from './providers/ThemeProvider';

export interface ShareLinkProps {
  referralCode: string;
  referralUrl: string;
}

export const ShareLink: React.FC<ShareLinkProps> = ({ referralCode, referralUrl }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const isReady = Boolean(referralUrl);
  const shareText = `Join VeriAgent Pay using my referral link and start earning! ${referralUrl}`;

  const handleCopy = (text: string, actionKey: string) => {
    if (!isReady) return;
    navigator.clipboard.writeText(text);
    setCopiedAction(actionKey);
    setTimeout(() => setCopiedAction(null), 2000);
  };

  const handleTelegramShare = () => {
    if (!isReady) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent('Join VeriAgent Pay using my referral link and start earning!')}`;
    window.open(url, '_blank');
  };

  const handleWhatsAppShare = () => {
    if (!isReady) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 space-y-6 shadow-xl transition-colors duration-200 ${isDark
        ? 'bg-[#070A11]/80 border-white/[0.08]'
        : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
        }`}
    >
      <div className="space-y-2 border-b pb-4 border-slate-800">
        <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
          <Share2 className="w-5 h-5 text-[#F2D827]" /> Share your referral code
        </h3>
        <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Spread the word across your favorite chat networks and earn VERI tokens for active deposits.
        </p>
      </div>

      {/* COPYABLE CODE + URL */}
      <div className="space-y-2">
        <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Your Unique Referral Code & URL
        </label>

        {/* The code itself, identical to the one on your share card. */}
        <div className="flex gap-2">
          <div
            className={`flex-1 p-3 rounded-xl border font-mono text-sm font-extrabold tracking-wider ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]'
              : 'bg-slate-100 border-slate-300 text-slate-950'
              }`}
          >
            {referralCode || (
              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Generating your code…</span>
            )}
          </div>
          <button
            type="button"
            disabled={!referralCode}
            onClick={() => handleCopy(referralCode, 'code')}
            className={`px-4 py-3 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-slate-200 hover:bg-slate-800'
              : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
          >
            {copiedAction === 'code' ? (
              <span className="flex items-center gap-1 text-[#F2D827]">
                <Check className="w-4 h-4" /> Copied!
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Copy className="w-4 h-4" /> Copy Code
              </span>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={referralUrl}
            placeholder="Generating your invite link…"
            className={`flex-1 p-3 rounded-xl border font-mono text-xs ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-[#F2D827]'
              : 'bg-slate-100 border-slate-300 text-slate-950 font-bold'
              }`}
          />
          <button
            type="button"
            disabled={!isReady}
            onClick={() => handleCopy(referralUrl, 'url')}
            className={`px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-[#F2D827] text-slate-950 hover:bg-[#E5A900]' : 'bg-[#F2D827] text-slate-950 hover:bg-[#E5A900]'
              }`}
          >
            {copiedAction === 'url' ? (
              <span className="flex items-center gap-1">
                <Check className="w-4 h-4" /> Copied!
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Copy className="w-4 h-4" /> Copy Link
              </span>
            )}
          </button>
        </div>
      </div>

      {/* MULTI-PLATFORM SHARE BUTTONS */}
      <div className="space-y-2 pt-2">
        <label className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          One-Tap Social Sharing
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* Telegram */}
          <button
            onClick={handleTelegramShare}
            disabled={!isReady}
            className="p-3 rounded-xl bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] font-bold font-mono text-xs flex items-center justify-center gap-2 hover:bg-[#229ED9]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Telegram</span>
          </button>

          {/* WhatsApp */}
          <button
            onClick={handleWhatsAppShare}
            disabled={!isReady}
            className="p-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold font-mono text-xs flex items-center justify-center gap-2 hover:bg-[#25D366]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
            <span>WhatsApp</span>
          </button>

          {/* Discord */}
          <button
            onClick={() => handleCopy(shareText, 'discord')}
            disabled={!isReady}
            className="p-3 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/30 text-[#5865F2] font-bold font-mono text-xs flex items-center justify-center gap-2 hover:bg-[#5865F2]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{copiedAction === 'discord' ? 'Copied!' : 'Discord'}</span>
          </button>

          {/* Slack */}
          <button
            onClick={() => handleCopy(shareText, 'slack')}
            disabled={!isReady}
            className="p-3 rounded-xl bg-[#E01E5A]/10 border border-[#E01E5A]/30 text-[#E01E5A] font-bold font-mono text-xs flex items-center justify-center gap-2 hover:bg-[#E01E5A]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Hash className="w-4 h-4" />
            <span>{copiedAction === 'slack' ? 'Copied!' : 'Slack'}</span>
          </button>

          {/* Direct Copy */}
          <button
            onClick={() => handleCopy(referralUrl, 'direct')}
            disabled={!isReady}
            className={`p-3 rounded-xl border font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all col-span-2 sm:col-span-1 disabled:opacity-50 disabled:cursor-not-allowed ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-slate-200 hover:bg-slate-800'
              : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
          >
            {copiedAction === 'direct' ? (
              <span className="text-[#F2D827] flex items-center gap-1">
                <Check className="w-4 h-4" /> Copied
              </span>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy URL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
