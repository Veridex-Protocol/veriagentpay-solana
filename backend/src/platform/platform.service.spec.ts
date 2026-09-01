import { PlatformService } from './platform.service';
import { IdentityService } from '../identity/identity.service';
import { RelayerService } from '../relayer/relayer.service';
import { CommandParserService } from './command-parser.service';
import { ShortLinksService } from '../shortlinks/shortlinks.service';
import { EscrowService } from '../escrow/escrow.service';
import { NlpService } from '../nlp/nlp.service';

describe('PlatformService', () => {
  let service: PlatformService;
  let identityService: IdentityService;
  let relayerService: RelayerService;
  let shortLinksService: ShortLinksService;
  let escrowService: EscrowService;
  let commandParserService: CommandParserService;
  let nlpService: NlpService;

  beforeEach(() => {
    const prisma = {
      user: {
        findFirst: async () => null,
      },
    } as any;
    const redis = {} as any;
    const userTokensService = {} as any;
    identityService = new IdentityService();
    relayerService = new RelayerService();
    shortLinksService = new ShortLinksService();
    escrowService = new EscrowService(prisma, identityService, shortLinksService, relayerService, redis);
    nlpService = new NlpService();
    commandParserService = new CommandParserService(nlpService);
    const vaultService = {} as any;
    const poolsService = {} as any;
    const referralService = { markFirstSend: async () => false } as any;
    // Analytics is fire-and-forget on the payment path; every call is
    // `.catch()`-ed, so the stub only needs to return promises.
    const funnelEvents = {
      track: async () => true,
      trackWalletActivated: async () => true,
      trackCampaignClicked: async () => true,
      trackPayItForward: async () => true,
    } as any;
    const badgesService = {} as any;
    const hotStateService = {} as any;
    const contactsService = {} as any;
    const activityService = {} as any;
    const paymentEscalation = {} as any;
    const splitsService = {} as any;
    const interactiveActionService = {} as any;
    const notificationsService = {} as any;
    const unifiedNotificationService = {} as any;

    // Positional, and the constructor has grown since this was written — an
    // argument inserted mid-list silently shifts every one after it, which is
    // how `commandParserService` ended up holding the vault stub and failing
    // with "parseCommand is not a function" rather than anything meaningful.
    // Keep this list in the same order as the constructor.
    service = new PlatformService(
      prisma,
      identityService,
      relayerService,
      paymentEscalation,
      shortLinksService,
      escrowService,
      commandParserService,
      vaultService,
      poolsService,
      referralService,
      funnelEvents,
      badgesService,
      hotStateService,
      contactsService,
      activityService,
      splitsService,
      interactiveActionService,
      notificationsService,
      unifiedNotificationService,
      userTokensService
    );
  });

  it('should process natural language pay commands', async () => {
    const res = await service.handleSocialMessage({
      platform: 'telegram',
      platformId: '12345',
      username: 'alice',
      text: 'Send $50 to @bob for dinner'
    });
    expect(res).toBeTruthy();
    expect(res.includes('Payment Setup Required') || res.includes('Payment Initialized') || res.includes('Payment Sent') || res.includes('Escrow')).toBe(true);
  });

  it('should process natural language split commands', async () => {
    const res = await service.handleSocialMessage({
      platform: 'discord',
      platformId: '67890',
      username: 'charlie',
      text: 'Split $120 bill with @alice and @bob'
    });
    expect(res).toBeTruthy();
    expect(res.includes('Account Setup Required') || res.includes('Group Bill Split Initialized')).toBe(true);
  });
});
