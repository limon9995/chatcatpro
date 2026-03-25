import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PageService } from '../page/page.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BotKnowledgeService {
  private readonly storageRoot = path.join(
    process.cwd(),
    'storage',
    'bot-knowledge',
  );
  private readonly globalFile = path.join(this.storageRoot, 'global.json');
  private readonly learningFile = path.join(
    this.storageRoot,
    'learning-log.json',
  );

  constructor(
    private readonly pageService: PageService,
    private readonly prisma: PrismaService,
  ) {
    fs.mkdirSync(this.storageRoot, { recursive: true });

    if (!fs.existsSync(this.globalFile)) {
      fs.writeFileSync(
        this.globalFile,
        JSON.stringify(this.defaultGlobalConfig(), null, 2),
        'utf8',
      );
    }

    if (!fs.existsSync(this.learningFile)) {
      fs.writeFileSync(this.learningFile, '[]', 'utf8');
    }
  }

  async getConfig(pageId: number) {
    await this.pageService.getById(pageId);

    const globalCfg = this.readGlobal();
    const pageCfg = this.readPage(pageId);

    return {
      pageId,
      questions: this.mergeQuestions(
        globalCfg.questions || [],
        pageCfg.questions || [],
      ),
      systemReplies: {
        ...this.normalizeSystemReplies(
          globalCfg.systemReplies || this.defaultSystemReplies(),
        ),
        ...this.normalizeSystemReplies(pageCfg.systemReplies || {}),
      },
      paymentRules: {
        ...this.defaultPaymentRules(),
        ...(globalCfg.paymentRules || {}),
        ...(pageCfg.paymentRules || {}),
      },
      pricingPolicy: {
        ...this.defaultPricingPolicy(),
        ...(globalCfg.pricingPolicy || {}),
        ...(pageCfg.pricingPolicy || {}),
      },
      areaRules: {
        globalInsideDhaka: this.normalizeAreas(
          globalCfg.areaRules?.globalInsideDhaka || [],
        ),
        clientCustomAreas: this.normalizeAreas(
          pageCfg.areaRules?.clientCustomAreas || [],
        ),
      },
      globalSuggestions: this.buildGlobalSuggestions(
        globalCfg.questions || [],
        pageCfg.questions || [],
      ),
      updatedAt:
        pageCfg.updatedAt || globalCfg.updatedAt || new Date().toISOString(),
    };
  }

  getGlobalConfig() {
    return this.readGlobal();
  }

  getLearningLog(pageId?: number) {
    const logs = this.readLearning();
    const filtered = pageId
      ? logs.filter((e: any) => e.pageId === pageId)
      : logs;
    return filtered.slice(-500).reverse();
  }

  async updateQuestions(pageId: number, questions: any[]) {
    const prev = this.readPage(pageId);
    const existing = this.normalizeQuestions(prev.questions || []);
    const incoming = this.normalizeQuestions(questions || []);
    const map = new Map<string, any>();

    for (const q of existing) map.set(String(q.key), q);
    for (const q of incoming)
      map.set(String(q.key), { ...(map.get(String(q.key)) || {}), ...q });

    const next = {
      ...prev,
      questions: Array.from(map.values()).sort(
        (a: any, b: any) => Number(a.priority || 0) - Number(b.priority || 0),
      ),
      updatedAt: new Date().toISOString(),
    };
    this.writePage(pageId, next);
    return this.getConfig(pageId);
  }

  async updateSystemReplies(
    pageId: number,
    systemReplies: Record<string, any> | any,
  ) {
    const prev = this.readPage(pageId);
    const next = {
      ...prev,
      systemReplies: this.normalizeSystemReplies(systemReplies || {}),
      updatedAt: new Date().toISOString(),
    };
    this.writePage(pageId, next);
    return this.getConfig(pageId);
  }

  async updatePaymentRules(pageId: number, body: any) {
    const prev = this.readPage(pageId);
    const current = {
      ...this.defaultPaymentRules(),
      ...(prev.paymentRules || {}),
    };

    const next = {
      ...prev,
      paymentRules: {
        ...current,
        codEnabled:
          body?.codEnabled !== undefined
            ? Boolean(body.codEnabled)
            : current.codEnabled,
        insideDhakaAdvanceEnabled:
          body?.insideDhakaAdvanceEnabled !== undefined
            ? Boolean(body.insideDhakaAdvanceEnabled)
            : current.insideDhakaAdvanceEnabled,
        outsideDhakaAdvanceEnabled:
          body?.outsideDhakaAdvanceEnabled !== undefined
            ? Boolean(body.outsideDhakaAdvanceEnabled)
            : current.outsideDhakaAdvanceEnabled,
        insideDhakaAdvanceType: String(
          body?.insideDhakaAdvanceType ||
            current.insideDhakaAdvanceType ||
            'none',
        ),
        outsideDhakaAdvanceType: String(
          body?.outsideDhakaAdvanceType ||
            current.outsideDhakaAdvanceType ||
            'none',
        ),
        insideDhakaAdvanceAmount: Number(
          body?.insideDhakaAdvanceAmount ??
            current.insideDhakaAdvanceAmount ??
            0,
        ),
        outsideDhakaAdvanceAmount: Number(
          body?.outsideDhakaAdvanceAmount ??
            current.outsideDhakaAdvanceAmount ??
            0,
        ),
        insideDhakaAdvancePercent: Number(
          body?.insideDhakaAdvancePercent ??
            current.insideDhakaAdvancePercent ??
            0,
        ),
        outsideDhakaAdvancePercent: Number(
          body?.outsideDhakaAdvancePercent ??
            current.outsideDhakaAdvancePercent ??
            0,
        ),
        highValueThreshold: Number(
          body?.highValueThreshold ?? current.highValueThreshold ?? 0,
        ),
        highValueAdvancePercent: Number(
          body?.highValueAdvancePercent ?? current.highValueAdvancePercent ?? 0,
        ),
        note: String(body?.note || current.note || ''),
      },
      updatedAt: new Date().toISOString(),
    };

    this.writePage(pageId, next);
    return this.getConfig(pageId);
  }

  async updateAreaRules(pageId: number, clientCustomAreas: any[]) {
    const prev = this.readPage(pageId);
    const next = {
      ...prev,
      areaRules: {
        clientCustomAreas: this.normalizeAreas(clientCustomAreas || []),
      },
      updatedAt: new Date().toISOString(),
    };
    this.writePage(pageId, next);
    return this.getConfig(pageId);
  }

  async updatePricingPolicy(pageId: number, body: any) {
    const prev = this.readPage(pageId);
    const current = {
      ...this.defaultPricingPolicy(),
      ...(prev.pricingPolicy || {}),
    };
    const next = {
      ...prev,
      pricingPolicy: {
        ...current,
        priceMode: String(
          body?.priceMode || current.priceMode || 'FIXED',
        ).toUpperCase(),
        allowCustomerOffer:
          body?.allowCustomerOffer !== undefined
            ? Boolean(body.allowCustomerOffer)
            : current.allowCustomerOffer,
        agentApprovalRequired:
          body?.agentApprovalRequired !== undefined
            ? Boolean(body.agentApprovalRequired)
            : current.agentApprovalRequired,
        autoNoteCustomerOffer:
          body?.autoNoteCustomerOffer !== undefined
            ? Boolean(body.autoNoteCustomerOffer)
            : current.autoNoteCustomerOffer,
        fixedPriceReplyText: String(
          body?.fixedPriceReplyText || current.fixedPriceReplyText || '',
        ),
        negotiationReplyText: String(
          body?.negotiationReplyText || current.negotiationReplyText || '',
        ),
        minNegotiationType: String(
          body?.minNegotiationType || current.minNegotiationType || 'none',
        ),
        minNegotiationValue: Number(
          body?.minNegotiationValue ?? current.minNegotiationValue ?? 0,
        ),
      },
      updatedAt: new Date().toISOString(),
    };
    this.writePage(pageId, next);
    return this.getConfig(pageId);
  }

  updateGlobalQuestions(questions: any[]) {
    const current = this.readGlobal();
    current.questions = this.normalizeQuestions(questions || []);
    current.updatedAt = new Date().toISOString();
    this.writeGlobal(current);
    return current;
  }

  updateGlobalSystemReplies(systemReplies: Record<string, any> | any) {
    const current = this.readGlobal();
    current.systemReplies = this.normalizeSystemReplies(systemReplies || {});
    current.updatedAt = new Date().toISOString();
    this.writeGlobal(current);
    return current;
  }

  updateGlobalAreas(areas: any[]) {
    const current = this.readGlobal();
    current.areaRules = {
      globalInsideDhaka: this.normalizeAreas(areas || []),
    };
    current.updatedAt = new Date().toISOString();
    this.writeGlobal(current);
    return current;
  }

  async importGlobalQuestion(pageId: number, key: string) {
    const globalCfg = this.readGlobal();
    const match = (globalCfg.questions || []).find(
      (q: any) => String(q.key) === String(key),
    );

    if (!match) {
      throw new Error('Global question not found');
    }

    const pageCfg = this.readPage(pageId);
    const pageQuestions = this.normalizeQuestions(pageCfg.questions || []);
    const idx = pageQuestions.findIndex(
      (q: any) => String(q.key) === String(key),
    );
    const imported = {
      ...match,
      source: 'client_import',
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      pageQuestions[idx] = { ...pageQuestions[idx], ...imported };
    } else {
      pageQuestions.push(imported);
    }

    pageCfg.questions = pageQuestions;
    pageCfg.updatedAt = new Date().toISOString();
    this.writePage(pageId, pageCfg);

    return this.getConfig(pageId);
  }

  createQuestionFromLearning(body: {
    logId?: string;
    pageId?: number;
    target?: 'global' | 'client';
    key?: string;
    label?: string;
    realMeaning?: string;
    replyTemplate?: string;
  }) {
    const logs = this.readLearning();
    const log = logs.find((x: any) => x.id === body.logId);

    if (!log) {
      throw new Error('Learning log not found');
    }

    const key = this.slug(
      body.key ||
        log.bestGuess?.key ||
        body.label ||
        log.message ||
        'custom_question',
    );

    const question = this.normalizeQuestions([
      {
        key,
        label: body.label || log.bestGuess?.label || 'Learned Question',
        realMeaning:
          body.realMeaning ||
          log.bestGuess?.realMeaning ||
          `Learned from: ${log.message}`,
        keywords: Array.from(
          new Set(
            [
              ...(log.suggestedKeywords || []),
              ...(log.bestGuess?.keywords || []),
              log.message,
            ].filter(Boolean),
          ),
        ),
        replyTemplate: body.replyTemplate || log.bestGuess?.replyTemplate || '',
        enabled: true,
        replyType: log.bestGuess?.replyType || 'text',
        priority: 999,
      },
    ])[0];

    if ((body.target || 'global') === 'client' && body.pageId) {
      const pageCfg = this.readPage(Number(body.pageId));
      pageCfg.questions = this.normalizeQuestions([
        ...(pageCfg.questions || []),
        question,
      ]);
      pageCfg.updatedAt = new Date().toISOString();
      this.writePage(Number(body.pageId), pageCfg);
      return { target: 'client', pageId: Number(body.pageId), question };
    }

    const globalCfg = this.readGlobal();
    globalCfg.questions = this.normalizeQuestions([
      ...(globalCfg.questions || []),
      question,
    ]);
    globalCfg.updatedAt = new Date().toISOString();
    this.writeGlobal(globalCfg);

    return { target: 'global', question };
  }

  async testMessage(pageId: number, message: string) {
    const cfg = await this.getConfig(pageId);
    const settings: any = await this.pageService.getBusinessSettings(pageId);
    const product = await this.findRelevantProduct(pageId, message);
    return this.evaluate(pageId, message, settings, cfg, product);
  }

  async resolveReply(pageId: number, message: string, psid?: string) {
    const cfg = await this.getConfig(pageId);
    const settings: any = await this.pageService.getBusinessSettings(pageId);
    const product = await this.findRelevantProduct(pageId, message);
    const result = this.evaluate(pageId, message, settings, cfg, product);

    const top = result.matchedQuestions[0];
    if (!top || top.score < 0.72) {
      this.logLearning(pageId, message, result, psid);
      return null;
    }

    return {
      reply: top.replyPreview,
      topKey: top.key,
      score: top.score,
      areaResult: result.areaResult,
      product: result.product || null,
    };
  }

  async resolveSystemReply(
    pageId: number,
    key: string,
    variables?: Record<string, any>,
  ) {
    const cfg = await this.getConfig(pageId);
    const settings: any = await this.pageService.getBusinessSettings(pageId);
    const paymentRules = cfg.paymentRules || this.defaultPaymentRules();
    const entry = cfg.systemReplies?.[String(key)] ||
      this.defaultSystemReplies()[String(key)] || { template: '' };

    const merged = {
      ...(variables || {}),
      insideFee: settings.deliveryFeeInsideDhaka ?? 0,
      outsideFee: settings.deliveryFeeOutsideDhaka ?? 0,
      deliveryTime: settings.deliveryTimeText || '',
      businessName: settings.businessName || '',
      businessPhone: settings.businessPhone || '',
      codLabel: settings.codLabel || 'COD',
      currencySymbol: settings.currencySymbol || '৳',
      advanceNote: paymentRules.note || '',
      productInfoNote: variables?.productInfoNote ?? '',
    };

    if (entry?.enabled === false) return '';

    const rendered = this.fillArbitraryTemplate(
      String(entry?.template || ''),
      merged,
    ).trim();

    return (
      rendered ||
      String(
        entry?.fallback ||
          this.defaultSystemReplies()[String(key)]?.fallback ||
          '',
      ).trim()
    );
  }

  private async findRelevantProduct(pageId: number, message: string) {
    const code = this.extractCode(message);
    if (!code) return null;

    try {
      return await this.prisma.product.findUnique({
        where: { pageId_code: { pageId, code } },
      });
    } catch {
      return null;
    }
  }

  private evaluate(
    pageId: number,
    message: string,
    settings: any,
    cfg: any,
    product: any,
  ) {
    const normalized = this.normalize(message);

    const matchedQuestions = (cfg.questions || [])
      .filter((q: any) => q.enabled !== false)
      .map((q: any) => {
        const keywordScores = (q.keywords || []).map((k: string) =>
          this.keywordScore(normalized, this.normalize(k)),
        );

        return {
          ...q,
          score: Math.max(0, ...(keywordScores.length ? keywordScores : [0])),
        };
      })
      .filter((q: any) => q.score >= 0.58)
      .sort(
        (a: any, b: any) =>
          b.score - a.score ||
          Number(a.priority || 0) - Number(b.priority || 0),
      )
      .slice(0, 8)
      .map((q: any) => ({
        key: q.key,
        label: q.label,
        realMeaning: q.realMeaning,
        keywords: q.keywords || [],
        replyType: q.replyType || 'text',
        score: Number(q.score.toFixed(2)),
        replyPreview: this.buildReply(
          q,
          settings,
          cfg.paymentRules,
          product,
          normalized,
          cfg,
        ),
      }));

    const areaResult = this.detectArea(normalized, cfg.areaRules || {});

    return {
      id: this.uuid(),
      pageId,
      message,
      normalized,
      product,
      matchedQuestions,
      areaResult,
      paymentRules: cfg.paymentRules,
      pricingPolicy: cfg.pricingPolicy,
      suggestedKeywords: normalized
        .split(/\s+/)
        .filter((x: string) => x.length > 2)
        .slice(0, 8),
      createdAt: new Date().toISOString(),
    };
  }

  private buildReply(
    question: any,
    settings: any,
    paymentRules: any,
    product: any,
    normalizedMessage: string,
    cfg: any,
  ) {
    const base = this.fillTemplate(
      question.replyTemplate || '',
      settings,
      paymentRules,
      product,
    );

    if (question.key === 'delivery_fee') {
      const area = this.detectArea(
        normalizedMessage,
        cfg?.areaRules || {
          globalInsideDhaka: [],
          clientCustomAreas: [],
        },
      );

      if (area.zoneType === 'outside_dhaka') {
        return `Dhakar bahire delivery fee ${settings.deliveryFeeOutsideDhaka ?? 0}${settings.currencySymbol || '৳'}.`;
      }

      return `Dhakar vitore delivery fee ${settings.deliveryFeeInsideDhaka ?? 0}${settings.currencySymbol || '৳'}, bahire ${settings.deliveryFeeOutsideDhaka ?? 0}${settings.currencySymbol || '৳'}.`;
    }

    if (question.key === 'advance_payment' && !base) {
      return this.buildAdvanceReply(paymentRules, settings);
    }

    if (
      (question.replyType === 'product' || /product/i.test(question.key)) &&
      !product &&
      !base
    ) {
      return 'Product code দিলে নির্দিষ্ট তথ্য দেখানো যাবে।';
    }

    return base || this.buildReplyFallback(question, paymentRules, product);
  }

  private buildAdvanceReply(paymentRules: any, settings: any) {
    const lines: string[] = [];

    if (!paymentRules.codEnabled) {
      lines.push('এই business-এ COD available না।');
    } else {
      lines.push(`${settings.codLabel || 'COD'} available.`);
    }

    if (paymentRules.insideDhakaAdvanceEnabled) {
      lines.push(
        `Dhakar vitore advance ${this.describeAdvance(
          paymentRules.insideDhakaAdvanceType,
          paymentRules.insideDhakaAdvanceAmount,
          paymentRules.insideDhakaAdvancePercent,
        )}.`,
      );
    }

    if (paymentRules.outsideDhakaAdvanceEnabled) {
      lines.push(
        `Dhakar bahire advance ${this.describeAdvance(
          paymentRules.outsideDhakaAdvanceType,
          paymentRules.outsideDhakaAdvanceAmount,
          paymentRules.outsideDhakaAdvancePercent,
        )}.`,
      );
    }

    if (
      Number(paymentRules.highValueThreshold || 0) > 0 &&
      Number(paymentRules.highValueAdvancePercent || 0) > 0
    ) {
      lines.push(
        `${paymentRules.highValueThreshold}${settings.currencySymbol || '৳'}+ order এ ${paymentRules.highValueAdvancePercent}% advance লাগতে পারে।`,
      );
    }

    if (paymentRules.note) {
      lines.push(String(paymentRules.note));
    }

    return lines.join(' ');
  }

  buildNegotiationReply(
    pricingPolicy: any,
    product: any,
    offeredPrice?: number | null,
  ) {
    const mode = String(pricingPolicy?.priceMode || 'FIXED').toUpperCase();
    const currentPrice = Number(product?.price ?? 0) || 0;

    if (mode === 'FIXED') {
      return String(
        pricingPolicy?.fixedPriceReplyText ||
          (currentPrice > 0
            ? `এই page-এ price fixed। Current price ${currentPrice}৳ final 💖`
            : 'এই page-এ price fixed 💖'),
      ).trim();
    }

    const parts: string[] = [];
    if (currentPrice > 0) parts.push(`Current price ${currentPrice}৳.`);
    if (offeredPrice && pricingPolicy?.autoNoteCustomerOffer) {
      parts.push(`আপনার offered price ${offeredPrice}৳ note করা হয়েছে 💖`);
    }
    parts.push(
      String(
        pricingPolicy?.negotiationReplyText ||
          'আপনার requested price note করা হয়েছে 💖 possible হলে এজেন্ট confirm করার সময় জানাবে।',
      ).trim(),
    );
    return parts.join(' ').trim();
  }

  private describeAdvance(type: string, amount: number, percent: number) {
    if (type === 'fixed') return `${amount || 0} taka`;
    if (type === 'percent') return `${percent || 0}%`;
    return 'business rule অনুযায়ী';
  }

  private buildReplyFallback(question: any, paymentRules: any, product: any) {
    if (question.key === 'price' && product) {
      return `Price ${product.price ?? 0} taka.`;
    }
    if (question.key === 'size') {
      return 'Size info client customize করতে পারবে।';
    }
    if (question.key === 'color') {
      return 'Color info client customize করতে পারবে।';
    }
    if (question.key === 'fabric_type') {
      return product
        ? `Product code ${product.code} এর detail client customize করতে পারবে।`
        : 'Fabric type client customize করতে পারবে।';
    }
    if (question.key === 'advance_payment') {
      return this.buildAdvanceReply(paymentRules, {
        codLabel: 'COD',
        currencySymbol: '৳',
      });
    }
    return '';
  }

  private fillArbitraryTemplate(template: string, values: Record<string, any>) {
    return String(template || '').replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_m, key) => String(values?.[key] ?? ''),
    );
  }

  private fillTemplate(
    template: string,
    settings: any,
    paymentRules: any,
    product: any,
  ) {
    const safe = (v: any) => String(v ?? '');

    return safe(template)
      .replace(
        /\{\{\s*insideFee\s*\}\}/gi,
        safe(settings.deliveryFeeInsideDhaka ?? 0),
      )
      .replace(
        /\{\{\s*outsideFee\s*\}\}/gi,
        safe(settings.deliveryFeeOutsideDhaka ?? 0),
      )
      .replace(
        /\{\{\s*deliveryTime\s*\}\}/gi,
        safe(settings.deliveryTimeText || ''),
      )
      .replace(
        /\{\{\s*businessName\s*\}\}/gi,
        safe(settings.businessName || ''),
      )
      .replace(
        /\{\{\s*businessPhone\s*\}\}/gi,
        safe(settings.businessPhone || ''),
      )
      .replace(/\{\{\s*advanceNote\s*\}\}/gi, safe(paymentRules.note || ''))
      .replace(/\{\{\s*productCode\s*\}\}/gi, safe(product?.code || '-'))
      .replace(/\{\{\s*productPrice\s*\}\}/gi, safe(product?.price ?? '-'))
      .replace(/\{\{\s*productStock\s*\}\}/gi, safe(product?.stockQty ?? '-'))
      .replace(
        /\{\{\s*currencySymbol\s*\}\}/gi,
        safe(settings.currencySymbol || '৳'),
      )
      .replace(/\{\{\s*productInfoNote\s*\}\}/gi, safe(''));
  }

  private defaultGlobalConfig() {
    return {
      questions: this.normalizeQuestions([
        {
          key: 'price',
          label: 'Price / দাম',
          realMeaning: 'customer asks about product price or cost',
          helpText:
            'Customer যখন পণ্যের দাম জিজ্ঞেস করে — "দাম কত?", "price?", "rate?" ইত্যাদি।',
          keywords: [
            // Bengali
            'দাম',
            'দাম কত',
            'দাম কতো',
            'দাম বলেন',
            'দাম জানান',
            'কত টাকা',
            'কতো টাকা',
            'মূল্য',
            'মূল্য কত',
            'কত দিয়ে নেব',
            'কতে পড়বে',
            'কত পড়বে',
            'কত লাগবে',
            'দাম টা কত',
            'এর দাম কত',
            'পণ্যের দাম',
            // Banglish
            'dam',
            'dam koto',
            'dam koto taka',
            'dam bolun',
            'dam janun',
            'dam ta',
            'koto taka',
            'koto dam',
            'daam',
            'daam koto',
            'dam ta koto',
            'koto lagbe',
            'kote porbe',
            'koto pore',
            'dam bolen',
            'price',
            'price koto',
            'price ta',
            'price ta koto',
            'price ki',
            'price bolun',
            'rate',
            'rate koto',
            'rate ta',
            'cost',
            'cost koto',
            'mullo',
            'mullo koto',
            'taka koto',
            'koto taka lagbe',
            'koto diye nebo',
            'koto diye pabo',
          ],
          replyTemplate: 'Price {{productPrice}} taka.',
          enabled: true,
          replyType: 'product',
          priority: 1,
        },
        {
          key: 'size',
          label: 'Size / সাইজ',
          realMeaning: 'customer asks about available sizes',
          helpText: 'Customer সাইজ বা মাপ জিজ্ঞেস করলে এই reply যাবে।',
          keywords: [
            // Bengali
            'সাইজ',
            'সাইজ আছে',
            'কোন সাইজ আছে',
            'কি সাইজ আছে',
            'সাইজ কি কি',
            'মাপ',
            'মাপ কত',
            'মাপ কি',
            'কোন মাপ আছে',
            'ছোট',
            'মাঝারি',
            'বড়',
            'ছোট আছে',
            'বড় আছে',
            // Banglish
            'size',
            'size ache',
            'size ki ache',
            'kon size ache',
            'kon size ase',
            'size koto',
            'size ki ki',
            'size gulo ki',
            'ki size ache',
            'map',
            'mape',
            'maap',
            'maper',
            'koto mape',
            'small',
            'medium',
            'large',
            'xl',
            'xxl',
            'xxxl',
            'xs',
            'm size',
            'l size',
            'xl size',
            'xxl size',
            's size',
            'chhoto',
            'majhari',
            'boro',
            'choto size',
            'boro size',
            'fitting',
            'fit',
            'fit hobe',
            'fit korbe',
            'mape hobe',
            'koto number',
            'number size',
          ],
          replyTemplate: 'Available size client customize করবে।',
          enabled: true,
          replyType: 'text',
          priority: 2,
        },
        {
          key: 'color',
          label: 'Color / রং',
          realMeaning: 'customer asks about available colors',
          helpText: 'Customer রং বা কালার জিজ্ঞেস করলে এই reply যাবে।',
          keywords: [
            // Bengali
            'রং',
            'রঙ',
            'কোন রং আছে',
            'রং কি কি',
            'কি রং আছে',
            'রং গুলো কি',
            'কালার',
            'কালার আছে',
            'কোন কালার আছে',
            'কালার কি কি',
            'নীল',
            'লাল',
            'সবুজ',
            'কালো',
            'সাদা',
            'হলুদ',
            'গোলাপি',
            'বেগুনি',
            'বাদামি',
            'ধূসর',
            // Banglish
            'color',
            'color ache',
            'color ki ache',
            'kon color ache',
            'kon color ase',
            'color ki ki',
            'color gulo ki',
            'ki color ache',
            'colour',
            'rang',
            'rang ache',
            'rong',
            'rong ache',
            'kon rang',
            'ki rang',
            'rang ki ki',
            'rong ki ki',
            'rang gulo',
            'rong gulo',
            'blue',
            'red',
            'green',
            'black',
            'white',
            'yellow',
            'pink',
            'purple',
            'grey',
            'brown',
            'neel',
            'lal',
            'sobuj',
            'kalo',
            'shada',
            'holud',
            'golapi',
            'beguni',
            'badami',
            'dark',
            'light',
            'mixed',
            'printed',
          ],
          replyTemplate: 'Available color client customize করবে।',
          enabled: true,
          replyType: 'text',
          priority: 3,
        },
        {
          key: 'delivery_fee',
          label: 'Delivery charge / ডেলিভারি চার্জ',
          realMeaning: 'customer asks about delivery charge or shipping cost',
          helpText:
            'Customer ডেলিভারি চার্জ বা শিপিং খরচ জিজ্ঞেস করলে এই reply যাবে।',
          keywords: [
            // Bengali
            'ডেলিভারি চার্জ',
            'ডেলিভারি কত',
            'ডেলিভারি খরচ',
            'ডেলিভারি ফি',
            'কুরিয়ার চার্জ',
            'কুরিয়ার কত',
            'শিপিং চার্জ',
            'শিপিং খরচ',
            'পাঠাতে কত লাগবে',
            'পাঠানোর খরচ',
            'হোম ডেলিভারি চার্জ',
            // Banglish
            'delivery charge',
            'delivery cost',
            'delivery fee',
            'delivery taka',
            'delivery koto',
            'delivery koto taka',
            'delivery charge koto',
            'courier charge',
            'courier cost',
            'courier fee',
            'courier koto',
            'shipping charge',
            'shipping cost',
            'shipping fee',
            'delivery te koto lagbe',
            'pathate koto lagbe',
            'pathানো koto',
            'home delivery charge',
            'home delivery cost',
            'home delivery taka',
            'deliver korte koto',
            'send korte koto',
            'pathate koto',
          ],
          replyTemplate:
            'Dhakar vitore {{insideFee}} taka, Dhakar bahire {{outsideFee}} taka.',
          enabled: true,
          replyType: 'settings',
          priority: 4,
        },
        {
          key: 'delivery_time',
          label: 'Delivery time (সাধারণত কতদিন লাগে?)',
          realMeaning:
            'customer asks general delivery time policy — how many days it usually takes',
          helpText:
            'Customer সাধারণভাবে জিজ্ঞেস করছে "delivery তে কতদিন লাগে?" — এটা policy question।',
          keywords: [
            // Bengali — সাধারণ নিয়ম / policy
            'কতদিন লাগে',
            'কত দিন লাগে',
            'কতদিন লাগবে',
            'কত দিন লাগবে',
            'ডেলিভারি তে কতদিন',
            'ডেলিভারি সময় কত',
            'ডেলিভারি টাইম কত',
            'সাধারণত কতদিন',
            'নরমালি কতদিন',
            'কত দিনের মধ্যে',
            'কতদিনের মধ্যে পাব',
            // Banglish — general policy
            'koto din lagbe',
            'koto din lage',
            'delivery time koto',
            'delivery time',
            'delivery te koto din',
            'delivery koto din',
            'delivery koto dine',
            'koto dine deliver hoy',
            'normally koto din',
            'usually koto din',
            'generally koto din',
            'koto time lagbe',
            'koto din er moddhe',
            'day koto lagbe',
            'koto day lagbe',
            'express delivery',
            'same day delivery',
            'next day delivery',
          ],
          replyTemplate: '{{deliveryTime}}',
          enabled: true,
          replyType: 'settings',
          priority: 5,
        },
        {
          key: 'delivery_when',
          label: 'Delivery কবে পাব? (নির্দিষ্ট order)',
          realMeaning:
            'customer asks when their specific order will arrive — tracking or eta question',
          helpText:
            'Customer তার নির্দিষ্ট order সম্পর্কে জিজ্ঞেস করছে "কবে পাব?", "কবে আসবে?" — এটা order status question।',
          keywords: [
            // Bengali — নির্দিষ্ট order এর জন্য
            'কবে পাব',
            'কবে আসবে',
            'কবে পৌঁছাবে',
            'কখন পাব',
            'কখন আসবে',
            'কবে দিবেন',
            'কবে পাঠাবেন',
            'কবে পাঠাচ্ছেন',
            'অর্ডার কবে আসবে',
            'আমার অর্ডার কবে',
            'আমার পণ্য কবে',
            'এখনো আসেনি',
            'এখনও আসেনি',
            'দেরি হচ্ছে কেন',
            'ট্র্যাকিং',
            'কোথায় আছে',
            'status কি',
            // Banglish — specific order
            'kobe pabo',
            'kobe asbe',
            'kobe pouche dibe',
            'kobe pathaben',
            'kokhon pabo',
            'kokhon asbe',
            'kokhon diben',
            'ami kobe pabo',
            'amar order kobe',
            'amar product kobe',
            'order kobe asbe',
            'parcel kobe asbe',
            'parcel kobe',
            'ekhono ashe ni',
            'deri hochhe keno',
            'update din',
            'tracking',
            'track korte chai',
            'kothay ache',
            'status ki',
            'kobe deliver hobe',
            'deliver korben kobe',
            'dispatch hoyeche',
            'out for delivery',
            'on the way',
            'rasta e ache',
          ],
          replyTemplate:
            'আপনার order আমরা যত দ্রুত সম্ভব পাঠাব। Order confirm হলে আমরা আপনাকে জানাব।',
          enabled: true,
          replyType: 'text',
          priority: 6,
        },
        {
          key: 'exchange_policy',
          label: 'Exchange / Return policy',
          realMeaning: 'customer asks about exchange or return policy',
          helpText: 'Customer পণ্য ফেরত বা exchange করতে চাইলে এই reply যাবে।',
          keywords: [
            // Bengali
            'এক্সচেঞ্জ',
            'ফেরত',
            'ফেরত দেওয়া যাবে',
            'ফেরত নেবেন',
            'ফেরত দিতে পারব',
            'বদলানো যাবে',
            'পরিবর্তন করা যাবে',
            'নষ্ট হলে',
            'সমস্যা হলে',
            'ফেরত নিবেন',
            'বদলে দিবেন',
            'ঠিক না হলে',
            // Banglish
            'exchange',
            'exchange kora jabe',
            'exchange nibe',
            'exchange dibe',
            'return',
            'return kora jabe',
            'return nibe',
            'return policy',
            'ferot',
            'ferot dewa jabe',
            'ferot nibe',
            'ferot dibe',
            'bodlano jabe',
            'change kore diben',
            'change korte parbo',
            'nosto hole',
            'problem hole',
            'defect hole',
            'issue hole',
            'mot na hole',
            'pochhhondo na hole',
            'fit na hole',
            'firiye dite parbo',
            'firiye newa jabe',
            'warranty',
            'guarantee',
            'replacement',
          ],
          replyTemplate: 'Exchange policy client dashboard theke set korun।',
          enabled: true,
          replyType: 'text',
          priority: 6,
        },
        {
          key: 'advance_payment',
          label: 'Advance payment / বিকাশ',
          realMeaning: 'customer asks whether advance payment is required',
          helpText:
            'Customer আগে টাকা দিতে হবে কিনা বা বিকাশ লাগবে কিনা জিজ্ঞেস করলে।',
          keywords: [
            // Bengali
            'অ্যাডভান্স',
            'আগে টাকা',
            'আগাম টাকা',
            'বুকিং মানি',
            'অগ্রিম',
            'বিকাশ করতে হবে',
            'নগদ করতে হবে',
            'পেমেন্ট আগে',
            'টাকা আগে দিতে হবে',
            'আগে পেমেন্ট',
            // Banglish
            'advance',
            'advance lagbe',
            'advance dite hobe',
            'advance nite hobe',
            'booking money',
            'booking taka',
            'prepayment',
            'age taka dite hobe',
            'age pay korte hobe',
            'upfront',
            'bkash',
            'bkash korte hobe',
            'bikash',
            'nagad',
            'nagad dite hobe',
            'rocket',
            'upay',
            'mobile banking',
            'cod',
            'cash on delivery',
            'cash on',
            'pouchhe dibo',
            'payment kivabe',
            'pay kivabe',
            'kemon pay',
            'taka pathabo kivabe',
            'taka dibo kivabe',
          ],
          replyTemplate: '{{advanceNote}}',
          enabled: true,
          replyType: 'payment',
          priority: 7,
        },
        {
          key: 'fabric_type',
          label: 'Fabric / Material / কাপড়',
          realMeaning: 'customer asks about fabric or material quality',
          helpText:
            'Customer কাপড়ের ধরন, মান বা material জিজ্ঞেস করলে এই reply যাবে।',
          keywords: [
            // Bengali
            'কাপড়',
            'কাপড় কেমন',
            'কি কাপড়',
            'কোন কাপড়',
            'কাপড়ের মান',
            'ম্যাটেরিয়াল',
            'কাপড় ভালো',
            'গরম হবে না',
            'আরামদায়ক',
            'সুতা',
            'কটন',
            'পলিয়েস্টার',
            'সিল্ক',
            'খাদি',
            'লিনেন',
            // Banglish
            'fabric',
            'fabric ki',
            'fabric kemon',
            'kon fabric',
            'kapor',
            'kapor ki',
            'kapor kemon',
            'kon kapor',
            'kapar',
            'material',
            'material ki',
            'material kemon',
            'kon material',
            'kemon kapar',
            'kapar er maan',
            'quality kemon',
            'cotton',
            'polyester',
            'silk',
            'linen',
            'georgette',
            'chiffon',
            'velvet',
            'suta',
            'thread',
            'kemon kapor',
            'gorom hobe na',
            'comfortable',
            'soft',
            'aramdayok',
            'valo kapor',
            'pure cotton',
            'half silk',
            'full silk',
            'viscose',
          ],
          replyTemplate: 'Fabric type client customize করবে।',
          enabled: true,
          replyType: 'text',
          priority: 8,
        },
        {
          key: 'availability',
          label: 'Stock available / আছে কি',
          realMeaning: 'customer asks if the product is available or in stock',
          helpText: 'Customer জিজ্ঞেস করে পণ্য আছে কিনা, পাওয়া যাবে কিনা।',
          keywords: [
            // Bengali
            'আছে',
            'আছে কি',
            'পাওয়া যাবে',
            'পাওয়া যাচ্ছে',
            'স্টক আছে',
            'এখন আছে',
            'এখন পাওয়া যাবে',
            'পাবো',
            'পাব',
            'পাওয়া যাবে কি',
            'আছে নাকি',
            'আছে তো',
            'পাওয়া যাচ্ছে কি',
            'কি আছে',
            // Banglish
            'ache',
            'ache ki',
            'pawa jabe',
            'pawa jacche',
            'stock ache',
            'ekhon ache',
            'ekhon pawa jabe',
            'pabo',
            'pabe',
            'available',
            'available ache',
            'in stock',
            'stock ki ache',
            'ache naki',
            'ache to',
            'ki ache',
            'ki ki ache',
            'ready ache',
            'ready',
            'ready stock',
            'instant',
            'akta ache',
            'duta ache',
            'koyekta ache',
          ],
          replyTemplate:
            'হ্যাঁ, এই পণ্যটি এখন available। Order করতে আপনার নাম, ঠিকানা ও ফোন নম্বর দিন।',
          enabled: true,
          replyType: 'text',
          priority: 9,
        },
        {
          key: 'how_to_order',
          label: 'How to order / অর্ডার কিভাবে',
          realMeaning: 'customer asks how to place an order',
          helpText: 'Customer জিজ্ঞেস করে কিভাবে অর্ডার করবে বা কিনবে।',
          keywords: [
            // Bengali
            'অর্ডার করব কিভাবে',
            'অর্ডার কিভাবে',
            'কিভাবে কিনব',
            'কিনব কিভাবে',
            'অর্ডার দেব',
            'অর্ডার দিতে চাই',
            'কিনতে চাই',
            'নিতে চাই',
            'বুক করব',
            'বুকিং দেব',
            // Banglish
            'order korbo kivabe',
            'order kivabe dibo',
            'kivabe order korbo',
            'order dite chai',
            'nite chai',
            'kinte chai',
            'buy korte chai',
            'order process',
            'order kivabe',
            'ki ki lagbe order dite',
            'book korbo',
            'booking dibo',
            'confirm korbo',
            'ki info dite hobe',
            'ki ki dite hobe',
            'details dibo',
            'name address phone',
            'details lagbe',
          ],
          replyTemplate:
            'অর্ডার করতে আপনার নাম, ঠিকানা ও ফোন নম্বর এই page-এ message করুন। আমরা confirm করব।',
          enabled: true,
          replyType: 'text',
          priority: 10,
        },
        {
          key: 'product_quality',
          label: 'Quality / মান কেমন',
          realMeaning: 'customer asks about product quality or durability',
          helpText: 'Customer পণ্যের মান, টেকসই বা quality নিয়ে জিজ্ঞেস করলে।',
          keywords: [
            // Bengali
            'মান',
            'মান কেমন',
            'কোয়ালিটি',
            'ভালো',
            'ভালো কি',
            'টেকসই',
            'কতদিন টিকবে',
            'নকল না আসল',
            'অরিজিনাল',
            'আসল পণ্য',
            // Banglish
            'quality',
            'quality kemon',
            'maan kemon',
            'valo ki',
            'valo ache',
            'teksoi',
            'durable',
            'long lasting',
            'koto din tikbe',
            'original',
            'genuine',
            'authentic',
            'copy na original',
            'fake na real',
            'real na fake',
            'imported',
            'high quality',
            'best quality',
            'premium',
          ],
          replyTemplate:
            'আমাদের পণ্যের মান উন্নত এবং টেকসই। আরও জানতে চাইলে জিজ্ঞেস করুন।',
          enabled: true,
          replyType: 'text',
          priority: 11,
        },
        {
          key: 'wholesale',
          label: 'Wholesale / পাইকারি',
          realMeaning: 'customer asks about wholesale or bulk pricing',
          helpText: 'Customer পাইকারি দাম বা বেশি quantity কিনতে চাইলে।',
          keywords: [
            // Bengali
            'পাইকারি',
            'পাইকারি দাম',
            'বেশি নিলে',
            'একসাথে অনেক',
            'বাল্ক',
            'রিসেলার',
            'রিসেল করব',
            'ব্যবসার জন্য',
            // Banglish
            'wholesale',
            'wholesale price',
            'paikari',
            'paikari dam',
            'beshi nile',
            'ekta beshi',
            'bulk',
            'bulk order',
            'reseller',
            'resell korbo',
            'business er jonno',
            'beshi nile dam koto',
            'discount kore diben',
            'kom diben',
            '10 ta nile',
            '20 ta nile',
            'quantity order',
          ],
          replyTemplate:
            'পাইকারি/wholesale সম্পর্কে জানতে inbox-এ details দিন অথবা যোগাযোগ করুন।',
          enabled: true,
          replyType: 'text',
          priority: 12,
        },
      ]),
      systemReplies: this.defaultSystemReplies(),
      pricingPolicy: this.defaultPricingPolicy(),
      areaRules: {
        globalInsideDhaka: this.normalizeAreas([
          {
            areaName: 'Mirpur',
            aliases: [
              'mirpur',
              'mirpur 1',
              'mirpur 10',
              'mirpur 11',
              'mirpur 12',
              'mirpr',
            ],
            zoneType: 'inside_dhaka',
            active: true,
          },
          {
            areaName: 'Uttara',
            aliases: [
              'uttara',
              'uttora',
              'utora',
              'azampur',
              'housebuilding',
              'uttara sector',
            ],
            zoneType: 'inside_dhaka',
            active: true,
          },
          {
            areaName: 'Dhanmondi',
            aliases: ['dhanmondi', 'dhan mandi', 'dhanmndi'],
            zoneType: 'inside_dhaka',
            active: true,
          },
          {
            areaName: 'Mohammadpur',
            aliases: ['mohammadpur', 'mohammad pur', 'mohamadpur'],
            zoneType: 'inside_dhaka',
            active: true,
          },
          {
            areaName: 'Badda',
            aliases: ['badda', 'bada', 'aftabnagar', 'north badda'],
            zoneType: 'inside_dhaka',
            active: true,
          },
          {
            areaName: 'Gulshan',
            aliases: ['gulshan', 'banani', 'niketon'],
            zoneType: 'inside_dhaka',
            active: true,
          },
        ]),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private defaultPricingPolicy() {
    return {
      priceMode: 'FIXED',
      allowCustomerOffer: false,
      agentApprovalRequired: true,
      autoNoteCustomerOffer: true,
      fixedPriceReplyText: 'এই page-এ price fixed। বর্তমান price-টাই final 💖',
      negotiationReplyText:
        'আপনার requested price note করা হয়েছে 💖 possible হলে এজেন্ট confirm করার সময় জানাবে।',
      minNegotiationType: 'none',
      minNegotiationValue: 0,
    };
  }

  private defaultPaymentRules() {
    return {
      codEnabled: true,
      insideDhakaAdvanceEnabled: false,
      outsideDhakaAdvanceEnabled: false,
      insideDhakaAdvanceType: 'none',
      outsideDhakaAdvanceType: 'none',
      insideDhakaAdvanceAmount: 0,
      outsideDhakaAdvanceAmount: 0,
      insideDhakaAdvancePercent: 0,
      outsideDhakaAdvancePercent: 0,
      highValueThreshold: 3000,
      highValueAdvancePercent: 50,
      note: 'Business type অনুযায়ী advance payment rule set করুন।',
    };
  }

  private defaultSystemReplies() {
    return this.normalizeSystemReplies({
      ocr_processing: {
        template: 'স্ক্রিনশট পেয়েছি ✅ Processing হচ্ছে... ⏳',
        fallback: 'স্ক্রিনশট পেয়েছি ✅ Processing হচ্ছে... ⏳',
      },
      ocr_fail: {
        template:
          'দুঃখিত, ছবিটি থেকে code পড়া যায়নি। পরিষ্কার screenshot বা code দিন।',
        fallback:
          'দুঃখিত, ছবিটি থেকে code পড়া যায়নি। পরিষ্কার screenshot বা code দিন।',
      },
      order_received: {
        template:
          '✅ আপনার তথ্য রিসিভ করা হয়েছে। আমাদের এজেন্ট চেক করে কনফার্ম করবে 💖',
        fallback: '✅ আপনার তথ্য রিসিভ করা হয়েছে।',
      },
      order_confirmed: {
        template:
          '✅ আপনার অর্ডার #{{orderId}} কনফার্ম হয়েছে! আমরা খুব শীঘ্রই পাঠিয়ে দেবো 🚚',
        fallback: '✅ আপনার অর্ডার কনফার্ম হয়েছে।',
      },
      order_courier_sent: {
        template:
          '📦 আপনার অর্ডার #{{orderId}} courier-এ পাঠানো হয়েছে!\n\nCourier: {{courierName}}\nTracking ID: {{trackingId}}\n\nশীঘ্রই পৌঁছে যাবে 🙌',
        fallback: '📦 আপনার অর্ডার courier-এ পাঠানো হয়েছে।',
      },
      order_cancelled: {
        template: '❌ আপনার অর্ডারটি বাতিল করা হয়েছে।',
        fallback: '❌ আপনার অর্ডারটি বাতিল করা হয়েছে।',
      },
      product_not_found: {
        template: '❌ এই কোডটি পাওয়া যায়নি: {{productCode}}',
        fallback: '❌ এই কোডটি পাওয়া যায়নি।',
      },
      stock_out: {
        template: '❌ {{productCode}} বর্তমানে স্টক আউট',
        fallback: '❌ Product বর্তমানে স্টক আউট।',
      },
      product_info: {
        template: `✅ Available

Code: {{productCode}}
Price: {{productPrice}}{{currencySymbol}}
Stock: {{productStock}}

{{productInfoNote}}`,
        fallback: '',
      },
      order_prompt: {
        template: 'অর্ডার করতে: Name + Phone + Full Address দিন 💖',
        fallback: '',
      },
      generic_fallback: {
        template:
          'আপনার প্রশ্নটি নোট করা হয়েছে। প্রয়োজনে আমাদের এজেন্ট আরও তথ্য দেবে।',
        fallback: 'আপনার প্রশ্নটি নোট করা হয়েছে।',
      },
    });
  }

  private normalizeSystemReplies(systemReplies: Record<string, any>) {
    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(systemReplies || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[String(key)] = {
          template: String(value.template || '').trim(),
          fallback: String(value.fallback || '').trim(),
          enabled: value.enabled !== false,
        };
      } else {
        out[String(key)] = {
          template: String(value || '').trim(),
          fallback: '',
          enabled: true,
        };
      }
    }

    return out;
  }

  private buildGlobalSuggestions(globalQuestions: any[], pageQuestions: any[]) {
    const pageKeys = new Set(
      (pageQuestions || []).map((q: any) => String(q.key)),
    );

    return (globalQuestions || [])
      .filter((q: any) => !pageKeys.has(String(q.key)))
      .slice(0, 50)
      .map((q: any) => ({
        key: q.key,
        label: q.label,
        realMeaning: q.realMeaning,
        keywords: q.keywords || [],
      }));
  }

  private mergeQuestions(globalQuestions: any[], pageQuestions: any[]) {
    const map = new Map<string, any>();

    for (const q of this.normalizeQuestions(globalQuestions || [])) {
      map.set(String(q.key), { ...q, source: 'global' });
    }

    for (const q of this.normalizeQuestions(pageQuestions || [])) {
      map.set(String(q.key), {
        ...(map.get(String(q.key)) || {}),
        ...q,
        source: 'client_override',
      });
    }

    return Array.from(map.values()).sort(
      (a: any, b: any) =>
        Number(a.priority || 0) - Number(b.priority || 0) ||
        String(a.label).localeCompare(String(b.label)),
    );
  }

  private normalizeQuestions(questions: any[]) {
    return (questions || []).map((q: any, i: number) => ({
      key: this.slug(q.key || `custom_${i + 1}`),
      label: String(q.label || q.key || `Question ${i + 1}`).trim(),
      realMeaning: String(q.realMeaning || q.label || '').trim(),
      // V8: helpText — shown in UI as ⓘ tooltip, admin can set this
      helpText: String(q.helpText || '').trim(),
      keywords: Array.isArray(q.keywords)
        ? q.keywords.map((x: any) => String(x).trim()).filter(Boolean)
        : String(q.keywords || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
      replyTemplate: String(q.replyTemplate || '').trim(),
      enabled: q.enabled !== false,
      replyType: String(q.replyType || 'text').trim(),
      priority: Number(q.priority || i + 1),
    }));
  }

  private normalizeAreas(areas: any[]) {
    return (areas || []).map((a: any, i: number) => ({
      areaName: String(a.areaName || `Area ${i + 1}`).trim(),
      aliases: Array.isArray(a.aliases)
        ? a.aliases.map((x: any) => String(x).trim()).filter(Boolean)
        : String(a.aliases || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
      zoneType: String(a.zoneType || 'inside_dhaka'),
      active: a.active !== false,
    }));
  }

  private detectArea(normalizedMessage: string, areaRules: any) {
    const rules = [
      ...(areaRules?.clientCustomAreas || []),
      ...(areaRules?.globalInsideDhaka || []),
    ].filter((x: any) => x.active !== false);

    let best: any = null;

    for (const rule of rules) {
      for (const alias of [rule.areaName, ...(rule.aliases || [])]) {
        const score = this.keywordScore(
          normalizedMessage,
          this.normalize(alias),
        );
        if (!best || score > best.score) {
          best = {
            areaName: rule.areaName,
            zoneType: rule.zoneType,
            alias,
            score,
          };
        }
      }
    }

    if (!best || best.score < 0.72) {
      return {
        zoneType: 'unknown',
        matchedArea: null,
        matchedAlias: null,
        score: 0,
      };
    }

    return {
      zoneType: best.zoneType,
      matchedArea: best.areaName,
      matchedAlias: best.alias,
      score: Number(best.score.toFixed(2)),
    };
  }

  // ── Banglish → canonical form map ─────────────────────────────────────────
  // Maps common Banglish spellings to a single canonical token so Levenshtein
  // sees them as identical rather than measuring character distance.
  private readonly BANGLISH_MAP: [RegExp, string][] = [
    // price / cost
    [
      /\b(dam|daam|daaam|dum|dom|dam koto|price|prise|proce|cost|kosht|koshot)\b/g,
      'dam',
    ],
    // how much / how many
    [/\b(koto|kotto|kato|kata|kotoi|koyto|koyto|kit|kita)\b/g, 'koto'],
    // delivery time / when
    [
      /\b(kobe|kbe|koob|koobe|koob|delivery time|deliveri time|deli time)\b/g,
      'delivery_time',
    ],
    // delivery charge / cost
    [
      /\b(delivery cost|deliveri cost|deli cost|delivery charge|deliveri charge|shipping cost|courier cost)\b/g,
      'delivery_charge',
    ],
    // available / in stock
    [
      /\b(available|avaible|avail|abeilebl|abilebl|stock|stok|stoock|achhe|ache|pawa jabe|paoa jabe)\b/g,
      'available',
    ],
    // size
    [/\b(size|siz|saiz|saize|shize|mop|mape|maap)\b/g, 'size'],
    // colour
    [/\b(color|colour|coler|rang|rong|rang ki|rong ki)\b/g, 'color'],
    // exchange / return
    [
      /\b(exchange|exchenge|return|ফেরত|ferot|firiye|firiye newa|newa)\b/g,
      'exchange',
    ],
    // advance / bkash
    [
      /\b(advance|adv|bkash|bikash|nagad|nagad|roket|rocket|upfront)\b/g,
      'advance',
    ],
    // fabric / material
    [
      /\b(kapar|kapor|kapd|fabric|meterial|material|kemon kapar|cloth)\b/g,
      'fabric',
    ],
    // order / buy
    [
      /\b(order|ordar|oder|oda|nite chai|nibo|kinte chai|buy|purchase)\b/g,
      'order',
    ],
    // cash on delivery
    [/\b(cod|cash on delivery|ক্যাশ অন|cash|ক্যাশ)\b/g, 'cod'],
    // location / address typos
    [/\b(uttora|utora|uttara)\b/g, 'uttara'],
    [/\b(dhan mondi|dhanmandi|dhanmondi)\b/g, 'dhanmondi'],
    [/\b(mohammad pur|mohammadpur|mohammadpore)\b/g, 'mohammadpur'],
    [/\b(mir pr|mirpur|mirpore)\b/g, 'mirpur'],
    [/\b(couriar|courier|courir)\b/g, 'courier'],
    // question particles
    [/\b(ki|ke|kii|kiii)\b/g, 'ki'],
    [/\b(keno|kno|kyano)\b/g, 'keno'],
    [/\b(kivabe|kibhabe|kivaabe|how)\b/g, 'kivabe'],
    // yes / confirm
    [/\b(confirm|konfirm|haan|haa|ha|ji|yes|ok|okay)\b/g, 'confirm'],
    // no / cancel
    [/\b(na|nah|nope|cancel|cancle|no)\b/g, 'na'],
  ];

  private applyBanglishMap(text: string): string {
    let t = text;
    for (const [pattern, replacement] of this.BANGLISH_MAP) {
      t = t.replace(pattern, replacement);
    }
    return t;
  }

  private keywordScore(text: string, keyword: string) {
    if (!text || !keyword) return 0;

    const t = this.normalize(text);
    const k = this.normalize(keyword);

    // Exact full match
    if (t === k) return 1;
    // Exact substring match
    if (t.includes(k)) return k.length >= 3 ? 1 : 0.9;
    // keyword contains text (short keywords inside longer)
    if (k.includes(t) && t.length >= 3) return 0.88;

    // Word-level matching
    const tWords = t.split(/\s+/).filter(Boolean);
    const kWords = k.split(/\s+/).filter(Boolean);

    // All keyword words found in text words (full phrase match)
    if (kWords.length > 1) {
      const allFound = kWords.every((kw) =>
        tWords.some(
          (tw) => tw === kw || this.levenshteinSimilarity(tw, kw) >= 0.82,
        ),
      );
      if (allFound) return 0.96;
    }

    // Best single word similarity
    let best = 0;
    for (const tw of tWords) {
      for (const kw of kWords) {
        best = Math.max(best, this.levenshteinSimilarity(tw, kw));
      }
    }
    // Full string similarity as fallback
    best = Math.max(best, this.levenshteinSimilarity(t, k));

    return best;
  }

  private levenshteinSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const longer = Math.max(a.length, b.length);
    if (!longer) return 1;
    return 1 - this.levenshtein(a, b) / longer;
  }

  private similarity(a: string, b: string) {
    return this.levenshteinSimilarity(this.normalize(a), this.normalize(b));
  }

  private levenshtein(a: string, b: string) {
    const rows = Array.from({ length: b.length + 1 }, () =>
      Array(a.length + 1).fill(0),
    );

    for (let i = 0; i <= b.length; i++) rows[i][0] = i;
    for (let j = 0; j <= a.length; j++) rows[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        rows[i][j] =
          b.charAt(i - 1) === a.charAt(j - 1)
            ? rows[i - 1][j - 1]
            : Math.min(
                rows[i - 1][j - 1] + 1,
                rows[i][j - 1] + 1,
                rows[i - 1][j] + 1,
              );
      }
    }

    return rows[b.length][a.length];
  }

  private normalize(value: string) {
    let t = String(value || '')
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?।]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Apply Banglish normalization
    t = this.applyBanglishMap(t);
    return t.replace(/\s+/g, ' ').trim();
  }

  private isOrderInfo(message: string): boolean {
    const m = message.trim();
    // Phone number only
    if (/^(\+?88)?01[3-9]\d{8}$/.test(m.replace(/[\s\-]/g, ''))) return true;
    // Contains phone number + other text (order submission)
    if (/(\+?88)?01[3-9]\d{8}/.test(m)) return true;
    // Pure numeric (order ID, amount)
    if (/^\d{4,}$/.test(m)) return true;
    // Very short single word likely a name (2-12 chars, no special meaning)
    if (
      /^[\u0980-\u09FF\w]{2,12}$/.test(m) &&
      m.split(/\s+/).length === 1 &&
      m.length <= 15
    )
      return true;
    return false;
  }

  private async logLearning(
    pageId: number,
    message: string,
    result: any,
    psid?: string,
  ) {
    // Skip logging order information (name, phone, address patterns)
    if (this.isOrderInfo(message)) return;

    // Fetch customer info from CRM if psid provided
    let customer: { psid: string; name?: string; phone?: string } | null = null;
    if (psid) {
      try {
        const crm = await this.prisma.customer.findFirst({
          where: { pageId, psid },
          select: { psid: true, name: true, phone: true },
        });
        if (crm)
          customer = {
            psid: crm.psid,
            name: crm.name ?? undefined,
            phone: crm.phone ?? undefined,
          };
        else customer = { psid };
      } catch {
        customer = { psid };
      }
    }

    const logs = this.readLearning();

    logs.push({
      id: this.uuid(),
      pageId,
      message,
      normalized: result.normalized,
      productCode: result.product?.code || null,
      bestGuess: result.matchedQuestions[0] || null,
      suggestedKeywords: result.suggestedKeywords || [],
      areaResult: result.areaResult,
      customer,
      createdAt: new Date().toISOString(),
    });

    fs.writeFileSync(
      this.learningFile,
      JSON.stringify(logs.slice(-1000), null, 2),
      'utf8',
    );
  }

  private extractCode(text: string): string | null {
    const t = String(text || '').toUpperCase();
    const match = t.match(/\bDF\s*[-]?\s*(\d{1,6})\b/);
    if (!match) return null;
    return `DF-${match[1].padStart(4, '0')}`;
  }

  private slug(value: string) {
    return (
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_') || `custom_${Date.now()}`
    );
  }

  private uuid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private pageFile(pageId: number) {
    return path.join(this.storageRoot, `page-${pageId}.json`);
  }

  private readPage(pageId: number): any {
    const p = this.pageFile(pageId);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
  }

  private writePage(pageId: number, data: any) {
    fs.writeFileSync(
      this.pageFile(pageId),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }

  private readGlobal(): any {
    return JSON.parse(fs.readFileSync(this.globalFile, 'utf8') || '{}');
  }

  private writeGlobal(data: any) {
    fs.writeFileSync(this.globalFile, JSON.stringify(data, null, 2), 'utf8');
  }

  private readLearning(): any[] {
    return JSON.parse(fs.readFileSync(this.learningFile, 'utf8') || '[]');
  }

  removeLearningEntry(id: string) {
    const logs = this.readLearning();
    const next = logs.filter((e: any) => e.id !== id);
    fs.writeFileSync(this.learningFile, JSON.stringify(next, null, 2), 'utf8');
    return { removed: logs.length - next.length };
  }

  async assignLearningEntry(body: {
    logId: string;
    pageId: number;
    action: 'add_to_existing' | 'create_new';
    // add_to_existing
    questionKey?: string;
    keywords?: string[];
    // create_new
    target?: 'global' | 'client';
    label?: string;
    key?: string;
    realMeaning?: string;
    replyTemplate?: string;
    replyType?: string;
  }) {
    if (body.action === 'add_to_existing') {
      const cfg = await this.getConfig(body.pageId);
      const allQ = cfg.questions;
      const q = allQ.find((q: any) => q.key === body.questionKey);
      if (!q) throw new Error(`Question "${body.questionKey}" not found`);

      const newKeywords = Array.from(
        new Set([...(q.keywords || []), ...(body.keywords || [])]),
      );
      const updated = allQ.map((item: any) =>
        item.key === body.questionKey
          ? { ...item, keywords: newKeywords }
          : item,
      );
      await this.updateQuestions(body.pageId, updated);
    } else if (body.action === 'create_new') {
      const slug = (body.key || body.label || 'custom_' + Date.now())
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      const newQ = {
        key: slug,
        label: body.label || slug,
        realMeaning: body.realMeaning || body.label || slug,
        helpText: '',
        keywords: body.keywords || [],
        replyTemplate: body.replyTemplate || '',
        enabled: true,
        replyType: body.replyType || 'text',
        priority: 99,
        source: body.target === 'global' ? 'global' : 'client_override',
      };

      if (body.target === 'global') {
        const global = this.readGlobal();
        global.questions = [...(global.questions || []), newQ];
        global.updatedAt = new Date().toISOString();
        this.writeGlobal(global);
      } else {
        const cfg = await this.getConfig(body.pageId);
        await this.updateQuestions(body.pageId, [...cfg.questions, newQ]);
      }
    }

    this.removeLearningEntry(body.logId);
    return this.getConfig(body.pageId);
  }
}
