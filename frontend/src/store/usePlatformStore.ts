import { create } from 'zustand';

export type PlatformType = 'telegram' | 'whatsapp' | 'discord' | 'web';

export interface PlatformState {
  platform: PlatformType;
  isInIframe: boolean;
  safeAreaTop: number;
  safeAreaBottom: number;

  setPlatform: (platform: PlatformType) => void;
  setIsInIframe: (inIframe: boolean) => void;
  setSafeArea: (top: number, bottom: number) => void;
}

export const usePlatformStore = create<PlatformState>((set) => ({
  platform: 'web',
  isInIframe: false,
  safeAreaTop: 0,
  safeAreaBottom: 0,

  setPlatform: (platform) => set({ platform }),
  setIsInIframe: (isInIframe) => set({ isInIframe }),
  setSafeArea: (safeAreaTop, safeAreaBottom) => set({ safeAreaTop, safeAreaBottom }),
}));
