/**
 * Injection tokens and narrow interfaces for services that depend on each other.
 *
 * Why this exists
 *
 *   `BadgesService` and `ReferralService` each need one method from the other:
 *   awarding a badge when a referral stage completes, and issuing a referral
 *   code when a badge page renders. Expressed as direct imports that is a
 *   module cycle, and `forwardRef` does not fix it — `forwardRef(() => X)`
 *   defers the *DI* reference, but TypeScript's `emitDecoratorMetadata` also
 *   writes a `design:paramtypes` entry naming the class, and that reference is
 *   evaluated the moment the decorator runs. Whichever module loaded second
 *   then threw `Cannot access 'X' before initialization`, which took down any
 *   spec that imported either service.
 *
 *   Depending on a token and an interface declared here removes the cycle
 *   outright: this file imports nothing, so neither service reaches the other
 *   at module scope. The interfaces are deliberately narrow — one method each,
 *   the only one actually called — so the coupling is visible rather than
 *   implied by a whole class.
 *
 *   Providers are registered under these tokens with `useExisting`, so there is
 *   still exactly one instance of each service.
 */

/** Resolves to {@link BadgeAwarder}. */
export const BADGES_SERVICE = 'BADGES_SERVICE';

/** Resolves to {@link ReferralCodeIssuer}. */
export const REFERRAL_SERVICE = 'REFERRAL_SERVICE';

/** The slice of `BadgesService` that `ReferralService` uses. */
export interface BadgeAwarder {
  checkAndAwardBadges(userId: string): Promise<string[]>;
}

/** The slice of `ReferralService` that `BadgesService` uses. */
export interface ReferralCodeIssuer {
  getOrCreateReferralCode(userId: string): Promise<string>;
  /**
   * Every surface that renders an invite must build its URL here rather than
   * concatenating one, so a share card, the referral page and a bot reply all
   * point at the same landing route for the same code.
   */
  buildShareUrl(code: string, src: string, campaign?: string): string;
}

/** Resolves to {@link HandleResolver}. */
export const IDENTITY_SERVICE = 'IDENTITY_SERVICE';

/**
 * The slice of `IdentityService` that `ActivityService` uses.
 *
 * @dev Same cycle as the pair above, for the same reason: the two services
 *      import each other, and `forwardRef` cannot defer the `design:paramtypes`
 *      reference that TypeScript emits alongside the decorator.
 */
export interface HandleResolver {
  getHandleForAddress(address: string): Promise<string | null>;
}

/** Resolves to {@link TokenResolver}. */
export const USER_TOKENS_SERVICE = 'USER_TOKENS_SERVICE';

/**
 * The slice of `UserTokensService` that transaction services need.
 *
 * @dev Consumed through a token so callers need no *value* import of the
 *      service. Several modules here import one another and lean on
 *      `forwardRef`, which does not defer the `design:paramtypes` reference —
 *      so adding an ordinary import to one of them reorders module evaluation
 *      and surfaces temporal-dead-zone errors in unrelated files. A type-only
 *      import plus a string token changes no ordering at all.
 */
export interface TokenResolver {
  resolveForUser(
    userId: string,
    reference?: string,
  ): Promise<{ token: { symbol: string; name: string; address: string; decimals: number; icon: string } | null; candidates: any[] }>;
}

/** Resolves to {@link UserNotifier}. */
export const NOTIFICATION_SERVICE = 'NOTIFICATION_SERVICE';

/**
 * The slice of `UnifiedNotificationService` that transaction services use.
 *
 * @dev `splits` -> `unified-notification` -> platform drivers -> `splits` is a
 *      module cycle. `forwardRef` defers the DI reference but not the
 *      `design:paramtypes` entry TypeScript emits next to the decorator, so the
 *      class evaluates as `undefined` depending on which module loads first.
 */
export interface UserNotifier {
  notifyUser(payload: any): Promise<any>;
}

/** Resolves to {@link NotificationStore}. */
export const NOTIFICATIONS_STORE = 'NOTIFICATIONS_STORE';

/**
 * The persistence side of notifications, as consumed by transaction services.
 *
 * @dev Separate from {@link UserNotifier}, which delivers to a chat platform.
 *      Both are reached through tokens for the same reason: their concrete
 *      classes sit in module cycles that `forwardRef` cannot break, because the
 *      `design:paramtypes` metadata TypeScript emits alongside the decorator is
 *      evaluated eagerly.
 */
export interface NotificationStore {
  create(payload: any): Promise<any>;
  findAllForUser?(...args: any[]): Promise<any>;
  getUnreadCount?(...args: any[]): Promise<any>;
  markAsRead?(...args: any[]): Promise<any>;
  markAllAsRead?(...args: any[]): Promise<any>;
  getUserPreferences?(...args: any[]): Promise<any>;
  updateUserPreferences?(...args: any[]): Promise<any>;
}

/** Resolves to {@link PlatformMessenger}. */
export const PLATFORM_SERVICE = 'PLATFORM_SERVICE';

/**
 * The chat-facing surface of `PlatformService`, for consumers outside its own
 * module.
 *
 * @dev Deliberately loose. The point is not to describe the service precisely
 *      but to avoid a *value* import of it from modules it imports back —
 *      relayer, envelopes, and the crons all sit on the other side of that
 *      cycle. Members are optional so a consumer only depends on what it calls.
 */
export interface PlatformMessenger {
  sendDirectMessage?(...args: any[]): Promise<any>;
  handleSocialMessage?(...args: any[]): Promise<any>;
  registerDriver?(...args: any[]): any;
  generateSignedDeepLink?(...args: any[]): string;
  resolveCurrentUser?(...args: any[]): Promise<any>;
  getInteractiveActionService?(...args: any[]): any;
  [key: string]: any;
}
