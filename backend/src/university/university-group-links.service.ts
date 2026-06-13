import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GroupLinkDto {
  label: string;
  semester?: string;
  department?: string;
  course?: string;
  linkType: string;
  link: string;
  isActive?: boolean;
}

@Injectable()
export class UniversityGroupLinksService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireConfig(pageId: number) {
    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config) throw new NotFoundException('University config not found. Save settings first.');
    return config;
  }

  async listLinks(pageId: number) {
    return this.prisma.groupLink.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createLink(pageId: number, dto: GroupLinkDto) {
    const config = await this.requireConfig(pageId);
    return this.prisma.groupLink.create({
      data: { configId: config.id, pageId, ...dto },
    });
  }

  async updateLink(id: number, pageId: number, dto: Partial<GroupLinkDto>) {
    return this.prisma.groupLink.updateMany({ where: { id, pageId }, data: dto });
  }

  async deleteLink(id: number, pageId: number) {
    return this.prisma.groupLink.deleteMany({ where: { id, pageId } });
  }
}
