import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { TelegramNotificationService } from './telegram-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramNotificationService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  @Post('test')
  @UseGuards(AuthGuard)
  async test(@Body() body: { token: string; chatId: string }) {
    if (!body?.token || !body?.chatId) {
      return { ok: false, error: 'token and chatId are required' };
    }
    return this.telegram.sendTest(body.token.trim(), body.chatId.trim());
  }

  @Post('fetch-chat-id')
  @UseGuards(AuthGuard)
  async fetchChatId(@Body() body: { token: string }) {
    if (!body?.token) {
      return { ok: false, error: 'token is required' };
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${body.token.trim()}/getUpdates?limit=10`,
        { signal: AbortSignal.timeout(8_000) },
      );
      const data = await res.json() as any;
      if (!data.ok) {
        return { ok: false, error: 'Invalid token or Telegram API error' };
      }
      const update = (data.result ?? []).find(
        (u: any) => u.message?.chat?.id || u.channel_post?.chat?.id,
      );
      const chatId =
        update?.message?.chat?.id ?? update?.channel_post?.chat?.id ?? null;
      if (!chatId) {
        return {
          ok: false,
          error: 'No messages found. Please send a message to your bot first.',
        };
      }
      return { ok: true, chatId: String(chatId) };
    } catch {
      return { ok: false, error: 'Failed to reach Telegram API' };
    }
  }

  /**
   * Auto-setup: set Telegram webhook after saving bot token.
   * Called from client-dashboard settings save.
   */
  @Post('setup-webhook')
  @UseGuards(AuthGuard)
  async setupWebhook(@Body() body: { token: string; pageId: number; baseUrl?: string }) {
    if (!body?.token || !body?.pageId) {
      return { ok: false, error: 'token and pageId required' };
    }
    const encryptedToken = this.encryption.encrypt(body.token.trim());
    const baseUrl = (body.baseUrl ?? 'https://api.chatcat.pro').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/telegram/callback/${encodeURIComponent(encryptedToken)}`;
    return this.telegram.setWebhook(body.token.trim(), webhookUrl);
  }

  /**
   * Telegram sends callback_query events here when inline buttons are pressed.
   * URL: POST /telegram/callback/:encryptedToken
   * No auth guard — Telegram calls this directly.
   */
  @Post('callback/:encryptedToken')
  async handleCallback(
    @Param('encryptedToken') encryptedToken: string,
    @Body() update: any,
  ) {
    // Handle callback_query (button press)
    const cbq = update?.callback_query;
    if (!cbq) return { ok: true };

    const callbackQueryId = cbq.id as string;
    const data = cbq.data as string | undefined;
    if (!data) return { ok: true };

    // Find page by encrypted token
    const page = await this.prisma.page.findFirst({
      where: { telegramBotToken: encryptedToken },
      select: { id: true, telegramChatId: true, telegramBotToken: true },
    });
    if (!page || !page.telegramBotToken) return { ok: true };

    const token = this.encryption.decrypt(page.telegramBotToken);

    // Parse action: confirm_{orderId} | fraud_{orderId}
    const [action, orderIdStr] = data.split('_');
    const orderId = parseInt(orderIdStr ?? '0', 10);

    if (action === 'confirm' && orderId) {
      await this.handleConfirm(page.id, orderId, token, callbackQueryId, page.telegramChatId ?? '');
    } else if (action === 'fraud' && orderId) {
      await this.handleFraud(page.id, orderId, token, callbackQueryId, page.telegramChatId ?? '');
    } else {
      await this.telegram.answerCallback(token, callbackQueryId, '❓ Unknown action');
    }

    return { ok: true };
  }

  private async handleConfirm(
    pageId: number,
    orderId: number,
    token: string,
    callbackQueryId: string,
    chatId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, pageIdRef: pageId },
      include: { items: true },
    });
    if (!order) {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Order not found');
      return;
    }
    if (order.status === 'CONFIRMED') {
      await this.telegram.answerCallback(token, callbackQueryId, '✅ Already confirmed');
      return;
    }
    if (order.status === 'CANCELLED') {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Order is cancelled');
      return;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    await this.telegram.answerCallback(token, callbackQueryId, '✅ Order confirmed!');
    await this.telegram.sendRaw(
      token,
      chatId,
      `✅ <b>Order #${orderId} Confirmed!</b>\n👤 ${order.customerName}\n📞 ${order.phone ?? '-'}`,
    );
  }

  private async handleFraud(
    pageId: number,
    orderId: number,
    token: string,
    callbackQueryId: string,
    chatId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, pageIdRef: pageId },
      select: { id: true, customerName: true, phone: true, spamRisk: true, spamScore: true, spamTotalOrders: true, spamDelivered: true, spamCancelled: true },
    });
    if (!order) {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Order not found');
      return;
    }

    const riskEmoji = order.spamRisk === 'high' ? '🔴' : order.spamRisk === 'medium' ? '🟡' : order.spamRisk === 'low' ? '🟢' : '⚪';
    const total = order.spamTotalOrders ?? 0;
    const delivered = order.spamDelivered ?? 0;
    const cancelled = order.spamCancelled ?? 0;

    const msg = [
      `🔍 <b>Fraud Check — Order #${order.id}</b>`,
      `👤 ${order.customerName} | 📞 ${order.phone ?? '-'}`,
      `${riskEmoji} Risk: <b>${(order.spamRisk ?? 'unknown').toUpperCase()}</b>`,
      total > 0
        ? `📊 Total: ${total} | ✅ Delivered: ${delivered} | ❌ Cancelled: ${cancelled}`
        : `📊 No order history found`,
    ].join('\n');

    await this.telegram.answerCallback(token, callbackQueryId, `${riskEmoji} Risk: ${order.spamRisk ?? 'unknown'}`);
    await this.telegram.sendRaw(token, chatId, msg);
  }
}
