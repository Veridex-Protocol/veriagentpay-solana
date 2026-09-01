import { Injectable, Logger } from '@nestjs/common';
import { NlpService } from '../nlp/nlp.service';
import { resolveToken, TokenInfo, DEFAULT_TOKEN_SYMBOL } from '../config/tokens.config';

export type CommandIntent =
  | 'START'
  | 'HELP'
  | 'PAY'
  | 'REQUEST'
  | 'REQUESTS_MENU'
  | 'SAVE'
  | 'ENVELOPE'
  | 'ENVELOPES_MENU'
  | 'VAULTS_MENU'
  | 'POOLS_MENU'
  | 'POOL_INVITE'
  | 'POOL_JOIN'
  | 'POOL_DEPOSIT'
  | 'POOL_REQUEST'
  | 'SPLIT'
  | 'SPLITS_MENU'
  | 'REFERRAL'
  | 'SUBSCRIBE'
  | 'WALLET'
  | 'DASHBOARD'
  | 'BALANCE'
  | 'CONTACTS'
  | 'HISTORY'
  | 'LEADERBOARD'
  | 'BADGES'
  | 'INVITE'
  | 'STATS'
  | 'PENDING'
  | 'CANCEL'
  | 'ADMIN_STATS'
  | 'ADMIN_INSIGHTS'
  | 'ADMIN_ALERT'
  | 'ADMIN_ADD'
  | 'VERIFY'
  | 'MENU'
  | 'TOKENS'
  | 'ADD_TOKEN'
  | 'REMOVE_TOKEN'
  | 'UNKNOWN';

export interface CommandParams {
  amount?: number;
  tokenSymbol?: string;
  tokenInfo?: TokenInfo | null;
  unsupportedToken?: string;
  /** Contract address for the token watch-list commands. */
  tokenAddress?: string;
  recipient?: string;
  participants?: string[];
  memo?: string;
  claimsCount?: number;
  intervalDays?: number;
  poolName?: string;
  poolId?: string;
  members?: string[];
  /** Short-link code, e.g. the escrow being cancelled. */
  code?: string;
  adminArgs?: any;
}

export interface ParsedCommand {
  intent: CommandIntent;
  params: CommandParams;
  confidence: number;
  source: 'nlp' | 'regex';
  parseTimeMs: number;
}

@Injectable()
export class CommandParserService {
  private readonly logger = new Logger(CommandParserService.name);

  // Pre-compiled regular expressions initialized once for zero-allocation regex evaluation
  // Enhanced regex patterns to support:
  // - 0x EVM wallet addresses (42 chars including 0x prefix)
  // - @username handles (social platform handles)
  // - Phone numbers (+1234567890 or variations)
  // - Natural language variations (send X to Y, pay Y X amount)
  private readonly regexPayPattern = /(?:send|pay|transfer)\s+(?:(?:\$|€|£)?(\d+(?:\.\d+)?)\s*([A-Za-z]+)?|([A-Za-z]+)?\s*(?:\$|€|£)?(\d+(?:\.\d+)?))\s+(?:to\s+)?(0x[a-fA-F0-9]{40}|@?[\w\.]+|\+?\d[\d\s\-\(\)]{6,})(?:\s+for\s+(.+))?/i;
  private readonly regexRequestPattern = /(?:request|ask)\s+(?:(?:\$|€|£)?(\d+(?:\.\d+)?)\s*([A-Za-z]+)?|([A-Za-z]+)?\s*(?:\$|€|£)?(\d+(?:\.\d+)?))\s+(?:from\s+)?(0x[a-fA-F0-9]{40}|@?[\w\.]+|\+?\d[\d\s\-\(\)]{6,})(?:\s+for\s+(.+))?/i;
  private readonly regexSavePattern = /(?:save|deposit|compound)\s+\$?(\d+(?:\.\d+)?)/i;
  private readonly regexSplitPattern = /split\s+(?:the\s+)?\$?(\d+(?:\.\d+)?)\s+(?:bill\s+)?with\s+((?:@?\w+[\s,a-z]*)+)/i;
  private readonly regexVerifyPattern = /(?:\/verify|verify)\s+(\d+)/i;
  private readonly regexWalletAddress = /0x[a-fA-F0-9]{40}/;

  constructor(private readonly nlpService: NlpService) {}

  /**
   * Unified message parser: regex fast-path for deterministic commands,
   * NLP for natural language. Every message gets a fair chance at both.
   */
  async parseCommand(text: string, platformContext?: { platform?: string; username?: string }): Promise<ParsedCommand> {
    const startNs = process.hrtime.bigint();
    if (!text || !text.trim()) {
      return { intent: 'UNKNOWN', params: {}, confidence: 0, source: 'regex', parseTimeMs: 0 };
    }

    const trimmed = text.trim();

    // 1. FAST-PATH: Deterministic regex for slash commands and structured patterns (<1ms)
    const regexResult = this.parseRegex(trimmed);
    if (regexResult.intent !== 'UNKNOWN') {
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      return {
        intent: regexResult.intent,
        params: regexResult.params,
        confidence: 1.0,
        source: 'regex',
        parseTimeMs: elapsedMs,
      };
    }

    // 2. NLP-PATH: Gemini agent for natural language understanding
    try {
      const nlpResult = await Promise.race([
        this.nlpService.parseIntent(trimmed),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;

      if (
        nlpResult &&
        nlpResult.intent &&
        nlpResult.intent !== 'unknown' &&
        nlpResult.securityCheck?.allowed !== false &&
        (nlpResult.securityCheck?.confidence ?? 0.85) >= 0.6
      ) {
        const mappedIntent = this.mapNlpIntentToAction(nlpResult.intent);
        if (mappedIntent !== 'UNKNOWN') {
          const rawTokenStr = (nlpResult.params?.token || DEFAULT_TOKEN_SYMBOL).toUpperCase();
          const tokenInfo = resolveToken(rawTokenStr);

          return {
            intent: mappedIntent,
            params: {
              amount: nlpResult.params?.amount,
              tokenSymbol: tokenInfo?.symbol || rawTokenStr,
              tokenInfo,
              unsupportedToken: !tokenInfo ? rawTokenStr : undefined,
              recipient: nlpResult.params?.recipient,
              memo: nlpResult.params?.note,
              claimsCount: nlpResult.params?.numRecipients || 5,
              intervalDays: nlpResult.params?.intervalDays || 30,
              participants: nlpResult.params?.participants || [],
              poolName: nlpResult.params?.poolName,
            },
            confidence: nlpResult.securityCheck?.confidence || 0.85,
            source: 'nlp',
            parseTimeMs: elapsedMs,
          };
        }
      }
    } catch (e: any) {
      this.logger.warn(`NLP parse failed (falling through gracefully): ${e.message}`);
    }

    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    return {
      intent: 'UNKNOWN',
      params: {},
      confidence: 0,
      source: 'regex',
      parseTimeMs: elapsedMs,
    };
  }

  private mapNlpIntentToAction(nlpIntent: string): CommandIntent {
    switch (nlpIntent.toLowerCase()) {
      case 'send':
      case 'pay':
      case 'transfer':
        return 'PAY';
      case 'request':
      case 'ask':
        return 'REQUEST';
      case 'split':
        return 'SPLIT';
      case 'envelope':
      case 'red_envelope':
        return 'ENVELOPE';
      case 'save':
      case 'deposit':
        return 'SAVE';
      case 'subscribe':
      case 'recurring':
        return 'SUBSCRIBE';
      case 'pool':
      case 'pools':
        return 'POOLS_MENU';
      case 'wallet':
      case 'account':
      case 'address':
        return 'WALLET';
      case 'balance':
      case 'check_balance':
        return 'BALANCE';
      case 'contacts':
      case 'payees':
        return 'CONTACTS';
      case 'leaderboard':
      case 'rankings':
        return 'LEADERBOARD';
      case 'badges':
      case 'achievements':
        return 'BADGES';
      case 'referral':
      case 'invite':
        return 'INVITE';
      case 'stats':
        return 'STATS';
      case 'pending':
        return 'PENDING';
      case 'cancel':
        return 'CANCEL';
      case 'help':
        return 'HELP';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Deterministic compiled regex parser (<1ms execution time)
   */
  public parseRegex(text: string): { intent: CommandIntent; params: CommandParams } {
    const tokens = text.split(/\s+/);
    const first = tokens[0].toLowerCase().split('@')[0];
    const fullLower = text.trim().toLowerCase();

    // --- TIER 0 INSTANT COMMANDS ---
    if (first === '/start') return { intent: 'START', params: {} };
    if (first === '/help' || fullLower === 'ℹ️ help' || first === 'help') return { intent: 'HELP', params: {} };
    if (first === '/wallet' || fullLower === '💳 wallet') return { intent: 'WALLET', params: {} };
    if (first === '/dashboard' || fullLower === 'dashboard' || fullLower === '🖥️ dashboard') return { intent: 'DASHBOARD', params: {} };
    if (first === '/balance') return { intent: 'BALANCE', params: {} };
    if (first === '/contacts' || fullLower === 'contacts' || fullLower === 'my contacts') return { intent: 'CONTACTS', params: {} };
    if (first === '/history' || first === '/activity' || first === '/transactions' || first === '/tx' || fullLower === '📜 history' || fullLower === '📜 activity' || fullLower === 'transactions' || fullLower === 'my activity') return { intent: 'HISTORY', params: {} };
    if (first === '/referral' || first === '/invite' || fullLower === '🎁 refer & earn') return { intent: 'INVITE', params: {} };
    if (first === '/leaderboard' || fullLower === '🏆 leaderboard') return { intent: 'LEADERBOARD', params: {} };
    if (first === '/badges' || fullLower === '🎖️ badges') return { intent: 'BADGES', params: {} };
    if (first === '/stats') return { intent: 'STATS', params: {} };

    // Token watch list. Address-only by design: a symbol cannot identify a
    // contract, and accepting one here is how a user ends up watching a
    // lookalike. `/tokens` lists what they already have.
    if (first === '/tokens' || fullLower === '🪙 tokens') return { intent: 'TOKENS', params: {} };
    if (first === '/addtoken' || first === '/watchtoken') {
      return { intent: 'ADD_TOKEN', params: { tokenAddress: tokens[1] } };
    }
    if (first === '/removetoken' || first === '/unwatchtoken') {
      return { intent: 'REMOVE_TOKEN', params: { tokenAddress: tokens[1] } };
    }

    // Outstanding escrows the sender can still pull back.
    if (first === '/pending' || fullLower === '⏳ pending' || fullLower === 'pending payments') {
      return { intent: 'PENDING', params: {} };
    }
    // `/cancel <code>` — bare `/cancel` falls through to the list so the user
    // is shown which codes exist rather than an error.
    if (first === '/cancel') {
      const code = tokens[1]?.trim();
      return code ? { intent: 'CANCEL', params: { code } } : { intent: 'PENDING', params: {} };
    }
    // Keyboard buttons and bare menu slash commands
    if (fullLower === '💸 send') return { intent: 'PAY', params: {} };
    if (first === '/requests' || fullLower === '📥 requests' || fullLower === '📥 request') return { intent: 'REQUESTS_MENU', params: {} };
    if (first === '/splits' || fullLower === '📊 splits' || fullLower === '📊 split') return { intent: 'SPLITS_MENU', params: {} };
    if (first === '/envelopes' || fullLower === '🧧 envelopes' || fullLower === '🧧 red envelope') return { intent: 'ENVELOPES_MENU', params: {} };
    if (first === '/pools' || first === '/pool' || fullLower === '👥 pools' || fullLower === '🏦 group pools') return { intent: 'POOLS_MENU', params: {} };

    // /pool invite <poolId> @user1,@user2,@user3
    if (first === '/pool' && tokens[1] === 'invite' && tokens[2]) {
      const poolId = tokens[2];
      const members = tokens.slice(3).join(' ').split(',').map(m => m.trim()).filter(m => m.length > 0);
      return {
        intent: 'POOL_INVITE',
        params: { poolId, members },
      };
    }

    // /pool join <poolId>
    if (first === '/pool' && tokens[1] === 'join' && tokens[2]) {
      return {
        intent: 'POOL_JOIN',
        params: { poolId: tokens[2] },
      };
    }

    // /pool deposit <poolId> <amount> [token]
    if (first === '/pool' && tokens[1] === 'deposit' && tokens[2] && tokens[3]) {
      const poolId = tokens[2];
      const amount = parseFloat(tokens[3]);
      const tokenSymbol = tokens[4] || DEFAULT_TOKEN_SYMBOL;
      const tokenInfo = resolveToken(tokenSymbol);
      return {
        intent: 'POOL_DEPOSIT',
        params: { poolId, amount, tokenSymbol: tokenInfo?.symbol || tokenSymbol, tokenInfo },
      };
    }

    // /pool request <poolId> <amount> [purpose]
    if (first === '/pool' && tokens[1] === 'request' && tokens[2] && tokens[3]) {
      const poolId = tokens[2];
      const amount = parseFloat(tokens[3]);
      const purpose = tokens.slice(4).join(' ') || undefined;
      return {
        intent: 'POOL_REQUEST',
        params: { poolId, amount, memo: purpose },
      };
    }

    if (first === '/menu' || fullLower === '📑 menu') return { intent: 'MENU', params: {} };
    if (fullLower === '🏦 vaults' || fullLower === '🎯 save ai') return { intent: 'VAULTS_MENU', params: {} };

    // --- TIER 1 STRUCTURED SLASH COMMANDS ---
    if (first === '/pay') {
      const amount = parseFloat(tokens[1]);
      let tokenSymbol = DEFAULT_TOKEN_SYMBOL;
      let recipient = tokens[2];
      let memoIndex = 3;

      const maybeToken = resolveToken(tokens[2]);
      if (maybeToken) {
        tokenSymbol = tokens[2];
        recipient = tokens[3];
        memoIndex = 4;
      }

      const tokenInfo = resolveToken(tokenSymbol);
      return {
        intent: 'PAY',
        params: {
          amount,
          tokenSymbol: tokenInfo?.symbol || tokenSymbol,
          tokenInfo,
          unsupportedToken: !tokenInfo ? tokenSymbol : undefined,
          recipient,
          memo: tokens.slice(memoIndex).join(' '),
        },
      };
    }

    if (first === '/request') {
      const amount = parseFloat(tokens[1]);
      let tokenSymbol = DEFAULT_TOKEN_SYMBOL;
      let recipient = tokens[2];

      // Check if token is specified (e.g., /request 50 USDT @user)
      const maybeToken = resolveToken(tokens[2]);
      if (maybeToken) {
        tokenSymbol = tokens[2];
        recipient = tokens[3];
      }

      // Handle "from @user" format (e.g., /request 50 USDT from @user)
      if (tokens[3] && tokens[3].toLowerCase() === 'from' && tokens[4]) {
        recipient = tokens[4];
      }

      const tokenInfo = resolveToken(tokenSymbol);
      return {
        intent: 'REQUEST',
        params: {
          amount,
          tokenSymbol: tokenInfo?.symbol || tokenSymbol,
          tokenInfo,
          unsupportedToken: !tokenInfo ? tokenSymbol : undefined,
          recipient,
        },
      };
    }
    if (first === '/save') {
      return { intent: 'SAVE', params: { amount: parseFloat(tokens[1] || '100') } };
    }
    if (first === '/envelope') {
      return { intent: 'ENVELOPE', params: { amount: parseFloat(tokens[1] || '50'), claimsCount: parseInt(tokens[2] || '5') } };
    }
    if (first === '/split') {
      const amount = parseFloat(tokens[1]);
      let tokenSymbol = DEFAULT_TOKEN_SYMBOL;
      let participantStartIndex = 2;

      if (tokens[2]) {
        const maybeToken = resolveToken(tokens[2]);
        if (maybeToken) {
          tokenSymbol = maybeToken.symbol;
          participantStartIndex = 3;
        }
      }

      const rawParticipants = tokens.slice(participantStartIndex);
      const participants = rawParticipants
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const tokenInfo = resolveToken(tokenSymbol);
      return {
        intent: 'SPLIT',
        params: {
          amount,
          tokenSymbol: tokenInfo?.symbol || tokenSymbol,
          tokenInfo,
          participants,
        },
      };
    }
    if (first === '/subscribe') {
      return {
        intent: 'SUBSCRIBE',
        params: { amount: parseFloat(tokens[1]), recipient: tokens[2], intervalDays: parseInt(tokens[3] || '30') },
      };
    }

    // --- ADMIN & VERIFICATION SLASH COMMANDS ---
    if (first === '/admin') {
      const sub = tokens[1]?.toLowerCase();
      if (sub === 'stats') return { intent: 'ADMIN_STATS', params: {} };
      if (sub === 'insights') return { intent: 'ADMIN_INSIGHTS', params: {} };
      if (sub === 'alert') return { intent: 'ADMIN_ALERT', params: { adminArgs: tokens.slice(2).join(' ') } };
      if (sub === 'whitelist' && tokens[2]?.toLowerCase() === 'add') {
        return { intent: 'ADMIN_ADD', params: { adminArgs: { platform: tokens[3], value: tokens[4] } } };
      }
      return { intent: 'ADMIN_STATS', params: {} };
    }

    const verifyMatch = text.match(this.regexVerifyPattern);
    if (verifyMatch) {
      return { intent: 'VERIFY', params: { adminArgs: verifyMatch[1] } };
    }

    // --- STRUCTURED NATURAL PATTERN MATCHES ---
    const payMatch = text.match(this.regexPayPattern);
    if (payMatch) {
      // Handle both "send 50 USDT to X" and "send USDT 50 to X" patterns
      const amount = parseFloat(payMatch[1] || payMatch[4]);
      let rawToken = payMatch[2] || payMatch[3];
      let recipient = payMatch[5];
      const memo = payMatch[6];

      // Validate amount is a valid number
      if (isNaN(amount)) {
        return { intent: 'UNKNOWN', params: {} };
      }

      // Check if rawToken is actually a recipient (e.g., "to" or "from")
      if (rawToken && (rawToken.toLowerCase() === 'to' || rawToken.toLowerCase() === 'for')) {
        recipient = rawToken.toLowerCase() === 'to' ? recipient : rawToken;
        rawToken = DEFAULT_TOKEN_SYMBOL;
      }

      const parsedTokenStr = rawToken ? rawToken.toUpperCase() : DEFAULT_TOKEN_SYMBOL;
      const tokenInfo = resolveToken(parsedTokenStr);

      return {
        intent: 'PAY',
        params: {
          amount,
          tokenSymbol: tokenInfo?.symbol || parsedTokenStr,
          tokenInfo,
          unsupportedToken: !tokenInfo ? parsedTokenStr : undefined,
          recipient,
          memo,
        },
      };
    }

    const requestMatch = text.match(this.regexRequestPattern);
    if (requestMatch) {
      // Handle both "request 50 USDT from X" and "request USDT 50 from X" patterns
      const amount = parseFloat(requestMatch[1] || requestMatch[4]);
      let rawToken = requestMatch[2] || requestMatch[3];
      let recipient = requestMatch[5];
      const memo = requestMatch[6];

      // Validate amount is a valid number
      if (isNaN(amount)) {
        return { intent: 'UNKNOWN', params: {} };
      }

      // Check if rawToken is actually a recipient (e.g., "from" or "for")
      if (rawToken && (rawToken.toLowerCase() === 'from' || rawToken.toLowerCase() === 'for')) {
        recipient = rawToken.toLowerCase() === 'from' ? recipient : rawToken;
        rawToken = DEFAULT_TOKEN_SYMBOL;
      }

      const parsedTokenStr = rawToken ? rawToken.toUpperCase() : DEFAULT_TOKEN_SYMBOL;
      const tokenInfo = resolveToken(parsedTokenStr);

      return {
        intent: 'REQUEST',
        params: {
          amount,
          tokenSymbol: tokenInfo?.symbol || parsedTokenStr,
          tokenInfo,
          unsupportedToken: !tokenInfo ? parsedTokenStr : undefined,
          recipient,
          memo,
        },
      };
    }

    const saveMatch = text.match(this.regexSavePattern);
    if (saveMatch) {
      return { intent: 'SAVE', params: { amount: parseFloat(saveMatch[1]) } };
    }

    const splitMatch = text.match(this.regexSplitPattern);
    if (splitMatch) {
      return {
        intent: 'SPLIT',
        params: {
          amount: parseFloat(splitMatch[1]),
          participants: splitMatch[2].split(/[\s,and]+/).filter((h) => h.length > 0),
        },
      };
    }

    // --- CONVERSATIONAL PATTERNS (no NLP needed) ---
    if (/^(what('?s| is) my (balance|funds)|how much (do i have|money)|check (my )?(balance|funds))/i.test(fullLower)) {
      return { intent: 'BALANCE', params: {} };
    }
    if (/^(show|what('?s| is)) my (wallet|address|account)/i.test(fullLower)) {
      return { intent: 'WALLET', params: {} };
    }
    if (/^(show|view|my) (contacts|payees)/i.test(fullLower)) {
      return { intent: 'CONTACTS', params: {} };
    }
    if (/^(show|view) (leaderboard|rankings)/i.test(fullLower)) {
      return { intent: 'LEADERBOARD', params: {} };
    }
    if (/^(show|view|my) (badges|achievements)/i.test(fullLower)) {
      return { intent: 'BADGES', params: {} };
    }
    if (/^(show|get|my) (invite|referral|invite link)/i.test(fullLower)) {
      return { intent: 'INVITE', params: {} };
    }
    if (/^(show|view|my) (stats|statistics)/i.test(fullLower)) {
      return { intent: 'STATS', params: {} };
    }
    if (/^(what can you do|how does this work|help me|what are the commands)/i.test(fullLower)) {
      return { intent: 'HELP', params: {} };
    }

    return { intent: 'UNKNOWN', params: {} };
  }
}
