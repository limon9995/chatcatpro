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
import { WebhookService } from './webhook.service';
import { PrismaService } from '../prisma/prisma.service';

@SkipThrottle() // Facebook can send many events — skip global rate limit
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    private readonly webhookService: WebhookService,
    private readonly prisma: PrismaService,
  ) {}

  // ── GET: Facebook webhook verification ───────────────────────────────────
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode !== 'subscribe' || !token) return 'Verification failed';

    // Check against any page's verifyToken in DB
    const page = await this.prisma.page.findFirst({
      where: { verifyToken: token, isActive: true },
    });
    if (page) {
      this.logger.log(`[Webhook] Verified page=${page.pageId}`);
      return challenge;
    }

    // Fallback: env var
    if (
      !this.isProduction &&
      process.env.DEFAULT_VERIFY_TOKEN &&
      token === process.env.DEFAULT_VERIFY_TOKEN
    ) {
      this.logger.log(`[Webhook] Verified via DEFAULT_VERIFY_TOKEN`);
      return challenge;
    }

    this.logger.warn(`[Webhook] Verification failed — unknown token`);
    return 'Verification failed';
  }

  // ── POST: Receive webhook events ─────────────────────────────────────────
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-hub-signature-256') sig: string,
  ) {
    // ── FIX: Webhook signature verification ─────────────────────────────────
    const secret = process.env.FB_WEBHOOK_SECRET?.trim();

    if (secret) {
      // main.ts routes /webhook through express.raw() so req.rawBody is Buffer
      const rawBody = (req as any).rawBody ?? req.body;
      const payload = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(JSON.stringify(rawBody));

      if (!sig) {
        this.logger.warn(
          '[Webhook] Missing X-Hub-Signature-256 header — rejecting',
        );
        return 'EVENT_RECEIVED'; // return 200 to FB but don't process
      }

      const expected =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const sigValid = crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expected),
      );

      if (!sigValid) {
        this.logger.warn(
          '[Webhook] Invalid signature — possible spoofed request, ignoring',
        );
        return 'EVENT_RECEIVED'; // 200 to avoid FB retries, but don't process
      }
    } else {
      // No secret configured — log warning but continue (dev mode)
      this.logger.warn(
        '[Webhook] FB_WEBHOOK_SECRET not set — signature verification SKIPPED (insecure in production!)',
      );
    }

    // Parse body: if raw buffer was received, parse JSON now
    let parsedBody = body;
    if (Buffer.isBuffer(body)) {
      try {
        parsedBody = JSON.parse(body.toString('utf8'));
      } catch {
        this.logger.error('[Webhook] Failed to parse body');
        return 'EVENT_RECEIVED';
      }
    }

    this.logger.debug(
      `[Webhook] Received object=${parsedBody?.object} entries=${parsedBody?.entry?.length ?? 0}`,
    );
    await this.webhookService.handle(parsedBody);
    return 'EVENT_RECEIVED';
  }
}
