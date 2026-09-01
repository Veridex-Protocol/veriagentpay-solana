import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface CopyToClipboardProps {
  text: string;
  label?: string;
  /**
   * Render just the copy icon, with no text.
   *
   * The default shows the truncated value, which is right when the button is
   * the only place the value appears. Beside something already displaying it
   * (such as the header's "Passkey: 0x577A…26Ad"), that printed the same address twice.
   */
  iconOnly?: boolean;
}

export const CopyToClipboard: React.FC<CopyToClipboardProps> = ({ text, label, iconOnly }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);

    // Standard vibration for web
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }

    // Telegram Mini App haptic feedback
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      try {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      } catch (e) {
        console.warn('Telegram haptic feedback not available');
      }
    }

    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={
        iconOnly
          ? 'inline-flex items-center justify-center p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors light:hover:text-slate-900'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-mono border border-white/5 transition-colors light:bg-slate-100 light:hover:bg-slate-200 light:text-slate-700 light:border-slate-200'
      }
      title="Copy to clipboard"
      aria-label={iconOnly ? `Copy ${text}` : undefined}
    >
      {!iconOnly && (
        <span>{label || `${text.substring(0, 6)}...${text.substring(text.length - 4)}`}</span>
      )}
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[#F2D827]" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-slate-400" />
      )}
    </button>
  );
};
