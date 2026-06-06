import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { parseSms } from './sms-parser';
import { randomUUID } from 'crypto';

// pageId=-1 is the admin/chatcat billing sentinel
const ADMIN_PAGE_ID = -1;

export interface SmsMatchResult {
  matched: boolean;
  method?: string;
  amount?: number;
  senderPhone?: string;
}

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async handleIncoming(
    pageId: number,
    rawText: string,
    fromPhone?: string,
  ): Promise<void> {
    const parsed = parseSms(rawText);
    if (!parsed) {
      this.logger.warn(`Page ${pageId}: could not parse SMS: ${rawText.slice(0, 80)}`);
      return;
    }

    // Use fromPhone as senderPhone override if parser didn't find one
    const senderPhone = parsed.senderPhone ?? fromPhone ?? null;

    await this.prisma.receivedSms.create({
      data: {
        pageId,
        rawText,
        method: parsed.method,
        txId: parsed.txId,
        amount: parsed.amount,
        senderPhone,
      },
    });

    this.logger.log(
      `Page ${pageId}: stored ${parsed.method} SMS | txId=${parsed.txId} amount=${parsed.amount} from=${senderPhone}`,
    );

    // Clean up SMS older than 24 hours for this page
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.receivedSms.deleteMany({
      where: { pageId, receivedAt: { lt: cutoff } },
    });
  }

  async matchPayment(
    pageId: number,
    txId: string | null,
    customerPhone: string | null,
    expectedAmount: number,
  ): Promise<SmsMatchResult> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min window
    const baseWhere = { pageId, matched: false, receivedAt: { gte: cutoff } };

    // 1. Exact TxID match
    if (txId) {
      const sms = await this.prisma.receivedSms.findFirst({
        where: { ...baseWhere, txId: { equals: txId.toUpperCase(), mode: 'insensitive' } },
      });
      if (sms && sms.amount !== null && sms.amount >= expectedAmount - 1) {
        return this.markMatched(sms, pageId);
      }
    }

    // 2. Partial TxID match — customer may give last 4-8 chars only
    if (txId && txId.length >= 4) {
      const suffix = txId.toUpperCase().slice(-6);
      const recent = await this.prisma.receivedSms.findMany({
        where: { ...baseWhere, txId: { not: null }, amount: { gte: expectedAmount - 1 } },
        orderBy: { receivedAt: 'desc' },
        take: 20,
      });
      const partial = recent.find(s => s.txId?.toUpperCase().endsWith(suffix));
      if (partial) return this.markMatched(partial, pageId);
    }

    // 3. Fallback: sender phone + amount match
    if (customerPhone) {
      const last8 = customerPhone.replace(/\D/g, '').slice(-8);
      const sms = await this.prisma.receivedSms.findFirst({
        where: {
          ...baseWhere,
          senderPhone: { endsWith: last8 },
          amount: { gte: expectedAmount - 1 },
        },
        orderBy: { receivedAt: 'desc' },
      });
      if (sms) return this.markMatched(sms, pageId);
    }

    // 4. Amount-only match (last resort — risky, only if single SMS in window)
    const amountOnly = await this.prisma.receivedSms.findMany({
      where: { ...baseWhere, amount: { gte: expectedAmount - 1, lte: expectedAmount + 1 } },
      orderBy: { receivedAt: 'desc' },
      take: 2,
    });
    if (amountOnly.length === 1) return this.markMatched(amountOnly[0], pageId);

    return { matched: false };
  }

  private async markMatched(sms: any, pageId?: number): Promise<SmsMatchResult> {
    await this.prisma.receivedSms.update({ where: { id: sms.id }, data: { matched: true } });
    // Deduct 1% SMS verification fee from wallet
    if (pageId && sms.amount && sms.amount > 0) {
      const fee = Math.round(sms.amount * 0.01 * 100) / 100;
      await this.wallet.deductFixed(
        pageId,
        fee,
        `SMS Payment Verify fee 1% of ৳${sms.amount} (${(sms.method ?? '').toUpperCase()})`,
        'DEDUCT_SMS_VERIFY',
      );
    }
    return { matched: true, method: sms.method, amount: sms.amount ?? undefined, senderPhone: sms.senderPhone ?? undefined };
  }

  async getOrCreateToken(pageId: number): Promise<string> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { smsGatewayToken: true },
    });
    if (page?.smsGatewayToken) return page.smsGatewayToken;
    const token = randomUUID();
    await this.prisma.page.update({
      where: { id: pageId },
      data: { smsGatewayToken: token },
    });
    return token;
  }

  async regenerateToken(pageId: number): Promise<string> {
    const token = randomUUID();
    await this.prisma.page.update({
      where: { id: pageId },
      data: { smsGatewayToken: token },
    });
    return token;
  }

  async setEnabled(pageId: number, enabled: boolean): Promise<void> {
    await this.prisma.page.update({
      where: { id: pageId },
      data: { smsGatewayEnabled: enabled },
    });
  }

  async getStatus(pageId: number) {
    const last = await this.prisma.receivedSms.findFirst({
      where: { pageId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, method: true, amount: true },
    });
    const total = await this.prisma.receivedSms.count({ where: { pageId } });
    const matched = await this.prisma.receivedSms.count({ where: { pageId, matched: true } });
    return { lastReceived: last, totalStored: total, totalMatched: matched };
  }

  async getRecent(pageId: number) {
    return this.prisma.receivedSms.findMany({
      where: { pageId },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: { id: true, method: true, txId: true, amount: true, senderPhone: true, receivedAt: true, matched: true },
    });
  }

  // Returns pageId (merchant) or null. Callers check isAdmin separately via verifyAdminToken.
  async verifyPageToken(token: string): Promise<number | null> {
    const page = await this.prisma.page.findFirst({
      where: { smsGatewayToken: token, smsGatewayEnabled: true },
      select: { id: true },
    });
    return page?.id ?? null;
  }

  // ── Admin billing SMS methods ─────────────────────────────────────────────

  private getAdminToken(): string | null {
    try {
      const cfg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'storage', 'global-config.json'), 'utf8'),
      );
      return cfg.smsGatewayAdminToken ?? null;
    } catch {
      return null;
    }
  }

  isAdminToken(token: string): boolean {
    const adminToken = this.getAdminToken();
    return !!adminToken && adminToken === token;
  }

  async setAdminToken(token: string): Promise<void> {
    const cfgPath = path.join(process.cwd(), 'storage', 'global-config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.smsGatewayAdminToken = token;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  }

  async handleAdminIncoming(rawText: string, fromPhone?: string): Promise<void> {
    const parsed = parseSms(rawText);
    if (!parsed) {
      this.logger.warn(`Admin SMS: could not parse: ${rawText.slice(0, 80)}`);
      return;
    }
    const senderPhone = parsed.senderPhone ?? fromPhone ?? null;
    await this.prisma.receivedSms.create({
      data: {
        isAdminSms: true,
        rawText,
        method: parsed.method,
        txId: parsed.txId,
        amount: parsed.amount,
        senderPhone,
      },
    });
    this.logger.log(
      `Admin SMS stored: ${parsed.method} txId=${parsed.txId} amount=${parsed.amount}`,
    );
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.receivedSms.deleteMany({
      where: { isAdminSms: true, receivedAt: { lt: cutoff } },
    });
  }

  async matchAdminPayment(
    txId: string | null,
    expectedAmount: number,
  ): Promise<SmsMatchResult> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const baseWhere = { isAdminSms: true, matched: false, receivedAt: { gte: cutoff } };

    if (txId) {
      // Exact match
      const sms = await this.prisma.receivedSms.findFirst({
        where: { ...baseWhere, txId: { equals: txId.toUpperCase(), mode: 'insensitive' } },
      });
      if (sms && sms.amount !== null && sms.amount >= expectedAmount - 1) {
        return this.markMatched(sms);
      }
      // Partial suffix match
      if (txId.length >= 4) {
        const suffix = txId.toUpperCase().slice(-6);
        const recent = await this.prisma.receivedSms.findMany({
          where: { ...baseWhere, txId: { not: null }, amount: { gte: expectedAmount - 1 } },
          orderBy: { receivedAt: 'desc' },
          take: 20,
        });
        const partial = recent.find(s => s.txId?.toUpperCase().endsWith(suffix));
        if (partial) return this.markMatched(partial);
      }
    }
    return { matched: false };
  }

  async getAdminStatus() {
    const last = await this.prisma.receivedSms.findFirst({
      where: { isAdminSms: true },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, method: true, amount: true },
    });
    return { lastReceived: last };
  }
}
