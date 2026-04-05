import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from './orders.service';

@SkipThrottle()
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly auth: AuthService,
  ) {}

  private pid(req: any, pageId: string | number | undefined): number | undefined {
    if (pageId === undefined || pageId === null || pageId === '') return undefined;
    const n = Number(pageId);
    this.auth.ensurePageAccess(req.user || req.authUser, n);
    return n;
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: string, @Query('pageId') pageId?: string) {
    return this.ordersService.listOrders(this.pid(req, pageId), status);
  }

  @Get('summary/stats')
  summary(@Req() req: any, @Query('pageId') pageId?: string) {
    return this.ordersService.getSummary(this.pid(req, pageId));
  }

  @Get('agent-issues')
  agentIssues(@Req() req: any, @Query('pageId') pageId?: string) {
    return this.ordersService.getAgentIssues(this.pid(req, pageId));
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId: string | undefined,
    @Body() body: any,
  ) {
    this.pid(req, pageId);
    return this.ordersService.updateOrderInfo(id, body);
  }

  @Post(':id/confirm')
  confirm(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.confirmByAgent(id, this.pid(req, pageId));
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.cancelOrder(id, this.pid(req, pageId));
  }

  @Post(':id/issue')
  issue(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.markIssue(id, this.pid(req, pageId));
  }

  @Post(':id/toggle-bot')
  toggleBot(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.toggleBotForCustomer(id, this.pid(req, pageId));
  }

  // For unmatched-message issues (no order id) — toggle by psid directly
  @Post('toggle-bot-psid')
  toggleBotByPsid(
    @Req() req: any,
    @Body('pageId') pageId: number,
    @Body('psid') psid: string,
    @Body('mute') mute: boolean,
  ) {
    this.pid(req, pageId);
    return this.ordersService.toggleBotByPsid(pageId, psid, mute);
  }

  @Get('payment-proofs')
  paymentProofs(@Req() req: any, @Query('pageId') pageId?: string) {
    return this.ordersService.getPaymentProofs(this.pid(req, pageId));
  }

  @Patch(':id/verify-payment')
  verifyPayment(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'verified' | 'verify_failed',
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.verifyPayment(id, status, this.pid(req, pageId));
  }
}
