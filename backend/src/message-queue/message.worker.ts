import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Avoid circular import: reference WebhookService by type only
type WebhookServiceLike = {
  processMessage(page: any, psid: string, message: any): Promise<void>;
};

export const WEBHOOK_SERVICE_TOKEN = 'WEBHOOK_SERVICE_FOR_WORKER';

@Injectable()
export class MessageWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageWorker.name);
  private worker: Worker;

  constructor(
    @Inject(WEBHOOK_SERVICE_TOKEN)
    private readonly webhookService: WebhookServiceLike,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      'incoming-messages',
      async (job: Job) => {
        const { page, psid, message } = job.data;
        this.logger.debug(`[MessageWorker] job=${job.id} page=${page?.pageId} psid=${psid}`);
        await this.webhookService.processMessage(page, psid, message);
      },
      {
        connection: { url: REDIS_URL },
        concurrency: 5,
        limiter: { max: 200, duration: 1000 },
      },
    );

    this.worker.on('completed', job => {
      this.logger.debug(`[MessageWorker] completed job=${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`[MessageWorker] failed job=${job?.id} attempts=${job?.attemptsMade} err=${err.message}`);
    });

    this.worker.on('error', err => {
      this.logger.error(`[MessageWorker] worker error: ${err.message}`);
    });

    this.logger.log('[MessageWorker] Started — listening on "incoming-messages"');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
