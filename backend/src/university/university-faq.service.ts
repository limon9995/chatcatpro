import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FaqDto {
  question: string;
  answer: string;
  sortOrder?: number;
}

@Injectable()
export class UniversityFaqService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireConfig(pageId: number) {
    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config) throw new NotFoundException('University config not found. Save settings first.');
    return config;
  }

  async listFaqs(pageId: number) {
    return this.prisma.universityFaq.findMany({
      where: { pageId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createFaq(pageId: number, dto: FaqDto) {
    const config = await this.requireConfig(pageId);
    return this.prisma.universityFaq.create({
      data: { configId: config.id, pageId, ...dto },
    });
  }

  async updateFaq(id: number, pageId: number, dto: Partial<FaqDto>) {
    return this.prisma.universityFaq.updateMany({ where: { id, pageId }, data: dto });
  }

  async deleteFaq(id: number, pageId: number) {
    return this.prisma.universityFaq.deleteMany({ where: { id, pageId } });
  }
}
