import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { EncryptionService } from '../common/encryption.service';

/**
 * FIX 1: Queue-based broadcast architecture.
 *
 * Instead of sending all messages in one long loop inside a single async call,
 * we use a per-broadcast in-memory queue that:
 *  - processes in chunks of CHUNK_SIZE
 *  - yields between chunks (setImmediate) so the event loop stays responsive
 *  - rate-limits to RATE_LIMIT_MS per message
 *  - can be cancelled mid-flight
 *  - updates progress in DB every chunk
 *
 * Future upgrade path → replace the in-memory queue with BullMQ + Redis:
 *   1. Install bullmq, ioredis
 *   2. Replace broadcastQueues Map with BullMQ Queue
 *   3. Move sendChunk logic to a BullMQ Worker
 *   4. No API surface change needed
 */

const RATE_LIMIT_MS = 50; // ms between messages (Facebook safe rate)
const CHUNK_SIZE = 20; // messages per chunk before yielding

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  // FIX 1: track active broadcast jobs — allows cancellation
  private readonly activeBroadcasts = new Map<number, { cancelled: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: MessengerService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(
    pageId: number,
    body: {
      title: string;
      message: string;
      targetType: string;
      targetValue?: string;
      scheduledAt?: string;
    },
  ) {
    if (!body.title?.trim()) throw new BadRequestException('Title required');
    if (!body.message?.trim())
      throw new BadRequestException('Message required');
    return this.prisma.broadcast.create({
      data: {
        pageId,
        title: body.title.trim(),
        message: body.message.trim(),
        targetType: body.targetType || 'all',
        targetValue: body.targetValue ?? null,
        status: 'draft',
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
    });
  }

  async list(pageId: number) {
    return this.prisma.broadcast.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async delete(pageId: number, id: number) {
    const b = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!b || b.pageId !== pageId)
      throw new NotFoundException('Broadcast not found');
    if (b.status === 'running')
      throw new BadRequestException('Cannot delete running broadcast');
    await this.prisma.broadcast.delete({ where: { id } });
    return { success: true };
  }

  async send(pageId: number, id: number) {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast || broadcast.pageId !== pageId)
      throw new NotFoundException('Broadcast not found');
    if (broadcast.status === 'running')
      throw new BadRequestException('Already running');
    if (broadcast.status === 'completed')
      throw new BadRequestException('Already completed');

    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page?.pageToken) throw new BadRequestException('Page token not found');
    const token = this.encryption.decrypt(page.pageToken);

    // FIX 4: filter out blocked customers when building target list
    const psids = await this.getTargets(
      pageId,
      broadcast.targetType,
      broadcast.targetValue,
    );

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: 'running',
        totalTarget: psids.length,
        startedAt: new Date(),
      },
    });

    // FIX 1: register in active map for potential cancellation
    this.activeBroadcasts.set(id, { cancelled: false });

    // Start processing in background
    this.processQueue(id, token, broadcast.message, psids).catch((e) =>
      this.logger.error(`[Broadcast] Queue error #${id}: ${e.message}`),
    );

    return {
      broadcastId: id,
      totalTarget: psids.length,
      message: 'Broadcast started',
    };
  }

  // FIX 1: chunk-based queue processor
  private async processQueue(
    id: number,
    token: string,
    message: string,
    psids: string[],
  ) {
    let sent = 0,
      failed = 0;
    const job = this.activeBroadcasts.get(id);

    for (let i = 0; i < psids.length; i++) {
      // Check if cancelled
      if (job?.cancelled) {
        this.logger.log(`[Broadcast] #${id} cancelled at ${i}/${psids.length}`);
        break;
      }

      try {
        await this.messenger.sendText(token, psids[i], message);
        sent++;
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      } catch {
        failed++;
      }

      // FIX 1: yield every CHUNK_SIZE messages so event loop stays free
      if (i > 0 && i % CHUNK_SIZE === 0) {
        // Update DB progress
        await this.prisma.broadcast
          .update({
            where: { id },
            data: { totalSent: sent, totalFailed: failed },
          })
          .catch(() => {});
        // Yield to event loop
        await new Promise((r) => setImmediate(r));
      }
    }

    const status = job?.cancelled ? 'failed' : 'completed';
    await this.prisma.broadcast
      .update({
        where: { id },
        data: {
          status,
          totalSent: sent,
          totalFailed: failed,
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    this.activeBroadcasts.delete(id);
    this.logger.log(
      `[Broadcast] #${id} ${status}: sent=${sent} failed=${failed}`,
    );
  }

  // ── Build target PSID list — FIX 4: exclude blocked customers ────────────
  private async getTargets(
    pageId: number,
    targetType: string,
    targetValue?: string | null,
  ): Promise<string[]> {
    switch (targetType) {
      case 'all': {
        // FIX 4: isBlocked: false
        const cs = await this.prisma.customer.findMany({
          where: { pageId, isBlocked: false },
          select: { psid: true },
        });
        return cs.map((c) => c.psid);
      }
      case 'tag': {
        if (!targetValue) return [];
        const cs = await this.prisma.customer.findMany({
          where: {
            pageId,
            isBlocked: false,
            tags: { contains: `"${targetValue}"` },
          },
          select: { psid: true },
        });
        return cs.map((c) => c.psid);
      }
      case 'ordered_before': {
        const before = targetValue ? new Date(targetValue) : new Date();
        const os = await this.prisma.order.findMany({
          where: { pageIdRef: pageId, createdAt: { lte: before } },
          select: { customerPsid: true },
          distinct: ['customerPsid'],
        });
        // FIX 4: cross-check against blocked list
        const blocked = await this.prisma.customer.findMany({
          where: { pageId, isBlocked: true },
          select: { psid: true },
        });
        const blockedSet = new Set(blocked.map((b) => b.psid));
        return os
          .map((o) => o.customerPsid)
          .filter((p) => p && !blockedSet.has(p));
      }
      case 'never_ordered': {
        const cs = await this.prisma.customer.findMany({
          where: { pageId, isBlocked: false, totalOrders: 0 },
          select: { psid: true },
        });
        return cs.map((c) => c.psid);
      }
      case 'custom_psids': {
        try {
          return JSON.parse(targetValue || '[]');
        } catch {
          return [];
        }
      }
      default:
        return [];
    }
  }
}
