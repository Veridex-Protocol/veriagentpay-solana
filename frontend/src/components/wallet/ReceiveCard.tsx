'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  CheckCircle2,
  AlertCircle,
  QrCode,
  ExternalLink,
  Info,
} from 'lucide-react';
import { api, ApiError, AUTH_REQUIRED_MESSAGE } from '../../lib/api';
import { VeriAgentLoader } from '../ui/VeriAgentLoader';

interface DepositAddress {
  address: string;
  chainRef?: string;
  chainId: number;
  network: string;
  isDeployed: boolean;
  supportedTokens: Array<{ symbol: string; name: string; icon: string }>;
  paymentUri: string;
  qrDataUri: string | null;
  explorerUrl: string;
}

/**
 * Shows the user's smart-account address so anyone can fund it from an external
 * wallet (Phantom, Solflare, Backpack, or another Solana wallet).
 *
 * The address is a deterministic PDA. Funding is allowed before initialization;
 * the passkey remains the only authority that can initialize and spend it.
 */
export const ReceiveCard: React.FC = () => {
  const [data, setData] = useState<DepositAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.fetchDepositAddress());
    } catch (err: any) {
      setError(err instanceof ApiError && err.status === 401
        ? AUTH_REQUIRED_MESSAGE
        : err?.message || 'Could not load your deposit address.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = async () => {
    if (!data?.address) return;
    await navigator.clipboard.writeText(data.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="va-product-surface flex items-center justify-center p-8">
        <VeriAgentLoader
          variant="inline"
          text="Generating deposit address"
          speed="fast"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-300">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span className="flex-1">{error}</span>
        <button
          onClick={load}
          className="rounded-lg border border-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-900/40"
        >
          Retry
        </button>
      </div>
    );
  }

  const tokenList = data.supportedTokens.map((t) => t.symbol).join(', ');

  return (
    <div className="va-product-surface space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="va-product-section-title text-base">Add funds</h3>
          <p className="mt-0.5 text-xs text-[var(--va-app-muted)]">
            Send {tokenList || 'supported tokens'} to this address from any wallet.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-300 dark:border-white/[0.1] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-slate-800 dark:text-slate-200">
          {data.network}
        </span>
      </div>

      {/* Address */}
      <div className="flex items-stretch gap-2">
        <div className="va-product-subtle min-w-0 flex-1 px-3.5 py-3">
          <p className="va-product-label mb-0.5 font-mono text-[10px]">
            Your address
          </p>
          <p className="break-all font-mono text-xs font-bold text-slate-950 dark:text-white">{data.address}</p>
        </div>
        <button
          onClick={handleCopy}
          aria-label="Copy deposit address"
          className="flex w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 transition hover:bg-slate-800 dark:hover:bg-slate-100 shadow-sm"
        >
          {copied ? <CheckCircle2 className="h-5 w-5 text-white dark:text-slate-950" /> : <Copy className="h-5 w-5 text-white dark:text-slate-950" />}
        </button>
        <button
          onClick={() => setShowQr((v) => !v)}
          aria-label="Show QR code"
          aria-pressed={showQr}
          className={`flex w-12 shrink-0 items-center justify-center rounded-xl border transition ${
            showQr
              ? 'border-slate-950 dark:border-white bg-slate-950 dark:bg-white text-white dark:text-slate-950'
              : 'border-[var(--va-app-line)] bg-[var(--va-app-soft)] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
          }`}
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>

      {showQr && data.qrDataUri && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUri}
            alt={`QR code for deposit address ${data.address}`}
            className="h-48 w-48"
          />
          <p className="text-[11px] text-slate-600">Scan with any wallet app</p>
        </div>
      )}

      {/* Network warning: wrong-network sends are the most common way funds are lost. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-200/90">
          Only send native USDC on <strong>{data.network}</strong>
          {data.chainRef ? ` (${data.chainRef})` : ''}. Tokens sent
          on another network cannot be recovered.
          {!data.isDeployed && (
            <>
              {' '}
              Your account activates automatically on first use: it can receive funds right now.
            </>
          )}
        </p>
      </div>

      <a
        href={data.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--va-app-muted)] transition hover:text-[#F2D827]"
      >
        <span>View on explorer</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
};
