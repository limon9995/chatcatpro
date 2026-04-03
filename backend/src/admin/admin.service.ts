import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';

export interface CallServerConfig {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
}

export interface GlobalConfig {
  callFeatureEnabled: boolean;
  callServers: CallServerConfig[];
  billingSupport?: {
    label?: string;
    phone?: string;
    whatsappUrl?: string;
    messengerUrl?: string;
    email?: string;
    note?: string;
  };
}

const DEFAULT_CALL_SERVERS: CallServerConfig[] = [
  { id: 'MANUAL',      name: 'Manual Call',             icon: '👤', enabled: true  },
  { id: 'TWILIO',      name: 'Server 1 (Twilio)',        icon: '📡', enabled: false },
  { id: 'SSLWIRELESS', name: 'Server 2 (SSLWireless)',   icon: '🇧🇩', enabled: false },
  { id: 'BDCALLING',   name: 'Server 3 (BDCalling)',     icon: '📲', enabled: false },
];

export interface TutorialsConfig {
  courier: {
    pathao: string;
    steadfast: string;
    redx: string;
    paperfly: string;
  };
  facebookAccessToken: string;
  generalOnboarding: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botKnowledge: BotKnowledgeService,
  ) {}

  async overview() {
    const [
      totalPages,
      activePages,
      totalProducts,
      totalOrders,
      todayOrders,
      pendingOrders,
      confirmedOrders,
      totalUsers,
      activeUsers,
    ] = await Promise.all([
      this.prisma.page.count().catch(() => 0),
      this.prisma.page
        .count({ where: { isActive: true, automationOn: true } })
        .catch(() => 0),
      this.prisma.product.count().catch(() => 0),
      this.prisma.order.count().catch(() => 0),
      this.prisma.order
        .count({
          where: {
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        })
        .catch(() => 0),
      this.prisma.order
        .count({ where: { status: { in: ['RECEIVED', 'PENDING'] } } })
        .catch(() => 0),
      this.prisma.order
        .count({ where: { status: 'CONFIRMED' } })
        .catch(() => 0),
      this.prisma.user.count().catch(() => 0),
      this.prisma.user
        .count({ where: { isActive: true, role: 'client' } })
        .catch(() => 0),
    ]);

    // Pages with bot ON vs OFF
    const pagesWithBot = activePages;
    const pagesWithoutBot = totalPages - activePages;

    // Learning log unmatched count
    const learningLog = this.botKnowledge.getLearningLog();
    const unmatchedCount = Array.isArray(learningLog) ? learningLog.length : 0;

    return {
      // System
      totalPages,
      pagesWithBot,
      pagesWithoutBot,
      totalUsers,
      activeUsers,
      // Products
      totalProducts,
      // Orders
      totalOrders,
      todayOrders,
      pendingOrders,
      confirmedOrders,
      // Bot knowledge health
      unmatchedMessages: unmatchedCount,
      // Meta
      generatedAt: new Date().toISOString(),
    };
  }

  async clients() {
    const users = await this.prisma.user.findMany({
      where: { role: 'client' },
      include: {
        pages: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            isActive: true,
            automationOn: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
      pages: u.pages,
    }));
  }

  async clientDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { pages: true },
    });
    if (!user || user.role !== 'client')
      throw new NotFoundException('Client not found');
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      pages: user.pages,
    };
  }

  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      database: db,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Admin: read/write page business settings ──────────────────────────────
  async getPageSettings(pageId: number) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async updatePageSettings(pageId: number, body: any) {
    const MODE_ACCESS_MAP: Record<string, string> = {
      automationOn: 'automationAllowed',
      ocrOn: 'ocrAllowed',
      infoModeOn: 'infoModeAllowed',
      orderModeOn: 'orderModeAllowed',
      printModeOn: 'printModeAllowed',
      callConfirmModeOn: 'callConfirmModeAllowed',
      memoSaveModeOn: 'memoSaveModeAllowed',
      memoTemplateModeOn: 'memoTemplateModeAllowed',
      autoMemoDesignModeOn: 'autoMemoDesignModeAllowed',
    };
    const ALLOWED = [
      'businessName',
      'businessPhone',
      'businessAddress',
      'websiteUrl',
      'currencySymbol',
      'codLabel',
      'deliveryFeeInsideDhaka',
      'deliveryFeeOutsideDhaka',
      'deliveryTimeText',
      'productCodePrefix',
      'paymentMode',
      'advanceAmount',
      'advanceBkash',
      'advanceNagad',
      'advancePaymentMessage',
      'catalogMessengerUrl',
      'catalogSlug',
      'ocrOn',
      'infoModeOn',
      'orderModeOn',
      'printModeOn',
      'callConfirmModeOn',
      'memoSaveModeOn',
      'memoTemplateModeOn',
      'autoMemoDesignModeOn',
      'automationOn',
    ];
    const patch: any = {};
    for (const k of ALLOWED) {
      if (!(k in body)) continue;
      const v = body[k];
      if (
        k === 'deliveryFeeInsideDhaka' ||
        k === 'deliveryFeeOutsideDhaka' ||
        k === 'advanceAmount'
      ) {
        patch[k] = Number(v);
      } else if (
        [
          'ocrOn',
          'infoModeOn',
          'orderModeOn',
          'printModeOn',
          'callConfirmModeOn',
          'memoSaveModeOn',
          'memoTemplateModeOn',
          'autoMemoDesignModeOn',
          'automationOn',
        ].includes(k)
      ) {
        patch[k] = Boolean(v);
        patch[MODE_ACCESS_MAP[k]] = Boolean(v);
      } else if (k === 'productCodePrefix') {
        const p = String(v || 'DF')
          .toUpperCase()
          .replace(/[^A-Z]/g, '');
        if (p.length >= 2 && p.length <= 6) patch[k] = p;
      } else {
        patch[k] = v === '' ? null : v;
      }
    }
    await this.prisma.page.update({ where: { id: pageId }, data: patch });
    return this.prisma.page.findUnique({ where: { id: pageId } });
  }

  // ── Global Bot Knowledge ────────────────────────────────────────────────────
  getGlobalBotKnowledge() {
    return this.botKnowledge.getGlobalConfig();
  }
  updateGlobalBotQuestions(questions: any[]) {
    return this.botKnowledge.updateGlobalQuestions(questions || []);
  }
  updateGlobalBotSystemReplies(replies: any) {
    return this.botKnowledge.updateGlobalSystemReplies(replies || {});
  }
  updateGlobalBotAreas(areas: any[]) {
    return this.botKnowledge.updateGlobalAreas(areas || []);
  }
  getBotLearningLog() {
    return this.botKnowledge.getLearningLog();
  }
  createQuestionFromLearning(body: any) {
    return this.botKnowledge.createQuestionFromLearning(body || {});
  }

  // ── Admin: read ANY page's bot-knowledge config ────────────────────────────
  async getClientBotKnowledge(pageId: number) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    return this.botKnowledge.getConfig(pageId);
  }

  // ── Admin: push questions to a specific client page ────────────────────────
  async setClientPageQuestions(pageId: number, questions: any[]) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    return this.botKnowledge.updateQuestions(pageId, questions || []);
  }

  // ── Admin: push system replies to a specific client page ──────────────────
  async setClientPageSystemReplies(pageId: number, systemReplies: any) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    return this.botKnowledge.updateSystemReplies(pageId, systemReplies || {});
  }

  // ── Admin: push a single global question to a client page ─────────────────
  async pushGlobalQuestionToPage(pageId: number, key: string) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    return this.botKnowledge.importGlobalQuestion(pageId, key);
  }

  // ── Get all pages with their owner info (for admin knowledge view) ─────────
  async getAllPages() {
    return this.prisma.page.findMany({
      select: {
        id: true,
        pageId: true,
        pageName: true,
        isActive: true,
        automationOn: true,
        ownerId: true,
        owner: { select: { id: true, username: true, name: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  // ── Global Config (callFeatureEnabled, callServers, …) ────────────────────
  private readonly globalConfigFile = path.join(
    process.cwd(),
    'storage',
    'global-config.json',
  );

  private _readGlobalConfig(): GlobalConfig {
    try {
      if (fs.existsSync(this.globalConfigFile)) {
        return JSON.parse(fs.readFileSync(this.globalConfigFile, 'utf8')) as GlobalConfig;
      }
    } catch {}
    return {
      callFeatureEnabled: false,
      callServers: DEFAULT_CALL_SERVERS,
      billingSupport: {
        label: 'Admin Support',
        phone: '',
        whatsappUrl: '',
        messengerUrl: '',
        email: '',
        note: '',
      },
    };
  }

  private _writeGlobalConfig(cfg: GlobalConfig): GlobalConfig {
    fs.mkdirSync(path.dirname(this.globalConfigFile), { recursive: true });
    fs.writeFileSync(this.globalConfigFile, JSON.stringify(cfg, null, 2), 'utf8');
    return cfg;
  }

  getGlobalConfig(): GlobalConfig {
    return this._readGlobalConfig();
  }

  saveGlobalConfig(input: Partial<GlobalConfig>): GlobalConfig {
    const existing = this._readGlobalConfig();
    const merged: GlobalConfig = {
      callFeatureEnabled: typeof input.callFeatureEnabled === 'boolean'
        ? input.callFeatureEnabled
        : existing.callFeatureEnabled,
      callServers: Array.isArray(input.callServers)
        ? input.callServers
        : existing.callServers,
      billingSupport: {
        label: String(input.billingSupport?.label ?? existing.billingSupport?.label ?? 'Admin Support').trim(),
        phone: String(input.billingSupport?.phone ?? existing.billingSupport?.phone ?? '').trim(),
        whatsappUrl: this._sanitizeUrl(
          input.billingSupport?.whatsappUrl ?? existing.billingSupport?.whatsappUrl ?? '',
        ),
        messengerUrl: this._sanitizeUrl(
          input.billingSupport?.messengerUrl ?? existing.billingSupport?.messengerUrl ?? '',
        ),
        email: String(input.billingSupport?.email ?? existing.billingSupport?.email ?? '').trim(),
        note: String(input.billingSupport?.note ?? existing.billingSupport?.note ?? '').trim(),
      },
    };
    return this._writeGlobalConfig(merged);
  }

  // ── V10: Courier tutorial videos (backward-compat) ────────────────────────
  private readonly courierTutorialFile = path.join(
    process.cwd(),
    'storage',
    'courier-tutorials.json',
  );

  // ── V17: Unified tutorials.json ───────────────────────────────────────────
  private readonly tutorialsFile = path.join(
    process.cwd(),
    'storage',
    'tutorials.json',
  );

  private _readTutorials(): TutorialsConfig {
    try {
      if (fs.existsSync(this.tutorialsFile)) {
        return JSON.parse(
          fs.readFileSync(this.tutorialsFile, 'utf8'),
        ) as TutorialsConfig;
      }
      // Migrate from old courier-tutorials.json if it exists
      if (fs.existsSync(this.courierTutorialFile)) {
        const old = JSON.parse(
          fs.readFileSync(this.courierTutorialFile, 'utf8'),
        );
        return { courier: old, facebookAccessToken: '', generalOnboarding: '' };
      }
    } catch {}
    return {
      courier: { pathao: '', steadfast: '', redx: '', paperfly: '' },
      facebookAccessToken: '',
      generalOnboarding: '',
    };
  }

  private _writeTutorials(cfg: TutorialsConfig): TutorialsConfig {
    fs.mkdirSync(path.dirname(this.tutorialsFile), { recursive: true });
    fs.writeFileSync(this.tutorialsFile, JSON.stringify(cfg, null, 2), 'utf8');
    return cfg;
  }

  getTutorials(): TutorialsConfig {
    return this._readTutorials();
  }

  saveTutorials(input: Partial<TutorialsConfig>): TutorialsConfig {
    const existing = this._readTutorials();
    const merged: TutorialsConfig = {
      courier: {
        pathao: this._sanitizeUrl(
          (input.courier as any)?.pathao ?? existing.courier?.pathao ?? '',
        ),
        steadfast: this._sanitizeUrl(
          (input.courier as any)?.steadfast ??
            existing.courier?.steadfast ??
            '',
        ),
        redx: this._sanitizeUrl(
          (input.courier as any)?.redx ?? existing.courier?.redx ?? '',
        ),
        paperfly: this._sanitizeUrl(
          (input.courier as any)?.paperfly ?? existing.courier?.paperfly ?? '',
        ),
      },
      facebookAccessToken: this._sanitizeUrl(
        input.facebookAccessToken ?? existing.facebookAccessToken ?? '',
      ),
      generalOnboarding: this._sanitizeUrl(
        input.generalOnboarding ?? existing.generalOnboarding ?? '',
      ),
    };
    return this._writeTutorials(merged);
  }

  private _sanitizeUrl(v: unknown): string {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    if (s === '' || s.includes('youtube') || s.includes('youtu.be')) return s;
    return '';
  }

  // ── backward-compat: old /admin/courier-tutorials endpoints ───────────────
  getCourierTutorials(): Record<string, string> {
    return this._readTutorials().courier as Record<string, string>;
  }

  saveCourierTutorials(tutorials: Record<string, string>) {
    const existing = this._readTutorials();
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(tutorials)) {
      clean[k] = this._sanitizeUrl(v);
    }
    const base = existing.courier ?? {
      pathao: '',
      steadfast: '',
      redx: '',
      paperfly: '',
    };
    const courier = {
      pathao: clean['pathao'] ?? base.pathao,
      steadfast: clean['steadfast'] ?? base.steadfast,
      redx: clean['redx'] ?? base.redx,
      paperfly: clean['paperfly'] ?? base.paperfly,
    };
    return this.saveTutorials({ ...existing, courier }).courier;
  }

  // ── Manual Call Queue (Admin) ─────────────────────────────────────────────
  async getAdminCallQueue(pageId?: number) {
    const where: any = {
      status: { in: ['RECEIVED', 'PENDING'] },
      callStatus: { not: 'CONFIRMED_BY_CALL' },
    };
    if (pageId) where.pageIdRef = pageId;

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: true,
        page: { select: { id: true, pageName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return orders;
  }

  async adminLogManualCall(
    orderId: number,
    body: { result: 'CONFIRMED' | 'CANCELLED' | 'NOT_ANSWERED' | 'CALLBACK_LATER'; note?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, pageIdRef: true, phone: true, callRetryCount: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const now = new Date();
    const callStatusMap: Record<string, string> = {
      CONFIRMED: 'CONFIRMED_BY_CALL',
      CANCELLED: 'CALL_FAILED',
      NOT_ANSWERED: 'NOT_ANSWERED',
      CALLBACK_LATER: 'PENDING_CALL',
    };
    const orderStatusMap: Record<string, string | null> = {
      CONFIRMED: 'CONFIRMED',
      CANCELLED: 'CANCELLED',
      NOT_ANSWERED: null,
      CALLBACK_LATER: null,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.callAttempt.create({
        data: {
          orderId,
          pageId: order.pageIdRef,
          phone: order.phone || '',
          callProvider: 'manual',
          status: body.result === 'NOT_ANSWERED' ? 'NOT_ANSWERED' : 'ANSWERED',
          errorMsg: body.note || null,
        },
      });

      const patch: any = {
        callStatus: callStatusMap[body.result],
        lastCallAt: now,
        callRetryCount: { increment: 1 },
      };
      const newOrderStatus = orderStatusMap[body.result];
      if (newOrderStatus) {
        patch.status = newOrderStatus;
        if (newOrderStatus === 'CONFIRMED') patch.confirmedAt = now;
      }
      if (body.note) patch.callResult = body.note;

      await tx.order.update({ where: { id: orderId }, data: patch });
    });

    return { success: true, result: body.result };
  }
}
