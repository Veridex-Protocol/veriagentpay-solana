import { usePlatformStore } from '../store/usePlatformStore';

export function usePlatform() {
  const platform = usePlatformStore((state) => state.platform);
  const isInIframe = usePlatformStore((state) => state.isInIframe);

  return {
    platform,
    isTelegram: platform === 'telegram',
    isWhatsApp: platform === 'whatsapp',
    isDiscord: platform === 'discord',
    isWeb: platform === 'web',
    isInIframe,
  };
}
