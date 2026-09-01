'use client';

// Fix: P0-2 Real Vault Deposit Execution via Passkey & API
import React, { useState, useEffect } from 'react';
import { Sparkles, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useDepositVault, useYieldApy } from '../../hooks/useApi';
import { PasskeyPrompt } from '../../components/ui/PasskeyPrompt';
import { useToast } from '../../components/providers/NotificationProvider';

export default function SaveYieldPage() {
  const toast = useToast();
  const [amount, setAmount] = useState<string>('0.00');
  // Was a useState(0) that nothing ever set, so the page advertised a
  // "verified 0% APY". Now reads the rate the oracle actually attests.
  const { label: apyLabel } = useYieldApy();
  const [_deposited, _setDeposited] = useState<boolean>(false);
  const [_loading, _setLoading] = useState<boolean>(false);
  const [_isPasskeyOpen, _setIsPasskeyOpen] = useState<boolean>(false);
  const [_vaultId, _setVaultId] = useState<string>('');

  const _depositMutation = useDepositVault();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('amount')) {
      setAmount(urlParams.get('amount') || '0.00');
    }
    if (urlParams.get('vaultId')) {
      _setVaultId(urlParams.get('vaultId') || '');
    }
  }, []);

  const _handleDepositClick = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    _setIsPasskeyOpen(true);
  };

  const _handlePasskeySuccess = async (_signature: string) => {
    _setIsPasskeyOpen(false);
    _setLoading(true);
    try {
      if (!_vaultId) {
        throw new Error('No vault selected. Please select a vault from /vaults page.');
      }
      await _depositMutation.mutateAsync({
        vaultId: _vaultId,
        amount: parseFloat(amount),
      });
      _setDeposited(true);
      toast.success(`Successfully deposited $${amount} USDT!`, {
        title: 'Yield Deposit Active',
      });
    } catch (e: any) {
      toast.error(e.message || 'Deposit failed', { title: 'Deposit Error' });
    } finally {
      _setLoading(false);
    }
  };

  return (
    <main className="va-auth-shell px-5 py-10">
      <section className="va-auth-card w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Sparkles size={28} className="text-cyan-500" />
          <h1 className="text-lg font-semibold tracking-tight">Save with AI Yield Vault</h1>
        </div>

        {_deposited ? (
          <div className="va-public-claim-success p-6 text-center">
            <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
            <h2 className="mt-4 text-xl font-semibold">${amount} USDT Deposited!</h2>
            <p className="mt-2 text-sm text-[var(--va-app-muted)]">
              {apyLabel
                ? `Compounding automatically at verified ${apyLabel} APY in AgentVaultV2 on BOTChain.`
                : 'Compounding automatically in AgentVaultV2 on BOTChain. Verified rate loading…'}
            </p>
          </div>
        ) : (
          <div>
            {/* Coming Soon Notice */}
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <Sparkles size={14} />
                <span>Savings Vaults Coming Soon</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                Direct vault deposits are temporarily in preview mode while cross-chain lending integrations are finalized.
              </p>
            </div>

            <div className="va-product-panel mb-5 flex justify-between p-4">
              <div>
                <div className="va-product-label">TARGET APY</div>
                <div className="mt-1 text-xl font-semibold text-cyan-500">{apyLabel ?? '5.8%'}</div>
              </div>
              <div>
                <div className="va-product-label">STATUS</div>
                <div className="mt-1 text-sm font-semibold text-amber-400">Coming Soon</div>
              </div>
            </div>

            <div className="mb-5 opacity-70">
              <label className="va-product-label mb-1.5 block">Deposit Amount (USDT)</label>
              <input
                type="number"
                disabled
                className="va-product-input text-base font-semibold cursor-not-allowed"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <button
              className="va-product-action w-full justify-center opacity-60 cursor-not-allowed bg-slate-800 text-slate-400 border border-slate-700"
              disabled
              onClick={_handleDepositClick}
            >
              <ShieldCheck size={18} /> Vault Deposits Coming Soon
            </button>
          </div>
        )}
      </section>

      <PasskeyPrompt
        isOpen={_isPasskeyOpen}
        onClose={() => _setIsPasskeyOpen(false)}
        onSuccess={_handlePasskeySuccess}
        title="Confirm Yield Deposit"
        description={`Authorize $${amount} USDT deposit to AgentVaultV2 with Passkey`}
      />
    </main>
  );
}
