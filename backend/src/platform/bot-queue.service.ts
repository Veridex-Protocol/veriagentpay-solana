import { Injectable, Logger } from '@nestjs/common';

export interface BotJob {
  id: string;
  platform: 'telegram' | 'whatsapp' | 'discord' | 'slack';
  chatId: string;
  text: string;
  payload: any;
  messageId?: number | string;
  enqueuedAtNs: bigint;
  handler: (job: BotJob) => Promise<void>;
}

@Injectable()
export class BotQueueService {
  private readonly logger = new Logger(BotQueueService.name);
  private queue: BotJob[] = [];
  private isProcessing = false;
  private concurrency = 10;
  private activeWorkers = 0;

  public enqueue(job: Omit<BotJob, 'id' | 'enqueuedAtNs'>): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullJob: BotJob = {
      ...job,
      id,
      enqueuedAtNs: process.hrtime.bigint(),
    };

    this.queue.push(fullJob);
    this.processQueue();
    return id;
  }

  private async processQueue() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.activeWorkers++;
    const job = this.queue.shift()!;

    setImmediate(async () => {
      const startTime = process.hrtime.bigint();
      const queueWaitMs = Number(startTime - job.enqueuedAtNs) / 1e6;

      try {
        await job.handler(job);
        const totalDurationMs = Number(process.hrtime.bigint() - job.enqueuedAtNs) / 1e6;
        this.logger.debug(
          `[BotQueue] Job ${job.id} (${job.platform}:${job.chatId}) completed in ${totalDurationMs.toFixed(2)}ms (Queue wait: ${queueWaitMs.toFixed(2)}ms)`
        );
      } catch (err: any) {
        this.logger.error(`[BotQueue] Execution error on job ${job.id}: ${err.message}`, err.stack);
      } finally {
        this.activeWorkers--;
        this.processQueue();
      }
    });
  }
}
