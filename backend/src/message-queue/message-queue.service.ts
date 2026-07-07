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
        // A "retry" here re-runs the whole handler and produces a NEW AI reply —
        // it is not a safe no-op resend, so replies are not retried on failure.
        // FB's own webhook redelivery is still deduped separately via jobId=mid.
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
    this.logger.log(`[MessageQueue] Connected → ${REDIS_URL}`);
  }

  async add(page: any, psid: string, message: any): Promise<void> {
    // Use Facebook message ID (mid) as jobId to deduplicate retried webhooks.
    // Fall back to timestamp only if mid is missing (shouldn't happen in practice).
    const mid: string = message?.mid ?? `${page.id}-${psid}-${Date.now()}`;
    await this.queue.add(
      'process',
      { page, psid, message },
      {
        jobId: mid,
      },
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
