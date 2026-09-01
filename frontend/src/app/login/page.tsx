'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authenticateWithPasskey } from '../../lib/veridex';
import { useWalletStore } from '../../store/useWalletStore';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Fingerprint, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';

export default function LoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { setToken, setAddress, setPasskeyRegistered, setAuthRequired, setAuthChecked } = useWalletStore();
  const [isSessionRecovery, setIsSessionRecovery] = useState(false);
  const [nextPath, setNextPath] = useState('/dashboard');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsSessionRecovery(params.get('reason') === 'session');

    const requestedPath = params.get('next');
    // Only honour local, absolute app paths. This prevents an auth redirect
    // parameter from becoming an open redirect to another site.
    if (requestedPath?.startsWith('/') && !requestedPath.startsWith('//')) {
      setNextPath(requestedPath);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await authenticateWithPasskey();
      const data = result;

      if (data.accessToken) {
        setToken(data.accessToken);
      }
      if (data.walletAddress) {
        setAddress(data.walletAddress);
      }
      setPasskeyRegistered(true);
      setAuthRequired(false);
      setAuthChecked(true);

      router.replace(nextPath);
    } catch (err: any) {
      console.error('[Login] Error:', err);
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen p-4 flex flex-col justify-center items-center font-sans transition-colors duration-200 ${
        isDark ? 'va-auth-shell bg-black text-slate-100' : 'va-auth-shell bg-white text-slate-950'
      }`}
    >
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VeriAgentLogoMark size={40} speed="normal" withSquircle={true} glow={true} />
            <div>
              <div className="va-auth-kicker flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> VERIAGENT PAY
              </div>
              <div className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Sign In
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-3 font-mono">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="va-auth-card p-6 space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
              <Fingerprint className="w-8 h-8" />
            </div>
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {isSessionRecovery ? 'Welcome back' : 'Sign in with Passkey'}
            </h2>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {isSessionRecovery
                ? 'For your security, please verify your passkey to continue.'
                : 'Use your synced passkey (Google Password Manager, iCloud Keychain, or hardware key) to access your wallet on this device.'}
            </p>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="va-auth-primary w-full py-4 active:scale-[0.98] font-bold font-mono text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <VeriAgentLogoMark size={20} speed="fast" withSquircle={false} glow={false} />
                <span>Authenticating Passkey...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span>Authenticate with Passkey</span>
              </>
            )}
          </button>

          <div className={`text-center text-[11px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Passkey synced via iCloud Keychain or Google Password Manager. Enable the same password manager on all your devices to sign in elsewhere. No other recovery path exists.
          </div>
        </div>

        <div className="text-center">
          <a
            href="/onboard"
            className={`inline-flex items-center gap-1 text-xs font-mono font-semibold transition ${
              isDark ? 'text-yellow-400 hover:text-yellow-300' : 'text-amber-700 hover:text-amber-800'
            }`}
          >
            New here? Create a wallet <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
