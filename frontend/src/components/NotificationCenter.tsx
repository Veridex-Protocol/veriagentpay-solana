'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Send, TrendingUp, ShieldCheck, Sparkles, Inbox, X } from 'lucide-react';
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '../hooks/use-notifications';
import { useTheme } from './providers/ThemeProvider';

export const NotificationCenter: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: rawNotifications } = useNotifications();
  const notifications = Array.isArray(rawNotifications) ? rawNotifications : [];
  const { data: unreadCount = 0 } = useUnreadCount();
  const markReadMutation = useMarkRead();
  const markAllReadMutation = useMarkAllRead();

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredNotifications = notifications.filter((item: any) =>
    activeTab === 'unread' ? !item.read : true
  );

  const handleItemClick = (id: string, isRead: boolean) => {
    if (!isRead) {
      markReadMutation.mutate(id);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'TRANSACTION_RECEIVED':
      case 'TRANSACTION_SENT':
        return <Send className="w-4 h-4 text-[#F2D827]" />;
      case 'YIELD_EARNED':
        return <TrendingUp className="w-4 h-4 text-[#F2D827]" />;
      case 'SYSTEM':
        return <ShieldCheck className="w-4 h-4 text-[#F2D827]" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#F2D827]" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* BELL TRIGGER BUTTON */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-xl border transition-colors relative ${isDark
          ? 'bg-slate-950 border-white/[0.08] text-slate-300 hover:text-white hover:border-[#F2D827]/40'
          : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-950 hover:border-slate-300'
          }`}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-[#F2D827] text-gray-950 font-mono text-[10px] font-bold rounded-full shadow-md">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* DROPDOWN CONTAINER */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl border shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] backdrop-blur-xl transition-colors duration-200 ${isDark
              ? 'bg-[#070A11]/95 border-white/[0.08] text-slate-100'
              : 'bg-white border-slate-200 text-slate-950 shadow-slate-200/60'
              }`}
          >
            {/* DROPDOWN HEADER */}
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-white/[0.08] bg-slate-950/60' : 'border-slate-200 bg-slate-50'
              }`}>
              <div className="flex items-center gap-2">
                <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F2D827]/10 text-[#F2D827] border border-[#F2D827]/20 font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-xs text-[#F2D827] hover:underline font-mono font-semibold flex items-center gap-1"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Read All
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className={`p-1 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className={`flex border-b px-4 pt-2 gap-4 text-xs font-mono font-semibold ${isDark ? 'border-white/[0.08] bg-slate-950/40 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}>
              <button
                onClick={() => setActiveTab('all')}
                className={`pb-2 border-b-2 transition-colors ${activeTab === 'all'
                  ? 'border-[#F2D827] text-[#F2D827] font-bold'
                  : 'border-transparent hover:text-slate-950 dark:hover:text-white'
                  }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setActiveTab('unread')}
                className={`pb-2 border-b-2 transition-colors ${activeTab === 'unread'
                  ? 'border-[#F2D827] text-[#F2D827] font-bold'
                  : 'border-transparent hover:text-slate-950 dark:hover:text-white'
                  }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* NOTIFICATIONS LIST */}
            <div className={`overflow-y-auto divide-y p-2 flex-1 space-y-1 ${isDark ? 'divide-white/[0.05]' : 'divide-slate-200'
              }`}>
              {filteredNotifications.length > 0 ? (
                filteredNotifications.map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.id, item.read)}
                    className={`p-3 rounded-xl transition-all cursor-pointer flex items-start gap-3 border ${!item.read
                      ? isDark
                        ? 'bg-slate-950 border-[#F2D827]/30'
                        : 'bg-amber-50/70 border-[#F2D827]/40'
                      : isDark
                        ? 'bg-transparent border-transparent hover:bg-white/[0.03] opacity-80'
                        : 'bg-transparent border-transparent hover:bg-slate-100 opacity-80'
                      }`}
                  >
                    <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-white border-slate-200'
                      }`}>
                      {getIconForType(item.type)}
                    </div>

                    <div className="flex-1 space-y-0.5 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{item.title}</span>
                        {!item.read && (
                          <span className="w-2 h-2 rounded-full bg-[#F2D827] animate-pulse" />
                        )}
                      </div>
                      <p className={`text-xs leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{item.body}</p>
                      <span className={`text-[10px] block pt-1 font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Inbox className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No notifications found</p>
                </div>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
