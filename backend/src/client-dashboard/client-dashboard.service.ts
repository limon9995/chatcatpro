import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PageService } from '../page/page.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from '../orders/orders.service';
import { MemoService } from '../memo/memo.service';
import { PrintService } from '../print/print.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { CallService } from '../call/call.service';
import { TtsService } from '../call/tts.service';
import { VisionOpsService } from '../vision-ops/vision-ops.service';

@Injectable()
export class ClientDashboardService {
  private readonly modeAccessMap: Record<string, string> = {
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly pageService: PageService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly memoService: MemoService,
    private readonly printService: PrintService,
    private readonly botKnowledgeService: BotKnowledgeService,
    private readonly callService: CallService,
    private readonly ttsService: TtsService,
    private readonly visionOps: VisionOpsService,
  ) {}

  // ── Summary ────────────────────────────────────────────────────────────────
  async getSummary(pageId: number) {
    const page: any = await this.pageService.getById(pageId);
    const [orders, products] = await Promise.all([
      this.prisma.order.findMany({
        where: { pageIdRef: pageId },
        select: { status: true, callStatus: true, negotiationRequested: true },
      }),
      this.prisma.product.count({ where: { pageId } }),
    ]);
    return {
      page: {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        businessName: page.businessName || '',
      },
      metrics: {
        totalOrders: orders.length,
        confirmedOrders: orders.filter((o) => o.status === 'CONFIRMED').length,
        pendingOrders: orders.filter((o) =>
          ['RECEIVED', 'PENDING'].includes(o.status),
        ).length,
        issueOrders: orders.filter((o) => o.status === 'ISSUE').length,
        products,
        pendingCalls: orders.filter((o) => o.callStatus === 'PENDING_CALL')
          .length,
        confirmedCalls: orders.filter(
          (o) => o.callStatus === 'CONFIRMED_BY_CALL',
        ).length,
        failedCalls: orders.filter((o) => o.callStatus === 'CALL_FAILED')
          .length,
        negotiated: orders.filter((o) => o.negotiationRequested).length,
      },
    };
  }

  // ── Sender count ───────────────────────────────────────────────────────────
  async getSenderCount(pageId: number) {
    const total = await this.prisma.conversationSession.count({
      where: { pageIdRef: pageId },
    });
    return { uniqueSenders: total };
  }

  // ── Feature modes ──────────────────────────────────────────────────────────
  async getModes(pageId: number) {
    const page: any = await this.pageService.getById(pageId);
    return {
      automationOn: Boolean(page.automationOn),
      ocrOn: Boolean(page.ocrOn),
      infoModeOn: Boolean(page.infoModeOn),
      orderModeOn: Boolean(page.orderModeOn),
      printModeOn: Boolean(page.printModeOn),
      callConfirmModeOn: Boolean(page.callConfirmModeOn),
      memoSaveModeOn: Boolean(page.memoSaveModeOn),
      memoTemplateModeOn: Boolean(page.memoTemplateModeOn),
      autoMemoDesignModeOn: Boolean(page.autoMemoDesignModeOn),
      modeAccess: this.getModeAccess(page),
    };
  }

  async updateModes(pageId: number, body: any) {
    const page: any = await this.pageService.getById(pageId);
    const allowed = [
      'automationOn',
      'ocrOn',
      'infoModeOn',
      'orderModeOn',
      'printModeOn',
      'callConfirmModeOn',
      'memoSaveModeOn',
      'memoTemplateModeOn',
      'autoMemoDesignModeOn',
    ];
    const patch: any = {};
    for (const k of allowed) {
      if (!(k in body)) continue;
      const nextVal = Boolean(body[k]);
      const accessKey = this.modeAccessMap[k];
      if (nextVal && accessKey && page?.[accessKey] === false) {
        throw new BadRequestException(
          `${k} is not available on your current plan. Please contact admin to upgrade.`,
        );
      }
      patch[k] = nextVal;
    }
    if (Object.keys(patch).length > 0)
      await this.prisma.page.update({ where: { id: pageId }, data: patch });
    return this.getModes(pageId);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  async listOrders(
    pageId: number,
    status?: string,
    source?: string,
    paymentStatus?: string,
  ) {
    const where: any = { pageIdRef: pageId };
    if (status && status !== 'ALL') where.status = status.toUpperCase();
    if (source && source !== 'ALL') where.source = source.toUpperCase();
    if (paymentStatus && paymentStatus !== 'ALL')
      where.paymentStatus = paymentStatus;
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: true,
        courierShipment: {
          select: {
            status: true,
            courierName: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 300,
    });
    return orders;
  }

  async markOrdersPrinted(pageId: number, ids: number[]) {
    await this.ensureOrders(pageId, ids || []);
    if (!ids?.length) return { updated: 0 };
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Order" SET "printedAt" = CURRENT_TIMESTAMP WHERE "pageIdRef" = ? AND id IN (${ids.map(() => '?').join(',')})`,
      pageId,
      ...ids,
    );
    return { updated: ids.length };
  }

  async createManualOrder(pageId: number, body: any) {
    const VALID_SOURCES = [
      'WHATSAPP',
      'INSTAGRAM',
      'PHONE',
      'MANUAL',
      'FACEBOOK',
    ];
    const source = VALID_SOURCES.includes(
      String(body?.source || '').toUpperCase(),
    )
      ? String(body.source).toUpperCase()
      : 'MANUAL';

    const order = await this.prisma.order.create({
      data: {
        pageIdRef: pageId,
        customerPsid: '',
        customerName: body?.customerName || '',
        phone: body?.phone || '',
        address: body?.address || '',
        orderNote: body?.orderNote || '',
        status: 'RECEIVED',
        source,
      },
    });

    // Create order items
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    for (const item of items) {
      if (!item?.productCode) continue;
      await this.prisma.orderItem.create({
        data: {
          orderId: order.id,
          productCode: String(item.productCode),
          qty: Number(item.qty) || 1,
          unitPrice: Number(item.unitPrice) || 0,
        },
      });
    }

    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
  }

  async updateOrder(pageId: number, orderId: number, body: any) {
    await this.ensureOrder(pageId, orderId);
    return this.ordersService.updateOrderInfo(orderId, body || {});
  }

  async applyOrderAction(pageId: number, orderId: number, action: string) {
    await this.ensureOrder(pageId, orderId);
    const a = String(action || '').toLowerCase();
    if (a === 'confirm')
      return this.ordersService.confirmByAgent(orderId, pageId);
    if (a === 'cancel') return this.ordersService.cancelOrder(orderId, pageId);
    if (a === 'issue') return this.ordersService.markIssue(orderId, pageId);
    throw new BadRequestException(`Unknown action: ${action}`);
  }

  // V9: Bulk order action — confirm/cancel/issue multiple orders at once
  async bulkOrderAction(
    pageId: number,
    ids: number[],
    action: string,
  ): Promise<{
    success: number;
    failed: number;
    results: any[];
  }> {
    const a = String(action || '').toLowerCase();
    if (!['confirm', 'cancel', 'issue'].includes(a))
      throw new BadRequestException(`Unknown action: ${action}`);
    let success = 0,
      failed = 0;
    const results: any[] = [];
    for (const id of ids) {
      try {
        const order = await this.prisma.order.findUnique({ where: { id } });
        if (!order || order.pageIdRef !== pageId) throw new Error('Not found');
        if (a === 'confirm')
          await this.ordersService.confirmByAgent(id, pageId);
        if (a === 'cancel') await this.ordersService.cancelOrder(id, pageId);
        if (a === 'issue') await this.ordersService.markIssue(id, pageId);
        results.push({ id, success: true });
        success++;
      } catch (e: any) {
        results.push({ id, success: false, error: e.message });
        failed++;
      }
    }
    return { success, failed, results };
  }

  // ── Manual Call Queue ──────────────────────────────────────────────────────
  async getCallQueue(pageId: number) {
    return this.prisma.order.findMany({
      where: {
        pageIdRef: pageId,
        status: { in: ['RECEIVED', 'PENDING'] },
        callStatus: { not: 'CONFIRMED_BY_CALL' },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
  }

  async logManualCall(
    pageId: number,
    orderId: number,
    body: { result: 'CONFIRMED' | 'CANCELLED' | 'NOT_ANSWERED' | 'CALLBACK_LATER'; note?: string },
  ) {
    await this.ensureOrder(pageId, orderId);
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

    const newCallStatus = callStatusMap[body.result];
    const newOrderStatus = orderStatusMap[body.result];

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { callRetryCount: true, phone: true },
      });

      await tx.callAttempt.create({
        data: {
          orderId,
          pageId,
          phone: order?.phone || '',
          callProvider: 'manual',
          status: body.result === 'CONFIRMED' ? 'ANSWERED' : body.result === 'NOT_ANSWERED' ? 'NOT_ANSWERED' : 'ANSWERED',
          errorMsg: body.note || null,
        },
      });

      const patch: any = {
        callStatus: newCallStatus,
        lastCallAt: now,
        callRetryCount: { increment: 1 },
      };
      if (newOrderStatus) {
        patch.status = newOrderStatus;
        if (newOrderStatus === 'CONFIRMED') patch.confirmedAt = now;
      }
      if (body.note) patch.callResult = body.note;

      await tx.order.update({ where: { id: orderId }, data: patch });
    });

    return { success: true, result: body.result };
  }

  // ── Call actions ───────────────────────────────────────────────────────────
  async sendCall(pageId: number, orderId: number) {
    await this.ensureOrder(pageId, orderId);
    return this.callService.sendManualCall(pageId, orderId);
  }
  async resendCall(pageId: number, orderId: number) {
    await this.ensureOrder(pageId, orderId);
    return this.callService.resendCall(pageId, orderId);
  }
  async confirmByCall(pageId: number, orderId: number) {
    await this.ensureOrder(pageId, orderId);
    return this.callService.confirmByCall(pageId, orderId);
  }
  async cancelByCall(pageId: number, orderId: number) {
    await this.ensureOrder(pageId, orderId);
    return this.callService.cancelByCall(pageId, orderId);
  }

  // ── Products — always page-scoped ─────────────────────────────────────────
  async listProducts(pageId: number) {
    return this.productsService.listByPage(pageId);
  }
  async createProduct(pageId: number, body: any) {
    if (!body?.code?.trim())
      throw new BadRequestException('Product code required');
    return this.productsService.create({
      pageId,
      code: String(body.code),
      price: Number(body.price ?? 0),
      costPrice: Number(body.costPrice ?? 0),
      stockQty: Number(body.stockQty ?? 0),
      name: body.name || undefined,
      description: body.description || undefined,
      imageUrl: body.imageUrl || undefined,
      referenceImagesJson: body.referenceImagesJson || undefined,
      productGroup: body.productGroup || undefined,
      variantLabel: body.variantLabel || undefined,
      videoUrl: body.videoUrl || undefined,
      postCaption: body.postCaption || undefined,
      catalogVisible:
        body.catalogVisible !== undefined ? Boolean(body.catalogVisible) : true,
      variantOptions: body.variantOptions
        ? this.parseVariantOptionsText(body.variantOptions)
        : undefined,
      // V18: Image recognition metadata
      category: body.category || undefined,
      color: body.color || undefined,
      tags: body.tags || undefined,
      imageKeywords: body.imageKeywords || undefined,
      aiDescription: body.aiDescription || undefined,
      visionSearchable:
        body.visionSearchable !== undefined
          ? Boolean(body.visionSearchable)
          : undefined,
    });
  }
  async updateProduct(pageId: number, code: string, body: any) {
    return this.productsService.updateOne(pageId, code, {
      price: body?.price !== undefined ? Number(body.price) : undefined,
      costPrice:
        body?.costPrice !== undefined ? Number(body.costPrice) : undefined,
      stockQty:
        body?.stockQty !== undefined ? Number(body.stockQty) : undefined,
      name: body?.name,
      description: body?.description,
      isActive: body?.isActive,
      imageUrl:
        body?.imageUrl !== undefined ? String(body.imageUrl || '') : undefined,
      referenceImagesJson:
        body?.referenceImagesJson !== undefined
          ? String(body.referenceImagesJson || '')
          : undefined,
      productGroup:
        body?.productGroup !== undefined
          ? String(body.productGroup || '')
          : undefined,
      variantLabel:
        body?.variantLabel !== undefined
          ? String(body.variantLabel || '')
          : undefined,
      videoUrl:
        body?.videoUrl !== undefined ? String(body.videoUrl || '') : undefined,
      postCaption:
        body?.postCaption !== undefined
          ? String(body.postCaption || '')
          : undefined,
      catalogVisible:
        body?.catalogVisible !== undefined
          ? Boolean(body.catalogVisible)
          : undefined,
      catalogSortOrder:
        body?.catalogSortOrder !== undefined
          ? Number(body.catalogSortOrder)
          : undefined,
      variantOptions:
        body?.variantOptions !== undefined
          ? this.parseVariantOptionsText(body.variantOptions)
          : undefined,
      // V18: Image recognition metadata
      category: body?.category !== undefined ? String(body.category || '') : undefined,
      color: body?.color !== undefined ? String(body.color || '') : undefined,
      tags: body?.tags !== undefined ? String(body.tags || '') : undefined,
      imageKeywords: body?.imageKeywords !== undefined ? String(body.imageKeywords || '') : undefined,
      aiDescription: body?.aiDescription !== undefined ? String(body.aiDescription || '') : undefined,
      visionSearchable:
        body?.visionSearchable !== undefined
          ? Boolean(body.visionSearchable)
          : undefined,
    });
  }

  /** Parse "Size: S,M,L,XL\nColor: Red,Blue" → JSON string for DB storage */
  private parseVariantOptionsText(text: string): string | null {
    const lines = String(text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;
    const result = lines.map((line) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) return { label: line.trim(), choices: [] };
      const label = line.slice(0, colonIdx).trim();
      const choices = line
        .slice(colonIdx + 1)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      return { label, choices };
    });
    return result.length ? JSON.stringify(result) : null;
  }
  async deleteProduct(pageId: number, code: string) {
    return this.productsService.deleteOne(pageId, code);
  }

  async uploadProductImage(pageId: number, file: any) {
    if (!file?.buffer) throw new BadRequestException('Image file required');
    return this.visionOps.uploadProductAsset(pageId, file);
  }

  async analyzeProductImage(pageId: number, body: any) {
    const imageUrl = String(body?.imageUrl || '').trim();
    if (!imageUrl) throw new BadRequestException('Image URL required');
    const result = await this.visionOps.analyzeProductImage(pageId, imageUrl);
    await this.visionOps.logVisionAttempt({
      pageId,
      type: 'product_analyze',
      imageUrl,
      note: 'Admin analyzed product image from dashboard',
      attrs: result.attrs,
      confidence: result.attrs.confidence,
    });
    return result;
  }

  async getProductVideoGuide(pageId: number, body: any) {
    const videoUrl = String(body?.videoUrl || '').trim();
    const existingImages = Number(body?.existingImages || 0);
    return this.visionOps.buildVideoCaptureGuide(videoUrl, existingImages);
  }

  async getVisionSummary(pageId: number, days = 30): Promise<any> {
    return this.visionOps.getSummary(pageId, days);
  }

  async getVisionReviewQueue(pageId: number): Promise<any[]> {
    return this.visionOps.getReviewQueue(pageId);
  }

  async updateVisionReviewQueueItem(
    pageId: number,
    itemId: string,
    body: any,
  ): Promise<any> {
    const status = String(body?.status || '').trim() as any;
    if (!status) throw new BadRequestException('Status required');
    return this.visionOps.updateReviewQueueItem(
      pageId,
      itemId,
      status,
      body?.note,
    );
  }

  // ── Settings: unified load ─────────────────────────────────────────────────
  async getBusinessSettings(pageId: number) {
    const [page, cfg]: [any, any] = await Promise.all([
      this.pageService.getById(pageId),
      this.botKnowledgeService.getConfig(pageId),
    ]);
    return {
      // Business
      businessName: page.businessName ?? '',
      businessPhone: page.businessPhone ?? '',
      businessAddress: page.businessAddress ?? '',
      websiteUrl: page.websiteUrl ?? '',
      logoUrl: page.logoUrl ?? '',
      memoFooterText: page.memoFooterText ?? '',
      currencySymbol: page.currencySymbol ?? '৳',
      codLabel: page.codLabel ?? 'COD',
      deliveryFeeInsideDhaka: page.deliveryFeeInsideDhaka ?? 80,
      deliveryFeeOutsideDhaka: page.deliveryFeeOutsideDhaka ?? 120,
      deliveryTimeText: page.deliveryTimeText ?? '',
      // V17: Payment mode
      paymentMode: page.paymentMode ?? 'cod',
      advanceAmount: page.advanceAmount ?? 0,
      advanceBkash: page.advanceBkash ?? '',
      advanceNagad: page.advanceNagad ?? '',
      advancePaymentMessage: page.advancePaymentMessage ?? '',
      catalogMessengerUrl: page.catalogMessengerUrl ?? '',
      catalogSlug: page.catalogSlug ?? '',
      fbPageId: page.pageId ?? '',
      // Feature flags
      automationOn: Boolean(page.automationOn),
      ocrOn: Boolean(page.ocrOn),
      infoModeOn: Boolean(page.infoModeOn),
      orderModeOn: Boolean(page.orderModeOn),
      printModeOn: Boolean(page.printModeOn),
      callConfirmModeOn: Boolean(page.callConfirmModeOn),
      memoSaveModeOn: Boolean(page.memoSaveModeOn),
      memoTemplateModeOn: Boolean(page.memoTemplateModeOn),
      autoMemoDesignModeOn: Boolean(page.autoMemoDesignModeOn),
      modeAccess: this.getModeAccess(page),
      // V18: Image recognition
      imageRecognitionOn: Boolean(page.imageRecognitionOn),
      imageHighConfidence: page.imageHighConfidence ?? 0.75,
      imageMediumConfidence: page.imageMediumConfidence ?? 0.45,
      imageFallbackAiOn: Boolean(page.imageFallbackAiOn),
      // Pricing (from bot-knowledge config)
      pricingPolicy: cfg?.pricingPolicy || {},
      // Call — all fields explicit
      callSettings: {
        callConfirmModeOn: Boolean(page.callConfirmModeOn),
        callMode: page.callMode ?? 'MANUAL',
        callConfirmationScope: page.callConfirmationScope ?? 'ALL',
        initialCallDelayMinutes: page.initialCallDelayMinutes ?? 30,
        retryIntervalMinutes: page.retryIntervalMinutes ?? 30,
        maxCallRetries: page.maxCallRetries ?? 3,
        callProvider: page.callProvider ?? '', // who makes the call
      },
      // Voice / TTS — all fields explicit
      voiceSettings: {
        callLanguage: page.callLanguage ?? 'BN',
        voiceType: page.voiceType ?? 'FEMALE',
        voiceStyle: page.voiceStyle ?? 'NATURAL',
        ttsProvider: page.ttsProvider || 'MANUAL_UPLOAD', // who generates audio
        banglaVoiceId: page.banglaVoiceId ?? '',
        englishVoiceId: page.englishVoiceId ?? '',
        banglaCallScript: page.banglaCallScript ?? '',
        englishCallScript: page.englishCallScript ?? '',
        banglaVoiceFileUrl: page.banglaVoiceFileUrl ?? '',
        englishVoiceFileUrl: page.englishVoiceFileUrl ?? '',
        voiceGeneratedAt: page.voiceGeneratedAt ?? null,
      },
    };
  }

  // ── Settings: unified save ─────────────────────────────────────────────────
  async updateBusinessSettings(pageId: number, body: any) {
    const { pricingPolicy, callSettings, voiceSettings, ...pageFields } =
      body || {};

    // Page-level business fields (whitelist)
    const PAGE_FIELDS = [
      'businessName',
      'businessPhone',
      'businessAddress',
      'websiteUrl',
      'logoUrl',
      'memoFooterText',
      'currencySymbol',
      'codLabel',
      'deliveryFeeInsideDhaka',
      'deliveryFeeOutsideDhaka',
      'deliveryTimeText',
      'infoModeOn',
      'orderModeOn',
      'printModeOn',
      'callConfirmModeOn',
      'memoSaveModeOn',
      'memoTemplateModeOn',
      'autoMemoDesignModeOn',
      'paymentMode',
      'advanceAmount',
      'advanceBkash',
      'advanceNagad',
      'advancePaymentMessage',
      'catalogMessengerUrl',
      'catalogSlug',
      'productCodePrefix',
      // V18: image recognition settings
      'imageRecognitionOn',
      'imageHighConfidence',
      'imageMediumConfidence',
      'imageFallbackAiOn',
    ];
    const pagePatch: any = {};
    for (const k of PAGE_FIELDS) {
      if (!(k in pageFields)) continue;
      const nextVal = pageFields[k];
      const accessKey = this.modeAccessMap[k];
      if (
        accessKey &&
        Boolean(nextVal) &&
        pageFields[k] !== undefined
      ) {
        const page: any = await this.pageService.getById(pageId);
        if (page?.[accessKey] === false) {
          throw new BadRequestException(
            `${k} is not available on your current plan. Please contact admin to upgrade.`,
          );
        }
      }
      pagePatch[k] = nextVal;
    }
    if (Object.keys(pagePatch).length > 0)
      await this.prisma.page.update({ where: { id: pageId }, data: pagePatch });

    // Pricing policy
    if (pricingPolicy)
      await this.botKnowledgeService.updatePricingPolicy(pageId, pricingPolicy);

    // Call settings
    if (callSettings) {
      const CALL_FIELDS: Record<string, string> = {
        callConfirmModeOn: 'boolean',
        callMode: 'string',
        callConfirmationScope: 'string',
        initialCallDelayMinutes: 'number',
        retryIntervalMinutes: 'number',
        maxCallRetries: 'number',
        callProvider: 'string',
      };
      const cp: any = {};
      for (const [k, t] of Object.entries(CALL_FIELDS)) {
        if (k in callSettings) {
          if (k === 'callConfirmModeOn') {
            const page: any = await this.pageService.getById(pageId);
            if (Boolean(callSettings[k]) && page?.callConfirmModeAllowed === false) {
              throw new BadRequestException(
                'callConfirmModeOn is not available on your current plan. Please contact admin to upgrade.',
              );
            }
          }
          cp[k] =
            t === 'boolean'
              ? Boolean(callSettings[k])
              : t === 'number'
                ? Number(callSettings[k])
                : String(callSettings[k]);
        }
      }
      if (Object.keys(cp).length > 0)
        await this.prisma.page.update({ where: { id: pageId }, data: cp });
    }

    // Voice settings — only save script if changed (clears cached audio)
    if (voiceSettings) {
      const VOICE_STR_FIELDS = [
        'callLanguage',
        'voiceType',
        'voiceStyle',
        'ttsProvider',
        'banglaVoiceId',
        'englishVoiceId',
        'banglaCallScript',
        'englishCallScript',
      ];
      const vp: any = {};
      for (const k of VOICE_STR_FIELDS) {
        if (k in voiceSettings) vp[k] = String(voiceSettings[k] ?? '');
      }
      // If script changed, invalidate cached audio URL + regeneration timestamp
      const page: any = await this.prisma.page.findUnique({
        where: { id: pageId },
      });
      if (
        vp.banglaCallScript &&
        vp.banglaCallScript !== page?.banglaCallScript
      ) {
        vp.banglaVoiceFileUrl = null;
        vp.voiceGeneratedAt = null;
        await this.ttsService.deleteVoice(pageId, 'BN');
      }
      if (
        vp.englishCallScript &&
        vp.englishCallScript !== page?.englishCallScript
      ) {
        vp.englishVoiceFileUrl = null;
        vp.voiceGeneratedAt = null;
        await this.ttsService.deleteVoice(pageId, 'EN');
      }
      if (Object.keys(vp).length > 0)
        await this.prisma.page.update({ where: { id: pageId }, data: vp });
    }

    return this.getBusinessSettings(pageId);
  }

  private _readGlobalCallFeatureEnabled(): boolean {
    try {
      const file = path.join(process.cwd(), 'storage', 'global-config.json');
      if (fs.existsSync(file)) {
        const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
        return cfg?.callFeatureEnabled === true;
      }
    } catch {}
    return false;
  }

  private getModeAccess(page: any) {
    return {
      automationOn: page?.automationAllowed !== false,
      ocrOn: page?.ocrAllowed !== false,
      infoModeOn: page?.infoModeAllowed !== false,
      orderModeOn: page?.orderModeAllowed !== false,
      printModeOn: page?.printModeAllowed !== false,
      callConfirmModeOn: page?.callConfirmModeAllowed !== false,
      memoSaveModeOn: page?.memoSaveModeAllowed !== false,
      memoTemplateModeOn: page?.memoTemplateModeAllowed !== false,
      autoMemoDesignModeOn: page?.autoMemoDesignModeAllowed !== false,
      callFeatureEnabled: this._readGlobalCallFeatureEnabled(),
    };
  }

  // ── Voice generate / preview ───────────────────────────────────────────────
  async generateVoice(pageId: number, language: 'BN' | 'EN') {
    const page: any = await this.prisma.page.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException('Page not found');
    const script =
      language === 'EN' ? page.englishCallScript : page.banglaCallScript;
    if (!script?.trim())
      throw new BadRequestException(`${language} script configure করা নেই`);
    const result = await this.ttsService.generateVoice(
      pageId,
      language,
      script,
      {
        voiceType: page.voiceType,
        voiceStyle: page.voiceStyle,
        ttsProvider: page.ttsProvider,
        voiceId: language === 'EN' ? page.englishVoiceId : page.banglaVoiceId,
      },
    );
    if (result.success && result.url) {
      const patch: any = { voiceGeneratedAt: new Date() };
      if (language === 'BN') patch.banglaVoiceFileUrl = result.url;
      else patch.englishVoiceFileUrl = result.url;
      await this.prisma.page.update({ where: { id: pageId }, data: patch });
    }
    return result;
  }

  async previewVoice(pageId: number, language: 'BN' | 'EN') {
    return this.ttsService.previewVoice(pageId, language);
  }

  async uploadVoice(pageId: number, language: 'BN' | 'EN', file: any) {
    const page: any = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');
    if (!file?.buffer) throw new BadRequestException('Audio file required');

    const allowedMimes = new Set([
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
    ]);
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const extOk = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'].some((ext) =>
      name.endsWith(ext),
    );
    if (!allowedMimes.has(mime) && !extOk) {
      throw new BadRequestException('Only audio files (.mp3, .wav, .m4a, .aac, .ogg) are allowed');
    }

    const result = await this.ttsService.uploadVoice(pageId, language, file);
    if (result.success && result.url) {
      const patch: any = { voiceGeneratedAt: new Date() };
      if (language === 'BN') patch.banglaVoiceFileUrl = result.url;
      else patch.englishVoiceFileUrl = result.url;
      await this.prisma.page.update({ where: { id: pageId }, data: patch });
    }
    return result;
  }

  // ── Memo / Print ───────────────────────────────────────────────────────────
  async getTemplate(pageId: number) {
    try {
      return await this.memoService.getUploadedTemplate(pageId);
    } catch {
      return null;
    }
  }
  async uploadTemplate(pageId: number, file: any) {
    if (!file?.buffer) throw new BadRequestException('File required');
    return this.memoService.uploadTemplate(pageId, file);
  }
  async updateTemplateMapping(pageId: number, mapping: any, confirm = false) {
    return this.memoService.updateTemplateMapping(
      pageId,
      mapping || {},
      confirm,
    );
  }
  async getTemplatePreview(pageId: number, orderId?: number) {
    return this.memoService.getTemplatePreview(pageId, orderId);
  }
  async confirmTemplate(pageId: number) {
    return this.memoService.confirmTemplate(pageId);
  }
  async getInvoicePdf(pageId: number, ids: number[], style?: string) {
    await this.ensureOrders(pageId, ids);
    return this.printService.generateInvoicePDF(
      ids,
      (style as any) || 'classic',
    );
  }
  async htmlToPdf(html: string) {
    return this.printService.generatePdfFromHtml(html);
  }
  async getPrintHtml(pageId: number, ids: number[], style?: string) {
    await this.ensureOrders(pageId, ids);
    const orders = await this.printService.getOrders(ids);
    return this.printService.buildPrintHTML(
      orders,
      (style as any) || 'classic',
    );
  }
  async getMemoHtml(pageId: number, ids: number[], memosPerPage?: number) {
    await this.ensureOrders(pageId, ids);
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { memoTheme: true, memoLayout: true, memosPerPage: true },
    });
    const theme = (page?.memoTheme as any) || 'classic';
    const layout = (page?.memoLayout as any) || 'memo';
    const count = memosPerPage === 4 ? 4 : page?.memosPerPage || 3;
    return this.memoService.generateA4MemoHtml(
      ids,
      pageId,
      layout,
      theme,
      count,
    );
  }

  async getMemoPreviewHtml(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { memoTheme: true, memoLayout: true, memosPerPage: true },
    });
    const theme = (page?.memoTheme as any) || 'classic';
    const layout = (page?.memoLayout as any) || 'memo';
    const count = page?.memosPerPage || 3;
    return this.memoService.generateSampleMemoHtml(
      pageId,
      layout,
      theme,
      count,
    );
  }

  async getMemoPreset(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { memoTheme: true, memoLayout: true, memosPerPage: true },
    });
    return {
      memoTheme: page?.memoTheme || 'classic',
      memoLayout: page?.memoLayout || 'memo',
      memosPerPage: page?.memosPerPage || 3,
    };
  }

  async setMemoPreset(
    pageId: number,
    memoTheme?: string,
    memoLayout?: string,
    memosPerPage?: number,
  ) {
    const validThemes = ['classic', 'fashion', 'luxury'];
    const validLayouts = ['memo', 'invoice'];
    const update: any = {};
    if (memoTheme && validThemes.includes(memoTheme))
      update.memoTheme = memoTheme;
    if (memoLayout && validLayouts.includes(memoLayout))
      update.memoLayout = memoLayout;
    if (memosPerPage && [3, 4].includes(memosPerPage))
      update.memosPerPage = memosPerPage;
    if (Object.keys(update).length === 0) return this.getMemoPreset(pageId);
    await this.prisma.page.update({ where: { id: pageId }, data: update });
    return this.getMemoPreset(pageId);
  }

  // ── Global Search ─────────────────────────────────────────────────────────
  async globalSearch(pageId: number, q: string) {
    const term = (q || '').trim();
    if (term.length < 1) return { orders: [], customers: [], term };

    const isId = /^\d+$/.test(term);

    const [orders, customers] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          pageIdRef: pageId,
          OR: [
            { customerName: { contains: term } },
            { phone: { contains: term } },
            { address: { contains: term } },
            { orderNote: { contains: term } },
            ...(isId ? [{ id: Number(term) }] : []),
            { items: { some: { productCode: { contains: term } } } },
          ],
        },
        include: {
          items: true,
          returnEntries: true,
          exchangeEntries: true,
          collections: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.customer.findMany({
        where: {
          pageId,
          OR: [{ name: { contains: term } }, { phone: { contains: term } }],
        },
        take: 10,
      }),
    ]);

    return { orders, customers, term };
  }

  // ── Agent Issues ───────────────────────────────────────────────────────────
  async getAgentIssues(pageId: number) {
    return this.ordersService.getAgentIssues(pageId);
  }

  async toggleBotForCustomer(pageId: number, orderId: number) {
    return this.ordersService.toggleBotForCustomer(orderId, pageId);
  }

  async toggleBotByPsid(pageId: number, psid: string, mute: boolean) {
    return this.ordersService.toggleBotByPsid(pageId, psid, mute);
  }

  async dismissAgentIssue(pageId: number, body: any) {
    return this.ordersService.dismissAgentIssue(pageId, body);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async ensureOrder(pageId: number, orderId: number) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, pageIdRef: true },
    });
    if (!o || o.pageIdRef !== pageId)
      throw new NotFoundException('Order not found');
    return o;
  }
  private async ensureOrders(pageId: number, ids: number[]) {
    if (!ids.length) return [];
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, pageIdRef: true },
    });
    if (
      orders.length !== ids.length ||
      orders.some((o) => o.pageIdRef !== pageId)
    )
      throw new NotFoundException('Some orders not found for this page');
    return orders;
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  async getWallet(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        walletBalanceBdt: true,
        costPerTextMsgBdt: true,
        costPerVoiceMsgBdt: true,
        costPerImageBdt: true,
        costPerAnalyzeBdt: true,
        subscriptionStatus: true,
        nextBillingDate: true,
      },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async getWalletTransactions(pageId: number, limit = 50) {
    return this.prisma.walletTransaction.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}
