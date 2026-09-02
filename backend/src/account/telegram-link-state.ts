export const TELEGRAM_LINK_TTL_SECONDS = 600;

export interface PendingTelegramLink {
  code: string;
  walletAddress: string | null;
  expiresAt: string;
}

export function normalizeTelegramUsername(username: string): string {
  return username.replace(/^@/, '').trim().toLowerCase();
}

export function pendingTelegramLinkKey(username: string): string {
  return `link-pending:telegram:${normalizeTelegramUsername(username)}`;
}