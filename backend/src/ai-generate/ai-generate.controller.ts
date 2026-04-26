import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AiGenerateService } from './ai-generate.service';

@SkipThrottle({ global: true })
@Controller('ai-generate')
@UseGuards(AuthGuard)
export class AiGenerateController {
  constructor(private readonly svc: AiGenerateService) {}

  @Post('product-description')
  async productDescription(@Body() b: any) {
    const pageId = Number(b?.pageId);
    if (!pageId) return { text: null };
    const text = await this.svc.generateProductDescription(pageId, {
      name: b?.name ?? '',
      category: b?.category ?? null,
      color: b?.color ?? null,
      keywords: b?.keywords ?? null,
    });
    return { text };
  }

  @Post('broadcast')
  async broadcastMessage(@Body() b: any) {
    const pageId = Number(b?.pageId);
    if (!pageId) return { text: null };
    const text = await this.svc.generateBroadcastMessage(pageId, {
      title: b?.title ?? '',
      targetType: b?.targetType ?? 'all',
      businessName: b?.businessName ?? null,
    });
    return { text };
  }
}
