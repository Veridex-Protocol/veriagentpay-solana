import { BadRequestException, Inject, Injectable, Logger, Optional, UnauthorizedException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from './identity.service';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { decodeCredentialPublicKey } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RelayerService } from '../relayer/relayer.service';
import { CredentialVaultService } from './credential-vault.service';
import { TelegramBotDriver } from '../platform/drivers/telegram-bot';
import { getRpId } from '../config/app-url.config';
import { ReferralService } from '../referral/referral.service';
import { FunnelEventsService } from '../analytics/funnel-events.service';
import { BadgesService } from '../badges/badges.service';
import { DEEPLINK_SECRET, JWT_SECRET } from '../config/secrets';
import { webPlaceholderUsername, webPlatformId } from '../config/provisional-identity';
import { RedisService } from '../core/redis.service';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Caller-supplied registration parameters.
 *
 * Deliberately has no `userId`. The account a passkey is enrolled against is a
 * server-derived value — taken from a verified bearer token — and is passed
 * separately as `authenticatedUserId`. When it lived here, an unauthenticated
 * caller could set it in the request body and skip both the claim-code and
 * onboarding-link checks, enrolling their own passkey on any account and
 * receiving that account's access token in the response.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-002
 */
type RegistrationContext = {
  platform: 'telegram' | 'whatsapp' | 'slack' | 'discord' | 'web';
  platformId: string;
  chatId?: string;
  username: string;
  label?: string;
  expires?: string;
  sig?: string;
  claimCode?: string;
  /** Referral code carried through the entry link; not part of the HMAC. */
  referralCode?: string;
  /** Campaign attribution carried through the entry link. */
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
  /** Client-computed device fingerprint used to block self-referral rings. */
  deviceFingerprint?: string;
};

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    @Inject(forwardRef(() => RelayerService))
    private readonly relayerService: RelayerService,
    private readonly credentialVault: CredentialVaultService,
    @Inject(forwardRef(() => ReferralService))
    private readonly referralService: ReferralService,
    private readonly funnelEvents: FunnelEventsService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService: BadgesService,
    private readonly redis: RedisService,
    @Optional()
    @Inject(forwardRef(() => TelegramBotDriver))
    private readonly telegramBot?: TelegramBotDriver,
  ) {}

  private get rpId(): string {
    return getRpId();
  }

  private get origins(): string[] {
    const configured = process.env.WEBAUTHN_ORIGINS || process.env.APP_ORIGIN || `https://${this.rpId}`;
    return configured.split(',').map(value => value.trim()).filter(Boolean);
  }

  /**
   * Resolves the caller from a bearer token, or `undefined` when there is no
   * usable one.
   *
   * An unverifiable token yields `undefined` rather than throwing: endpoints
   * that require a session enforce that themselves, while registration has
   * legitimate anonymous entry paths (a claim code, a signed onboarding link)
   * that carry their own authorization. Throwing here meant a stale token left
   * in localStorage killed claim-and-onboard for a brand-new recipient before
   * their claim code was ever checked. An invalid token still grants nothing.
   */
  authenticateBearer(value?: string): string | undefined {
    if (!value?.startsWith('Bearer ')) return undefined;
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET environment variable is required');
    try {
      const payload = jwt.verify(value.slice(7), secret) as { userId?: string };
      return payload.userId;
    } catch {
      this.logger.debug('Ignoring unverifiable bearer token; continuing unauthenticated.');
      return undefined;
    }
  }

  private async issueSession(userId: string, walletAddress: string | null) {
    const jti = crypto.randomUUID();
    // `pkv` marks this token as backed by a completed WebAuthn ceremony. Only
    // tokens carrying it may skip a biometric re-prompt.
    const accessToken = jwt.sign({ userId, walletAddress, jti, pkv: true }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async saveChallenge(flow: 'registration' | 'authentication', challenge: string, context?: object, userId?: string) {
    try {
      await this.prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (e) {
      this.logger.warn(`Failed to clean up expired challenges: ${e}`);
    }
    return this.prisma.webAuthnChallenge.create({
      data: {
        flow,
        challenge,
        context: context as any,
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
  }

  private async consumeChallenge(id: string, flow: string) {
    const record = await this.prisma.webAuthnChallenge.findUnique({ where: { id } });
    if (!record || record.flow !== flow || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Passkey challenge is invalid, expired, or already used.');
    }
    const consumed = await this.prisma.webAuthnChallenge.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('Passkey challenge was already used.');
    return record;
  }

  /**
   * @param context             Caller-supplied parameters. Never carries identity.
   * @param authenticatedUserId The account to enrol against, derived from a
   *                            verified bearer token by the controller. When
   *                            absent, the caller must present an anonymous
   *                            authorization: a claim code, a signed onboarding
   *                            link, or — for self-serve web signup — nothing
   *                            at all, because the identity is minted here
   *                            rather than asserted by the caller.
   */
  async registrationOptions(context: RegistrationContext, authenticatedUserId?: string) {
    // Self-serve web signup: someone who reached the site directly, with no bot
    // deep link and no claim code. There is nothing to verify because there is
    // nothing being claimed — so the server mints the identity instead.
    //
    // Discarding the caller's `platformId` is the security property that makes
    // this safe without a signature. The threat the signed-link gate exists for
    // (SEC-002) is enrolling a passkey against an account that already exists;
    // a random `web:<uuid>` cannot name one. Anything the client sent here is
    // therefore ignored rather than trusted.
    const selfServeWeb =
      !authenticatedUserId && !context.claimCode && context.platform === 'web';
    if (selfServeWeb) {
      context.platformId = webPlatformId();
      context.username = webPlaceholderUsername();
    }

    if (!context.platformId || !context.username) {
      throw new BadRequestException('platformId and username are required');
    }
    if (!authenticatedUserId) {
      if (context.claimCode) {
        const link = await this.verifyClaimCode(context.claimCode);
        context.platformId = this.provisionalIdForClaim(context, link);
      } else if (!selfServeWeb) {
        this.verifyOnboardingLink(context);
      }
    }
    const options = await generateRegistrationOptions({
      rpName: 'VeriAgent Pay',
      rpID: this.rpId,
      userName: context.username,
      userDisplayName: context.username,
      timeout: CHALLENGE_TTL_MS,
      attestationType: 'none',
      supportedAlgorithmIDs: [-7],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
        // Allow both platform and cross-platform authenticators for passkey sync
        // undefined = allow both platform-bound (device-only) and roaming (synced via Google/iCloud)
        authenticatorAttachment: undefined,
      },
    });
    const challenge = await this.saveChallenge(
      'registration',
      options.challenge,
      context,
      authenticatedUserId,
    );
    return { challengeId: challenge.id, options };
  }

  /**
   * Refuses a registration that would leave an account with no recoverable
   * credential.
   *
   * @param authenticatedUserId The account being enrolled against, when known.
   *        Absent for a brand-new account, where the credential being
   *        registered is by definition the only one.
   * @param deviceType `multiDevice` when the authenticator reports the
   *        credential as backup-eligible (BE flag).
   *
   * @dev Enforcement is opt-out via `REQUIRE_RECOVERABLE_PASSKEY=false`, kept
   *      for local development against virtual authenticators that report
   *      `singleDevice`. It defaults to on: a wallet whose loss is
   *      unrecoverable should not be the accidental outcome of a missing
   *      environment variable.
   */
  private async assertAccountRemainsRecoverable(
    authenticatedUserId: string | undefined,
    deviceType: 'singleDevice' | 'multiDevice',
  ): Promise<void> {
    if (process.env.REQUIRE_RECOVERABLE_PASSKEY === 'false') return;
    if (deviceType === 'multiDevice') return;

    // Adding a device-bound credential is fine when the account already holds a
    // synced one — the hardware key becomes an addition, not the last resort.
    if (authenticatedUserId) {
      const backedUpCount = await this.prisma.passkeyCredential.count({
        where: {
          userId: authenticatedUserId,
          revokedAt: null,
          backedUp: true,
          credentialPublicKey: { not: null },
        },
      });
      if (backedUpCount > 0) return;
    }

    this.logger.warn(
      `Rejected device-bound passkey registration for ${
        authenticatedUserId ? `${authenticatedUserId.slice(0, 8)}…` : 'a new account'
      }: account would have no recoverable credential.`,
    );

    const error = new BadRequestException(
      'This passkey is stored only on this device, so losing the device would ' +
        'permanently lose access to your wallet. Turn on iCloud Keychain or ' +
        'Google Password Manager and try again.',
    );
    // The frontend branches on this to show setup instructions rather than a
    // generic failure.
    (error as any).code = 'PASSKEY_NOT_RECOVERABLE';
    throw error;
  }

  private async verifyClaimCode(code: string) {
    const link = await this.prisma.shortLink.findUnique({ where: { code } });
    if (!link) throw new UnauthorizedException('Invalid claim code.');
    if (link.status !== 'ACTIVE') throw new UnauthorizedException('Claim link is no longer active.');
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new UnauthorizedException('Claim link has expired.');
    }
    return link;
  }

  /**
   * A claim recipient usually arrives with no real platform id: the sender only
   * ever typed a handle, and the claim page opens in the device browser where
   * no platform SDK can supply one. Storing the handle in the id column would
   * strand the account — the bot looks users up by numeric id and would create
   * a second one, leaving the claimed funds unreachable.
   *
   * So an id that is really just the target handle gets parked under
   * `pending:<handle>`, which `IdentityService.resolveUser` adopts on the
   * owner's first authenticated contact. A genuine id is left untouched.
   */
  private provisionalIdForClaim(context: RegistrationContext, link: { targetUserId?: string | null }) {
    // These identifiers form a durable link between a public claim and the
    // bot's later platform callback. Do not normalize username case here.
    const supplied = context.platformId.replace(/^@/, '');
    const target = link.targetUserId?.replace(/^@/, '');
    const handle = context.username.replace(/^@/, '');

    const isHandleNotId = supplied === target || supplied === handle || supplied.startsWith('user_');
    if (!isHandleNotId) return context.platformId;

    return IdentityService.provisionalPlatformId(target || handle);
  }

  private verifyOnboardingLink(context: RegistrationContext) {
    const secret = process.env.DEEPLINK_SECRET || DEEPLINK_SECRET;
    if (!secret) throw new UnauthorizedException('DEEPLINK_SECRET is required for passkey onboarding');
    const expires = Number(context.expires);
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Onboarding link is invalid or expired. Request a new link from the bot.');
    }
    const params: Record<string, string> = {
      expires: String(context.expires),
      platform: context.platform,
      platformId: context.platformId,
      username: context.username,
    };
    if (context.chatId) params.chatId = context.chatId;
    const canonical = new URLSearchParams();
    Object.keys(params).sort().forEach(key => canonical.append(key, params[key]));
    const expected = crypto.createHmac('sha256', secret).update(canonical.toString()).digest('hex');
    const provided = context.sig || '';

    let isValid =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    // Backward-compatibility: if the link was generated with userId instead of platformId
    if (!isValid && context.platformId) {
      const altParams: Record<string, string> = {
        expires: String(context.expires),
        platform: context.platform,
        userId: context.platformId,
        username: context.username,
      };
      if (context.chatId) altParams.chatId = context.chatId;
      const altCanonical = new URLSearchParams();
      Object.keys(altParams).sort().forEach(key => altCanonical.append(key, altParams[key]));
      const altExpected = crypto.createHmac('sha256', secret).update(altCanonical.toString()).digest('hex');
      isValid =
        provided.length === altExpected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(altExpected));
    }

    if (!isValid) {
      throw new UnauthorizedException('Onboarding link signature is invalid.');
    }
  }

  async registrationOptionsForUser(userId: string, label?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User account not found.');
    const platformId = user.telegramId || user.whatsappId || user.slackId || user.discordId;
    // A web signup has no platform column set, and refusing here would have
    // locked it out of enrolling a second passkey — the one thing that keeps a
    // self-custodial account recoverable. The account is already established by
    // the bearer token; the platform here only labels the ceremony.
    const platform = user.telegramId
      ? 'telegram'
      : user.whatsappId
        ? 'whatsapp'
        : user.slackId
          ? 'slack'
          : user.discordId
            ? 'discord'
            : 'web';
    return this.registrationOptions(
      {
        platform,
        platformId: platformId || webPlatformId(),
        username: user.username || `user_${user.id.slice(0, 8)}`,
        label: label || 'Additional passkey',
      },
      userId,
    );
  }

  async verifyRegistration(challengeId: string, response: RegistrationResponseJSON) {
    const challenge = await this.consumeChallenge(challengeId, 'registration');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
      requireUserPresence: true,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7],
    }).catch((err: any) => {
      // Logged, not swallowed. A silent `null` here made every failed
      // verification — including deliberate probing — invisible.
      // @see docs/security-remaining-issues.md — BE-M-04
      this.logger.warn(`WebAuthn verification failed: ${err?.message ?? err}`);
      return null;
    });
    if (!verification?.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Passkey registration verification failed.');
    }

    const info = verification.registrationInfo;
    const cose = decodeCredentialPublicKey(info.credential.publicKey) as Map<number, Uint8Array | number>;
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      throw new BadRequestException('Only P-256 passkeys are supported.');
    }
    const publicKeyX = BigInt(`0x${Buffer.from(x).toString('hex')}`).toString();
    const publicKeyY = BigInt(`0x${Buffer.from(y).toString('hex')}`).toString();
    const context = challenge.context as unknown as RegistrationContext;

    // Recoverability gate. Once the relayer can no longer move funds on a
    // user's behalf, losing the passkey means losing the vault — there is no
    // support path that can undo it. WebAuthn tells us whether a credential is
    // backup-eligible via the BE flag, surfaced here as `credentialDeviceType`:
    // `multiDevice` syncs to iCloud Keychain or Google Password Manager,
    // `singleDevice` lives and dies with the hardware.
    //
    // The rule is per-account, not per-credential: an account must retain at
    // least one recoverable credential. That still allows a hardware key or a
    // Windows Hello credential to be added *alongside* a synced one, which a
    // blanket rejection would have blocked for no safety gain.
    await this.assertAccountRemainsRecoverable(
      challenge.userId ?? undefined,
      info.credentialDeviceType,
    );
    // The account comes from the challenge row's own `userId` column, written at
    // options time from a verified bearer token — never from the JSON context,
    // which is caller-supplied.
    const authenticatedUserId = challenge.userId ?? undefined;
    const existingUser = authenticatedUserId
      ? await this.prisma.user.findUnique({ where: { id: authenticatedUserId }, include: { smartWallet: true } })
      : await this.prisma.user.findFirst({
          where: {
            OR: [
              { telegramId: context.platformId },
              { whatsappId: context.platformId },
              { slackId: context.platformId },
              { discordId: context.platformId },
            ],
          },
          include: { smartWallet: true },
        });
    const hasExistingPasskey = Boolean(
      existingUser?.smartWallet &&
      existingUser.smartWallet.publicKeyX !== '0' &&
      existingUser.smartWallet.publicKeyX !== '0x0',
    );
    const result = hasExistingPasskey && existingUser
      ? {
          userId: existingUser.id,
          smartAccountAddress: existingUser.smartWallet?.address || null,
          isDeployed: existingUser.smartWallet?.isDeployed || false,
          username: existingUser.username,
          accessToken: jwt.sign(
            { userId: existingUser.id, walletAddress: existingUser.smartWallet?.address || null, jti: crypto.randomUUID() },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' },
          ),
        }
      : await this.identityService.registerUser(
          context.platform,
          context.platformId,
          context.username,
          publicKeyX,
          publicKeyY,
          '',
        );
    const credentialId = info.credential.id;
    const lookupHash = crypto.createHash('sha256').update(credentialId).digest('hex');
    await this.prisma.passkeyCredential.upsert({
      where: { lookupHash },
      update: {
        userId: result.userId,
        credentialPublicKey: Buffer.from(info.credential.publicKey),
        publicKeyX,
        publicKeyY,
        counter: info.credential.counter,
        transports: response.response.transports || [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        backupStateKnown: true,
        label: context.label || null,
        revokedAt: null,
      },
      create: {
        userId: result.userId,
        lookupHash,
        credentialPublicKey: Buffer.from(info.credential.publicKey),
        publicKeyX,
        publicKeyY,
        counter: info.credential.counter,
        transports: response.response.transports || [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        backupStateKnown: true,
        label: context.label || null,
      },
    });
    // Attribution + referral milestones fire only for genuinely new wallets.
    if (!hasExistingPasskey) {
      await this.applyOnboardingAttribution(result.userId, context);
    }

    // Whether the client should run the passkey session-key grant now.
    //
    // This used to call `provisionSessionKey` here, which generated a real
    // session private key, encrypted it, and stored it — for a row that could
    // never sign. Only a passkey-authorized `registerSession` sets
    // `activatedAt`, and the client's grant flow provisions its own key anyway,
    // so this one sat unused until it expired. What the client actually needs
    // from this response is the signal to prompt, not a key.
    const shouldGrantSessionKey = !hasExistingPasskey && Boolean(result.smartAccountAddress);

    if (!hasExistingPasskey && result.smartAccountAddress) {
      // Send Telegram confirmation if platform is telegram
      if (context.platform === 'telegram' && context.platformId && this.telegramBot) {
        try {
          await this.telegramBot.sendOnboardingSuccess(context.platformId, result.smartAccountAddress!);
          await this.telegramBot.sendCommunityInvite(context.platformId);
        } catch (err: any) {
          this.logger.warn(`Telegram onboarding notification failed: ${err.message}`);
        }
      }
    }

    const session = await this.issueSession(result.userId, result.smartAccountAddress || null);
    return {
      ...result,
      ...session,
      credentialId,
      publicKeyX,
      publicKeyY,
      backedUp: info.credentialBackedUp,
      deviceType: info.credentialDeviceType,
      shouldGrantSessionKey,
      // Registration never creates an active key. A session key only exists
      // after the follow-up passkey-authorized on-chain grant confirms.
      sessionKeyProvisioned: false,
    };
  }

  /**
   * Persists signup attribution and advances the referral to its
   * wallet-created milestone. Never throws — a growth-tracking failure must not
   * break wallet creation.
   */
  private async applyOnboardingAttribution(userId: string, context: RegistrationContext) {
    try {
      if (context.deviceFingerprint) {
        await this.referralService.recordDeviceFingerprint(userId, context.deviceFingerprint);
      }

      if (context.src || context.campaign) {
        await this.prisma.user.updateMany({
          where: { id: userId, signupSrc: null },
          data: { signupSrc: context.src, signupCampaign: context.campaign },
        });
      }

      if (context.referralCode) {
        const outcome = await this.referralService.processReferral(context.referralCode, userId, {
          src: context.src,
          campaign: context.campaign,
          partner: context.partner,
          channel: context.channel,
        });
        if (!outcome.accepted) {
          this.logger.warn(
            `Referral not attributed for ${userId} (code=${context.referralCode}): ${outcome.reason}`,
          );
        }
      }

      // Fires whether the referral was created just now or on a prior click.
      await this.referralService.markWalletCreated(userId);

      await this.funnelEvents.trackWalletVerified(userId, {
        src: context.src,
        campaign: context.campaign,
        partner: context.partner,
        channel: context.channel,
        platform: context.platform,
      });

      if (context.campaign === 'hk2026') {
        await this.badgesService.awardHk2026PioneerBadge(userId, 'onboarding');
      }
    } catch (error: any) {
      this.logger.error(`Onboarding attribution failed for ${userId}: ${error.message}`);
    }
  }

  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      timeout: CHALLENGE_TTL_MS,
      userVerification: 'required',
      allowCredentials: [],
    });
    const challenge = await this.saveChallenge('authentication', options.challenge);
    return { challengeId: challenge.id, options };
  }

  async verifyAuthentication(challengeId: string, response: AuthenticationResponseJSON) {
    const challenge = await this.consumeChallenge(challengeId, 'authentication');
    const lookupHash = crypto.createHash('sha256').update(response.id).digest('hex');
    let stored = await this.prisma.passkeyCredential.findUnique({ where: { lookupHash } });
    if ((!stored || !stored.credentialPublicKey) && !stored?.revokedAt) {
      await this.credentialVault.ensureWebAuthnPublicKey(response.id);
      stored = await this.prisma.passkeyCredential.findUnique({ where: { lookupHash } });
    }
    if (!stored || stored.revokedAt || !stored.credentialPublicKey) {
      throw new UnauthorizedException('Passkey is not registered or must be securely re-enrolled.');
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
      requireUserVerification: true,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(stored.credentialPublicKey),
        counter: stored.counter,
        transports: stored.transports as any,
      },
    }).catch((err: any) => {
      // Logged, not swallowed. A silent `null` here made every failed
      // verification — including deliberate probing — invisible.
      // @see docs/security-remaining-issues.md — BE-M-04
      this.logger.warn(`WebAuthn verification failed: ${err?.message ?? err}`);
      return null;
    });
    if (!verification?.verified) throw new UnauthorizedException('Passkey authentication verification failed.');

    await this.prisma.passkeyCredential.update({
      where: { id: stored.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        backupStateKnown: true,
        deviceType: verification.authenticationInfo.credentialDeviceType,
        lastUsedAt: new Date(),
      },
    });
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId }, include: { smartWallet: true } });
    if (!user) throw new UnauthorizedException('User account not found.');
    const walletAddress = user.smartWallet?.address || null;
    const session = await this.issueSession(user.id, walletAddress);
    const cose = decodeCredentialPublicKey(new Uint8Array(stored.credentialPublicKey)) as Map<number, Uint8Array | number>;
    const x = cose.get(-2) as Uint8Array;
    const y = cose.get(-3) as Uint8Array;
    return {
      success: true,
      userId: user.id,
      username: user.username,
      walletAddress,
      ...session,
      credential: {
        credentialId: response.id,
        publicKeyX: BigInt(`0x${Buffer.from(x).toString('hex')}`).toString(),
        publicKeyY: BigInt(`0x${Buffer.from(y).toString('hex')}`).toString(),
      },
    };
  }

  async listCredentials(userId: string) {
    const credentials = await this.prisma.passkeyCredential.findMany({
      where: { userId, revokedAt: null, credentialPublicKey: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true, deviceType: true, backedUp: true, backupStateKnown: true, transports: true, createdAt: true, lastUsedAt: true },
    });
    return { credentials };
  }

  async refreshToken(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { smartWallet: true } } },
    });
    if (!stored || stored.expiresAt <= new Date()) {
      if (stored) await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    const user = stored.user;
    const walletAddress = user.smartWallet?.address || null;
    const session = await this.issueSession(user.id, walletAddress);
    return { success: true, ...session, userId: user.id, walletAddress };
  }

  async logout(refreshToken?: string, authorization?: string) {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }
    if (authorization?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authorization.slice(7), JWT_SECRET) as { jti?: string; exp?: number };
        if (decoded.jti && decoded.exp) {
          await this.redis.setValue(`jwt:revoked:${decoded.jti}`, '1', Math.max(1, decoded.exp - Math.floor(Date.now() / 1000)));
        }
      } catch {}
    }
    return { success: true };
  }

  async legacyRefreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { smartWallet: true }
    });
    if (!user) throw new UnauthorizedException('User not found');

    const walletAddress = user.smartWallet?.address || null;
    return { success: true, ...(await this.issueSession(user.id, walletAddress)), userId: user.id, walletAddress };
  }

  async revokeCredential(userId: string, id: string) {
    const credential = await this.prisma.passkeyCredential.findFirst({ where: { id, userId, revokedAt: null } });
    if (!credential) throw new BadRequestException('Passkey not found.');
    const activeCount = await this.prisma.passkeyCredential.count({
      where: { userId, revokedAt: null, credentialPublicKey: { not: null } },
    });
    if (activeCount <= 1) throw new BadRequestException('Add another passkey before revoking your last passkey.');
    await this.prisma.passkeyCredential.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { success: true };
  }
}
