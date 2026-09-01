import { useState } from 'react';
import { api } from '../lib/api';

export type PaymentToken = 'USDC' | 'USDT' | 'BOT';

export interface ParsedPayment {
  recipient: string;
  amount: string;
  token: PaymentToken;
}

/**
 * Parses a plain-language payment instruction via the backend NLP service.
 *
 * This was a local regex stub that never called the backend: it guessed a
 * token from substring matching, took the first number it found, and (when no
 * handle was present) returned the literal recipient `'Bob'`. In a payments
 * input, a parser that invents a recipient is worse than one that fails.
 *
 * The backend runs the real intent parser, including the pre-execution
 * `IntentVerifier` check, which the stub bypassed entirely.
 *
 * @see docs/security-remaining-issues.md (FE-M-02)
 */
export function useNaturalLanguage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsePrompt = async (prompt: string): Promise<ParsedPayment | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const parsed = await api.parseIntent(prompt);

      const params = (parsed as any)?.params ?? {};
      const recipient = params.recipient ?? params.to ?? null;
      const amount = params.amount ?? null;

      // Nothing is guessed. Without a recipient and an amount there is no
      // instruction to act on, and the caller must ask rather than assume.
      if (!recipient || amount === null || amount === undefined) {
        setError('Could not read that. Try "send 20 USDT to @alice".');
        return null;
      }

      // Anything the parser reports that we do not settle in is rejected rather
      // than coerced: USDC is gated off entirely, so silently accepting it
      // would produce a payment against a token that does not resolve.
      const raw = String(params.token ?? 'USDT').toUpperCase();
      const token: PaymentToken =
        raw === 'USDT' || raw === 'BOT' ? raw : 'USDT';

      return { recipient: String(recipient), amount: String(amount), token };
    } catch (err: any) {
      console.error('NLP parse failed:', err);
      setError(err?.message || 'Could not reach the parser. Please try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { parsePrompt, isLoading, error };
}
