'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Fingerprint, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { signWithBiometrics } from '../../lib/veridex';
import { useTheme } from '../providers/ThemeProvider';

export interface PasskeyPromptProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  amount?: string;
  recipient?: string;
  onSuccess: (attestation: any) => void;
}

export const PasskeyPrompt: React.FC<PasskeyPromptProps> = ({
  isOpen = true,
  onClose,
  onCancel,
  title = 'Passkey Authentication',
  description,
  amount,
  recipient,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');

  const handleClose = () => {
    if (onClose) onClose();
    if (onCancel) onCancel();
  };

  const handleAuthenticate = async () => {
    setStatus('authenticating');
    try {
      // Generate a challenge for signing (in production, this should come from your backend)
      const challenge = typeof window !== 'undefined' && window.crypto
        ? window.crypto.getRandomValues(new Uint8Array(32))
        : new Uint8Array(32);

      // Sign with existing passkey (not register a new one)
      const signature = await signWithBiometrics(challenge);

      setStatus('success');
      setTimeout(() => {
        onSuccess(signature);
        setStatus('idle');
      }, 600);
    } catch (err: any) {
      console.error('Passkey authentication failed:', err);
      setStatus('error');
      // Show error for 2 seconds then reset
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="flex flex-col items-center justify-center text-center py-4 space-y-5">
        <div className="relative flex items-center justify-center w-24 h-24">
          <motion.div
            animate={{
              scale: status === 'authenticating' ? [1, 1.15, 1] : 1,
              opacity: status === 'authenticating' ? [0.6, 1, 0.6] : 1,
            }}
            transition={{ repeat: status === 'authenticating' ? Infinity : 0, duration: 1.2 }}
            className={`w-full h-full rounded-full flex items-center justify-center ${
              status === 'success'
                ? 'bg-[#F2D827]/20 border-2 border-[#F2D827] text-[#F2D827]'
                : status === 'error'
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-500'
                  : 'bg-[#F2D827]/10 border-2 border-[#F2D827]/40 text-[#F2D827]'
            }`}
          >
            {status === 'success' ? (
              <CheckCircle2 className="w-12 h-12" />
            ) : status === 'error' ? (
              <AlertCircle className="w-12 h-12" />
            ) : (
              <Fingerprint className="w-12 h-12" />
            )}
          </motion.div>
        </div>

        {amount && recipient && (
          <div className={`border rounded-2xl p-4 w-full text-left space-y-1 ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'
          }`}>
            <div className={`flex justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span>Transfer Payload</span>
              <span className="flex items-center gap-1 text-[#D4A106] dark:text-[#F2D827] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" /> Gas Sponsored
              </span>
            </div>
            <div className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
              {amount} to <span className="text-[#D4A106] dark:text-[#F2D827] font-mono">{recipient}</span>
            </div>
          </div>
        )}

        <p className={`text-xs max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {description ||
            (status === 'authenticating'
              ? 'Touch Sensor or look at camera to sign UserOperation with your Passkey...'
              : status === 'success'
                ? 'Biometric signature verified! Relaying transaction...'
                : 'Confirm transaction using Touch ID, Face ID, or Windows Hello.')}
        </p>

        <div className="w-full flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handleClose}
            disabled={status === 'authenticating'}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            isLoading={status === 'authenticating'}
            onClick={handleAuthenticate}
            leftIcon={<Fingerprint className="w-4 h-4" />}
          >
            Authenticate
          </Button>
        </div>
      </div>
    </Modal>
  );
};
