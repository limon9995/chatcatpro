import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../crm/phone.util';
import { MarketingScoringService } from './marketing-scoring.service';
import { MarketingAuditLogService } from './marketing-audit-log.service';
import { MarketingAiService } from './marketing-ai.service';
import { MarketingSettingsService } from './marketing-settings.service';

export const PIPELINE_STATUSES = [
  'NEW',
  'RESEARCHED',
  'QUALIFIED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'DEMO_BOOKED',
  'TRIAL_STARTED',
  'TRIAL_ACTIVE',
  'CONVERTED',
  'PAID_CUSTOMER',
  'NOT_INTERESTED',
  'OPTED_OUT',
  'LOST',
  'FOLLOW_UP_LATER',
] as const;

interface LeadInput {
  businessName?: string;
  category?: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  followerCount?: number;
  reviewCount?: number;
  rating?: number;
  estimatedMessageVolume?: string;
  onlineOrderPresence?: boolean;
  source?: string;
  sourceUrl?: string;
  notes?: string;
}

@Injectable()
export class MarketingLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: MarketingScoringService,
    private readonly auditLog: MarketingAuditLogService,
    private readonly ai: MarketingAiService,
    private readonly settingsService: MarketingSettingsService,
  ) {}

  /** Lowercase, strip protocol/www/trailing slash — makes exact-match dedup reliable. */
  private normalizeUrl(url?: string | null): string | null {
    const raw = String(url || '').trim();
    if (!raw) return null;
    const cleaned = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
    return cleaned || null;
  }

  private normalizeInput(dto: LeadInput) {
    return {
      phone: normalizePhone(dto.phone) ?? (dto.phone?.trim() || null),
      website: this.normalizeUrl(dto.website),
      facebookUrl: this.normalizeUrl(dto.facebookUrl),
      instagramUrl: this.normalizeUrl(dto.instagramUrl),
    };
  }

  async findDuplicates(
    normalized: {
      phone: string | null;
      website: string | null;
      facebookUrl: string | null;
      instagramUrl: string | null;
    },
    excludeId?: number,
  ) {
    const or: Record<string, unknown>[] = [];
    if (normalized.phone) or.push({ phone: normalized.phone });
    if (normalized.website) or.push({ website: normalized.website });
    if (normalized.facebookUrl)
      or.push({ facebookUrl: normalized.facebookUrl });
    if (normalized.instagramUrl)
      or.push({ instagramUrl: normalized.instagramUrl });
    if (!or.length) return [];

    return this.prisma.marketingLead.findMany({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: {
        id: true,
        businessName: true,
        phone: true,
        website: true,
        facebookUrl: true,
        instagramUrl: true,
        pipelineStatus: true,
        leadTemperature: true,
      },
      take: 5,
    });
  }

  async create(actorUserId: string, dto: LeadInput, forceCreate = false) {
    if (!dto.businessName?.trim())
      throw new BadRequestException('businessName required');
    const normalized = this.normalizeInput(dto);

    if (!forceCreate) {
      const duplicates = await this.findDuplicates(normalized);
      if (duplicates.length) return { lead: null, duplicates };
    }

    const { score, temperature } = await this.scoring.scoreLead({
      facebookUrl: normalized.facebookUrl,
      website: normalized.website,
      followerCount: dto.followerCount,
      reviewCount: dto.reviewCount,
      onlineOrderPresence: dto.onlineOrderPresence,
      estimatedMessageVolume: dto.estimatedMessageVolume,
    });

    const lead = await this.prisma.marketingLead.create({
      data: {
        businessName: dto.businessName.trim(),
        category: dto.category?.trim() || null,
        location: dto.location?.trim() || null,
        phone: normalized.phone,
        email: dto.email?.trim() || null,
        website: normalized.website,
        facebookUrl: normalized.facebookUrl,
        instagramUrl: normalized.instagramUrl,
        followerCount: dto.followerCount ?? null,
        reviewCount: dto.reviewCount ?? null,
        rating: dto.rating ?? null,
        estimatedMessageVolume: dto.estimatedMessageVolume || null,
        onlineOrderPresence: !!dto.onlineOrderPresence,
        leadScore: score,
        leadTemperature: temperature,
        source: dto.source?.trim() || 'manual',
        sourceUrl: dto.sourceUrl?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });

    void this.auditLog.record({
      eventType: 'lead.discovered',
      entityType: 'MarketingLead',
      entityId: lead.id,
      actorUserId,
      metadata: { source: lead.source },
    });
    void this.auditLog.record({
      eventType: 'lead.scored',
      entityType: 'MarketingLead',
      entityId: lead.id,
      actorUserId,
      metadata: { score, temperature },
    });

    return { lead, duplicates: [] };
  }

  /** Bulk (CSV) import — always skips duplicates rather than prompting, since there's no per-row UI to confirm. */
  async bulkCreate(actorUserId: string, rows: LeadInput[]) {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('rows required');
    if (rows.length > 500)
      throw new BadRequestException(
        'সর্বোচ্চ ৫০০ row এ একবারে import করা যাবে',
      );

    let createdCount = 0;
    const skipped: { businessName: string; reason: string }[] = [];
    const failed: { businessName: string; reason: string }[] = [];

    for (const row of rows) {
      try {
        const result = await this.create(actorUserId, row, false);
        if (result.lead) createdCount++;
        else
          skipped.push({
            businessName: row.businessName || '(no name)',
            reason: 'duplicate',
          });
      } catch (e: any) {
        failed.push({
          businessName: row.businessName || '(no name)',
          reason: e.message || 'unknown error',
        });
      }
    }

    void this.auditLog.record({
      eventType: 'lead.bulk_import',
      entityType: 'MarketingLead',
      actorUserId,
      metadata: {
        total: rows.length,
        createdCount,
        skippedCount: skipped.length,
        failedCount: failed.length,
      },
    });

    return { createdCount, skipped, failed };
  }

  async list(opts: {
    pipelineStatus?: string;
    leadTemperature?: string;
    campaignId?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: Record<string, unknown> = { isTest: false };
    if (opts.pipelineStatus) where.pipelineStatus = opts.pipelineStatus;
    if (opts.leadTemperature) where.leadTemperature = opts.leadTemperature;
    if (opts.campaignId) where.campaignId = opts.campaignId;
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { website: { contains: q.toLowerCase() } },
      ];
    }

    const [rows, total, statusCounts] = await Promise.all([
      this.prisma.marketingLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.marketingLead.count({ where }),
      this.prisma.marketingLead.groupBy({
        by: ['pipelineStatus'],
        where: { isTest: false },
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      rows,
      statusCounts: Object.fromEntries(
        statusCounts.map((s) => [s.pipelineStatus, s._count._all]),
      ),
    };
  }

  async get(id: number) {
    const lead = await this.prisma.marketingLead.findUnique({
      where: { id },
      include: {
        outreachMessages: { orderBy: { createdAt: 'desc' }, take: 20 },
        followUps: { orderBy: { scheduledAt: 'desc' }, take: 20 },
        demoBookings: { orderBy: { scheduledAt: 'desc' }, take: 10 },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(
    actorUserId: string,
    id: number,
    dto: LeadInput & {
      pipelineStatus?: string;
      assignedUserId?: string | null;
    },
  ) {
    const existing = await this.prisma.marketingLead.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Lead not found');

    if (
      dto.pipelineStatus &&
      !PIPELINE_STATUSES.includes(dto.pipelineStatus as any)
    ) {
      throw new BadRequestException(
        `Invalid pipelineStatus: ${dto.pipelineStatus}`,
      );
    }

    const normalized = this.normalizeInput({
      phone: dto.phone ?? existing.phone ?? undefined,
      website: dto.website ?? existing.website ?? undefined,
      facebookUrl: dto.facebookUrl ?? existing.facebookUrl ?? undefined,
      instagramUrl: dto.instagramUrl ?? existing.instagramUrl ?? undefined,
    });

    const scoringInputChanged =
      dto.followerCount !== undefined ||
      dto.reviewCount !== undefined ||
      dto.onlineOrderPresence !== undefined ||
      dto.estimatedMessageVolume !== undefined ||
      dto.website !== undefined ||
      dto.facebookUrl !== undefined;

    let scoreUpdate: { leadScore?: number; leadTemperature?: string } = {};
    if (scoringInputChanged) {
      const { score, temperature } = await this.scoring.scoreLead({
        facebookUrl: normalized.facebookUrl,
        website: normalized.website,
        followerCount: dto.followerCount ?? existing.followerCount,
        reviewCount: dto.reviewCount ?? existing.reviewCount,
        onlineOrderPresence:
          dto.onlineOrderPresence ?? existing.onlineOrderPresence,
        estimatedMessageVolume:
          dto.estimatedMessageVolume ?? existing.estimatedMessageVolume,
      });
      scoreUpdate = { leadScore: score, leadTemperature: temperature };
    }

    const lead = await this.prisma.marketingLead.update({
      where: { id },
      data: {
        ...(dto.businessName !== undefined
          ? { businessName: dto.businessName.trim() }
          : {}),
        ...(dto.category !== undefined
          ? { category: dto.category?.trim() || null }
          : {}),
        ...(dto.location !== undefined
          ? { location: dto.location?.trim() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: normalized.phone } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.website !== undefined ? { website: normalized.website } : {}),
        ...(dto.facebookUrl !== undefined
          ? { facebookUrl: normalized.facebookUrl }
          : {}),
        ...(dto.instagramUrl !== undefined
          ? { instagramUrl: normalized.instagramUrl }
          : {}),
        ...(dto.followerCount !== undefined
          ? { followerCount: dto.followerCount }
          : {}),
        ...(dto.reviewCount !== undefined
          ? { reviewCount: dto.reviewCount }
          : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.estimatedMessageVolume !== undefined
          ? { estimatedMessageVolume: dto.estimatedMessageVolume }
          : {}),
        ...(dto.onlineOrderPresence !== undefined
          ? { onlineOrderPresence: !!dto.onlineOrderPresence }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.assignedUserId !== undefined
          ? { assignedUserId: dto.assignedUserId }
          : {}),
        ...(dto.pipelineStatus !== undefined
          ? { pipelineStatus: dto.pipelineStatus }
          : {}),
        ...scoreUpdate,
      },
    });

    if (dto.pipelineStatus && dto.pipelineStatus !== existing.pipelineStatus) {
      void this.auditLog.record({
        eventType: 'lead.status_changed',
        entityType: 'MarketingLead',
        entityId: id,
        actorUserId,
        metadata: { from: existing.pipelineStatus, to: dto.pipelineStatus },
      });
    }
    if (scoreUpdate.leadScore !== undefined) {
      void this.auditLog.record({
        eventType: 'lead.scored',
        entityType: 'MarketingLead',
        entityId: id,
        actorUserId,
        metadata: scoreUpdate,
      });
    }

    return lead;
  }

  async delete(actorUserId: string, id: number) {
    const existing = await this.prisma.marketingLead.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.marketingLead.delete({ where: { id } });
    void this.auditLog.record({
      eventType: 'lead.deleted',
      entityType: 'MarketingLead',
      entityId: id,
      actorUserId,
      metadata: { businessName: existing.businessName },
    });
    return { success: true };
  }

  /**
   * V30 Phase 2: AI business-research agent. Synthesizes a summary + pain
   * points from the lead's own structured fields and staff-entered notes —
   * deliberately does NOT fetch/scrape the lead's Facebook/website itself
   * (see marketing-ai.service.ts's header comment for why).
   */
  async research(actorUserId: string, id: number) {
    if (await this.settingsService.isKillSwitchEnabled()) {
      throw new BadRequestException(
        'Marketing automation kill switch চালু আছে — Settings থেকে বন্ধ করুন প্রথমে',
      );
    }
    const lead = await this.prisma.marketingLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const result = await this.ai.researchLead({
      businessName: lead.businessName,
      category: lead.category,
      location: lead.location,
      website: lead.website,
      facebookUrl: lead.facebookUrl,
      instagramUrl: lead.instagramUrl,
      followerCount: lead.followerCount,
      reviewCount: lead.reviewCount,
      rating: lead.rating,
      onlineOrderPresence: lead.onlineOrderPresence,
      estimatedMessageVolume: lead.estimatedMessageVolume,
      notes: lead.notes,
    });
    if (!result) {
      throw new BadRequestException(
        'AI research এখন করা যাচ্ছে না — একটু পর আবার চেষ্টা করুন',
      );
    }

    const nextStatus =
      lead.pipelineStatus === 'NEW' ? 'RESEARCHED' : lead.pipelineStatus;
    const updated = await this.prisma.marketingLead.update({
      where: { id },
      data: {
        aiSummary: `ChatCat সুযোগ: ${result.opportunity}\n\n${result.summary}`,
        painPointsJson: JSON.stringify(result.painPoints),
        pipelineStatus: nextStatus,
      },
    });

    void this.auditLog.record({
      eventType: 'research.completed',
      entityType: 'MarketingLead',
      entityId: id,
      actorUserId,
      metadata: {
        opportunity: result.opportunity,
        painPointCount: result.painPoints.length,
        model: result.usage.model,
      },
    });
    if (nextStatus !== lead.pipelineStatus) {
      void this.auditLog.record({
        eventType: 'lead.status_changed',
        entityType: 'MarketingLead',
        entityId: id,
        actorUserId,
        metadata: { from: lead.pipelineStatus, to: nextStatus },
      });
    }

    return updated;
  }
}
