'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { usePasskey } from '../hooks/usePasskey';
import { useWalletStore } from '../store/useWalletStore';
import { Fingerprint, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

export const PasskeyOnboardingModal: React.FC = () => {
  const { data: session } = useSession();
  const { passkeyRegistered, setPasskeyRegistered, setAddress } = useWalletStore();
  const { registerPasskey } = usePasskey();

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // If user already has passkey wallet, don't display modal
  const backendUser = (session as any)?.backendUser;
  if (!session || passkeyRegistered || backendUser?.hasPasskeyWallet) {
    return null;
  }

  const handleCreatePasskey = async () => {
    setIsLoading(true);
    try {
      const res = await registerPasskey();
      setPasskeyRegistered(true);
      if (res) setAddress((res as any).address || res.credentialId);
      setIsSuccess(true);
    } catch (err) {
      console.error('Passkey creation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
      <Card glow className="max-w-md w-full p-8 text-center space-y-6 bg-gradient-to-b from-slate-950 via-brand-navy to-slate-950 border border-[#F2D827]/30 shadow-glow">
        {!isSuccess ? (
          <>
            <div className="w-16 h-16 rounded-3xl bg-[#F2D827]/15 border border-[#F2D827]/30 text-[#F2D827] flex items-center justify-center mx-auto shadow-glow">
              <Fingerprint className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white">
                Welcome, {session.user?.name || 'User'}!
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                To enable gasless social payments and earn verified AI yields, create your non-custodial WebAuthn Passkey Wallet.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-white/5 text-left text-xs text-slate-300 space-y-2 font-mono">
              <div className="flex items-center gap-2 text-[#F2D827] font-bold">
                <ShieldCheck className="w-4 h-4" /> Non-Custodial Architecture
              </div>
              <p className="text-[11px] text-slate-400">
                Your passkey is your identity. Private keys are generated hardware-isolated on your device (Touch ID / Face ID) and never leave it.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              onClick={handleCreatePasskey}
              leftIcon={<Fingerprint className="w-5 h-5" />}
            >
              Create Biometric Passkey
            </Button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-[#F2D827]/20 border-2 border-[#F2D827] text-[#F2D827] flex items-center justify-center mx-auto shadow-glow">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white">Wallet Provisioned!</h2>
              <p className="text-xs text-slate-400">
                Your ERC-4337 Smart Account is ready. Enjoy instant, gasless payments across all social messengers.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              rightIcon={<ArrowRight className="w-5 h-5" />}
              onClick={() => setIsSuccess(false)}
            >
              Continue to Dashboard
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};
