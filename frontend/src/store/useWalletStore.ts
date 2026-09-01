import { create } from 'zustand';

export interface WalletState {
  address: string | null;
  token: string | null; // JWT Bearer Token
  balances: Record<string, string>;
  telegramUser: { id: number; username?: string; first_name?: string } | null;
  hideBalances: boolean;
  passkeyRegistered: boolean;
  authRequired: boolean;
  /** True once the current browser has checked its HttpOnly passkey session. */
  authChecked: boolean;
  biometricOverride: boolean; // Always require biometrics even if valid session key exists
  selectedToken: 'USDC';
  
  // Actions
  setAddress: (address: string | null) => void;
  setToken: (token: string | null) => void;
  setBalances: (balances: Record<string, string>) => void;
  setTelegramUser: (user: any) => void;
  toggleHideBalances: () => void;
  setPasskeyRegistered: (registered: boolean) => void;
  setAuthRequired: (required: boolean) => void;
  setAuthChecked: (checked: boolean) => void;
  setBiometricOverride: (override: boolean) => void;
  setSelectedToken: (token: 'USDC') => void;
}

const getLocalItem = (key: string): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem(key) : null;

export const useWalletStore = create<WalletState>((set) => ({
  // Hydrate from localStorage so navigating between pages doesn't lose state
  address: getLocalItem('veriagent_wallet_address'),
  // Access tokens live only in memory. The durable session is an HttpOnly
  // refresh cookie that JavaScript cannot read (SEC-038).
  token: null,
  balances: {},
  telegramUser: null,
  hideBalances: false,
  passkeyRegistered: getLocalItem('veriagent_passkey_registered') === 'true',
  authRequired: false,
  authChecked: false,
  biometricOverride: false,
  selectedToken: 'USDC',

  setAddress: (address) => {
    if (typeof window !== 'undefined') {
      if (address) localStorage.setItem('veriagent_wallet_address', address);
      else localStorage.removeItem('veriagent_wallet_address');
    }
    set({ address });
  },
  setToken: (token) => {
    set({ token });
  },
  setBalances: (balances) => set({ balances }),
  setTelegramUser: (telegramUser) => set({ telegramUser }),
  toggleHideBalances: () => set((state) => ({ hideBalances: !state.hideBalances })),
  setPasskeyRegistered: (passkeyRegistered) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('veriagent_passkey_registered', String(passkeyRegistered));
    }
    set({ passkeyRegistered });
  },
  setAuthRequired: (authRequired) => set({ authRequired }),
  setAuthChecked: (authChecked) => set({ authChecked }),
  setBiometricOverride: (biometricOverride) => set({ biometricOverride }),
  setSelectedToken: (selectedToken) => set({ selectedToken }),
}));
