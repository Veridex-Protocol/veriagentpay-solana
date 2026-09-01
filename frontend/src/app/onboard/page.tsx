'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerBiometricPasskey } from '../../lib/veridex';
import { useTheme } from '../../components/providers/ThemeProvider';
import { useWalletStore } from '../../store/useWalletStore';
import {
  ShieldCheck,
  Key,
  CheckCircle2,
  Fingerprint,
  ArrowRight,
  Sparkles,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { grantSessionKeyWithPasskey } from '../../lib/passkey-actions';
import { triggerTelegramHaptic } from '../../lib/telegram-haptics';
import { getTelegramBotUsername } from '../../lib/app-url';
import { VeriAgentLoader, VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { setToken, setAddress, setPasskeyRegistered } = useWalletStore();
  const [platform, setPlatform] = useState<string>('telegram');
  const [chatId, setChatId] = useState<string>('');
  const [platformId, setPlatformId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const [smartAddress, setSmartAddress] = useState<string>('');
  const [sessionKeyProvisioned, setSessionKeyProvisioned] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Start as null so server and client both render nothing for the browser
  // fallback block until the client has actually checked: eliminates the
  // hydration mismatch caused by server/client disagreeing on these booleans.
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState<boolean | null>(null);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState<boolean | null>(null);

  // No platform identity in the link: this visitor is signing up on the web,
  // and the server mints the identity rather than verifying one.
  const isWebSignup = platform === 'web';

  useEffect(() => {
    const chat = searchParams.get('chatId') || searchParams.get('chat_id') || '';
    const pId = searchParams.get('platformId') || searchParams.get('userId') || chat;

    // Two ways in. A bot deep link carries a platform identity and an HMAC; a
    // visitor who typed the address carries nothing, and is a web signup whose
    // identity the server mints. Defaulting to `telegram` for the second case
    // sent an empty platformId to an endpoint that requires one, which is why
    // web signup used to fail before the biometric prompt ever appeared.
    const plat = searchParams.get('platform') || (pId ? 'telegram' : 'web');
    const isWebSignup = plat === 'web';
    const user =
      searchParams.get('username') ||
      searchParams.get('handle') ||
      (isWebSignup ? '' : 'telegram_user');

    setPlatform(plat);
    setChatId(chat);
    setPlatformId(pId);
    setUsername(user);

    // Client-only checks: must run after mount to avoid hydration mismatch.
    const supported = !!(window.PublicKeyCredential && window.navigator.credentials);
    setIsWebAuthnSupported(supported);

    const isTg = !!(
      (window as any).TelegramWebviewProxy ||
      (window as any).Telegram?.WebApp?.initData ||
      navigator.userAgent.includes('TelegramBot') ||
      document.querySelector('script[src*="telegram-web-app"]')
    );
    setIsTelegramWebApp(isTg);

    // Telegram WebApp expansion, BiometricManager & theme sync
    if ((window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();

      // Only fills gaps in a signed Telegram link. `initDataUnsafe` is exactly
      // that (unverified client data), so it must not promote a bare web
      // signup into a Telegram-bound one: the wallet's derivation salt would
      // then come from an identity nothing has checked. A web signup inside
      // Telegram stays a web signup, and binds Telegram later through
      // Settings → Linked Accounts, where the code is verified.
      if (tg.initDataUnsafe?.user && !isWebSignup) {
        if (!pId) setPlatformId(tg.initDataUnsafe.user.id.toString());
        if (!user || user === 'telegram_user') {
          setUsername(tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || 'telegram_user');
        }
      }

      if (tg.isVersionAtLeast?.('7.2') && tg.BiometricManager) {
        try {
          tg.BiometricManager.init();
        } catch {
          // Ignore biometric manager initialization errors on unsupported Telegram clients
        }
      }
    }
  }, [searchParams]);

  const handleOpenExternalBrowser = () => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      if ((window as any).Telegram?.WebApp?.openLink) {
        (window as any).Telegram.WebApp.openLink(currentUrl);
      } else {
        window.open(currentUrl, '_blank');
      }
    }
  };

  const handleRegisterPasskey = async () => {
    // WebAuthn rejects ceremonies from unfocused documents, and the browser's
    // own passkey UI is a common reason focus is elsewhere. Wait for it to come
    // back rather than refusing outright: `registerBiometricPasskey` still
    // translates a genuine refusal into advice.
    triggerTelegramHaptic('impact');
    setLoading(true);
    setError(null);

    try {
      const creds = await registerBiometricPasskey(username, {
        platform: platform as 'telegram' | 'whatsapp' | 'slack' | 'discord' | 'web',
        platformId,
        chatId,
        label: 'Primary passkey',
        expires: searchParams.get('expires') || undefined,
        sig: searchParams.get('sig') || undefined,
        // Attribution carried through from the entry link so the referrer gets
        // credited the moment the wallet is created.
        referralCode: searchParams.get('ref') || undefined,
        src: searchParams.get('src') || undefined,
        campaign: searchParams.get('campaign') || undefined,
        partner: searchParams.get('partner') || undefined,
        channel: searchParams.get('channel') || undefined,
      });
      console.log('[Passkey] Credential created successfully:', creds);
      const data = creds;
      // The API names this `smartAccountAddress`; reading only `walletAddress`
      // left it empty, which silently skipped both the address write and the
      // session-key grant below.
      const walletAddr = data.smartAccountAddress || data.walletAddress || '';
      setSmartAddress(walletAddr);
      // A web signup is handed a generated handle. Keep it so the success
      // screen can show what to replace by linking a social.
      if (data.username) setUsername(data.username);

      // Store auth token + wallet address for immediate session key minting
      if (data.accessToken) {
        setToken(data.accessToken);
      }
      if (walletAddr) {
        setAddress(walletAddr);
        if (typeof window !== 'undefined') {
          localStorage.setItem('veriagent_wallet_address', walletAddr);
        }
      }
      setPasskeyRegistered(true);

      // Grant the default session key with the passkey the user just created.
      //
      // The grant is the only thing that makes a session key real: it is an
      // on-chain `registerSession` the *user* must authorize, because the
      // relayer is not permitted to send one. Skip it and chat payments
      // silently escalate on first use.
      //
      // Prompting here is the cheapest moment to do it: the user is already in
      // a biometric flow, having just approved one a second ago.
      if ((data.shouldGrantSessionKey ?? data.sessionKeyProvisioned) && walletAddr) {
        try {
          await grantSessionKeyWithPasskey({
            durationDays: 7,
            perTxLimitUSD: 50,
            dailyLimitUSD: 100,
          });
          setSessionKeyProvisioned(true);
        } catch (grantErr) {
          // Not fatal: the wallet works, and the copy below tells the user to
          // enrol a key from Session Keys. Claiming success would be worse:
          // they would find out at their first payment.
          console.error('[Passkey] Session key grant failed:', grantErr);
          setSessionKeyProvisioned(false);
        }
      }

      setCompleted(true);
      triggerTelegramHaptic('success');
    } catch (err: any) {
      console.error('[Passkey] Error during registration:', err);
      setError(err.message || 'Failed to register passkey wallet.');
    } finally {
      setLoading(false);
    }
  };

  // Where a web signup goes to trade its generated handle for a real one.
  // Settings opens the linking modal directly on this query.
  const handleConnectTelegram = () => {
    triggerTelegramHaptic('impact');
    router.push('/settings?connect=telegram');
  };

  const handleReturnToTelegram = () => {
    triggerTelegramHaptic('impact');
    if (typeof window === 'undefined') return;

    const webApp = (window as any).Telegram?.WebApp;
    const botUsername = getTelegramBotUsername();
    const botChatUrl = `https://t.me/${encodeURIComponent(botUsername)}`;

    // telegram-web-app.js creates a WebApp object in ordinary browsers too.
    // Calling close() there is a silent no-op, so only use it when the native
    // Telegram bridge has supplied real Mini App session data.
    const isEmbeddedMiniApp = Boolean(
      (window as any).TelegramWebviewProxy ||
      webApp?.initData ||
      webApp?.initDataUnsafe?.user,
    );

    if (isEmbeddedMiniApp && typeof webApp?.close === 'function') {
      webApp.close();

      // A client that ignores close() should still leave the user somewhere
      // useful. In a successful close the document is hidden, so this does not
      // interrupt the normal return-to-chat behavior.
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') window.location.assign(botChatUrl);
      }, 700);
      return;
    }

    // The onboarding link may also open in the system browser. HTTPS gives
    // mobile and desktop Telegram a chance to claim the bot link, while still
    // working as a normal browser fallback.
    window.location.assign(botChatUrl);
  };

  return (
    <div
      className={`min-h-screen p-4 flex flex-col justify-center items-center font-sans transition-colors duration-200 ${
        isDark ? 'va-auth-shell bg-black text-slate-100' : 'va-auth-shell bg-white text-slate-950'
      }`}
    >
      <div className="w-full max-w-md space-y-6">
        {/* App Header Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-500 text-black font-extrabold flex items-center justify-center text-xl font-mono shadow-lg shadow-yellow-500/20">
              V
            </div>
            <div>
              <div className="va-auth-kicker flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-yellow-400" /> VERIAGENT PAY
              </div>
              <div className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Passkey Wallet Setup
              </div>
            </div>
          </div>
          <div className="text-[10px] font-mono font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2.5 py-1 rounded-full">
            BOTChain L1
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-3 font-mono">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {!completed ? (
          /* Step 1: Passkey Creation Card */
          <div className="va-auth-card p-6 space-y-6">
            <div className="space-y-2 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
                <Fingerprint className="w-8 h-8 animate-pulse" />
              </div>
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Create Your Passkey Wallet
              </h2>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Set up hardware-backed WebAuthn biometrics (Touch ID / Face ID) for 0.2s instant social micro-payments.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-3 font-mono text-xs">
              <div
                className={`p-3 rounded-xl border flex items-center gap-3 ${
                  isDark ? 'bg-slate-900/60 border-white/[0.05]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div>
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    100% Self-Custodial
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ERC-4337 Account Abstraction on BOTChain
                  </div>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center gap-3 ${
                  isDark ? 'bg-slate-900/60 border-white/[0.05]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Key className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div>
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Zero Seed Phrases
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Secured by device enclave P-256 hardware keys
                  </div>
                </div>
              </div>
            </div>

            {/* Primary CTA Button */}
            <button
              onClick={handleRegisterPasskey}
              disabled={loading}
              className="va-auth-primary w-full py-4 active:scale-[0.98] font-bold font-mono text-sm transition flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <VeriAgentLogoMark size={20} speed="fast" withSquircle={false} glow={false} />
                  <span>Deploying Passkey Wallet...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  <span>🔐 Create Passkey Wallet</span>
                </>
              )}
            </button>

            {/* External Browser Fallback Notice & Button for In-App WebViews */}
            {/* Only render once client has checked: null means not yet determined */}
            {(isWebAuthnSupported !== null && isTelegramWebApp !== null) && (!isWebAuthnSupported || isTelegramWebApp) && (
              <div className="pt-2 text-center space-y-2">
                <p className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isWebSignup
                    ? 'If this browser prevents biometric prompts:'
                    : 'If your device or browser prevents biometric prompts inside Telegram:'}
                </p>
                <button
                  type="button"
                  onClick={handleOpenExternalBrowser}
                  className={`w-full py-2.5 rounded-xl border text-xs font-mono font-semibold transition ${
                    isDark
                      ? 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🌐 Open in External Browser for Passkey Setup
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Step 2: Onboarding Success Screen */
          <div className="va-auth-card border-yellow-500/30 p-6 space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                ✅ Passkey Wallet Ready!
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Your self-custodial smart wallet on BOTChain is live.
              </p>
            </div>

            {/* Wallet Address Box */}
            {smartAddress && (
              <div
                className={`p-3 rounded-xl border text-left font-mono ${
                  isDark ? 'bg-slate-900 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Smart Account Address
                </div>
                <div className="text-xs font-bold text-yellow-400 truncate mt-0.5">
                  {smartAddress}
                </div>
              </div>
            )}

            {/* A web signup has a generated handle nobody can guess or type.
                Say so plainly and point at the fix, or the account stays
                unreachable from every chat platform. */}
            {isWebSignup && (
              <div className={`p-3 rounded-xl border text-left text-xs leading-relaxed ${
                isDark ? 'bg-yellow-400/5 border-yellow-400/20 text-slate-300' : 'bg-amber-50 border-amber-200 text-slate-700'
              }`}>
                <div className="font-bold text-yellow-400 mb-1">
                  Your handle is {username ? `@${username}` : 'a temporary one'}
                </div>
                Connect Telegram (or another chat platform) to claim your real handle: it
                replaces the temporary one, so people can pay you at{' '}
                <span className="font-mono">@yourname</span> and reach you from chat.
              </div>
            )}

            <div className={`p-3 rounded-xl border text-left text-xs leading-relaxed ${
              isDark ? 'bg-amber-400/5 border-amber-400/20 text-slate-300' : 'bg-amber-50 border-amber-200 text-slate-700'
            }`}>
              <div className="font-bold text-amber-500 mb-1">Session-key safety limit</div>
              {sessionKeyProvisioned
                ? 'A seven-day session key was created with a $100 daily limit and $50 per-payment limit. This limits exposure if a chat session is compromised.'
                : 'Your wallet is ready, but the default session key could not be created. Open Session Keys to enroll one securely.'}
              {' '}For higher limits, revoke the existing key in your dashboard and enroll a replacement with your preferred limits.
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => router.push(`/keys?platform=${platform}&chatId=${chatId}`)}
                className="va-auth-primary w-full py-3.5 font-bold font-mono text-xs transition flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                <span>{sessionKeyProvisioned ? 'Review Session Key & Safety Limits' : 'Create Session Key for Faster Payments'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={isWebSignup ? handleConnectTelegram : handleReturnToTelegram}
                className={`w-full py-3 rounded-xl font-mono text-xs font-bold border transition flex items-center justify-center gap-2 ${
                  isDark
                    ? 'bg-slate-900 border-white/[0.1] text-slate-200 hover:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-yellow-400" />
                <span>{isWebSignup ? 'Connect Telegram' : 'Return to Telegram Chat'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="md"
          text="Setting Up Wallet"
          subtext="Preparing zero-seed passkey cryptography..."
          showProgress={true}
        />
      }
    >
      <OnboardContent />
    </Suspense>
  );
}
