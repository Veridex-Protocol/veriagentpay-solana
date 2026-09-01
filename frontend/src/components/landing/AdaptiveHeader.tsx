'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  Fingerprint,
  Menu,
  MessageCircle,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { OfficialWordmark } from '../ui/OfficialBrand';

export function Wordmark() {
  return <OfficialWordmark className="vf-wordmark" width={174} />;
}

export function AdaptiveHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Personal');

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const personalTriggerRef = useRef<HTMLButtonElement>(null);
  const megaPanelRef = useRef<HTMLDivElement>(null);

  // Scroll direction hiding & header background transition
  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setHasScrolled(currentScrollY > 40);

      // Hide on scroll down past threshold, show immediately on scroll up
      if (currentScrollY > 100 && currentScrollY > lastScrollY + 6) {
        setHidden(true);
        setPersonalOpen(false);
      } else if (currentScrollY < lastScrollY - 4) {
        setHidden(false);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Section observer to adapt header foreground color (white vs dark ink)
  useEffect(() => {
    const updateHeaderTheme = () => {
      const headerTop = 36; // Midpoint of header
      const elements = document.querySelectorAll('.vf-light-band, .vf-trust, .vf-dark-band, .vf-hero, .vf-final');

      for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect();
        if (rect.top <= headerTop && rect.bottom >= headerTop) {
          if (elements[i].classList.contains('vf-light-band') || elements[i].classList.contains('vf-trust')) {
            setThemeMode('light');
          } else {
            setThemeMode('dark');
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', updateHeaderTheme, { passive: true });
    updateHeaderTheme();
    return () => window.removeEventListener('scroll', updateHeaderTheme);
  }, []);

  // Close mega menu on click outside or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (personalOpen) {
          setPersonalOpen(false);
          personalTriggerRef.current?.focus();
        }
        if (mobileOpen) {
          setMobileOpen(false);
          menuButtonRef.current?.focus();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        megaPanelRef.current &&
        !megaPanelRef.current.contains(e.target as Node) &&
        personalTriggerRef.current &&
        !personalTriggerRef.current.contains(e.target as Node)
      ) {
        setPersonalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [personalOpen, mobileOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  // Personal dropdown items
  const personalItems = [
    { label: 'Send & Request', desc: 'Instant stablecoin messaging', href: '/send', icon: CircleDollarSign },
    { label: 'AI Savings', desc: 'Automated yield strategies · Coming Soon', href: '/vaults', icon: Sparkles },
    { label: 'Group Pools', desc: 'Shared goals & crowd pools', href: '/pools', icon: Users },
    { label: 'Red Envelopes', desc: 'Social claimable gifts', href: '/envelopes', icon: MessageCircle },
    { label: 'Payment Links', desc: 'Reusable checkout links', href: '/pay', icon: WalletCards },
    { label: 'Passkey Wallet', desc: 'Biometric security settings', href: '/settings/security', icon: Fingerprint },
    { label: 'Security', desc: 'Inspectable execution rules', href: '#security', icon: ShieldCheck },
    { label: 'Integrations', desc: 'Telegram, WhatsApp, Slack', href: '#integrations', icon: Network },
  ];

  const categories = ['Personal', 'Businesses', 'Developers', 'Security', 'About'];

  return (
    <header
      className={`vf-header ${hidden ? 'vf-header-hidden' : ''} ${
        themeMode === 'light' ? 'vf-header-light-fg' : 'vf-header-dark-fg'
      } ${hasScrolled ? 'vf-header-scrolled' : ''}`}
    >
      <nav className="vf-nav" aria-label="Primary navigation">
        <Link href="/" className="vf-brand">
          <Wordmark />
        </Link>

        {/* Desktop Nav Links */}
        <div className="vf-navlinks" role="menubar">
          <button
            ref={personalTriggerRef}
            aria-expanded={personalOpen}
            aria-controls="personal-mega-panel"
            aria-haspopup="true"
            className={`vf-nav-link ${personalOpen ? 'active' : ''}`}
            onClick={() => setPersonalOpen(v => !v)}
            role="menuitem"
          >
            Personal <ChevronDown size={14} className={`vf-chevron ${personalOpen ? 'open' : ''}`} />
          </button>
          <a href="#flow" className="vf-nav-link" role="menuitem">How it works</a>
          <a href="#savings" className="vf-nav-link" role="menuitem">Savings</a>
          <a href="#social" className="vf-nav-link" role="menuitem">Social money</a>
          <a href="#security" className="vf-nav-link" role="menuitem">Security</a>
        </div>

        {/* Actions */}
        <div className="vf-navactions">
          <Link href="/login" className="vf-login-link">
            Log in
          </Link>
          <Link href="/auth" className="vf-pill vf-pill-primary">
            Open VeriAgent Pay
          </Link>
        </div>

        {/* Mobile Menu Trigger */}
        <button
          ref={menuButtonRef}
          className="vf-menu-button"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Contextual Mega Panel for Personal */}
        <AnimatePresence>
          {personalOpen && (
            <motion.div
              ref={megaPanelRef}
              id="personal-mega-panel"
              className="vf-mega-panel"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              role="menu"
              aria-label="Personal features"
            >
              <div className="vf-mega-header">
                <span>Personal financial suite</span>
              </div>
              <div className="vf-mega-grid">
                {personalItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="vf-mega-item"
                      role="menuitem"
                      onClick={() => setPersonalOpen(false)}
                    >
                      <div className="vf-mega-icon">
                        <Icon size={18} />
                      </div>
                      <div>
                        <b>{item.label}</b>
                        <small>{item.desc}</small>
                      </div>
                      <ArrowRight size={14} className="vf-mega-arrow" />
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Full-Height Navigation Drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id="mobile-nav-panel"
              className="vf-mobile-menu"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation menu"
            >
              <div className="vf-mobile-header">
                <Wordmark />
                <button
                  aria-label="Close navigation menu"
                  onClick={() => {
                    setMobileOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                >
                  <X size={24} />
                </button>
              </div>

              {/* Horizontally scrollable top category rail */}
              <div className="vf-mobile-rail" role="tablist" aria-label="Menu categories">
                {categories.map(cat => (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={activeCategory === cat}
                    className={`vf-mobile-rail-item ${activeCategory === cat ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="vf-mobile-body">
                <nav className="vf-mobile-nav-links" aria-label="Mobile navigation links">
                  <a href="#flow" onClick={() => setMobileOpen(false)}>How it works</a>
                  <a href="#savings" onClick={() => setMobileOpen(false)}>Savings automation</a>
                  <a href="#social" onClick={() => setMobileOpen(false)}>Social money</a>
                  <a href="#security" onClick={() => setMobileOpen(false)}>Passkey security</a>
                  <Link href="/send" onClick={() => setMobileOpen(false)}>Send & Request</Link>
                  <Link href="/pools" onClick={() => setMobileOpen(false)}>Group Pools</Link>
                  <Link href="/vaults" onClick={() => setMobileOpen(false)}>AI Savings</Link>
                  <Link href="/login" onClick={() => setMobileOpen(false)}>Log in</Link>
                </nav>
              </div>

              <div className="vf-mobile-footer">
                <Link
                  href="/auth"
                  className="vf-pill vf-pill-primary vf-mobile-cta"
                  onClick={() => setMobileOpen(false)}
                >
                  Open VeriAgent Pay <ArrowRight size={18} />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
