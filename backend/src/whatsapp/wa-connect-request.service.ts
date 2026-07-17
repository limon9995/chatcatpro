import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { TelegramService } from '../common/telegram.service';

// Zero-touch WhatsApp connection request queue — mirrors FacebookService's
// PageRequest ("client adds admin as moderator, admin approves") pattern,
// but for WhatsApp: since a client requesting WhatsApp automation already
// has Facebook automation running, the request just enables WA on their
// existing Page rather than bootstrapping a new one. The admin does the
// actual Meta Business Manager work (register number under the agency's own
// Business Portfolio, verify OTP with the client, generate a permanent
// System User token) and pastes the result in via finalize().
@Injectable()
export class WaConnectRequestService {
  private readonly logger = new Logger(WaConnectRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly telegram: TelegramService,
  ) {}

  async submit(userId: string, pageId: number, phoneNumber: string, note?: string) {
    const phone = phoneNumber.trim();
    if (!phone) throw new BadRequestException('WhatsApp business ফোন নম্বর দিন');

    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');

    const existing = await this.prisma.waConnectRequest.findFirst({
      where: { pageId, status: 'pending' },
    });
    if (existing) return { success: true, request: existing, alreadyPending: true };

    const req = await this.prisma.waConnectRequest.create({
      data: { userId, pageId, phoneNumber: phone, note: note?.trim() || null },
    });
    this.logger.log(`[WaConnectRequest] New request #${req.id} for page ${pageId}: ${phone}`);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    void this.telegram.sendMessage(
      `📲 <b>নতুন WhatsApp Automation Request!</b> #${req.id}\n` +
        `👤 User: ${user?.name || userId} (${user?.email || ''})\n` +
        `📄 Page: ${page.pageName || page.pageId}\n` +
        `📞 Phone: ${phone}\n` +
        (note ? `📝 Note: ${note}\n` : '') +
        `🕐 সময়: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}\n\n` +
        `Admin Panel → WhatsApp Requests থেকে finalize করুন।`,
    );

    return { success: true, request: req };
  }

  async myRequests(userId: string) {
    return this.prisma.waConnectRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin-side ──────────────────────────────────────────────────────────

  async list(status?: string) {
    return this.prisma.waConnectRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { id: true, username: true, name: true, email: true } },
        page: { select: { id: true, pageName: true, pageId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async finalize(
    id: number,
    body: { waPhoneNumberId: string; waToken: string; waVerifyToken?: string; adminNote?: string },
  ) {
    const req = await this.prisma.waConnectRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already processed');

    const phoneNumberId = String(body.waPhoneNumberId || '').trim();
    const token = String(body.waToken || '').trim();
    if (!phoneNumberId || !token)
      throw new BadRequestException('waPhoneNumberId এবং waToken দুটোই লাগবে');

    await this.prisma.page.update({
      where: { id: req.pageId },
      data: {
        waEnabled: true,
        waPhoneNumberId: phoneNumberId,
        waToken: this.encryption.encryptIfNeeded(token),
        waVerifyToken: body.waVerifyToken?.trim() || crypto.randomBytes(16).toString('hex'),
      },
    });

    const updated = await this.prisma.waConnectRequest.update({
      where: { id },
      data: { status: 'approved', adminNote: body.adminNote?.trim() || null },
    });

    this.logger.log(`[WaConnectRequest] #${id} finalized → page ${req.pageId} WA enabled`);
    return { success: true, request: updated };
  }

  async reject(id: number, adminNote?: string) {
    const req = await this.prisma.waConnectRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already processed');

    await this.prisma.waConnectRequest.update({
      where: { id },
      data: { status: 'rejected', adminNote: adminNote?.trim() || null },
    });
    return { success: true };
  }
}
