import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

const TRIAL_DAYS = 7;
const PAGE_FEATURE_FIELDS = [
  'automationAllowed',
  'ocrAllowed',
  'infoModeAllowed',
  'orderModeAllowed',
  'printModeAllowed',
  'callConfirmModeAllowed',
  'memoSaveModeAllowed',
  'memoTemplateModeAllowed',
  'autoMemoDesignModeAllowed',
] as const;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly globalConfigFile = path.join(
    process.cwd(),
    'storage',
    'global-config.json',
  );

  constructor(private readonly prisma: PrismaService) {}

  // ── Startup: seed / sync plans ───────────────────────────────────────────
  async onModuleInit() {
    const plans = [
      {
        id: 'plan_basic',
        name: 'basic',
        displayName: 'Basic',
        priceMonthly: 999,
        ordersLimit: 200,
        pagesLimit: 1,
        agentsLimit: 1,
      },
      {
        id: 'plan_starter',
        name: 'starter',
        displayName: 'Starter',
        priceMonthly: 1699,
        ordersLimit: 400,
        pagesLimit: 1,
        agentsLimit: 1,
      },
      {
        id: 'plan_pro',
        name: 'pro',
        displayName: 'Pro',
        priceMonthly: 3499,
        ordersLimit: 800,
        pagesLimit: 3,
        agentsLimit: 3,
      },
      {
        id: 'plan_business',
        name: 'business',
        displayName: 'Business',
        priceMonthly: 7999,
        ordersLimit: 2000,
        pagesLimit: 10,
        agentsLimit: 10,
      },
    ];

    for (const plan of plans) {
      await this.prisma.plan.upsert({
        where: { name: plan.name },
        update: {
          displayName: plan.displayName,
          priceMonthly: plan.priceMonthly,
          ordersLimit: plan.ordersLimit,
          pagesLimit: plan.pagesLimit,
          agentsLimit: plan.agentsLimit,
          isActive: true,
        },
        create: { ...plan, isActive: true },
      });
    }
    // Deactivate old plans no longer in use (enterprise)
    await this.prisma.plan.updateMany({
      where: { name: { in: ['enterprise'] } },
      data: { isActive: false },
    });
    this.logger.log('[Billing] Plans synced (basic/starter/pro/business)');
  }

  // ── Get or create subscription for user ──────────────────────────────────
  async getOrCreateSubscription(userId: string) {
    let sub = await this.prisma.subscription.findFirst({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      const plan = await this.prisma.plan.findFirst({
        where: { name: 'starter' },
      });
      const now = new Date();
      const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
      const periodEnd = new Date(now.getTime() + 30 * 86_400_000);

      sub = await this.prisma.subscription.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          planId: plan!.id,
          status: 'trial',
          periodStart: now,
          periodEnd,
          ordersLimit: plan!.ordersLimit,
          trialEndsAt: trialEnd,
          nextPaymentDue: trialEnd,
        },
        include: { plan: true },
      });
      this.logger.log(
        `[Billing] Trial subscription created for user ${userId}`,
      );
    }
    return sub;
  }

  // ── Get subscription status summary ──────────────────────────────────────
  async getStatus(userId: string) {
    const sub = await this.getOrCreateSubscription(userId);
    const now = new Date();

    // Auto-expire trial
    if (sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt < now) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired', updatedAt: now },
      });
      sub.status = 'expired';
    }

    // Auto-expire active
    if (sub.status === 'active' && sub.periodEnd < now) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'grace', updatedAt: now },
      });
      sub.status = 'grace';
    }

    const daysLeft =
      sub.status === 'trial' && sub.trialEndsAt
        ? Math.max(
            0,
            Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000),
          )
        : Math.max(
            0,
            Math.ceil((sub.periodEnd.getTime() - now.getTime()) / 86_400_000),
          );

    const ordersUsed = sub.ordersUsed;
    const ordersLimit = sub.ordersLimit;
    const usagePct =
      ordersLimit === -1
        ? 0
        : Math.min(100, Math.round((ordersUsed / ordersLimit) * 100));

    return {
      subscriptionId: sub.id,
      status: sub.status, // trial | active | expired | grace | cancelled
      planName: (sub as any).plan?.name || 'starter',
      planDisplay: (sub as any).plan?.displayName || 'Starter',
      priceMonthly: (sub as any).plan?.priceMonthly || 999,
      daysLeft,
      periodEnd: sub.periodEnd.toISOString(),
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      ordersUsed,
      ordersLimit,
      usagePct,
      nextPaymentDue: sub.nextPaymentDue?.toISOString() ?? null,
      isActive: ['trial', 'active', 'grace'].includes(sub.status),
      canTakeOrders: this.canTakeOrders(sub),
      warnings: this.buildWarnings(sub, daysLeft, usagePct),
      adminContact: this.getBillingSupportContact(),
    };
  }

  // ── Check if user can take new orders ────────────────────────────────────
  canTakeOrders(sub: any): boolean {
    if (!['trial', 'active', 'grace'].includes(sub.status)) return false;
    if (sub.ordersLimit === -1) return true;
    return sub.ordersUsed < sub.ordersLimit;
  }

  // ── Increment order usage ─────────────────────────────────────────────────
  async incrementOrderUsage(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { ordersUsed: { increment: 1 }, updatedAt: new Date() },
    });
  }

  // ── Submit payment (client submits bKash transaction ID) ──────────────────
  async submitPayment(
    userId: string,
    body: {
      amount: number;
      method: string;
      transactionId: string;
      note?: string;
    },
  ) {
    const sub = await this.getOrCreateSubscription(userId);
    if (!body.transactionId?.trim())
      throw new BadRequestException('Transaction ID required');
    if (body.amount <= 0) throw new BadRequestException('Invalid amount');

    const payment = await this.prisma.payment.create({
      data: {
        id: crypto.randomUUID(),
        subscriptionId: sub.id,
        amount: body.amount,
        method: body.method || 'bkash',
        transactionId: body.transactionId.trim(),
        status: 'pending',
        note: body.note ?? null,
        paidAt: new Date(),
      },
    });

    this.logger.log(
      `[Billing] Payment submitted userId=${userId} txn=${body.transactionId} amount=${body.amount}`,
    );
    return {
      paymentId: payment.id,
      status: 'pending',
      message:
        'আপনার payment received। Admin confirm করলে subscription activate হবে।',
    };
  }

  // ── Get payment history ───────────────────────────────────────────────────
  async getPayments(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return [];
    return this.prisma.payment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ── Get all plans ─────────────────────────────────────────────────────────
  async getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  // ── ADMIN: Confirm payment + activate subscription ────────────────────────
  async adminConfirmPayment(
    paymentId: string,
    adminUserId: string,
    planName?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'confirmed')
      throw new BadRequestException('Already confirmed');

    // Confirm payment
    const now = new Date();
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'confirmed', confirmedAt: now, confirmedBy: adminUserId },
    });

    // Activate / extend subscription
    const plan = planName
      ? await this.prisma.plan.findFirst({ where: { name: planName } })
      : payment.subscription.plan;

    if (!plan) throw new NotFoundException('Plan not found');

    const periodStart = now;
    const periodEnd = new Date(now.getTime() + 30 * 86_400_000);

    await this.prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: 'active',
        planId: plan.id,
        ordersLimit: plan.ordersLimit,
        periodStart,
        periodEnd,
        ordersUsed: 0, // reset usage on new payment
        lastPaymentAt: now,
        nextPaymentDue: periodEnd,
        updatedAt: now,
      },
    });

    this.logger.log(
      `[Billing] Payment confirmed ${paymentId} → subscription activated plan=${plan.name}`,
    );
    return {
      success: true,
      message: `Subscription activated — ${plan.displayName} until ${periodEnd.toLocaleDateString()}`,
    };
  }

  // ── ADMIN: List all subscriptions ─────────────────────────────────────────
  async adminListSubscriptions(filter?: { status?: string }) {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    return this.prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            pages: {
              select: {
                id: true,
                pageName: true,
                automationAllowed: true,
                ocrAllowed: true,
                infoModeAllowed: true,
                orderModeAllowed: true,
                printModeAllowed: true,
                callConfirmModeAllowed: true,
                memoSaveModeAllowed: true,
                memoTemplateModeAllowed: true,
                autoMemoDesignModeAllowed: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── ADMIN: List pending payments ──────────────────────────────────────────
  async adminListPendingPayments() {
    return this.prisma.payment.findMany({
      where: { status: 'pending' },
      include: {
        subscription: {
          include: {
            plan: true,
            user: { select: { id: true, username: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── ADMIN: Manually set subscription ─────────────────────────────────────
  async adminSetSubscription(
    userId: string,
    body: {
      planName: string;
      status: string;
      periodDays?: number;
      ordersLimit?: number;
      note?: string;
      featureAccess?: Partial<Record<(typeof PAGE_FEATURE_FIELDS)[number], boolean>>;
    },
  ) {
    const plan = await this.prisma.plan.findFirst({
      where: { name: body.planName },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const existing = await this.prisma.subscription.findFirst({
      where: { userId },
    });
    const now = new Date();
    const days = body.periodDays ?? 30;
    const periodEnd = new Date(now.getTime() + days * 86_400_000);
    const nextOrdersLimit =
      typeof body.ordersLimit === 'number' && Number.isFinite(body.ordersLimit)
        ? body.ordersLimit
        : plan.ordersLimit;
    const pagePatch = this.buildPageFeaturePatch(body.featureAccess);

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: body.status,
          ordersLimit: nextOrdersLimit,
          ordersUsed: 0,
          periodStart: now,
          periodEnd,
          nextPaymentDue: periodEnd,
          note: body.note ?? null,
          updatedAt: now,
        },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          planId: plan.id,
          status: body.status,
          ordersLimit: nextOrdersLimit,
          periodStart: now,
          periodEnd,
          nextPaymentDue: periodEnd,
          note: body.note ?? null,
        },
      });
    }
    if (Object.keys(pagePatch).length > 0) {
      await this.prisma.page.updateMany({
        where: { ownerId: userId },
        data: pagePatch,
      });
    }
    this.logger.log(
      `[Billing] Admin set subscription for ${userId} → ${body.planName} / ${body.status}`,
    );
    return { success: true };
  }

  // ── Reset monthly usage (called by cron on 1st of month) ─────────────────
  async resetMonthlyUsage() {
    const result = await this.prisma.subscription.updateMany({
      where: { status: { in: ['active', 'trial'] } },
      data: { ordersUsed: 0 },
    });
    this.logger.log(
      `[Billing] Monthly usage reset — ${result.count} subscriptions`,
    );
    return result.count;
  }

  // ── Build warning messages ────────────────────────────────────────────────
  private buildWarnings(
    sub: any,
    daysLeft: number,
    usagePct: number,
  ): string[] {
    const w: string[] = [];
    if (sub.status === 'trial' && daysLeft <= 3)
      w.push(`⚠️ Trial ${daysLeft} দিনে শেষ হবে — upgrade করুন`);
    if (sub.status === 'trial' && daysLeft <= 7)
      w.push(`Trial ${daysLeft} দিন বাকি`);
    if (sub.status === 'active' && daysLeft <= 2)
      w.push(`⚠️ Subscription ${daysLeft} দিনের মধ্যে শেষ হবে — admin এর সাথে কথা বলুন`);
    if (sub.status === 'expired')
      w.push('❌ Subscription expired — payment করুন');
    if (sub.status === 'grace') w.push('⚠️ Grace period চলছে — payment করুন');
    if (usagePct >= 90 && sub.ordersLimit !== -1)
      w.push(`⚠️ ${usagePct}% order limit used`);
    if (usagePct >= 100 && sub.ordersLimit !== -1)
      w.push('❌ Order limit reached — upgrade করুন');
    return w;
  }

  private buildPageFeaturePatch(
    input?: Partial<Record<(typeof PAGE_FEATURE_FIELDS)[number], boolean>>,
  ) {
    const patch: Record<string, boolean> = {};
    for (const field of PAGE_FEATURE_FIELDS) {
      if (typeof input?.[field] === 'boolean') {
        patch[field] = input[field] as boolean;
      }
    }
    return patch;
  }

  private getBillingSupportContact() {
    try {
      if (fs.existsSync(this.globalConfigFile)) {
        const cfg = JSON.parse(fs.readFileSync(this.globalConfigFile, 'utf8'));
        const support = cfg?.billingSupport || {};
        return {
          label: String(support.label || 'Admin Support').trim(),
          phone: String(support.phone || '').trim(),
          whatsappUrl: String(support.whatsappUrl || '').trim(),
          messengerUrl: String(support.messengerUrl || '').trim(),
          email: String(support.email || '').trim(),
          note: String(support.note || '').trim(),
        };
      }
    } catch {}
    return {
      label: 'Admin Support',
      phone: '',
      whatsappUrl: '',
      messengerUrl: '',
      email: '',
      note: '',
    };
  }
}
