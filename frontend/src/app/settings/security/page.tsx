'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppLayout } from '../../../components/layout/AppLayout';
import { ShieldCheck, ArrowLeft, Fingerprint } from 'lucide-react';
import { useTheme } from '../../../components/providers/ThemeProvider';
import { useToast } from '../../../components/providers/NotificationProvider';

export default function SecuritySettingsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();

  const [requireBiometricsAlways, setRequireBiometricsAlways] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiBase}/api/settings/security`);
      const data = await res.json();
      setRequireBiometricsAlways(data.requireBiometricsAlways);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const newValue = !requireBiometricsAlways;
    setSaving(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${apiBase}/api/settings/security`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireBiometricsAlways: newValue }),
      });
      setRequireBiometricsAlways(newValue);
      toast.success(newValue ? 'Strict biometric enforcement enabled.' : 'Biometric fallback enabled.');
    } catch (err) {
      console.error('Failed to update setting:', err);
      toast.error('Failed to update setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className={`p-2 rounded-xl border transition ${
                isDark
                  ? 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1
                className={`text-2xl font-extrabold tracking-tight flex items-center gap-2 ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                <span>Security Settings</span>
              </h1>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage passkey and transaction security preferences
              </p>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div
          className={`rounded-2xl border p-6 space-y-6 shadow-xl transition-colors ${
            isDark
              ? 'bg-slate-950 border-white/[0.08]'
              : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          {/* Always Require Biometrics Setting */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                  <Fingerprint className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="space-y-1">
                  <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                    Always Require Biometrics
                  </h3>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    If enabled, every transaction will require Touch ID / Face ID verification, even if you have a
                    valid temporary session key. This setting is synced across all your devices.
                  </p>
                  <div
                    className={`mt-3 p-3 rounded-xl border text-xs ${
                      isDark
                        ? 'bg-slate-900/60 border-white/[0.05] text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="font-semibold">Note:</span> When OFF, small transactions within your session key
                    limits can be approved instantly without biometric prompts.
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={handleToggle}
                disabled={loading || saving}
                className={`relative w-14 h-8 rounded-full transition-all shrink-0 ${
                  requireBiometricsAlways ? 'bg-emerald-500' : 'bg-slate-700'
                } ${(loading || saving) && 'opacity-50 cursor-not-allowed'}`}
              >
                <div
                  className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform shadow-md ${
                    requireBiometricsAlways ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Status Indicator */}
            {!loading && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono ${
                  requireBiometricsAlways
                    ? isDark
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : isDark
                    ? 'bg-slate-900 border-white/[0.05] text-slate-400'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <span className="font-bold">
                    {requireBiometricsAlways ? '🔒 Enhanced Security Active' : '⚡ Fast Payments Enabled'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Security Info */}
        <div
          className={`rounded-2xl border p-5 text-xs ${
            isDark
              ? 'bg-slate-950/60 border-white/[0.05] text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <h4 className={`font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
            🛡️ How Session Keys Work
          </h4>
          <ul className="space-y-1 list-disc list-inside">
            <li>Session keys allow instant approvals for small transactions</li>
            <li>They have daily spending limits and per-transaction limits</li>
            <li>Session keys expire after a set period (default: 7 days)</li>
            <li>You can revoke session keys anytime from Session Manager</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
