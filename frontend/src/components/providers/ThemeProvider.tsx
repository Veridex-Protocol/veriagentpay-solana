'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Keep the server and first client render identical. RootLayout applies the
  // saved class before paint; this state synchronizes immediately after mount.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    // The pre-hydration script in RootLayout has already applied this class,
    // preventing a bright/dark flash. Synchronize React with that value and
    // follow system preference only while the user has no saved choice.
    const savedTheme = localStorage.getItem('veriagent-theme') as Theme | null;
    const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setThemeState(initialTheme);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(initialTheme);

    if (savedTheme) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemTheme = (event: MediaQueryListEvent) => {
      const nextTheme: Theme = event.matches ? 'light' : 'dark';
      setThemeState(nextTheme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(nextTheme);
    };
    media.addEventListener?.('change', handleSystemTheme);
    return () => media.removeEventListener?.('change', handleSystemTheme);
  }, []);

  // React owns the <html> element while this provider owns theme state. Keep
  // them synchronized after hydration as well as during user toggles.
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('veriagent-theme', newTheme);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(newTheme);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div className={`theme-root ${theme} ${pathname === '/' ? 'contents' : 'va-app-root'}`} data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'dark' as Theme,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
