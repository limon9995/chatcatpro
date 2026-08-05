import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditLogService } from './marketing-audit-log.service';

// V30: singleton settings row (id fixed at 1, seeded by the Phase 0
// migration) — scoring weights, sequence config, and the marketing
// automation kill switch. Everything here is admin/marketing_manager
// editable from the dashboard; nothing in this module reads it yet beyond
// exposing it — later phases (scoring engine, outreach sender) will.
@Injectable()
export class MarketingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: MarketingAuditLogService,
  ) {}

  async get() {
    const row = await this.prisma.marketingSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    return {
      killSwitchEnabled: row.killSwitchEnabled,
      scoringWeights: this.parseJson(row.scoringWeightsJson, {}),
      sequenceConfig: this.parseJson(row.sequenceConfigJson, []),
      dailyOutreachLimit: row.dailyOutreachLimit,
      outreachRequiresApproval: row.outreachRequiresApproval,
      updatedAt: row.updatedAt,
    };
  }

  /** Cheap check other services/jobs can call before doing anything automated. */
  async isKillSwitchEnabled(): Promise<boolean> {
    const row = await this.prisma.marketingSettings.findUnique({
      where: { id: 1 },
    });
    return row?.killSwitchEnabled ?? false;
  }

  async update(
    actorUserId: string,
    body: {
      killSwitchEnabled?: boolean;
      scoringWeights?: Record<string, number>;
      sequenceConfig?: unknown[];
      dailyOutreachLimit?: number;
      outreachRequiresApproval?: boolean;
    },
  ) {
    const data: Record<string, unknown> = { updatedByUserId: actorUserId };
    if (body.killSwitchEnabled !== undefined)
      data.killSwitchEnabled = Boolean(body.killSwitchEnabled);
    if (body.scoringWeights !== undefined)
      data.scoringWeightsJson = JSON.stringify(body.scoringWeights);
    if (body.sequenceConfig !== undefined)
      data.sequenceConfigJson = JSON.stringify(body.sequenceConfig);
    if (body.dailyOutreachLimit !== undefined)
      data.dailyOutreachLimit = Math.max(
        0,
        Number(body.dailyOutreachLimit) || 0,
      );
    if (body.outreachRequiresApproval !== undefined)
      data.outreachRequiresApproval = Boolean(body.outreachRequiresApproval);

    const row = await this.prisma.marketingSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });

    if (body.killSwitchEnabled !== undefined) {
      void this.auditLog.record({
        eventType: 'kill_switch.toggled',
        entityType: 'MarketingSettings',
        entityId: 1,
        actorUserId,
        metadata: { killSwitchEnabled: row.killSwitchEnabled },
      });
    }
    void this.auditLog.record({
      eventType: 'settings.updated',
      entityType: 'MarketingSettings',
      entityId: 1,
      actorUserId,
      metadata: body,
    });

    return this.get();
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
