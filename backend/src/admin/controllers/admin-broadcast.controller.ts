import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { AdminBroadcastService, BroadcastDto } from '../services/admin-broadcast.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../auth/decorators/public.decorator';

// Guarded by AdminGuard / AdminRolesGuard below, not by the user JWT
// guard bound globally in AppModule. @Public() opts out of that guard only.
@Public()
@Controller('api/admin/broadcast')
@UseGuards(AdminGuard)
export class AdminBroadcastController {
  constructor(
    private readonly broadcastService: AdminBroadcastService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('send')
  async sendBroadcast(@Body() dto: BroadcastDto) {
    if (!dto.title || !dto.message || !dto.platforms?.length) {
      return { success: false, error: 'title, message, and platforms are required' };
    }
    return this.broadcastService.broadcast(dto);
  }

  @Get('stats')
  async getBroadcastStats() {
    const userCounts = await this.prisma.user.aggregate({
      _count: { id: true },
    });

    const telegramCount = await this.prisma.user.count({ where: { telegramId: { not: null } } });
    const whatsappCount = await this.prisma.user.count({ where: { whatsappId: { not: null } } });
    const discordCount = await this.prisma.user.count({ where: { discordId: { not: null } } });
    const slackCount = await this.prisma.user.count({ where: { slackId: { not: null } } });

    const recentBroadcasts = await this.prisma.notificationLog.findMany({
      where: { notificationType: 'admin_broadcast' },
      orderBy: { sentAt: 'desc' },
      take: 10,
      select: { id: true, sentAt: true, metadata: true },
    });

    return {
      totalUsers: userCounts._count.id,
      reachByPlatform: {
        telegram: telegramCount,
        whatsapp: whatsappCount,
        discord: discordCount,
        slack: slackCount,
      },
      recentBroadcasts,
    };
  }
}
