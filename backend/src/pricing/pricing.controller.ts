import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PricingService } from './pricing.service';

@SkipThrottle({ global: true, auth: true, chat: true })
@Controller('catalog')
export class PricingController {
  constructor(private readonly svc: PricingService) {}

  /** Public: real-time "how many more orders until Lucky Customer" check, keyed by phone. */
  @Get(':pageId/loyalty-status')
  loyaltyStatus(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Query('phone') phone: string,
  ) {
    return this.svc.getLoyaltyStatus(pageId, phone);
  }

  /** Public: whether Happy Hour is active right now, for the catalog banner. */
  @Get(':pageId/happy-hour-status')
  happyHourStatus(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.svc.getHappyHourStatus(pageId);
  }
}
