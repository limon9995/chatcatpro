import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationService } from '../orders/order-notification.service';

export type CourierName =
  | 'pathao'
  | 'steadfast'
  | 'redx'
  | 'paperfly'
  | 'manual';

export interface CourierSettings {
  defaultCourier: CourierName;
  autoBookOnConfirm: boolean;
  pathao?: { apiKey: string; secretKey: string; storeId?: string };
  steadfast?: { apiKey: string; secretKey: string };
  redx?: { apiKey: string };
  paperfly?: { apiKey: string; apiPassword: string };
}

export interface BookingInput {
  orderId: number;
  pageId: number;
  courier: CourierName;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
  weight?: number;
  note?: string;
}

export interface ManualShipmentInput {
  courierName?: CourierName;
  trackingId?: string;
  trackingUrl?: string;
  codAmount?: number;
  weight?: number;
  courierFee?: number;
  bookedAt?: string | Date | null;
}

// FIX 3: courier API timeout — 15s, retry up to 2 times with 2s backoff
const COURIER_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);
  private readonly settingsDir = path.join(
    process.cwd(),
    'storage',
    'courier-settings',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: OrderNotificationService,
  ) {}

  // ── Book a shipment ───────────────────────────────────────────────────────
  async bookShipment(pageId: number, input: BookingInput): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });
    if (!order || order.pageIdRef !== pageId)
      throw new NotFoundException('Order not found');

    const settings = this.parseSettings(await this.getSettings(pageId));

    let trackingId: string | null = null;
    let trackingUrl: string | null = null;
    let rawResponse: any = null;

    if (input.courier !== 'manual') {
      // FIX 3: with retry
      const result = await this.callWithRetry(input.courier, settings, input);
      trackingId = result.trackingId;
      trackingUrl = result.trackingUrl;
      rawResponse = result.raw;
    }

    const existing = await this.prisma.courierShipment.findUnique({
      where: { orderId: input.orderId },
    });
    const data = {
      pageId,
      courierName: input.courier,
      trackingId: trackingId ?? null,
      trackingUrl: trackingUrl ?? null,
      status: 'booked',
      codAmount: input.codAmount,
      weight: input.weight ?? 0.5,
      bookedAt: new Date(),
      rawResponse: rawResponse ? JSON.stringify(rawResponse) : null,
    };

    const shipment = existing
      ? await this.prisma.courierShipment.update({
          where: { orderId: input.orderId },
          data,
        })
      : await this.prisma.courierShipment.create({
          data: { ...data, orderId: input.orderId },
        });

    this.logger.log(
      `[Courier] Booked: order=${input.orderId} courier=${input.courier} tracking=${trackingId}`,
    );

    // Fire-and-forget: notify customer via Messenger
    void this.notification.notifyCourierSent(pageId, input.orderId, {
      courierName: input.courier,
      trackingId: trackingId,
    });

    return shipment;
  }

  // ── FIX 3: Retry wrapper ──────────────────────────────────────────────────
  private async callWithRetry(
    courier: CourierName,
    settings: CourierSettings,
    input: BookingInput,
    attempt = 1,
  ): Promise<{
    trackingId: string | null;
    trackingUrl: string | null;
    raw: any;
  }> {
    try {
      return await this.callCourierApi(courier, settings, input);
    } catch (e: any) {
      const isRetryable = this.isRetryableError(e);
      if (attempt < MAX_RETRIES && isRetryable) {
        const delay = attempt * 2000;
        this.logger.warn(
          `[Courier] ${courier} attempt ${attempt} failed (${e.message}), retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        return this.callWithRetry(courier, settings, input, attempt + 1);
      }
      // FIX 3: detailed failure logging
      this.logger.error(
        `[Courier] ${courier} FAILED after ${attempt} attempt(s): ${e.message} ` +
          `| Status: ${(e as AxiosError)?.response?.status ?? 'N/A'} ` +
          `| Response: ${JSON.stringify((e as AxiosError)?.response?.data ?? {}).slice(0, 200)}`,
      );
      throw e;
    }
  }

  // Network errors and 5xx are retryable; 4xx (bad API key etc.) are not
  private isRetryableError(e: any): boolean {
    if (!e.response) return true; // network error
    const status = e.response?.status ?? 0;
    return status >= 500;
  }

  // ── Bulk book ─────────────────────────────────────────────────────────────
  async bulkBook(pageId: number, orderIds: number[], courier: CourierName) {
    const results: any[] = [];
    let success = 0,
      failed = 0;

    for (const orderId of orderIds) {
      try {
        const order: any = await this.prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!order || order.pageIdRef !== pageId) {
          failed++;
          results.push({ orderId, success: false, error: 'Not found' });
          continue;
        }

        const subtotal = (order.items || []).reduce(
          (s: number, i: any) => s + i.unitPrice * i.qty,
          0,
        );
        const shipment = await this.bookShipment(pageId, {
          orderId,
          pageId,
          courier,
          recipientName: order.customerName || 'Customer',
          recipientPhone: order.phone || '',
          recipientAddress: order.address || '',
          codAmount: subtotal,
        });
        results.push({
          orderId,
          success: true,
          trackingId: shipment.trackingId,
        });
        success++;
      } catch (e: any) {
        results.push({ orderId, success: false, error: e.message });
        failed++;
      }
    }
    return { success, failed, results };
  }

  async trackShipment(pageId: number, orderId: number) {
    const s = await this.prisma.courierShipment.findUnique({
      where: { orderId },
    });
    if (!s || s.pageId !== pageId)
      throw new NotFoundException('Shipment not found');
    return s;
  }

  async listShipments(pageId: number, status?: string) {
    const where: any = { pageId };
    if (status) where.status = status;
    return this.prisma.courierShipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        order: {
          select: {
            id: true,
            customerName: true,
            phone: true,
            address: true,
            status: true,
          },
        },
      },
    });
  }

  async cancelShipment(pageId: number, orderId: number) {
    const s = await this.prisma.courierShipment.findUnique({
      where: { orderId },
    });
    if (!s || s.pageId !== pageId)
      throw new NotFoundException('Shipment not found');
    return this.prisma.courierShipment.update({
      where: { orderId },
      data: { status: 'cancelled' },
    });
  }

  async upsertManualShipment(
    pageId: number,
    orderId: number,
    input: ManualShipmentInput,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.pageIdRef !== pageId)
      throw new NotFoundException('Order not found');

    const existing = await this.prisma.courierShipment.findUnique({
      where: { orderId },
    });
    const subtotal = (order.items || []).reduce(
      (s: number, i: any) => s + i.unitPrice * i.qty,
      0,
    );
    const courierName = this.isCourierName(input?.courierName)
      ? input.courierName
      : (existing?.courierName as CourierName | undefined) || 'manual';
    const bookedAt =
      input?.bookedAt === null
        ? null
        : input?.bookedAt
          ? new Date(input.bookedAt)
          : existing?.bookedAt || new Date();

    const data = {
      pageId,
      courierName,
      trackingId: input?.trackingId?.trim() || null,
      trackingUrl: input?.trackingUrl?.trim() || null,
      status: existing?.status || 'booked',
      codAmount:
        input?.codAmount !== undefined ? Number(input.codAmount) || 0 : existing?.codAmount || subtotal,
      weight:
        input?.weight !== undefined ? Number(input.weight) || 0.5 : existing?.weight || 0.5,
      courierFee:
        input?.courierFee !== undefined && input?.courierFee !== null
          ? Number(input.courierFee) || 0
          : existing?.courierFee ?? null,
      bookedAt,
    };

    return existing
      ? this.prisma.courierShipment.update({ where: { orderId }, data })
      : this.prisma.courierShipment.create({
          data: {
            ...data,
            orderId,
            rawResponse: null,
          },
        });
  }

  async getSettings(pageId: number): Promise<string | null> {
    const file = this.settingsFile(pageId);
    try {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf8');
    } catch (e: any) {
      this.logger.error(
        `[Courier] Failed to read settings for page=${pageId}: ${e.message}`,
      );
      return null;
    }
  }

  async saveSettings(pageId: number, settings: CourierSettings) {
    const next = this.normalizeSettings(settings);
    const file = this.settingsFile(pageId);
    try {
      fs.mkdirSync(this.settingsDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
      return next;
    } catch (e: any) {
      this.logger.error(
        `[Courier] Failed to save settings for page=${pageId}: ${e.message}`,
      );
      throw new BadRequestException('Failed to save courier settings');
    }
  }

  parseSettings(raw: string | null): CourierSettings {
    try {
      return this.normalizeSettings(JSON.parse(raw || '{}'));
    } catch {
      return this.defaultSettings();
    }
  }

  private settingsFile(pageId: number) {
    return path.join(this.settingsDir, `page-${pageId}.json`);
  }

  private defaultSettings(): CourierSettings {
    return {
      defaultCourier: 'manual',
      autoBookOnConfirm: false,
      pathao: { apiKey: '', secretKey: '', storeId: '' },
      steadfast: { apiKey: '', secretKey: '' },
      redx: { apiKey: '' },
      paperfly: { apiKey: '', apiPassword: '' },
    };
  }

  private normalizeSettings(input: any): CourierSettings {
    const defaults = this.defaultSettings();
    const defaultCourier = this.isCourierName(input?.defaultCourier)
      ? input.defaultCourier
      : defaults.defaultCourier;

    return {
      defaultCourier,
      autoBookOnConfirm: Boolean(input?.autoBookOnConfirm),
      pathao: {
        apiKey: String(input?.pathao?.apiKey || ''),
        secretKey: String(input?.pathao?.secretKey || ''),
        storeId: String(input?.pathao?.storeId || ''),
      },
      steadfast: {
        apiKey: String(input?.steadfast?.apiKey || ''),
        secretKey: String(input?.steadfast?.secretKey || ''),
      },
      redx: {
        apiKey: String(input?.redx?.apiKey || ''),
      },
      paperfly: {
        apiKey: String(input?.paperfly?.apiKey || ''),
        apiPassword: String(input?.paperfly?.apiPassword || ''),
      },
    };
  }

  private isCourierName(value: unknown): value is CourierName {
    return (
      value === 'pathao' ||
      value === 'steadfast' ||
      value === 'redx' ||
      value === 'paperfly' ||
      value === 'manual'
    );
  }

  // ── Courier API adapters ──────────────────────────────────────────────────
  private async callCourierApi(
    courier: CourierName,
    settings: CourierSettings,
    input: BookingInput,
  ): Promise<{
    trackingId: string | null;
    trackingUrl: string | null;
    raw: any;
  }> {
    switch (courier) {
      case 'pathao':
        return this.bookPathao(settings.pathao, input);
      case 'steadfast':
        return this.bookSteadfast(settings.steadfast, input);
      case 'redx':
        return this.bookRedx(settings.redx, input);
      case 'paperfly':
        return this.bookPaperfly(settings.paperfly, input);
      default:
        throw new BadRequestException(`Unknown courier: ${courier}`);
    }
  }

  private async bookPathao(
    cfg: CourierSettings['pathao'],
    input: BookingInput,
  ) {
    if (!cfg?.apiKey)
      throw new BadRequestException('Pathao API key not configured');
    const tokenRes = await axios.post(
      'https://api-hermes.pathao.com/aladdin/api/v1/issue-token',
      {
        client_id: cfg.apiKey,
        client_secret: cfg.secretKey,
        grant_type: 'password',
      },
      { timeout: COURIER_TIMEOUT_MS },
    );
    const token = tokenRes.data?.access_token;
    if (!token) throw new Error('Pathao token failed');

    const res = await axios.post(
      'https://api-hermes.pathao.com/aladdin/api/v1/orders',
      {
        store_id: cfg.storeId || '',
        merchant_order_id: String(input.orderId),
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        recipient_address: input.recipientAddress,
        recipient_city: 1,
        recipient_zone: 1,
        delivery_type: 48,
        item_type: 2,
        special_instruction: input.note || '',
        item_quantity: 1,
        item_weight: input.weight ?? 0.5,
        amount_to_collect: input.codAmount,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: COURIER_TIMEOUT_MS,
      },
    );
    return {
      trackingId: res.data?.data?.consignment_id || null,
      trackingUrl: res.data?.data?.consignment_id
        ? `https://pathao.com/t/${res.data.data.consignment_id}`
        : null,
      raw: res.data,
    };
  }

  private async bookSteadfast(
    cfg: CourierSettings['steadfast'],
    input: BookingInput,
  ) {
    if (!cfg?.apiKey)
      throw new BadRequestException('Steadfast API key not configured');
    const res = await axios.post(
      'https://portal.steadfast.com.bd/api/v1/create_order',
      {
        invoice: String(input.orderId),
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        recipient_address: input.recipientAddress,
        cod_amount: input.codAmount,
        note: input.note || '',
      },
      {
        headers: { 'Api-Key': cfg.apiKey, 'Secret-Key': cfg.secretKey },
        timeout: COURIER_TIMEOUT_MS,
      },
    );
    return {
      trackingId: res.data?.consignment?.tracking_code || null,
      trackingUrl: res.data?.consignment?.tracking_code
        ? `https://steadfast.com.bd/t/${res.data.consignment.tracking_code}`
        : null,
      raw: res.data,
    };
  }

  private async bookRedx(cfg: CourierSettings['redx'], input: BookingInput) {
    if (!cfg?.apiKey)
      throw new BadRequestException('RedX API key not configured');
    const res = await axios.post(
      'https://openapi.redx.com.bd/v1.0.0-beta/parcel',
      {
        customer_name: input.recipientName,
        customer_phone: input.recipientPhone,
        delivery_area: input.recipientAddress,
        delivery_area_id: 1,
        merchant_invoice_id: String(input.orderId),
        cash_collection_amount: input.codAmount,
        parcel_weight: (input.weight ?? 0.5) * 1000,
      },
      {
        headers: { 'API-ACCESS-TOKEN': `Bearer ${cfg.apiKey}` },
        timeout: COURIER_TIMEOUT_MS,
      },
    );
    return {
      trackingId: res.data?.tracking_id || null,
      trackingUrl: null,
      raw: res.data,
    };
  }

  private async bookPaperfly(
    cfg: CourierSettings['paperfly'],
    input: BookingInput,
  ) {
    if (!cfg?.apiKey)
      throw new BadRequestException('Paperfly API key not configured');
    const auth = Buffer.from(`${cfg.apiKey}:${cfg.apiPassword}`).toString(
      'base64',
    );
    const res = await axios.post(
      'https://merchant.paperfly.com.bd/api/merchant/order/create/',
      [
        {
          merchant_order_id: String(input.orderId),
          customer_name: input.recipientName,
          customer_mobile: input.recipientPhone,
          shipping_address: input.recipientAddress,
          cod_amount: input.codAmount,
          order_weight: (input.weight ?? 0.5) * 1000,
          package_description: `Order #${input.orderId}`,
        },
      ],
      {
        headers: { Authorization: `Basic ${auth}` },
        timeout: COURIER_TIMEOUT_MS,
      },
    );
    return {
      trackingId: res.data?.[0]?.tracking_id || null,
      trackingUrl: null,
      raw: res.data,
    };
  }

  // ── V10/V17: Get courier tutorial videos (set by admin) ────────────────────
  getTutorials(): Record<string, string> {
    try {
      const fs = require('fs');
      const path = require('path');
      // V17: prefer unified tutorials.json, fall back to old courier-tutorials.json
      const unified = path.join(process.cwd(), 'storage', 'tutorials.json');
      if (fs.existsSync(unified)) {
        const data = JSON.parse(fs.readFileSync(unified, 'utf8'));
        return (data.courier as Record<string, string>) || {};
      }
      const legacy = path.join(
        process.cwd(),
        'storage',
        'courier-tutorials.json',
      );
      if (!fs.existsSync(legacy)) return {};
      return JSON.parse(fs.readFileSync(legacy, 'utf8'));
    } catch {
      return {};
    }
  }

  // ── V17: Get full tutorials config (for client use) ────────────────────────
  getFullTutorials(): Record<string, any> {
    try {
      const fs = require('fs');
      const path = require('path');
      const unified = path.join(process.cwd(), 'storage', 'tutorials.json');
      if (fs.existsSync(unified))
        return JSON.parse(fs.readFileSync(unified, 'utf8'));
      const courier = this.getTutorials();
      return { courier, facebookAccessToken: '', generalOnboarding: '' };
    } catch {
      return { courier: {}, facebookAccessToken: '', generalOnboarding: '' };
    }
  }
}
