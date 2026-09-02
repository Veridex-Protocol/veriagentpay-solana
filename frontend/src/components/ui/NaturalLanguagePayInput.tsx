import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useNaturalLanguage } from '../../hooks/useNaturalLanguage';
import { motion } from 'motion/react';
import { VeriAgentLogoMark } from './VeriAgentLoader';

export interface NaturalLanguagePayInputProps {
  onParsed: (result: { recipient?: string; amount?: string; token?: 'USDC' }) => void;
}

export const NaturalLanguagePayInput: React.FC<NaturalLanguagePayInputProps> = ({ onParsed }) => {
  const [prompt, setPrompt] = useState('');
  const { parsePrompt, isLoading } = useNaturalLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const result = await parsePrompt(prompt);
    if (result) {
      onParsed(result);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div className="gradient-border glass-panel relative flex items-center rounded-2xl p-1.5 focus-within:shadow-glow">
        <motion.div
          animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
          transition={isLoading ? { duration: 1.2, ease: 'linear', repeat: Infinity } : { type: 'spring', stiffness: 300, damping: 25 }}
          className="pl-3 text-brand-accentPurple"
        >
          <Sparkles className="h-5 w-5" />
        </motion.div>
        <div className="ml-3 hidden h-6 w-px bg-white/10 sm:block" />
        <div className="min-w-0 flex-1 px-3">
          <div className="hidden text-[9px] font-semibold uppercase tracking-[0.18em] text-violet-300 sm:block">Agent command</div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Send 50 USDC to @alice for dinner"
            aria-label="Describe a payment or savings action"
            className="w-full bg-transparent py-2 text-xs text-white placeholder-slate-500 focus:outline-none sm:py-0.5 sm:text-sm"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
          type="submit"
          disabled={!prompt.trim() || isLoading}
          aria-label="Parse command"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accentPurple text-white shadow-glowPurple disabled:opacity-40"
        >
          {isLoading ? (
            <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
        </motion.button>
      </div>
    </form>
  );
};
