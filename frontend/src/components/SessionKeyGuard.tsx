'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSessionKeyStatus } from '../hooks/useApi';
import { grantSessionKeyWithPasskey } from '../lib/passkey-actions';
import { PasskeyPrompt } from './ui/PasskeyPrompt';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface SessionKeyGuardContextType {
  hasActiveKey: boolean;
  secondsRemaining: number;
  triggerReauthorization: () => void;
}

const SessionKeyGuardContext = createContext<SessionKeyGuardContextType>({
  hasActiveKey: false,
  secondsRemaining: 0,
  triggerReauthorization: () => {},
});

export const useSessionKeyGuard = () => useContext(SessionKeyGuardContext);

export const SessionKeyGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: statusData } = useSessionKeyStatus();
  const queryClient = useQueryClient();

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Listen for global window events dispatched when an API call fails with SESSION_EXPIRED or SESSION_KEY_REQUIRED
  useEffect(() => {
    const handleExpiredEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const msg = customEvent.detail?.message || 'Your session key has expired. Please authenticate with your passkey to continue.';
      setPromptMessage(msg);
      setShowPrompt(true);
    };

    window.addEventListener('session-key-expired', handleExpiredEvent);
    return () => window.removeEventListener('session-key-expired', handleExpiredEvent);
  }, []);

  const triggerReauthorization = () => {
    setPromptMessage('Authenticate with your Passkey to authorize a new instant payment session.');
    setShowPrompt(true);
  };

  const handlePasskeySuccess = async () => {
    setIsProvisioning(true);
    try {
      // Re-authorize through the passkey grant path. The relayer can no longer
      // register a session grant on-chain: a delegated authority must not be
      // able to mint itself more, so the user signs for their own key.
      await grantSessionKeyWithPasskey({
        durationDays: 1,
        perTxLimitUSD: 50,
        dailyLimitUSD: 200,
      });

      queryClient.invalidateQueries({ queryKey: ['session-key-status'] });
      queryClient.invalidateQueries({ queryKey: ['session-keys'] });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setShowPrompt(false);
        setIsProvisioning(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to auto-provision session key:', err);
      setIsProvisioning(false);
      setShowPrompt(false);
    }
  };

  const hasActiveKey = statusData?.hasActiveKey ?? false;
  const secondsRemaining = statusData?.secondsRemaining ?? 0;
  const isExpiringSoon = hasActiveKey && secondsRemaining > 0 && secondsRemaining < 300; // < 5 mins

  const minsRemaining = Math.max(1, Math.ceil(secondsRemaining / 60));

  return (
    <SessionKeyGuardContext.Provider value={{ hasActiveKey, secondsRemaining, triggerReauthorization }}>
      {/* Expiry Warning Banner (<5 mins remaining) */}
      {isExpiringSoon && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 px-4 py-2 text-xs font-mono flex items-center justify-between z-40 sticky top-0 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>
              <strong>Session Expiring Soon:</strong> Fast-path key expires in {minsRemaining} min{minsRemaining > 1 ? 's' : ''}.
            </span>
          </div>
          <button
            onClick={triggerReauthorization}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold transition text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-Authorize Now
          </button>
        </div>
      )}

      {/* Global Passkey Prompt Modal */}
      {showPrompt && (
        <PasskeyPrompt
          isOpen={showPrompt}
          onClose={() => setShowPrompt(false)}
          onCancel={() => setShowPrompt(false)}
          title={isSuccess ? 'Session Key Provisioned! ⚡' : 'Passkey Session Re-Authorization'}
          description={
            isSuccess
              ? 'Universal session key successfully created. Instant transfers are active.'
              : isProvisioning
              ? 'Provisioning fast-path session key...'
              : promptMessage || 'Touch Sensor or look at camera to re-authorize your instant payment session.'
          }
          onSuccess={handlePasskeySuccess}
        />
      )}

      {children}
    </SessionKeyGuardContext.Provider>
  );
};
