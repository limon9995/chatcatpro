import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PublicOrderService } from './public-order.service';

function actionPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);padding:40px;max-width:400px;text-align:center}
.icon{font-size:48px;margin-bottom:12px}
h1{font-size:18px;color:${ok ? '#16a34a' : '#dc2626'};margin:0 0 8px}
p{color:#475569;font-size:14px}
</style></head>
<body><div class="card"><div class="icon">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

@Controller('public/order')
export class PublicOrderController {
  constructor(private readonly svc: PublicOrderService) {}

  // Order matters: this literal 2-segment path is registered before the
  // single-segment ':token' route below, so it can't be shadowed by it.
  @Get('action/reject/:token')
  async rejectOrder(@Param('token') token: string, @Res() res: Response) {
    try {
      const { orderId, businessName } = await this.svc.rejectByToken(token);
      res
        .status(200)
        .send(
          actionPage(
            'Order Rejected',
            `Order #${orderId}${businessName ? ` (${businessName})` : ''} বাতিল করা হয়েছে।`,
            true,
          ),
        );
    } catch (e: any) {
      res
        .status(400)
        .send(
          actionPage(
            'Link Invalid বা Expired',
            e?.message === 'Order not found'
              ? 'এই order টি খুঁজে পাওয়া যায়নি।'
              : 'এই লিংকটি আর কাজ করছে না — মেয়াদ শেষ হয়ে গেছে অথবা ইতিমধ্যে ব্যবহার হয়েছে।',
            false,
          ),
        );
    }
  }

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
