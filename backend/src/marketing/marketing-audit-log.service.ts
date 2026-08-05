import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// V30: generic event/audit trail for the AI Marketing & Sales Automation
// feature — nothing like this existed in the codebase before (see the
// architecture report); every significant marketing action across later
// phases (lead scored, message generated/approved/sent, follow-up
// scheduled, etc) should call record() so admin can review AI decisions.
@Injectable()
export class MarketingAuditLogService {
  private readonly logger = new Logger(MarketingAuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget by convention (callers use `void auditLog.record(...)`) — never blocks the caller's main flow. */
  async record(input: {
    eventType: string;
    entityType: string;
    entityId?: number | null;
    actorUserId?: string | null;
    metadata?: unknown;
  }) {
    try {
      await this.prisma.marketingAuditLog.create({
        data: {
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          actorUserId: input.actorUserId ?? null,
          metadataJson:
            input.metadata !== undefined
              ? JSON.stringify(input.metadata)
              : null,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Failed to record audit log entry: ${(e as Error).message}`,
      );
    }
  }

  async list(opts: {
    eventType?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: Record<string, unknown> = {};
    if (opts.eventType) where.eventType = opts.eventType;
    if (opts.entityType) where.entityType = opts.entityType;

    const [rows, total] = await Promise.all([
      this.prisma.marketingAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.marketingAuditLog.count({ where }),
    ]);

    return {
      total,
      limit,
      offset,
      rows: rows.map((r) => ({
        ...r,
        metadata: r.metadataJson ? this.safeParse(r.metadataJson) : null,
        metadataJson: undefined,
      })),
    };
  }

  private safeParse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
