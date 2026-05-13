import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { WaWebhookService } from './wa-webhook.service';
import { PrismaService } from '../prisma/prisma.service';

@SkipThrottle()
@Controller('wa-webhook')
export class WaWebhookController {
  private readonly logger = new Logger(WaWebhookController.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    private readonly waWebhookService: WaWebhookService,
    private readonly prisma: PrismaService,
  ) {}

  // ── GET: WhatsApp webhook verification ────────────────────────────────────
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode !== 'subscribe' || !token) return 'Verification failed';

    // Match against any page's waVerifyToken
    const page = await this.prisma.page.findFirst({
      where: { waVerifyToken: token, waEnabled: true, isActive: true },
    });

    if (page) {
      this.logger.log(`[WA Webhook] Verified page id=${page.id}`);
      return challenge;
    }

    this.logger.warn(`[WA Webhook] Verification failed — unknown token`);
    return 'Verification failed';
  }

  // ── POST: Receive WhatsApp webhook events ─────────────────────────────────
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-hub-signature-256') sig: string,
  ) {
    // HMAC signature verification (same FB App Secret as Facebook webhook)
    const secret = process.env.FB_WEBHOOK_SECRET?.trim();

    if (secret) {
      const rawBody = (req as any).rawBody ?? req.body;
      const payload = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(JSON.stringify(rawBody));

      if (!sig) {
        this.logger.warn('[WA Webhook] Missing X-Hub-Signature-256 — rejecting');
        return 'EVENT_RECEIVED';
      }

      const expected =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const sigValid = crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expected),
      );

      if (!sigValid) {
        this.logger.warn('[WA Webhook] Invalid signature — ignoring');
        return 'EVENT_RECEIVED';
      }
    } else {
      this.logger.warn(
        '[WA Webhook] FB_WEBHOOK_SECRET not set — HMAC verification SKIPPED',
      );
    }

    // Parse raw body if needed
    let parsedBody = body;
    if (Buffer.isBuffer(body)) {
      try {
        parsedBody = JSON.parse(body.toString('utf8'));
      } catch {
        this.logger.error('[WA Webhook] Failed to parse body');
        return 'EVENT_RECEIVED';
      }
    }

    this.logger.debug(
      `[WA Webhook] Received object=${parsedBody?.object} entries=${parsedBody?.entry?.length ?? 0}`,
    );

    await this.waWebhookService.handle(parsedBody);
    return 'EVENT_RECEIVED';
  }
}
