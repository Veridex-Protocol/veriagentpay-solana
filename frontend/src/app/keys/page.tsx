'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useWalletStore } from '../../store/useWalletStore';
import { usePasskey } from '../../hooks/usePasskey';
import { authenticateWithPasskey } from '../../lib/veridex';
import { useSessionKeys, useDeleteSessionKey } from '../../hooks/useApi';
import { refreshCallPolicyWithPasskey } from '../../lib/passkey-actions';
import { grantSessionKeyWithPasskey } from '../../lib/passkey-actions';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Key, ShieldCheck, Plus, Trash2, Clock, DollarSign, Fingerprint, Lock, LogIn, PlusCircle } from 'lucide-react';
import { useToast, useConfirm } from '../../components/providers/NotificationProvider';

export default function SessionKeysPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();
  const confirm = useConfirm();
  const { address, passkeyRegistered, setPasskeyRegistered, biometricOverride, setBiometricOverride, setToken, setAddress, authRequired } = useWalletStore();
  const { registerPasskey } = usePasskey();

  const { data: keysData, isLoading, isError: keysLoadFailed, refetch: refetchKeys } = useSessionKeys();
  const [isGranting, setIsGranting] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState('');
  const [grantError, setGrantError] = useState('');
  const deleteKeyMutation = useDeleteSessionKey();

  // Compute synchronously on every render pass so it is active immediately
  const isWalletActive = Boolean(
    address ||
    passkeyRegistered ||
    (keysData && keysData.length > 0) ||
    (typeof window !== 'undefined' && (localStorage.getItem('veriagent_wallet_address') || localStorage.getItem('veriagent_passkey_registered') === 'true'))
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasWallet = localStorage.getItem('veriagent_wallet_address');
      const hasPasskeyFlag = localStorage.getItem('veriagent_passkey_registered') === 'true';

      if ((hasWallet || hasPasskeyFlag || address) && !passkeyRegistered) {
        setPasskeyRegistered(true);
      }
    }
  }, [address, passkeyRegistered, setPasskeyRegistered]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [durationHours, setDurationHours] = useState('24');
  const [spendingCap, setSpendingCap] = useState('50');
  const [keyLabel, setKeyLabel] = useState('');

  // Auto-open modal if ?mint=true query param is present.
  const handledMintLink = useRef(false);
  useEffect(() => {
    if (handledMintLink.current || typeof window === 'undefined') return;
    handledMintLink.current = true;
    if (new URLSearchParams(window.location.search).get('mint') === 'true') {
      setIsCreateModalOpen(true);
    }
  }, []);

  const sessionKeys = keysData || [];

  const handleSignInExistingPasskey = async () => {
    try {
      const session = await authenticateWithPasskey();
      if (session.accessToken) setToken(session.accessToken);
      if (session.walletAddress) setAddress(session.walletAddress);
      setPasskeyRegistered(true);
      toast.success('Signed in with passkey successfully!');
      await refetchKeys();
    } catch (err: any) {
      toast.error(err.message || 'Passkey sign-in failed', { title: 'Sign-in Error' });
    }
  };

  const handleGenerateNewPasskey = async () => {
    try {
      await registerPasskey('user');
      setPasskeyRegistered(true);
      toast.success('New device passkey generated successfully!', {
        title: 'Passkey Registered',
      });
    } catch (err: any) {
      toast.error(err.message || 'Passkey registration failed', {
        title: 'Registration Error',
      });
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreateModalOpen(false);
    await executeMintSessionKey();
  };

  /**
   * Grant a session key, authorized by the user's passkey and registered
   * on-chain.
   *
   * The grant is an on-chain `registerSession` call the *user* authorizes. The
   * relayer used to make it, which meant a delegated authority could mint
   * itself more delegated authority: that path is now blocked in the vault, so
   * this is the only way a session key becomes usable.
   *
   * The key stays inert until the grant lands: the backend records it but will
   * not select it for payments until the transaction confirms.
   */
  const executeMintSessionKey = async () => {
    setGrantError('');
    setIsGranting(true);
    try {
      const hours = Number(durationHours);
      const cap = Number(spendingCap);

      if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(cap) || cap <= 0) {
        throw new Error('Enter a valid duration and spending limit.');
      }

      await grantSessionKeyWithPasskey({
        durationHours: hours,
        // The single value shown in this form is the exact limit stored and
        // displayed. Never silently multiply a security limit after consent.
        perTxLimitUSD: cap,
        dailyLimitUSD: cap,
      });

      setKeyLabel('');
      await refetchKeys();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.message?.includes('cancelled')) {
        setGrantError('Passkey authorization was cancelled.');
      } else {
        setGrantError(err?.message || 'Could not create the session key. Please try again.');
      }
      console.error('Create session key failed:', err);
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    const ok = await confirm({
      title: 'Revoke Session Key',
      message: 'Are you sure you want to revoke this session key?',
      description: 'The key will be removed immediately and any automated delegation disabled.',
      confirmText: 'Revoke Key',
      cancelText: 'Keep Active',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteKeyMutation.mutateAsync(id);
      toast.success('Session key revoked successfully.');
    } catch (err: any) {
      console.error('Revoke session key failed:', err);
      toast.error(err?.message || 'Failed to revoke session key');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* PASSKEY REGISTRATION STATUS CARD */}
        <Card glow className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F2D827]/15 text-[#F2D827] border border-[#F2D827]/30 flex items-center justify-center">
              <Fingerprint className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">WebAuthn Passkey Status</h2>
                <Badge variant={isWalletActive ? 'yellow' : 'red'}>
                  {isWalletActive ? 'Active Wallet' : 'Not Enrolled'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                P-256 credential protected by your selected device or password manager.
              </p>
            </div>
          </div>

          {isWalletActive ? (
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-[#F2D827]/10 border border-[#F2D827]/30 text-[#F2D827] text-xs font-mono font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Passkey Connected & Session Active</span>
              </div>
              <button
                onClick={handleGenerateNewPasskey}
                className="text-xs text-slate-400 hover:text-white font-mono underline transition"
              >
                + Add Secondary Passkey
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSignInExistingPasskey}
                leftIcon={<LogIn className="w-4 h-4" />}
              >
                Sign In with Existing Passkey
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateNewPasskey}
                leftIcon={<PlusCircle className="w-4 h-4" />}
              >
                Enroll New Passkey
              </Button>
            </div>
          )}

          {isGranting && (
            <p className="mt-3 text-xs font-mono text-blue-400">
              Waiting for the session key to be registered on-chain…
            </p>
          )}
          {grantError && (
            <p className="mt-3 text-xs font-mono text-red-400">{grantError}</p>
          )}
        </Card>

        {/* BIOMETRIC OVERRIDE TOGGLE */}
        <Card className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-[#F2D827]" />
            <div>
              <h4 className="text-sm font-bold text-white">Always Require Biometrics</h4>
              <p className="text-xs text-slate-400">
                If enabled, even valid temporary session keys will require a TouchID/FaceID prompt.
              </p>
            </div>
          </div>

          <button
            onClick={() => setBiometricOverride(!biometricOverride)}
            className={`w-12 h-6 rounded-full transition-colors relative ${biometricOverride ? 'bg-[#F2D827]' : 'bg-slate-800'
              }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${biometricOverride ? 'left-6' : 'left-0.5'
                }`}
            />
          </button>
        </Card>

        {/*
          Contract permissions.

          A vault's contract allowlist is stamped in at creation and the factory
          has no setter, so a vault made before a protocol contract moved keeps
          refusing the new address: group-pool actions fail with a bare revert
          and no way for the user to know why. This re-stamps it with the
          current addresses. It needs the passkey because the vault blocks every
          other path from reaching the spending module, which is what stops a
          leaked session key widening its own reach.
        */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white">Contract Permissions</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                Your wallet keeps a list of the contracts it is allowed to call. If group pool
                actions fail unexpectedly, this re-authorizes that list against the current
                contracts. Requires your passkey.
              </p>
              {policyMessage && (
                <p
                  className={`text-xs mt-2 font-mono ${
                    policyMessage.startsWith('Authorized') ? 'text-[#F2D827]' : 'text-red-400'
                  }`}
                >
                  {policyMessage}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              disabled={policyBusy}
              onClick={async () => {
                setPolicyBusy(true);
                setPolicyMessage('');
                try {
                  const result = await refreshCallPolicyWithPasskey();
                  setPolicyMessage(`Authorized. Tx ${result.txHash.slice(0, 10)}…`);
                } catch (err: any) {
                  setPolicyMessage(err?.message || 'Could not re-authorize. Please try again.');
                } finally {
                  setPolicyBusy(false);
                }
              }}
            >
              {policyBusy ? 'Authorizing…' : 'Re-authorize'}
            </Button>
          </div>
        </Card>

        {/* SESSION KEYS SECTION */}
        <section className="space-y-4">
          <Card className="p-4 border border-amber-400/20 bg-amber-400/5 text-xs text-slate-300 leading-relaxed">
            New accounts start with a $100 daily session-key limit as a safety measure. To increase it, revoke the existing key below, then enroll a new session key with your preferred daily and per-payment limits. Revoking a key immediately stops it from authorizing new payments.
          </Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-[#F2D827]" /> Active Session Keys
              </h3>
              <p className="text-xs text-slate-400">
                Grant scoped micro-permissions for frictionless social bot transactions.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              Mint Session Key
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          ) : keysLoadFailed || authRequired ? (
            <Card className="p-8 text-center space-y-4">
              <p className="text-sm text-slate-400">
                Authenticate with your passkey to load and manage your active session keys.
              </p>
              <Button onClick={handleSignInExistingPasskey} leftIcon={<LogIn className="w-4 h-4" />}>
                Authenticate with Passkey
              </Button>
            </Card>
          ) : sessionKeys.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessionKeys.map((key: any) => (
                <Card key={key.id} className="p-5 space-y-4 border border-white/5">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">{key.label || `Session Key (${key.id})`}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {key.id}</span>
                    </div>
                    <Badge variant="yellow" size="sm">
                      Active
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> Duration
                      </span>
                      <span suppressHydrationWarning className="font-mono font-bold text-white">
                        {(() => {
                          const mins = key.durationMinutes ?? (key.expiryAt && key.createdAt ? Math.round((new Date(key.expiryAt).getTime() - new Date(key.createdAt).getTime()) / 60000) : 0);
                          if (!mins || mins <= 0) return 'Active';
                          const roundedMins = Math.round(mins);
                          if (roundedMins >= 1440 && roundedMins % 1440 === 0) {
                            return `${roundedMins / 1440}d`;
                          }
                          const h = Math.floor(roundedMins / 60);
                          const m = roundedMins % 60;
                          return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
                        })()}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                      <span className="text-slate-400 flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-[#F2D827]" /> Daily Limit
                      </span>
                      <span suppressHydrationWarning className="font-mono font-bold text-[#F2D827]">
                        ${Number(key.dailyLimitUSD ?? key.perTxLimitUSD ?? key.maxValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-slate-400">Scoped BOT permissions active</span>
                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-slate-400 text-sm">
              No active session keys. Create one to enable instant bot actions!
            </Card>
          )}
        </section>

        {/* MINT SESSION KEY MODAL */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Mint Temporary Session Key"
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <Input
              label="Key Label / Description"
              placeholder="e.g. Telegram Bot Auto Pay"
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
            />

            <div className="space-y-2">
              <label className={`text-xs font-semibold uppercase tracking-wider block ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>Duration Limit</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { hours: '1', label: '1h' },
                  { hours: '6', label: '6h' },
                  { hours: '12', label: '12h' },
                  { hours: '24', label: '24h' },
                  { hours: '168', label: '7d' },
                  { hours: '720', label: '30d' },
                ].map(({ hours, label }) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setDurationHours(hours)}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                      durationHours === hours
                        ? 'bg-[#F2D827] text-slate-950 border-[#F2D827] shadow-sm'
                        : isDark
                          ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                Longer sessions keep the same daily spending limit and can be revoked at any time.
              </p>
            </div>

            <Input
              label="Daily Spending Limit (USD)"
              type="number"
              min="0.01"
              step="0.01"
              value={spendingCap}
              onChange={(e) => setSpendingCap(e.target.value)}
            />

            <div className="pt-2 flex gap-3">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                Authorize with Passkey
              </Button>
            </div>
          </form>
        </Modal>

      </div>
    </AppLayout>
  );
}
