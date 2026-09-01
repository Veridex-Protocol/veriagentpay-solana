import { Controller, Post, Get, Body, Query, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

export interface RegisterUserDto {
  platform: 'telegram' | 'whatsapp' | 'slack' | 'discord';
  platformId: string;
  username: string;
  publicKeyX: string;
  publicKeyY: string;
}

// Registration and handle resolution run before a session exists.
@Public()
@Controller('api/identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  async registerUser(@Body() dto: RegisterUserDto) {
    throw new UnauthorizedException('Direct public-key registration is disabled. Use the verified WebAuthn registration ceremony.');
    /*
    if (!dto.platform || !dto.platformId || !dto.publicKeyX || !dto.publicKeyY) {
      throw new BadRequestException('platform, platformId, publicKeyX, and publicKeyY are required');
    }

    return this.identityService.registerUser(
      dto.platform,
      dto.platformId,
      dto.username || dto.platformId,
      dto.publicKeyX,
      dto.publicKeyY
    );
    */
  }

  @Get('resolve')
  async resolveContact(@Query('platform') platform: string, @Query('handle') handle: string) {
    if (!platform || !handle) {
      throw new BadRequestException('platform and handle query parameters are required');
    }

    const address = await this.identityService.resolveContact(platform, handle);
    const node = await this.identityService.findSocialNodeByHandle(platform, handle);

    const formattedHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: formattedHandle },
          { telegramId: formattedHandle },
          { whatsappId: formattedHandle },
          { discordId: formattedHandle },
        ],
      },
      include: { smartWallet: true },
    });

    const hasPasskey = !!(
      dbUser?.smartWallet &&
      dbUser.smartWallet.publicKeyX !== '0x0' &&
      dbUser.smartWallet.publicKeyX !== '0'
    );

    return {
      address,
      isRegistered: !!node || !!dbUser,
      node: node || null,
      hasPasskey,
    };
  }
}
