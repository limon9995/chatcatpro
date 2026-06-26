import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PublicOrderService } from './public-order.service';

@Controller('public/order')
export class PublicOrderController {
  constructor(private readonly svc: PublicOrderService) {}

  @Get(':token')
  async getOrder(@Param('token') token: string) {
    return this.svc.getByToken(token);
  }

  @Put(':token')
  async updateOrder(
    @Param('token') token: string,
    @Body()
    body: {
      customerName?: string;
      phone?: string;
      address?: string;
      items?: { productCode: string; qty: number; unitPrice: number }[];
    },
  ) {
    return this.svc.updateByToken(token, body);
  }
}
