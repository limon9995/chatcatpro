import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { TelegramNotificationService } from './telegram-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { MessengerService } from '../messenger/messenger.service';
import { TelegramService as AdminTelegramService } from '../common/telegram.service';
// Type import + runtime token for ModuleRef lookup. Not imported as a Nest
// module (CourierModule → OrdersModule → TelegramModule would be circular), so
// we resolve CourierService lazily via ModuleRef instead.
import { CourierService } from '../courier/courier.service';
// Same circular-dependency situation as CourierService (OrdersModule imports
// TelegramModule) — resolved lazily via ModuleRef.
import { OrdersService } from '../orders/orders.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramNotificationService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly messenger: MessengerService,
    private readonly adminTelegram: AdminTelegramService,
    private readonly moduleRef: ModuleRef,
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
    const token = body.token.trim();
    try {
      // Telegram's getUpdates returns nothing (silently, ok:true + empty
      // result) while a webhook is registered for this bot — and this app
      // registers one on every successful save (for the inline Confirm/
      // Courier buttons). A previous save attempt with this same token can
      // leave a webhook attached, permanently blocking auto-fetch even
      // though the customer's messages really did arrive. deleteWebhook is
      // a harmless no-op if none was set, so always clear it first.
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        signal: AbortSignal.timeout(8_000),
      }).catch(() => {});

      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?limit=10`,
        { signal: AbortSignal.timeout(8_000) },
      );
      const data = (await res.json()) as any;
      if (!data.ok) {
        return {
          ok: false,
          error: data.description || 'Invalid token or Telegram API error',
        };
      }
      const results = (data.result ?? []) as any[];
      // Pick the MOST RECENT message, not the first — Telegram returns
      // updates oldest-first, and stale test messages (e.g. the merchant
      // trying the bot themselves before handing it to their client) stay
      // queued for a while. Always fetching the last one ensures whoever
      // messaged most recently (the intended recipient) wins.
      const matching = results.filter(
        (u: any) => u.message?.chat?.id || u.channel_post?.chat?.id,
      );
      const update = matching[matching.length - 1];
      const chatId =
        update?.message?.chat?.id ?? update?.channel_post?.chat?.id ?? null;
      if (!chatId) {
        return {
          ok: false,
          error: 'No messages found. Please send a message to your bot first.',
        };
      }
      // Acknowledge all fetched updates so old/stale messages don't linger
      // and get picked up again by a future auto-fetch for this same bot.
      const lastUpdateId = results[results.length - 1]?.update_id;
      if (lastUpdateId !== undefined) {
        fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}`,
          { signal: AbortSignal.timeout(8_000) },
        ).catch(() => {});
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
   * Registers the webhook for the single global admin bot (the one that
   * sends PageRequest/AgentRequest notifications), so its Approve/Reject
   * inline buttons start working. Admin-only, run once after configuring
   * the admin bot token in Admin > API Keys (or again if it's ever changed).
   */
  @Post('setup-admin-webhook')
  @UseGuards(AuthGuard)
  async setupAdminWebhook(@Body() body: { baseUrl?: string }) {
    const token = this.adminTelegram.getAdminBotToken();
    if (!token) return { ok: false, error: 'No admin telegramBotToken configured' };
    const baseUrl = (body?.baseUrl ?? 'https://api.chatcat.pro').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/telegram/admin-callback/${encodeURIComponent(token)}`;
    return this.adminTelegram.setAdminWebhook(webhookUrl);
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

    // Parse action: confirm_{orderId} | fraud_{orderId} | payok_{orderId} | payfail_{orderId} | advrefund_confirm_{returnId} | advrefund_skip_{returnId}
    const parts = data.split('_');
    const action = parts[0];
    const orderId = parseInt(parts[parts.length - 1] ?? '0', 10);

    if (action === 'advrefund' && orderId) {
      const subAction = parts[1]; // 'confirm' or 'skip'
      await this.handleAdvanceRefund(page.id, orderId, subAction, token, callbackQueryId, page.telegramChatId ?? '');
    } else if (action === 'confirm' && orderId) {
      await this.handleConfirm(page.id, orderId, token, callbackQueryId, page.telegramChatId ?? '');
    } else if (action === 'courier' && orderId) {
      await this.handleCourierBook(page.id, orderId, token, callbackQueryId, page.telegramChatId ?? '');
    } else if ((action === 'payok' || action === 'payfail') && orderId) {
      await this.handlePaymentVerify(page.id, orderId, action === 'payok', token, callbackQueryId, page.telegramChatId ?? '');
    } else if (action === 'fraud' && orderId) {
      await this.handleFraud(page.id, orderId, token, callbackQueryId, page.telegramChatId ?? '');
    } else {
      await this.telegram.answerCallback(token, callbackQueryId, '❓ Unknown action');
    }

    return { ok: true };
  }

  /**
   * Callback endpoint for the single global ADMIN bot (PageRequest/AgentRequest
   * Approve/Reject buttons) — not tied to any Page. Secured by requiring the
   * URL's :token segment to match the currently configured admin bot token
   * (same secret-in-URL pattern as the per-page /telegram/callback/:encryptedToken
   * route above), since Telegram has nowhere else to authenticate this webhook.
   * No auth guard — Telegram calls this directly.
   */
  @Post('admin-callback/:token')
  async handleAdminCallback(
    @Param('token') token: string,
    @Body() update: any,
  ) {
    const expected = this.adminTelegram.getAdminBotToken();
    if (!expected || token !== expected) return { ok: true };

    const cbq = update?.callback_query;
    if (!cbq) return { ok: true };
    const callbackQueryId = cbq.id as string;
    const data = cbq.data as string | undefined;
    if (!data) return { ok: true };

    // Format: pagereq_reject_<id>
    // (approval no longer happens via callback_data — the Telegram message's
    // "Login with Facebook & Approve" button is a url button that goes
    // straight to /facebook/callback, bypassing this handler entirely.)
    const parts = data.split('_');
    const domain = parts[0];
    const action = parts[1];
    const id = parseInt(parts[parts.length - 1] ?? '0', 10);

    if (domain === 'pagereq' && id && action === 'reject') {
      await this.handleAdminPageRequestAction(id, action, callbackQueryId);
    } else if (
      domain === 'recharge' &&
      id &&
      (action === 'approve' || action === 'reject')
    ) {
      await this.handleRechargeAction(id, action, callbackQueryId);
    } else {
      await this.adminTelegram.answerCallback(callbackQueryId, '❓ Unknown action');
    }

    return { ok: true };
  }

  /**
   * Approve/reject a wallet recharge request straight from the admin Telegram
   * bot's inline buttons. The approve path mirrors
   * AdminService.approveRechargeRequest — replicated here (not injected) because
   * AdminModule already imports TelegramModule, so injecting AdminService would
   * create a circular dependency.
   */
  private async handleRechargeAction(
    id: number,
    action: 'approve' | 'reject',
    callbackQueryId: string,
  ) {
    const req = await this.prisma.walletRechargeRequest.findUnique({
      where: { id },
    });
    if (!req) {
      await this.adminTelegram.answerCallback(callbackQueryId, '❌ Request not found');
      return;
    }
    if (req.status !== 'pending') {
      await this.adminTelegram.answerCallback(
        callbackQueryId,
        `⏭️ Already ${req.status}`,
      );
      return;
    }

    if (action === 'reject') {
      await this.prisma.walletRechargeRequest.update({
        where: { id },
        data: { status: 'rejected', rejectedReason: 'Rejected via Telegram' },
      });
      await this.adminTelegram.answerCallback(callbackQueryId, '❌ Rejected');
      await this.adminTelegram.sendMessage(
        `❌ Recharge Request #${id} — rejected (via Telegram button)`,
      );
      return;
    }

    // approve — credit the wallet in one transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.page.update({
        where: { id: req.pageId },
        data: {
          walletBalanceBdt: { increment: req.amountBdt },
          subscriptionStatus: 'ACTIVE',
        },
      });
      await tx.walletTransaction.create({
        data: {
          pageId: req.pageId,
          type: 'RECHARGE',
          amountBdt: req.amountBdt,
          description: `${req.method.toUpperCase()} Recharge — TrxID: ${req.transactionId}`,
        },
      });
      await tx.walletRechargeRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: 'telegram-admin',
        },
      });
    });

    await this.adminTelegram.answerCallback(
      callbackQueryId,
      `✅ Approved! ৳${req.amountBdt} added`,
    );
    await this.adminTelegram.sendMessage(
      `✅ <b>Recharge Approved</b>\nRequest #${id} — ৳${req.amountBdt} balance যোগ হয়েছে (via Telegram)`,
    );
    // Notify the client on their page Telegram that the balance was added.
    void this.telegram.notify(
      req.pageId,
      `✅ <b>Wallet Recharge Approved</b>\n💰 ৳${req.amountBdt} আপনার balance-এ যোগ হয়েছে। ধন্যবাদ! 🎉`,
    );
  }

  private async handleAdminPageRequestAction(
    id: number,
    action: 'reject',
    callbackQueryId: string,
  ) {
    const req = await this.prisma.pageRequest.findUnique({ where: { id } });
    if (!req) {
      await this.adminTelegram.answerCallback(callbackQueryId, '❌ Request not found');
      return;
    }
    if (req.status !== 'pending') {
      await this.adminTelegram.answerCallback(callbackQueryId, `⏭️ Already ${req.status}`);
      return;
    }
    await this.prisma.pageRequest.update({ where: { id }, data: { status: 'rejected' } });
    await this.adminTelegram.answerCallback(callbackQueryId, '❌ Rejected!');
    await this.adminTelegram.sendMessage(
      `❌ Page Request #${id} — rejected (via Telegram button)`,
    );
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

  /**
   * Book the courier for an order straight from the Telegram button, using the
   * page's own courier settings (default courier + credentials configured on the
   * website). CourierService is resolved via ModuleRef to avoid a circular module
   * dependency (CourierModule → OrdersModule → TelegramModule).
   */
  private async handleCourierBook(
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
    if (order.status === 'CANCELLED') {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Order is cancelled');
      return;
    }
    const existing = await this.prisma.courierShipment.findUnique({
      where: { orderId },
    });
    if (existing?.trackingId) {
      await this.telegram.answerCallback(
        token,
        callbackQueryId,
        `✅ Already booked (${existing.trackingId})`,
      );
      return;
    }

    const courier = this.moduleRef.get(CourierService, { strict: false });
    const settings = courier.parseSettings(await courier.getSettings(pageId));
    if (!settings.defaultCourier || settings.defaultCourier === 'manual') {
      await this.telegram.answerCallback(
        token,
        callbackQueryId,
        '⚠️ Website-এ default courier setup করুন',
      );
      return;
    }

    const subtotal = (order.items || []).reduce(
      (s: number, i: any) => s + i.unitPrice * i.qty,
      0,
    );

    // Answer immediately (courier APIs can take a few seconds), then book.
    await this.telegram.answerCallback(
      token,
      callbackQueryId,
      `🚚 ${settings.defaultCourier}-এ পাঠানো হচ্ছে...`,
    );

    try {
      const shipment = await courier.bookShipment(pageId, {
        orderId,
        pageId,
        courier: settings.defaultCourier,
        recipientName: order.customerName || 'Customer',
        recipientPhone: order.phone || '',
        recipientAddress: order.address || '',
        codAmount: subtotal,
      });
      await this.telegram.sendRaw(
        token,
        chatId,
        `✅ <b>Order #${orderId} — Courier Booked</b> 🚚\n📦 ${settings.defaultCourier}\n🔖 Tracking: ${shipment?.trackingId || '-'}`,
      );
    } catch (err: any) {
      await this.telegram.sendRaw(
        token,
        chatId,
        `❌ Order #${orderId} courier booking failed: ${err?.message ?? err}`,
      );
    }
  }

  private async handleAdvanceRefund(
    pageId: number,
    returnId: number,
    subAction: string,
    token: string,
    callbackQueryId: string,
    chatId: string,
  ) {
    const returnEntry = await this.prisma.returnEntry.findFirst({
      where: { id: returnId, pageId },
      include: {
        order: {
          select: { id: true, customerPsid: true, customerName: true, phone: true, pageIdRef: true, page: { select: { pageToken: true, currencySymbol: true } } },
        },
      },
    });

    if (!returnEntry) {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Return entry not found');
      return;
    }
    if (returnEntry.refundStatus === 'given') {
      await this.telegram.answerCallback(token, callbackQueryId, '✅ Already refunded');
      return;
    }
    if (returnEntry.refundStatus === 'not_applicable') {
      await this.telegram.answerCallback(token, callbackQueryId, '⏭️ Already skipped');
      return;
    }

    const sym = returnEntry.order.page?.currencySymbol || '৳';
    const amount = returnEntry.refundAmount;

    if (subAction === 'skip') {
      await this.prisma.returnEntry.update({
        where: { id: returnId },
        data: { refundStatus: 'not_applicable' },
      });
      await this.telegram.answerCallback(token, callbackQueryId, '⏭️ Skipped');
      await this.telegram.sendRaw(token, chatId, `⏭️ Advance refund for Order #${returnEntry.orderId} marked as N/A`);
      return;
    }

    // subAction === 'confirm'
    await this.prisma.returnEntry.update({
      where: { id: returnId },
      data: {
        refundStatus: 'given',
        refundGivenAt: new Date(),
        refundGivenAmount: amount,
        refundMethod: 'bkash_manual',
      },
    });

    // Send customer Messenger message
    const psid = returnEntry.order.customerPsid;
    const pageToken = returnEntry.order.page?.pageToken;
    if (psid && pageToken) {
      const msg = `✅ আপনার অর্ডার #${returnEntry.orderId} এর অগ্রিম ${sym}${amount} ফেরত পাঠানো হয়েছে। ধন্যবাদ! 💖`;
      await this.messenger.sendText(pageToken, psid, msg, 'ACCOUNT_UPDATE');
    }

    await this.telegram.answerCallback(token, callbackQueryId, `✅ Refund confirmed! ${sym}${amount}`);
    await this.telegram.sendRaw(
      token,
      chatId,
      `✅ <b>Refund Confirmed</b>\nOrder #${returnEntry.orderId} — ${returnEntry.order.customerName || 'Customer'}\n💰 ${sym}${amount} refunded`,
    );
  }

  /**
   * Approve/reject a manual advance payment (trxID/screenshot) straight from
   * the Telegram button. Delegates to OrdersService.verifyPayment — the same
   * path the dashboard uses — so approve also confirms the order and sends the
   * customer their confirmation message. OrdersService is resolved via
   * ModuleRef to avoid the OrdersModule → TelegramModule circular dependency.
   */
  private async handlePaymentVerify(
    pageId: number,
    orderId: number,
    approve: boolean,
    token: string,
    callbackQueryId: string,
    chatId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, pageIdRef: pageId },
      select: {
        id: true,
        customerName: true,
        phone: true,
        customerPsid: true,
        paymentStatus: true,
        paymentVerifyStatus: true,
        transactionId: true,
        page: { select: { pageToken: true } },
      },
    });
    if (!order) {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Order not found');
      return;
    }
    if (order.paymentStatus !== 'advance_paid') {
      await this.telegram.answerCallback(token, callbackQueryId, '⚠️ এই order-এ কোনো advance payment নেই');
      return;
    }
    if (order.paymentVerifyStatus === 'verified') {
      await this.telegram.answerCallback(token, callbackQueryId, '✅ Already approved');
      return;
    }
    if (!approve && order.paymentVerifyStatus === 'verify_failed') {
      await this.telegram.answerCallback(token, callbackQueryId, '❌ Already rejected');
      return;
    }

    const orders = this.moduleRef.get(OrdersService, { strict: false });

    if (approve) {
      try {
        // verifyPayment('verified') also confirms the order, messages the
        // customer (order_confirmed template) and sends the merchant a
        // Telegram summary — no extra sends needed here.
        await orders.verifyPayment(orderId, 'verified', pageId);
        await this.telegram.answerCallback(token, callbackQueryId, '✅ Payment approved!');
      } catch (err: any) {
        await this.telegram.answerCallback(token, callbackQueryId, `❌ ${err?.message ?? 'Failed'}`);
      }
      return;
    }

    try {
      await orders.verifyPayment(orderId, 'verify_failed', pageId);
    } catch (err: any) {
      await this.telegram.answerCallback(token, callbackQueryId, `❌ ${err?.message ?? 'Failed'}`);
      return;
    }
    await this.telegram.answerCallback(token, callbackQueryId, '❌ Payment rejected');
    await this.telegram.sendRaw(
      token,
      chatId,
      `❌ <b>Payment Rejected</b> — Order #${orderId}\n👤 ${order.customerName || 'Customer'} | 📞 ${order.phone ?? '-'}\n💳 Proof: ${order.transactionId ?? '-'}\nCustomer-কে জানানো হয়েছে সঠিক Transaction ID পাঠাতে।`,
    );
    // Tell the customer politely so they can re-send the correct proof
    if (order.customerPsid && order.page?.pageToken) {
      const msg = `দুঃখিত, আপনার অর্ডার #${orderId}-এর payment টি আমরা verify করতে পারিনি 😔 অনুগ্রহ করে Transaction ID টি আবার check করে পাঠান, অথবা payment-এর screenshot দিন 💖`;
      await this.messenger
        .sendText(order.page.pageToken, order.customerPsid, msg, 'ACCOUNT_UPDATE')
        .catch(() => {});
    }
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
