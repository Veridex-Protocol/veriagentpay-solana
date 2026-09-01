'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppLayout } from '../../../components/layout/AppLayout';
import { Bell, ArrowLeft, Users, TrendingUp, Sparkles, Award, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api';

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState({
    socialProof: true,
    spending: true,
    saving: true,
    virality: true,
    reputation: true,
    telegramNotifications: true,
    whatsappNotifications: true,
    discordNotifications: true,
    slackNotifications: true,
    webPushNotifications: true,
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    api.fetchNotificationPreferences().then((res) => {
      if (res?.preferences) {
        setPrefs(res.preferences);
      }
    });
  }, []);

  const handleToggle = (category: keyof typeof prefs) => {
    const updated = { ...prefs, [category]: !prefs[category] };
    setPrefs(updated);
    api.updateNotificationPreferences(updated).then(() => {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    });
  };

  const categories = [
    {
      key: 'socialProof' as const,
      title: 'Social Proof & FOMO',
      description: 'Friend joined prompts, contact badges earned, and trending APY yield vault alerts',
      icon: Users,
      color: 'text-purple-400',
      badge: 'Max 3/week',
    },
    {
      key: 'spending' as const,
      title: 'Spending Encouragement',
      description: 'Low balance fiat top-up alerts, pending payment requests, and recurring payment reminders',
      icon: Bell,
      color: 'text-emerald-400',
      badge: 'Max 2/day',
    },
    {
      key: 'saving' as const,
      title: 'Saving & AI Investment Nudges',
      description: 'Non-intrusive "Save with AI" after receiving funds, 1-hour streak saver warnings, and weekly APY yield summaries',
      icon: TrendingUp,
      color: 'text-amber-400',
      badge: 'Max 1/day',
    },
    {
      key: 'virality' as const,
      title: 'Virality & Referral Milestones',
      description: 'Double referral reward events (2x VERI), red envelope claim notifications, and milestone unlocks',
      icon: Sparkles,
      color: 'text-sky-400',
      badge: 'Max 1/month',
    },
    {
      key: 'reputation' as const,
      title: 'Reputation & Group Lending',
      description: 'Loan on-time repayment confirmations and group pool voting notifications',
      icon: Award,
      color: 'text-indigo-400',
      badge: 'Max 2/day',
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/settings"
              className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
                <Bell className="w-6 h-6 text-purple-400" />
                <span>Behavioral Notification Settings</span>
              </h1>
              <p className="text-xs text-slate-400">Permission-based categories with daily/weekly frequency caps</p>
            </div>
          </div>

          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center space-x-1 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Preferences Saved</span>
            </span>
          )}
        </div>

        {/* Platform Toggles */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <Bell className="w-4 h-4 text-emerald-500" />
            <span>Notification Platforms</span>
          </h3>
          <p className="text-xs text-slate-400">
            Choose which platforms can send you notifications
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'telegramNotifications', label: 'Telegram', icon: '✈️' },
              { key: 'whatsappNotifications', label: 'WhatsApp', icon: '💬' },
              { key: 'discordNotifications', label: 'Discord', icon: '🎮' },
              { key: 'slackNotifications', label: 'Slack', icon: '💼' },
              { key: 'webPushNotifications', label: 'Web Push', icon: '🌐' },
            ].map((platform) => {
              const isEnabled = prefs[platform.key as keyof typeof prefs];
              return (
                <div
                  key={platform.key}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-emerald-500/30 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{platform.icon}</span>
                    <span className="text-sm font-bold text-white">{platform.label}</span>
                  </div>
                  <button
                    onClick={() => handleToggle(platform.key as keyof typeof prefs)}
                    className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
                      isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        isEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Categories List */}
        <div className="space-y-3">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isEnabled = prefs[cat.key];
            return (
              <div
                key={cat.key}
                className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex items-center justify-between transition shadow-md hover:border-slate-700"
              >
                <div className="flex items-start space-x-4 max-w-lg">
                  <div className={`p-3 rounded-xl bg-slate-950 border border-slate-800 ${cat.color} shrink-0 mt-0.5`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-white text-sm">{cat.title}</h4>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {cat.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{cat.description}</p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={() => handleToggle(cat.key)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${isEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
