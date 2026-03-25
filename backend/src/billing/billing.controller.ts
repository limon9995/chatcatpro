import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingService } from './billing.service';

@SkipThrottle()
@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ── Client routes ─────────────────────────────────────────────────────────
  @Get('status')
  getStatus(@Req() req: any) {
    return this.billing.getStatus(req.authUser.id);
  }

  @Get('plans')
  getPlans() {
    return this.billing.getPlans();
  }

  @Get('payments')
  getPayments(@Req() req: any) {
    return this.billing.getPayments(req.authUser.id);
  }

  @Post('payments/submit')
  submitPayment(@Req() req: any, @Body() body: any) {
    return this.billing.submitPayment(req.authUser.id, body);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────
  @Get('admin/subscriptions')
  @UseGuards(RolesGuard)
  @Roles('admin')
  adminList(@Query('status') status: string) {
    return this.billing.adminListSubscriptions(status ? { status } : undefined);
  }

  @Get('admin/pending-payments')
  @UseGuards(RolesGuard)
  @Roles('admin')
  pendingPayments() {
    return this.billing.adminListPendingPayments();
  }

  @Post('admin/payments/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles('admin')
  confirmPayment(
    @Param('id') id: string,
    @Body('planName') planName: string,
    @Req() req: any,
  ) {
    return this.billing.adminConfirmPayment(id, req.authUser.id, planName);
  }

  @Patch('admin/users/:userId/subscription')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setSubscription(@Param('userId') userId: string, @Body() body: any) {
    return this.billing.adminSetSubscription(userId, body);
  }
}
