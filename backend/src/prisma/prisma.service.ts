import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma Singleton Connection Pool initialized.');

    // Log slow queries exceeding 200ms threshold
    (this as any).$on('query', (e: any) => {
      if (e.duration > 200) {
        this.logger.warn(`[SLOW QUERY] ${e.duration}ms: ${e.query} -- Params: ${e.params}`);
      }
    });
  }
}
