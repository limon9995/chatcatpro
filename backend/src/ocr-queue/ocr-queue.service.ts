import { Injectable, Logger } from '@nestjs/common';

type Job = () => Promise<void>;

const MAX_QUEUE_SIZE = 50;
const JOB_TIMEOUT_MS = 45_000; // 45 seconds per OCR job

@Injectable()
export class OcrQueueService {
  private readonly logger = new Logger(OcrQueueService.name);
  private queue: Job[] = [];
  private running: boolean = false;
  private processed = 0;
  private failed = 0;

  async add(job: Job): Promise<boolean> {
    // FIX: max queue size — reject if full
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.logger.warn(
        `[OCRQueue] Queue full (${MAX_QUEUE_SIZE}) — dropping job`,
      );
      return false;
    }
    this.queue.push(job);
    this.process();
    return true;
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;

      try {
        // FIX: timeout wrapper — job cannot run forever
        await this.withTimeout(job, JOB_TIMEOUT_MS);
        this.processed++;
      } catch (e: any) {
        this.failed++;
        this.logger.error(`[OCRQueue] Job failed/timeout: ${e?.message ?? e}`);
      }
    }

    this.running = false;
  }

  private withTimeout(job: Job, ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`OCR job timed out after ${ms}ms`)),
        ms,
      );
      job()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      processed: this.processed,
      failed: this.failed,
      maxSize: MAX_QUEUE_SIZE,
    };
  }

  // Keep for backwards compat
  getQueueLength() {
    return this.queue.length;
  }
}
