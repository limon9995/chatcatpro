import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from '../common/api-keys.service';

/**
 * Client-facing agent catalog reads. Admin CRUD for BotAgentDefinition lives
 * in AdminService (mirrors the existing page-requests admin pattern).
 */
@Injectable()
export class AgentCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  /** Only active definitions, for the onboarding picker. */
  async listActive() {
    return this.prisma.botAgentDefinition.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getContact() {
    const number = await this.apiKeys.get('adminWhatsappNumber');
    return {
      whatsappNumber: number,
      whatsappLink: `https://wa.me/${number.replace(/^0/, '88')}`,
    };
  }
}
