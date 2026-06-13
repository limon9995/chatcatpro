import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UniversityConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(pageId: number) {
    return this.prisma.universityConfig.findUnique({ where: { pageId } });
  }

  async upsertConfig(
    pageId: number,
    dto: {
      scrapeUrl?: string;
      scrapeInterval?: number;
      scrapeEnabled?: boolean;
      autoPostEnabled?: boolean;
      knowledgeText?: string;
    },
  ) {
    return this.prisma.universityConfig.upsert({
      where: { pageId },
      create: { pageId, ...dto },
      update: dto,
    });
  }

  async toggleAutoPost(pageId: number, enabled: boolean) {
    return this.prisma.universityConfig.upsert({
      where: { pageId },
      create: { pageId, autoPostEnabled: enabled },
      update: { autoPostEnabled: enabled },
    });
  }

  async getRecentNotices(pageId: number, limit = 20) {
    return this.prisma.universityNotice.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async deleteNotice(id: number, pageId: number) {
    return this.prisma.universityNotice.deleteMany({ where: { id, pageId } });
  }
}
