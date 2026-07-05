import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';
import { AgentCatalogService } from './agent-catalog.service';

/**
 * Client-facing agent-request submission. Admin CRUD for AgentRequest lives
 * in AdminService (mirrors the existing page-requests admin pattern).
 */
@Injectable()
export class AgentRequestService {
  private readonly logger = new Logger(AgentRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramNotificationService,
    private readonly catalog: AgentCatalogService,
  ) {}

  async submit(
    userId: string,
    pageUrl: string,
    description: string,
    contactInfo?: string,
  ) {
    const url = pageUrl.trim();
    const desc = description.trim();
    if (!url) throw new BadRequestException('Facebook page link দিন');
    if (!desc) throw new BadRequestException('আপনার business সম্পর্কে বিস্তারিত লিখুন');

    const req = await this.prisma.agentRequest.create({
      data: { userId, pageUrl: url, description: desc, contactInfo: contactInfo?.trim() || '' },
    });
    this.logger.log(`[AgentRequest] New request #${req.id} from user ${userId}: ${url}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    void this.telegram.sendMessage(
      `🤖 <b>নতুন Custom Agent Request!</b>\n` +
      `👤 User: ${user?.name || userId} (${user?.email || ''})\n` +
      `🔗 Page URL: ${url}\n` +
      `📝 Business: ${desc}\n` +
      (contactInfo ? `📞 Contact: ${contactInfo}\n` : '') +
      `🕐 সময়: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}`,
    );

    const contact = await this.catalog.getContact();
    return { success: true, request: req, ...contact };
  }

  async getMine(userId: string) {
    return this.prisma.agentRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
