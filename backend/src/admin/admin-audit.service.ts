import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log state-changing admin action for security & compliance audit
   */
  async logAction(params: {
    adminId?: string;
    adminEmail?: string;
    action: string;
    target?: string;
    details?: any;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: params.adminId || null,
          adminEmail: params.adminEmail || null,
          action: params.action,
          target: params.target || null,
          details: params.details || null,
          ipAddress: params.ipAddress || null,
        },
      });
      this.logger.log(`Audit Log Created: [${params.action}] by admin [${params.adminEmail || params.adminId}] on target [${params.target}]`);
    } catch (e: any) {
      this.logger.error(`Failed to record AdminAuditLog: ${e.message}`);
    }
  }

  async getAuditLogs(query: { adminId?: string; action?: string; limit?: number; offset?: number }) {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const where: any = {};
    if (query.adminId) where.adminId = query.adminId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return { items, total, limit, offset };
  }
}
