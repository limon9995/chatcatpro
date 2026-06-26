import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';

const LOCKED_STATUSES = ['SHIPPED', 'DELIVERED', 'CANCELLED'];

@Injectable()
export class PublicOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramNotificationService,
  ) {}

  async getByToken(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { editToken: token },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      status: order.status,
      locked: LOCKED_STATUSES.includes(order.status),
      items: order.items.map((i) => ({
        id: i.id,
        productCode: i.productCode,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
      total: order.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    };
  }

  async updateByToken(
    token: string,
    body: {
      customerName?: string;
      phone?: string;
      address?: string;
      items?: { productCode: string; qty: number; unitPrice: number }[];
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { editToken: token },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (LOCKED_STATUSES.includes(order.status))
      throw new BadRequestException('Order cannot be edited at this stage');

    const changes: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const patch: any = {};
      if (body.customerName && body.customerName !== order.customerName) {
        patch.customerName = body.customerName;
        changes.push(`নাম: "${order.customerName}" → "${body.customerName}"`);
      }
      if (body.phone && body.phone !== order.phone) {
        patch.phone = body.phone;
        changes.push(`ফোন: "${order.phone}" → "${body.phone}"`);
      }
      if (body.address && body.address !== order.address) {
        patch.address = body.address;
        changes.push(`ঠিকানা: "${order.address}" → "${body.address}"`);
      }
      if (Object.keys(patch).length > 0) {
        await tx.order.update({ where: { id: order.id }, data: patch });
      }

      if (body.items && body.items.length > 0) {
        await tx.orderItem.deleteMany({ where: { orderId: order.id } });
        await tx.orderItem.createMany({
          data: body.items.map((i) => ({
            orderId: order.id,
            productCode: i.productCode,
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
        });
        const oldItems = order.items
          .map((i) => `${i.productCode}×${i.qty}`)
          .join(', ');
        const newItems = body.items
          .map((i) => `${i.productCode}×${i.qty}`)
          .join(', ');
        if (oldItems !== newItems)
          changes.push(`পণ্য: [${oldItems}] → [${newItems}]`);
      }
    });

    if (changes.length > 0) {
      this.telegram
        .notify(
          order.pageIdRef,
          `✏️ Order #${order.id} — Customer নিজে edit করেছে:\n${changes.join('\n')}`,
        )
        .catch(() => {});
    }

    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
  }
}
