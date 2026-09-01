import { Global, Module } from '@nestjs/common';
import { UserTokensService } from './user-tokens.service';
import { UserTokensController } from './user-tokens.controller';
import { TokenBalanceReconciliationCron } from './token-balance-reconciliation.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { USER_TOKENS_SERVICE } from '../common/service-contracts';

/**
 * Global because it is a leaf — it depends only on Prisma — and because adding
 * it to each consumer's `imports` introduces new edges into an already
 * cycle-prone module graph. Several services import each other and rely on
 * `forwardRef`, which does not defer the `design:paramtypes` reference, so
 * changing evaluation order surfaces temporal-dead-zone errors in unrelated
 * modules. A global leaf provider avoids touching that ordering at all.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [UserTokensController],
  providers: [
    UserTokensService,
    { provide: USER_TOKENS_SERVICE, useExisting: UserTokensService },
    TokenBalanceReconciliationCron,
  ],
  exports: [UserTokensService, USER_TOKENS_SERVICE],
})
export class TokensModule {}
