'use client';

import React, { useState } from 'react';
import {
  Send,
  Phone,
  MessageSquare,
  Hash,
  Copy,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { getAppBaseUrl } from '../lib/app-url';
import { useToast } from './providers/NotificationProvider';

export interface ShareEnvelopeLinkProps {
  envelopeId: string;
  shareUrl?: string;
  customText?: string;
}

export const ShareEnvelopeLink: React.FC<ShareEnvelopeLinkProps> = ({
  envelopeId,
  shareUrl,
  customText,
}) => {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const baseUrl = getAppBaseUrl();
  const url = shareUrl || (envelopeId ? `${baseUrl}/envelopes/${envelopeId}` : baseUrl);
  const text = customText || `🧧 Claim your gasless Red Envelope on VeriAgent Pay! ${url}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Envelope link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareTargets = [
    {
      name: 'Telegram',
      icon: Send,
      bgColor: 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/20',
      action: () =>
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
            text
          )}`,
          '_blank'
        ),
    },
    {
      name: 'WhatsApp',
      icon: Phone,
      bgColor: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20',
      action: () =>
        window.open(
          `https://wa.me/?text=${encodeURIComponent(text)}`,
          '_blank'
        ),
    },
    {
      name: 'Discord',
      icon: MessageSquare,
      bgColor: 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border-indigo-500/20',
      action: () => {
        navigator.clipboard.writeText(text);
        toast.success('Discord message copied! Paste into your Discord channel.');
      },
    },
    {
      name: 'Slack',
      icon: Hash,
      bgColor: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20',
      action: () => {
        navigator.clipboard.writeText(text);
        toast.success('Slack message copied! Paste into your Slack channel.');
      },
    },
  ];

  return (
    <div className="bg-slate-950/80 border border-red-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-red-400 uppercase tracking-wider">
          <Share2 className="w-4 h-4 text-red-400" />
          <span>Multi-Platform Share Options</span>
        </div>
      </div>

      {/* Share Target Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {shareTargets.map((target) => {
          const Icon = target.icon;
          return (
            <button
              key={target.name}
              onClick={target.action}
              className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition ${target.bgColor}`}
            >
              <Icon className="w-4 h-4" />
              <span>{target.name}</span>
            </button>
          );
        })}
      </div>

      {/* Copy Link Bar */}
      <div className="flex items-center space-x-2 pt-1">
        <input
          type="text"
          readOnly
          value={url}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none"
        />
        <button
          onClick={copyToClipboard}
          className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white font-medium text-xs rounded-lg flex items-center space-x-1 transition shrink-0"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied!' : 'Copy Link'}</span>
        </button>
      </div>
    </div>
  );
};
