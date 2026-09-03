'use client';

import React, { useRef } from 'react';
import {
  Share2,
  Send,
  Phone,
  Download,
  Award,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useShareCardPayload } from '../hooks/use-badges';
import { useTheme } from './providers/ThemeProvider';
import { QRCodeSVG } from 'qrcode.react';

export interface ShareCardPreviewProps {
  cardData?: any;
  selectedBadge?: any;
}

export const ShareCardPreview: React.FC<ShareCardPreviewProps> = ({ cardData: externalData, selectedBadge }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: fetchedData, isLoading, isError } = useShareCardPayload();
  const cardData = externalData || fetchedData;
  const cardRef = useRef<HTMLDivElement>(null);

  const displayName = cardData?.displayName || null;
  const rank = cardData?.globalRank ?? null;
  const badgeTitle = selectedBadge?.name || cardData?.badgeTitle || (cardData?.unlockedBadges?.[0]?.name) || 'Launch Day Supporter 🛡️';
  const totalReferred = cardData?.totalReferred ?? 0;
  const reputationPoints = cardData?.reputationPoints ?? 0;
  const inviteCode = cardData?.inviteCode || null;
  const inviteUrl = cardData?.inviteUrl || null;
  const shareText = cardData?.shareText || (inviteUrl ? `Join me on VeriAgent Pay. ${inviteUrl}` : null);

  if (isLoading && !externalData) {
    return <div className={`h-[30rem] w-full max-w-md mx-auto rounded-3xl border animate-pulse ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`} />;
  }

  if ((isError || !cardData) && !externalData) {
    return (
      <div className={`rounded-3xl border p-6 text-center text-sm ${isDark ? 'bg-[#070A11] border-white/[0.08] text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
        Your verified share card is unavailable until your account session is restored.
      </div>
    );
  }

  const qrCodeImgUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(inviteUrl)}&color=10b981&bgcolor=${isDark ? '0f172a' : 'ffffff'}`
    : null;

  const handleTwitterShare = () => {
    if (!inviteUrl) return;
    const tweetText = `Proud to be ranked #${rank} on @VeriAgentPay with ${reputationPoints} Reputation Points! 🛡️ Claim gasless payments and yield: ${inviteUrl}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
  };

  const handleTelegramShare = () => {
    if (!inviteUrl) return;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(`Join me on VeriAgent Pay! Ranked #${rank} 🛡️`)}`, '_blank');
  };

  const handleWhatsAppShare = () => {
    if (!shareText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const handleDownloadCard = () => {
    if (!inviteUrl || !qrCodeImgUrl || !displayName) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fitText = (text: string, maxWidth: number, maxSize: number, minSize = 24) => {
      let size = maxSize;
      while (size > minSize) {
        ctx.font = `bold ${size}px sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) return { text, size };
        size -= 2;
      }
      ctx.font = `bold ${minSize}px sans-serif`;
      let fitted = text;
      while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) {
        fitted = fitted.slice(0, -1);
      }
      return { text: `${fitted}…`, size: minSize };
    };

    const drawRoundedPanel = (x: number, y: number, width: number, height: number) => {
      ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
      ctx.strokeStyle = isDark ? '#334155' : '#dbe3ee';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 28);
      ctx.fill();
      ctx.stroke();
    };

    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 1200);
    bgGrad.addColorStop(0, isDark ? '#0b0f19' : '#ffffff');
    bgGrad.addColorStop(1, isDark ? '#070a11' : '#f8fafc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 1200);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 6;
    ctx.roundRect(60, 60, 1080, 1080, 40);
    ctx.stroke();

    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.fillText('VeriAgent Pay 🛡️', 120, 160);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'right';
    ctx.fillText('Solana Devnet Verified', 1080, 160);
    ctx.textAlign = 'left';

    ctx.strokeStyle = isDark ? '#334155' : '#dbe3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 210);
    ctx.lineTo(1080, 210);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(200, 340, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 70px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName.charAt(0).toUpperCase(), 175, 365);

    const fittedName = fitText(`@${displayName}`, 680, 56, 30);
    ctx.font = `bold ${fittedName.size}px sans-serif`;
    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.fillText(fittedName.text, 320, 330);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(rank ? `Global Rank #${rank}` : 'No global rank yet', 320, 385);

    drawRoundedPanel(120, 480, 960, 180);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('REFERRED FRIENDS', 165, 535);
    ctx.fillText('REPUTATION SCORE', 615, 535);
    ctx.font = 'bold 38px sans-serif';
    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.fillText(`${totalReferred} Users`, 165, 600);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`${reputationPoints} Pts`, 615, 600);

    drawRoundedPanel(120, 720, 650, 300);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('PERSONAL INVITE CODE', 165, 780);
    const fittedCode = fitText(inviteCode, 560, 34, 22);
    ctx.font = `bold ${fittedCode.size}px monospace`;
    ctx.fillStyle = '#10b981';
    ctx.fillText(fittedCode.text, 165, 845);
    ctx.font = '22px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Scan to join & get gasless bonus', 165, 910);

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(815, 735, 265, 265, 24);
      ctx.fill();
      ctx.drawImage(qrImg, 835, 755, 225, 225);
      const link = document.createElement('a');
      link.download = `veriagent-pay-card-${displayName.replace(/[^a-z0-9_-]/gi, '-').slice(0, 48)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    qrImg.src = qrCodeImgUrl;
  };

  return (
    <div className="min-w-0 w-full space-y-4 max-w-md mx-auto">
      {/* Visual Share Card Box */}
      <div
        ref={cardRef}
        className={`relative min-w-0 w-full border-2 rounded-3xl p-4 sm:p-6 md:p-8 space-y-6 shadow-2xl overflow-hidden backdrop-blur-2xl transition-colors duration-200 ${isDark
          ? 'bg-[#070A11] border-[#F2D827]/30 text-white'
          : 'bg-white border-slate-200 text-slate-950 shadow-slate-200/60'
          }`}
      >
        {/* Brand Header */}
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex min-w-0 items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-[#F2D827] text-slate-950 font-extrabold text-sm flex items-center justify-center shadow-md">
              V
            </div>
            <span className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              VeriAgent <span className="text-[#F2D827]">Pay</span>
            </span>
          </div>
          <span className="max-w-full text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#F2D827]/10 text-[#F2D827] border border-[#F2D827]/20 flex items-center space-x-1 whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Solana Devnet</span>
          </span>
        </div>

        {/* User Identity & Leaderboard Rank */}
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#F2D827] text-slate-950 font-extrabold text-2xl flex items-center justify-center shadow-lg shrink-0 border border-[#F2D827]">
            {(displayName || '?').charAt(0).toUpperCase()}
          </div>
          <div className="space-y-1 min-w-0 font-mono">
            <div className="flex min-w-0 items-center gap-2">
              <h3 title={displayName ? (displayName.startsWith('@') ? displayName : `@${displayName}`) : undefined} className={`min-w-0 flex-1 font-extrabold text-lg truncate ${isDark ? 'text-white' : 'text-slate-950'}`}>{displayName ? (displayName.startsWith('@') ? displayName : `@${displayName}`) : 'Verified member'}</h3>
              {rank && <span className="text-xs font-extrabold text-[#F2D827] bg-[#F2D827]/10 border border-[#F2D827]/20 px-2 py-0.5 rounded-full shrink-0">#{rank} Global</span>}
            </div>
            <p className="text-xs text-[#F2D827] font-semibold flex items-center space-x-1">
              <Award className="w-3.5 h-3.5" />
              <span>{badgeTitle}</span>
            </p>
          </div>
        </div>

        {/* Key Stats Grid */}
        <div className={`grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 text-xs p-4 rounded-2xl border font-mono ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-50 border-slate-200 text-slate-950'
          }`}>
          <div>
            <span className={`font-semibold uppercase text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Referred Friends</span>
            <p className={`font-extrabold text-base flex items-center space-x-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Users className="w-4 h-4 text-slate-300" />
              <span>{totalReferred} Users</span>
            </p>
          </div>
          <div>
            <span className={`font-semibold uppercase text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Reputation Score</span>
            <p className="text-[#F2D827] font-extrabold text-base flex items-center space-x-1">
              <span>⭐ {reputationPoints} Pts</span>
            </p>
          </div>
        </div>

        {/* Real Functional QR Code Footer */}
        <div className={`grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-3 p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-50 border-slate-200 text-slate-950'
          }`}>
          <div className="min-w-0 space-y-1 font-mono">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personal Invite Code</span>
            <p className="break-all text-xs sm:text-sm font-extrabold leading-snug text-[#F2D827]">{inviteCode || 'Generating invite code…'}</p>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{inviteUrl ? 'Scan QR to join & get gasless bonus' : 'Invite link is not available yet'}</p>
          </div>

          <div className="w-16 h-16 max-w-full bg-white border border-slate-200 rounded-xl p-1 flex items-center justify-center overflow-hidden">
            {inviteUrl ? <QRCodeSVG value={inviteUrl} size={56} level="M" includeMargin /> : <span className="text-[10px] text-slate-500">-</span>}
          </div>
        </div>
      </div>

      {/* Share Target Buttons */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 font-mono text-xs">
        <button
          onClick={handleTwitterShare}
          disabled={!inviteUrl}
          className="py-2.5 px-3 rounded-xl bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 border border-sky-500/20 font-bold flex items-center justify-center space-x-2 transition"
        >
          <Share2 className="w-4 h-4" />
          <span>Share on X</span>
        </button>

        <button
          onClick={handleTelegramShare}
          disabled={!inviteUrl}
          className="py-2.5 px-3 rounded-xl bg-[#229ED9]/10 text-[#229ED9] hover:bg-[#229ED9]/20 border border-[#229ED9]/20 font-bold flex items-center justify-center space-x-2 transition"
        >
          <Send className="w-4 h-4" />
          <span>Telegram</span>
        </button>

        <button
          onClick={handleWhatsAppShare}
          disabled={!shareText}
          className="py-2.5 px-3 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border border-[#25D366]/20 font-bold flex items-center justify-center space-x-2 transition"
        >
          <Phone className="w-4 h-4" />
          <span>WhatsApp</span>
        </button>

        <button
          onClick={handleDownloadCard}
          disabled={!inviteUrl}
          className="py-2.5 px-3 rounded-xl bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border border-purple-500/20 font-bold flex items-center justify-center space-x-2 transition"
        >
          <Download className="w-4 h-4" />
          <span>Download PNG</span>
        </button>
      </div>
    </div>
  );
};
