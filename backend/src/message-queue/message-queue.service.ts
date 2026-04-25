import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

@Injectable()
export class MessageQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageQueueService.name);
  readonly queue: Queue;

  constructor() {
    this.queue = new Queue('incoming-messages', {
      connection: { url: REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
    this.logger.log(`[MessageQueue] Connected → ${REDIS_URL}`);
  }

  async add(page: any, psid: string, message: any): Promise<void> {
    await this.queue.add('process', { page, psid, message }, {
      jobId: `${page.id}-${psid}-${Date.now()}`,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
