import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';

/**
 * Sends automated Messenger messages to customers when key order events happen.
 *
 * Events:
 *   order_confirmed    — Agent confirms order from dashboard
 *   order_courier_sent — Order booked with courier
 *
 * Message templates are stored in the question bank (systemReplies)
 * so each page owner can customize them.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: MessengerService,
    private readonly knowledge: BotKnowledgeService,
  ) {}

  /** Send order-confirmed message to customer. */
  async notifyConfirmed(pageId: number, orderId: number): Promise<void> {
    await this.send(pageId, orderId, 'order_confirmed', {});
  }

  /** Send courier-booked message to customer. */
  async notifyCourierSent(
    pageId: number,
    orderId: number,
    opts: {
      courierName: string;
      trackingId: string | null;
    },
  ): Promise<void> {
    await this.send(pageId, orderId, 'order_courier_sent', {
      courierName: opts.courierName || 'Courier',
      trackingId: opts.trackingId || '—',
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async send(
    pageId: number,
    orderId: number,
    key: string,
    vars: Record<string, any>,
  ): Promise<void> {
    try {
      // Get order — need customerPsid
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order || !order.customerPsid || order.pageIdRef !== pageId) return;

      // Get page token
      const page = await this.prisma.page.findUnique({ where: { id: pageId } });
      if (!page || !page.pageToken) return;

      // Resolve template with order-specific variables
      const text = await this.knowledge.resolveSystemReply(pageId, key, {
        ...vars,
        orderId: orderId,
        customerName: order.customerName || '',
      });

      if (!text) return;

      await this.messenger.sendText(page.pageToken, order.customerPsid, text);
      this.logger.log(
        `[OrderNotify] ${key} → psid=${order.customerPsid} order=#${orderId}`,
      );
    } catch (err) {
      // Never crash the main flow — notification is best-effort
      this.logger.warn(
        `[OrderNotify] Failed to send ${key} for order #${orderId}: ${err}`,
      );
    }
  }
}
