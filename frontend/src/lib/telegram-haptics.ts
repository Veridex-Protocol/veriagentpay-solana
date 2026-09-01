/**
 * Utility helper to trigger Telegram Mini App native haptic feedback
 */
export function triggerTelegramHaptic(type: 'success' | 'warning' | 'error' | 'impact') {
  if (typeof window !== 'undefined') {
    const webApp = (window as any).Telegram?.WebApp;

    // Telegram introduced HapticFeedback in Mini App API 6.1. Older clients
    // expose the object from telegram-web-app.js but only log a warning when
    // its methods are called.
    if (!webApp?.HapticFeedback || !webApp.isVersionAtLeast?.('6.1')) return;

    const haptic = webApp.HapticFeedback;
    if (type === 'success' || type === 'warning' || type === 'error') {
      haptic.notificationOccurred(type);
    } else {
      haptic.impactOccurred('medium');
    }
  }
}
