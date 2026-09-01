import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CallPolicyService } from './call-policy.service';

/**
 * Owns the contract allowlist that a passkey policy refresh grants.
 *
 * Deliberately standalone. Both the admin API (which edits the list) and the
 * relayer (which serves it to the passkey flow) need it, and putting it in
 * `AdminModule` meant the relayer had to import the admin graph — closing a
 * cycle that left `RelayerModule` undefined for every module importing it
 * without a `forwardRef`. Depending only on Prisma keeps it a leaf.
 */
@Module({
  imports: [PrismaModule],
  providers: [CallPolicyService],
  exports: [CallPolicyService],
})
export class CallPolicyModule {}
