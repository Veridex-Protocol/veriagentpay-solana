import { Module, forwardRef } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PLATFORM_SERVICE } from '../common/service-contracts';
import { CommandParserService } from './command-parser.service';
import { WebhookVerifierService } from './webhook-verifier.service';
import { PaymentEscalationService } from './payment-escalation.service';
import { PlatformController } from './platform.controller';
import { EscalationController } from './escalation.controller';
import { TelegramBotDriver } from './drivers/telegram-bot';
import { WhatsAppBotDriver } from './drivers/whatsapp-bot';
import { DiscordBotDriver } from './drivers/discord-bot';
import { SlackBotDriver } from './drivers/slack-bot';
import { DiscordBotInitService } from './drivers/discord-bot-init.service';
import { SlackBotInitService } from './drivers/slack-bot-init.service';
import { BotSessionService } from './sessions/bot-session.service';
import { BotQueueService } from './bot-queue.service';
import { HotStateService } from '../core/hot-state.service';
import { IdentityService } from '../identity/identity.service';
import { IdentityModule } from '../identity/identity.module';
import { RelayerService } from '../relayer/relayer.service';
import { NlpModule } from '../nlp/nlp.module';
import { AdminModule } from '../admin/admin.module';
import { ShortLinksModule } from '../shortlinks/shortlinks.module';
import { EscrowModule } from '../escrow/escrow.module';
import { VaultModule } from '../vault/vault.module';
import { PoolsModule } from '../pools/pools.module';
import { ReferralModule } from '../referral/referral.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BadgesModule } from '../badges/badges.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ActivityModule } from '../activity/activity.module';
import { SplitsModule } from '../splits/splits.module';
import { InteractiveActionService } from './interactive-action.service';
import { ConversationStateService } from './conversation-state.service';
import { RequestsModule } from '../requests/requests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { TokensModule } from '../tokens/tokens.module';
import { RelayerModule } from '../relayer/relayer.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ReferralCardService } from './referral-card.service';
import { GrowthModule } from '../growth/growth.module';

@Module({
  imports: [
    NlpModule,
    forwardRef(() => AdminModule),
    AnalyticsModule,
    ShortLinksModule,
    forwardRef(() => EscrowModule),
    forwardRef(() => VaultModule),
    forwardRef(() => PoolsModule),
    forwardRef(() => ReferralModule),
    forwardRef(() => BadgesModule),
    forwardRef(() => ContactsModule),
    forwardRef(() => ActivityModule),
    forwardRef(() => SplitsModule),
    forwardRef(() => NotificationsModule),
    TokensModule,
    forwardRef(() => IdentityModule),
    forwardRef(() => RequestsModule),
    forwardRef(() => EnvelopesModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => SubscriptionModule),
    forwardRef(() => GrowthModule),
  ],
  controllers: [PlatformController, EscalationController],
  providers: [
    WebhookVerifierService,
    PaymentEscalationService,
    PlatformService,
    { provide: PLATFORM_SERVICE, useExisting: PlatformService },
    CommandParserService,
    InteractiveActionService,
    ConversationStateService,
    ReferralCardService,
    TelegramBotDriver,
    WhatsAppBotDriver,
    DiscordBotDriver,
    SlackBotDriver,
    DiscordBotInitService,
    SlackBotInitService,
    BotSessionService,
    BotQueueService,
  ],
  exports: [
    PlatformService,
    PLATFORM_SERVICE,
    ReferralCardService,
    CommandParserService,
    TelegramBotDriver,
    WhatsAppBotDriver,
    DiscordBotDriver,
    SlackBotDriver,
    BotSessionService,
    BotQueueService,
    ConversationStateService,
  ],
})
export class PlatformModule {}
