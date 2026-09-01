import {
  Controller,
  Query,
  Get,
  Post,
  Body,
  Param,
  Req,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PoolsService } from './pools.service';
import {
  CreatePoolDto,
  RequestLoanDto,
  AmountDto,
  VoteDto,
  ExtensionDto,
  AddMembersDto,
  PaginationDto,
} from './dto/pools.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/pools')
export class PoolsController {
  private readonly logger = new Logger(PoolsController.name);

  constructor(
    private readonly poolsService: PoolsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The acting user, taken from the verified access token.
   *
   * There is deliberately no fallback. The previous implementation resolved an
   * `x-wallet-address` header and, when it was missing or unrecognised, acted as
   * the *oldest account in the database* — so a request with no headers at all
   * operated the first user ever registered.
   *
   * @see docs/audit/11th-august-2026-1.md — SEC-010
   */
  private async resolveUser(req: any) {
    const userId = req?.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { smartWallet: true },
    });

    if (!user) throw new UnauthorizedException('Account not found');
    return user;
  }

  @Post()
  async createPool(
    @Req() req: any,
    @Body() dto: CreatePoolDto
  ) {
    const user = await this.resolveUser(req);

    // No request bodies, emails, usernames or full addresses in logs — these
    // ship to Loki and become a durable record of who paid whom (SEC-043).
    this.logger.debug(`createPool user=${user.id.slice(0, 8)}…`);

    const result = await this.poolsService.createPool(user.id, dto);

    this.logger.log(`Pool created id=${result.poolId}`);
    return result;
  }

  /**
   * Pools the caller belongs to.
   *
   * @dev Paginated. Returning every pool with all members embedded grew without
   *      bound and made one request expensive to serve.
   *
   * @see docs/security-remaining-issues.md — BE-M-08
   */
  @Get()
  async getPools(@Req() req: any, @Query() query: PaginationDto) {
    const user = await this.resolveUser(req);
    const limit = Math.min(query.limit ?? 25, 100);
    const offset = query.offset ?? 0;

    const { pools, total } = await this.poolsService.findAllForUser(user.id, limit, offset);
    return {
      pools,
      total,
      limit,
      offset,
    };
  }

  /**
   * Reputation for a user.
   *
   * @dev Scoped to the caller, or to someone who shares a pool with them. Open
   *      to any authenticated caller this was an enumeration oracle: probing
   *      identifiers revealed which accounts exist and their standing.
   *
   * @see docs/security-remaining-issues.md — BE-M-02
   */
  @Get('reputation/:userIdentifier')
  async getReputation(@Param('userIdentifier') userIdentifier: string, @Req() req: any) {
    const caller = await this.resolveUser(req);
    const allowed = await this.poolsService.sharesPoolWith(caller.id, userIdentifier);
    if (!allowed) {
      throw new NotFoundException('No reputation available for that user');
    }
    return await this.poolsService.getUserReputation(userIdentifier);
  }

  @Get('user/my-loans')
  async getMyLoans(@Req() req: any) {
    const user = await this.resolveUser(req);
    const loans = await this.poolsService.findLoansForUser(user.id);
    return { loans };
  }

  /**
   * Pool detail.
   *
   * @dev Membership-gated. This returned every member's email, wallet address,
   *      reputation and vote to any authenticated user who knew a pool id —
   *      making it both a data leak and an enumeration oracle.
   *
   * @see docs/security-remediation-plan.md — BE-H-09
   */
  @Get(':id')
  async getPool(@Param('id') id: string, @Req() req: any) {
    const pool = await this.poolsService.findOne(id);
    if (!pool) throw new NotFoundException('Pool not found');

    const userId = req.user?.userId;
    const isMember =
      pool.creator?.id === userId ||
      pool.members?.some((m: any) => m.user?.id === userId || m.userId === userId);

    if (!isMember) {
      // Indistinguishable from a pool that does not exist, so a non-member
      // cannot probe for which ids are real.
      throw new NotFoundException('Pool not found');
    }

    return { pool };
  }

  @Post(':id/deposit')
  async deposit(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: AmountDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.deposit(id, user.id, body.amount);
  }

  @Post(':id/loans')
  async requestLoan(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RequestLoanDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.requestLoan(id, user.id, dto);
  }

  @Post(':id/loans/:loanId/vote')
  async voteLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @Req() req: any,
    @Body() body: VoteDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.voteLoan(id, loanId, user.id, body.approve);
  }

  @Post(':id/loans/:loanId/execute')
  async executeLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @Req() req: any
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.executeLoan(id, loanId, user.id);
  }

  @Post(':id/loans/:loanId/repay')
  async repayLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @Req() req: any,
    @Body() body: AmountDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.repayLoan(id, loanId, user.id, body.amount);
  }

  @Post(':id/loans/:loanId/extension')
  async requestExtension(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @Req() req: any,
    @Body() body: ExtensionDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.requestExtension(id, loanId, user.id, body.additionalDays);
  }

  @Post(':id/loans/:loanId/write-off')
  async writeOffLoan(
    @Param('id') id: string,
    @Param('loanId') loanId: string,
    @Req() req: any,
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.writeOffLoan(id, loanId, user.id);
  }

  @Post(':id/close')
  async closePool(@Param('id') id: string, @Req() req: any) {
    const user = await this.resolveUser(req);
    return await this.poolsService.closePool(id, user.id);
  }

  @Post(':id/withdraw')
  async withdraw(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: AmountDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.withdraw(id, user.id, body.amount);
  }

  @Post(':id/invite')
  async inviteMembers(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: AddMembersDto
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.inviteMembers(id, user.id, body.members);
  }

  @Post(':id/join')
  async joinPool(
    @Param('id') id: string,
    @Req() req: any
  ) {
    const user = await this.resolveUser(req);
    return await this.poolsService.joinPool(id, user.id);
  }
}
