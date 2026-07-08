import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { BotAgentRegistry } from '../agents/bot-agent.registry';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

@Injectable()
export class MessageWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageWorker.name);
  private worker: Worker;

  constructor(private readonly botAgentRegistry: BotAgentRegistry) {}

  onModuleInit() {
    this.worker = new Worker(
      'incoming-messages',
      async (job: Job) => {
        const { page, psid, message } = job.data;
        this.logger.debug(
          `[MessageWorker] job=${job.id} page=${page?.pageId} psid=${psid}`,
        );
        const agent = this.botAgentRegistry.resolveForPage(page);
        await agent.handle(page, psid, message);
      },
      {
        connection: { url: REDIS_URL },
        concurrency: 5,
        limiter: { max: 200, duration: 1000 },
        // Default 30s lock is too tight for jobs that call a slow AI provider —
        // if lock renewal falls behind, BullMQ marks the job "stalled" and
        // re-runs it on another worker slot while the original run may still
        // be finishing, producing two independent replies for one message.
        lockDuration: 60_000,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`[MessageWorker] completed job=${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `[MessageWorker] failed job=${job?.id} attempts=${job?.attemptsMade} err=${err.message}`,
      );
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(
        `[MessageWorker] job=${jobId} stalled — BullMQ will re-run it, which can cause a duplicate reply. Investigate slow handlers if this recurs.`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`[MessageWorker] worker error: ${err.message}`);
    });

    this.logger.log(
      '[MessageWorker] Started — listening on "incoming-messages"',
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
