import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';

@SkipThrottle()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query('status') status?: string, @Query('pageId') pageId?: string) {
    return this.ordersService.listOrders(
      pageId ? Number(pageId) : undefined,
      status,
    );
  }

  @Get('summary/stats')
  summary(@Query('pageId') pageId?: string) {
    return this.ordersService.getSummary(pageId ? Number(pageId) : undefined);
  }

  @Get('agent-issues')
  agentIssues(@Query('pageId') pageId?: string) {
    return this.ordersService.getAgentIssues(pageId ? Number(pageId) : undefined);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.ordersService.updateOrderInfo(id, body);
  }

  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.confirmByAgent(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrder(id);
  }

  @Post(':id/issue')
  issue(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.markIssue(id);
  }

  @Post(':id/toggle-bot')
  toggleBot(
    @Param('id', ParseIntPipe) id: number,
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.toggleBotForCustomer(
      id,
      pageId ? Number(pageId) : undefined,
    );
  }

  // For unmatched-message issues (no order id) — toggle by psid directly
  @Post('toggle-bot-psid')
  toggleBotByPsid(
    @Body('pageId') pageId: number,
    @Body('psid') psid: string,
    @Body('mute') mute: boolean,
  ) {
    return this.ordersService.toggleBotByPsid(pageId, psid, mute);
  }

  @Get('payment-proofs')
  paymentProofs(@Query('pageId') pageId?: string) {
    return this.ordersService.getPaymentProofs(
      pageId ? Number(pageId) : undefined,
    );
  }

  @Patch(':id/verify-payment')
  verifyPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'verified' | 'verify_failed',
    @Query('pageId') pageId?: string,
  ) {
    return this.ordersService.verifyPayment(
      id,
      status,
      pageId ? Number(pageId) : undefined,
    );
  }
}
