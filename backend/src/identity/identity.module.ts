import { Module, forwardRef } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { OnboardingController } from './onboarding.controller';
import { CredentialVaultService } from './credential-vault.service';
import { PlatformModule } from '../platform/platform.module';
import { RelayerModule } from '../relayer/relayer.module';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnService } from './webauthn.service';
import { ReferralModule } from '../referral/referral.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BadgesModule } from '../badges/badges.module';
import { ActivityModule } from '../activity/activity.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CoreModule } from '../core/core.module';
import { IDENTITY_SERVICE } from '../common/service-contracts';

@Module({
  imports: [
    PrismaModule,
    CoreModule,
    forwardRef(() => PlatformModule),
    forwardRef(() => RelayerModule),
    forwardRef(() => ReferralModule),
    AnalyticsModule,
    forwardRef(() => BadgesModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [IdentityController, OnboardingController, WebAuthnController],
  providers: [
    // `useExisting`, not `useClass`: the token must resolve to the same
    // instance the rest of the app injects by class.
    { provide: IDENTITY_SERVICE, useExisting: IdentityService },
    IdentityService,
    CredentialVaultService,
    WebAuthnService,
  ],
  exports: [
    IDENTITY_SERVICE,
    IdentityService,
    CredentialVaultService,
    WebAuthnService,
  ],
})
export class IdentityModule {}
