'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/layout/AppLayout';
import { Avatar } from '../../components/ui/Avatar';
import {
  Key,
  ChevronRight,
  MessageCircle,
  Phone,
  MessageSquare,
  Hash,
  LogOut,
  Check,
  Copy,
  ShieldCheck,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';
import { AnimatePresence, motion } from 'framer-motion';
import { useWalletStore } from '../../store/useWalletStore';
import { useTheme } from '../../components/providers/ThemeProvider';
import {
  useLinkedAccounts,
  useRequestAccountLink,
  useVerifyAccountCode,
  useUnlinkAccount,
} from '../../hooks/use-user';
import { api } from '../../lib/api';

export default function SettingsPage() {
  const { address } = useWalletStore();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const { data: linkedAccounts = [], refetch: refetchLinkedAccounts } = useLinkedAccounts();
  const requestLinkMutation = useRequestAccountLink();
  const verifyCodeMutation = useVerifyAccountCode();
  const unlinkMutation = useUnlinkAccount();

  const [activeModalPlatform, setActiveModalPlatform] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  // 'handle' → asking who they are; 'otp' → code sent, waiting for it back;
  // 'deeplink' → we could not message them, so they open the bot instead.
  const [linkStep, setLinkStep] = useState<'handle' | 'otp' | 'deeplink'>('handle');
  const [otpInput, setOtpInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  // The handle the person says is theirs. It personalises the prompt and lets
  // us warn on a mismatch: it is never what authorises the link.
  const [claimedHandle, setClaimedHandle] = useState('');
  const [copiedPasskey, setCopiedPasskey] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const queryClient = useQueryClient();
  const { data: notifPrefs } = useQuery({
    queryKey: ['notificationPrefs'],
    queryFn: () => api.fetchNotificationPrefs(),
  });
  const updateNotifPrefsMutation = useMutation({
    mutationFn: (prefs: { pushAlerts?: boolean; telegramBot?: boolean; yieldAlerts?: boolean }) =>
      api.updateNotificationPrefs(prefs),
    onSuccess: (data) => queryClient.setQueryData(['notificationPrefs'], data),
  });

  const notifications = notifPrefs ?? { pushAlerts: true, telegramBot: true, yieldAlerts: true };

  const passkeyAddress = address || '';
  const displayPasskey = mounted && address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : 'Not connected';

  const handleCopyPasskey = () => {
    navigator.clipboard.writeText(passkeyAddress);
    setCopiedPasskey(true);
    setTimeout(() => setCopiedPasskey(false), 2000);
  };

  const handleConnect = async (targetPlatform: string) => {
    setLinkError(null);
    setOtpInput('');
    setDeepLink(null);
    setInstructions('');
    setClaimedHandle('');

    // Telegram and WhatsApp start by asking who they are, so the code can be
    // delivered to that account instead of made the user's problem to carry.
    if (targetPlatform === 'telegram' || targetPlatform === 'whatsapp') {
      setLinkStep('handle');
      setActiveModalPlatform(targetPlatform);
      return;
    }

    try {
      const res = await requestLinkMutation.mutateAsync(targetPlatform);
      if (res?.url) window.open(res.url, '_blank');
    } catch (err) {
      console.error('Failed to request link:', err);
    }
  };

  /**
   * Sends the code to the handle the person entered.
   *
   * If we already know that chat, the bot messages them the code and they type
   * it back here. If we have never spoken to them, Telegram will not accept a
   * first message from a bot, so we hand back the deep link instead, which
   * both starts the bot and redeems the code in one tap.
   */
  const handleSendCode = async () => {
    if (!activeModalPlatform || !claimedHandle.trim()) return;
    setLinkError(null);
    try {
      const res = await requestLinkMutation.mutateAsync({
        platform: activeModalPlatform,
        username: claimedHandle.trim(),
      });
      setInstructions(res?.instructions || '');
      setDeepLink(res?.deepLink || null);
      setLinkStep(res?.delivery === 'otp' ? 'otp' : 'deeplink');
    } catch (err: any) {
      setLinkError(err?.message || 'Could not send the code. Try again.');
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalPlatform || otpInput.length < 6) return;
    setLinkError(null);
    try {
      await verifyCodeMutation.mutateAsync({
        platform: activeModalPlatform,
        code: otpInput.trim(),
        username: claimedHandle.trim().replace(/^@/, '') || undefined,
      });
      setActiveModalPlatform(null);
      setOtpInput('');
    } catch (err: any) {
      setLinkError(err?.message || 'That code did not work. Request a new one.');
    }
  };

  /**
   * The link completes inside the chat app, not here: the code is redeemed by
   * the bot, which is the only party that can prove which account redeemed it.
   * So this window just watches for the result when the user comes back.
   */
  React.useEffect(() => {
    if (!activeModalPlatform) return;
    const onFocus = () => refetchLinkedAccounts();
    window.addEventListener('focus', onFocus);
    const poll = setInterval(onFocus, 4000);
    // Stop polling after 5 minutes — if the user hasn't linked by then they
    // probably closed the bot or lost the code. Surface a hint instead of
    // polling indefinitely.
    const timeout = setTimeout(() => {
      setActiveModalPlatform(null);
      setLinkError('Still linking? Open Telegram, send /start to the bot, and try again.');
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [activeModalPlatform, refetchLinkedAccounts]);

  React.useEffect(() => {
    if (activeModalPlatform && isPlatformLinked(activeModalPlatform)) {
      setActiveModalPlatform(null);
    }
  }, [activeModalPlatform, linkedAccounts]);

  const handleDisconnect = async (targetPlatform: string) => {
    try {
      setIsDisconnecting(targetPlatform);
      await unlinkMutation.mutateAsync(targetPlatform);
    } catch (err) {
      console.error('Unlink failed:', err);
    } finally {
      setIsDisconnecting(null);
    }
  };

  // `?connect=telegram` opens the linking modal straight away, so the prompt a
  // web signup sees after creating their wallet lands on the code rather than
  // on a settings page they then have to navigate. Read from `location`
  // instead of `useSearchParams` so this page needs no Suspense boundary.
  const connectRequested = React.useRef(false);
  React.useEffect(() => {
    if (!mounted || connectRequested.current) return;
    const target = new URLSearchParams(window.location.search).get('connect');
    if (!target || isPlatformLinked(target)) return;
    connectRequested.current = true;
    handleConnect(target);
  }, [mounted, linkedAccounts]);

  const isPlatformLinked = (target: string) =>
    linkedAccounts.some((item: any) => item.platform === target);

  const getLinkedUsername = (target: string) => {
    const account = linkedAccounts.find((item: any) => item.platform === target);
    if (!account) return 'Not linked';
    if (account.username?.startsWith('@') || account.username?.startsWith('+')) {
      return account.username;
    }
    return target === 'whatsapp' ? `${account.username || 'Not set'}` : `@${account.username || 'Not set'}`;
  };

  const handleToggleNotification = (key: 'pushAlerts' | 'telegramBot' | 'yieldAlerts') => {
    const next = !notifications[key];
    // Optimistic update via cache so the toggle feels instant
    queryClient.setQueryData(['notificationPrefs'], { ...notifications, [key]: next });
    updateNotifPrefsMutation.mutate({ [key]: next });
  };

  if (!mounted) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F2D827] border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={`settings-page space-y-8 max-w-4xl mx-auto px-4 sm:px-6 py-6 transition-colors duration-200 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {/* PAGE HEADER */}
        <div className="space-y-1 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 pb-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wider uppercase text-[#D4A106] dark:text-[#F2D827]">
              ACCOUNT & PREFERENCES
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
            Settings
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-400 light:text-slate-600">
            Manage your Google profile, social messenger integrations, notification alerts, and biometric passkeys.
          </p>
        </div>

        {/* SECTION 1: PROFILE & IDENTITY */}
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D4A106] dark:text-[#F2D827]">
            PROFILE & IDENTITY
          </h2>
          <div className="border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white rounded-2xl p-6 transition-colors duration-200 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar name={session?.user?.name || 'Verified member'} src={session?.user?.image || undefined} size="lg" />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#F2D827] border-2 border-[#070A11] dark:border-[#070A11] light:border-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-white dark:text-white light:text-slate-900">
                    {session?.user?.name || 'No profile connected'}
                    </h3>
                    <span className="bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 font-mono text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Verified
                    </span>
                  </div>
                  <p className="font-mono text-sm text-slate-400 dark:text-slate-400 light:text-slate-600 mt-1">
                    {session?.user?.email || 'Sign in to connect a profile'}
                  </p>
                </div>
              </div>

              {session && (
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-rose-400 hover:bg-rose-500/10 dark:text-rose-400 light:text-rose-600 border border-rose-500/20 hover:border-rose-500/40 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 self-stretch sm:self-auto justify-center"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: CONNECTED CHAT ACCOUNTS */}
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D4A106] dark:text-[#F2D827]">
            CONNECTED CHAT ACCOUNTS
          </h2>
          <div className="border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white rounded-2xl divide-y divide-white/[0.08] dark:divide-white/[0.08] light:divide-slate-200 overflow-hidden transition-colors duration-200 shadow-sm">
            {/* TELEGRAM */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 text-[#229ED9] border border-[#229ED9]/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                    Telegram
                  </h3>
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                    {isPlatformLinked('telegram') ? getLinkedUsername('telegram') : 'Not linked'}
                  </p>
                </div>
              </div>

              {isPlatformLinked('telegram') ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline-flex bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 font-mono text-xs px-2.5 py-0.5 rounded-full font-medium">
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDisconnect('telegram')}
                    disabled={isDisconnecting === 'telegram'}
                    className="text-rose-400 hover:bg-rose-500/10 dark:text-rose-400 light:text-rose-600 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  >
                    {isDisconnecting === 'telegram' ? 'Unlinking...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect('telegram')}
                  className="bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-semibold px-4 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                >
                  Link Telegram
                </button>
              )}
            </div>

            {/* WHATSAPP */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                    WhatsApp
                  </h3>
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                    {isPlatformLinked('whatsapp') ? getLinkedUsername('whatsapp') : 'Not linked'}
                  </p>
                </div>
              </div>

              {isPlatformLinked('whatsapp') ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline-flex bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 font-mono text-xs px-2.5 py-0.5 rounded-full font-medium">
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDisconnect('whatsapp')}
                    disabled={isDisconnecting === 'whatsapp'}
                    className="text-rose-400 hover:bg-rose-500/10 dark:text-rose-400 light:text-rose-600 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  >
                    {isDisconnecting === 'whatsapp' ? 'Unlinking...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect('whatsapp')}
                  className="bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-semibold px-4 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                >
                  Link WhatsApp
                </button>
              )}
            </div>

            {/* DISCORD */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                    Discord
                  </h3>
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                    {isPlatformLinked('discord') ? getLinkedUsername('discord') : 'Not linked'}
                  </p>
                </div>
              </div>

              {isPlatformLinked('discord') ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline-flex bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 font-mono text-xs px-2.5 py-0.5 rounded-full font-medium">
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDisconnect('discord')}
                    disabled={isDisconnecting === 'discord'}
                    className="text-rose-400 hover:bg-rose-500/10 dark:text-rose-400 light:text-rose-600 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  >
                    {isDisconnecting === 'discord' ? 'Unlinking...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect('discord')}
                  className="border border-white/10 dark:border-white/10 light:border-slate-300 hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-slate-100 text-slate-200 dark:text-slate-200 light:text-slate-800 font-semibold px-4 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                >
                  Connect OAuth
                </button>
              )}
            </div>

            {/* SLACK */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#E01E5A]/10 text-[#E01E5A] border border-[#E01E5A]/20 flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                    Slack
                  </h3>
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                    {isPlatformLinked('slack') ? getLinkedUsername('slack') : 'Not linked'}
                  </p>
                </div>
              </div>

              {isPlatformLinked('slack') ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline-flex bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 font-mono text-xs px-2.5 py-0.5 rounded-full font-medium">
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDisconnect('slack')}
                    disabled={isDisconnecting === 'slack'}
                    className="text-rose-400 hover:bg-rose-500/10 dark:text-rose-400 light:text-rose-600 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  >
                    {isDisconnecting === 'slack' ? 'Unlinking...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect('slack')}
                  className="border border-white/10 dark:border-white/10 light:border-slate-300 hover:bg-white/5 dark:hover:bg-white/5 light:hover:bg-slate-100 text-slate-200 dark:text-slate-200 light:text-slate-800 font-semibold px-4 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                >
                  Connect OAuth
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3: NOTIFICATION PREFERENCES */}
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D4A106] dark:text-[#F2D827]">
            NOTIFICATION PREFERENCES
          </h2>
          <div className="border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white rounded-2xl divide-y divide-white/[0.08] dark:divide-white/[0.08] light:divide-slate-200 overflow-hidden transition-colors duration-200 shadow-sm">
            {/* PUSH & IN-APP ALERTS */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Push & In-App Alerts
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600">
                  Receive real-time payment arrivals, requests, and claim notifications.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifications.pushAlerts}
                onClick={() => handleToggleNotification('pushAlerts')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.pushAlerts
                    ? 'bg-[#F2D827]'
                    : 'bg-slate-800 dark:bg-slate-800 light:bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.pushAlerts ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* TELEGRAM BOT DIRECT RECEIPTS */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Telegram Bot Direct Receipts
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600">
                  Send instant payment receipts and execution logs directly to your Telegram chat.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifications.telegramBot}
                onClick={() => handleToggleNotification('telegramBot')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.telegramBot
                    ? 'bg-[#F2D827]'
                    : 'bg-slate-800 dark:bg-slate-800 light:bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.telegramBot ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* YIELD & VAULT PERFORMANCE ALERTS */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Yield & Vault Performance Alerts
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600">
                  Weekly yield distribution summaries and significant APY strategy changes.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifications.yieldAlerts}
                onClick={() => handleToggleNotification('yieldAlerts')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.yieldAlerts
                    ? 'bg-[#F2D827]'
                    : 'bg-slate-800 dark:bg-slate-800 light:bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.yieldAlerts ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* DUAL-THEME PREFERENCE */}
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-2">
                  Appearance Mode
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600">
                  Switch between dark high-contrast and clean light theme aesthetics.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-2 border border-white/10 dark:border-white/10 light:border-slate-300 bg-white/5 dark:bg-white/5 light:bg-slate-100 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800 hover:bg-white/10 transition-all"
              >
                {theme === 'dark' ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#F2D827]" /> Dark Mode
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-[#D4A106]" /> Light Mode
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 4: SECURITY & PASSKEYS */}
        <section className="space-y-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D4A106] dark:text-[#F2D827]">
            SECURITY & PASSKEYS
          </h2>
          <div className="space-y-3">
            {/* ACTIVE PASSKEY HIGHLIGHT CARD */}
            <div className="border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white rounded-2xl p-5 transition-colors duration-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                    Active Passkey Identity
                  </h3>
                  <p className="font-mono text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                    Passkey Address:{' '}
                    <span className="font-mono font-bold text-slate-200 dark:text-slate-200 light:text-slate-800">
                      {displayPasskey}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyPasskey}
                className="bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 hover:bg-white/[0.1] border border-white/[0.08] dark:border-white/[0.08] light:border-slate-300 text-slate-200 dark:text-slate-200 light:text-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5"
              >
                {copiedPasskey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#F2D827]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* SESSION KEYS NAVIGATION LINK */}
            <Link href="/keys" className="block">
              <div className="border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white hover:bg-white/[0.04] dark:hover:bg-white/[0.04] light:hover:bg-slate-100/80 rounded-2xl p-5 transition-all duration-200 shadow-sm flex items-center justify-between group">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20 flex items-center justify-center shrink-0">
                    <Key className="w-5 h-5 text-[#D4A106] dark:text-[#F2D827]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900 group-hover:text-[#F2D827] transition-colors">
                      Manage Session Keys & Biometrics
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                      Configure WebAuthn P-256 keys, Touch ID / Face ID overrides, and session duration limits.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-400 light:text-slate-500 group-hover:translate-x-1 transition-transform shrink-0" />
              </div>
            </Link>
          </div>
        </section>

        {/* VERIFICATION MODAL */}
        <AnimatePresence>
          {Boolean(activeModalPlatform) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveModalPlatform(null)}
                className="fixed inset-0 bg-black/75 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                className={`relative z-10 w-full max-w-md backdrop-blur-xl border rounded-3xl p-6 shadow-2xl space-y-5 ${
                  isDark ? 'bg-[#070A11]/95 border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
                }`}
              >
                {/* Header */}
                <div className={`flex items-center justify-between border-b pb-4 ${
                  isDark ? 'border-white/[0.08]' : 'border-slate-200'
                }`}>
                  <h3 className={`text-lg font-bold capitalize ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Link {activeModalPlatform}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveModalPlatform(null)}
                    aria-label="Close dialog"
                    className={`p-1.5 rounded-full transition-colors ${
                      isDark ? 'text-slate-400 hover:text-white hover:bg-white/[0.08]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {linkError && (
                    <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-3 text-sm text-red-500">
                      {linkError}
                    </p>
                  )}

                  {linkStep === 'handle' && (
                    <>
                      {/* The handle decides where the code is sent, nothing
                          more. Whoever receives and returns it is who gets
                          linked, so typing someone else's handle only sends
                          them a code you will never see. */}
                      <div className="space-y-2">
                        <label className={`text-xs font-semibold uppercase font-mono tracking-wider block ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Your {activeModalPlatform} username
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          autoFocus
                          placeholder={activeModalPlatform === 'whatsapp' ? '+234…' : '@yourhandle'}
                          value={claimedHandle}
                          onChange={(e) => setClaimedHandle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }}
                          className={`font-mono text-base py-3 px-4 rounded-xl focus:outline-none focus:border-[#F2D827] transition-colors w-full border ${
                            isDark ? 'bg-white/[0.03] border-white/[0.1] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        />
                        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          We send a 6-digit code to this account. Once confirmed it becomes your
                          VeriAgent Pay handle, so people can pay you by name.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={!claimedHandle.trim() || requestLinkMutation.isPending}
                        className="w-full bg-[#F2D827] hover:bg-[#E5A900] disabled:opacity-50 text-slate-950 font-bold px-5 py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        {requestLinkMutation.isPending && (
                          <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
                        )}
                        Send code to {claimedHandle.trim() || 'my account'}
                      </button>
                    </>
                  )}

                  {linkStep === 'otp' && (
                    <form onSubmit={handleVerifySubmit} className="space-y-4">
                      <div className={`font-mono border p-3.5 rounded-xl text-center text-sm font-semibold ${
                        isDark ? 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border-[#F2D827]/20' : 'bg-amber-50 text-amber-900 border-[#F2D827]/30'
                      }`}>
                        {instructions}
                      </div>

                      <div className="space-y-2">
                        <label className={`text-xs font-semibold uppercase font-mono tracking-wider block ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          6-Digit Verification Code
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          placeholder="000000"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                          className={`font-mono text-center text-2xl tracking-[0.3em] font-bold py-3 px-4 rounded-xl focus:outline-none focus:border-[#F2D827] transition-colors w-full border ${
                            isDark ? 'bg-white/[0.03] border-white/[0.1] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={verifyCodeMutation.isPending || otpInput.length < 6}
                        className="w-full bg-[#F2D827] hover:bg-[#E5A900] disabled:opacity-50 text-slate-950 font-bold px-5 py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        {verifyCodeMutation.isPending && (
                          <VeriAgentLogoMark size={16} speed="fast" withSquircle={false} glow={false} />
                        )}
                        Confirm & Link
                      </button>

                      <button
                        type="button"
                        onClick={() => { setLinkStep('handle'); setOtpInput(''); }}
                        className={`w-full text-xs underline underline-offset-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                      >
                        Wrong account? Use a different username
                      </button>
                    </form>
                  )}

                  {linkStep === 'deeplink' && (
                    <>
                      {/* Reached when we have never spoken to this account:
                          Telegram refuses a bot's first message, so there is
                          nowhere to send a code yet. Opening the bot both
                          starts that conversation and redeems the code. */}
                      <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {claimedHandle.trim()} has not messaged the bot yet, so we cannot send a
                        code there. Open Telegram once and the link completes itself.
                      </p>

                      {deepLink && (
                        <a
                          href={deepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setTimeout(() => refetchLinkedAccounts(), 1500)}
                          className="w-full bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold px-5 py-3 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Open Telegram to finish
                        </a>
                      )}

                      <details className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <summary className="cursor-pointer select-none">Prefer to do it manually?</summary>
                        <p className="mt-2 font-mono select-all break-all">{instructions}</p>
                      </details>
                    </>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveModalPlatform(null)}
                      className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        isDark ? 'border-white/10 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
