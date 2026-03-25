import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from './phone.util';

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Upsert customer on every order ───────────────────────────────────────
  async upsertFromOrder(
    pageId: number,
    order: {
      customerPsid: string;
      customerName?: string | null;
      phone?: string | null;
      address?: string | null;
      totalAmount: number;
    },
  ) {
    // FIX 5: normalize phone before saving/matching
    const normalizedPhone = normalizePhone(order.phone);

    try {
      const existing = await this.prisma.customer.findUnique({
        where: { pageId_psid: { pageId, psid: order.customerPsid } },
      });

      if (!existing) {
        // FIX 5: check if another record exists with same normalized phone
        // (customer may have messaged from different PSID after phone lookup)
        if (normalizedPhone) {
          const byPhone = await this.prisma.customer.findFirst({
            where: { pageId, phone: normalizedPhone },
          });
          if (byPhone) {
            // Merge: update existing phone-matched record with this psid's order
            await this.prisma.customer.update({
              where: { id: byPhone.id },
              data: {
                name: order.customerName ?? byPhone.name,
                address: order.address ?? byPhone.address,
                totalOrders: { increment: 1 },
                totalSpent: { increment: order.totalAmount },
                lastOrderAt: new Date(),
              },
            });
            return;
          }
        }

        await this.prisma.customer.create({
          data: {
            pageId,
            psid: order.customerPsid,
            name: order.customerName ?? null,
            phone: normalizedPhone ?? null,
            address: order.address ?? null,
            totalOrders: 1,
            totalSpent: order.totalAmount,
            firstOrderAt: new Date(),
            lastOrderAt: new Date(),
          },
        });
      } else {
        await this.prisma.customer.update({
          where: { pageId_psid: { pageId, psid: order.customerPsid } },
          data: {
            name: order.customerName ?? existing.name,
            // FIX 5: only update phone if new one normalizes to something valid
            phone: normalizedPhone ?? existing.phone,
            address: order.address ?? existing.address,
            totalOrders: { increment: 1 },
            totalSpent: { increment: order.totalAmount },
            lastOrderAt: new Date(),
          },
        });
      }
    } catch (e: any) {
      this.logger.error(`[CRM] upsertFromOrder failed: ${e.message}`);
    }
  }

  // ── List customers ────────────────────────────────────────────────────────
  async listCustomers(
    pageId: number,
    opts?: {
      search?: string;
      tag?: string;
      isBlocked?: boolean;
      orderBy?: 'recent' | 'spent' | 'orders';
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { pageId };
    if (opts?.isBlocked !== undefined) where.isBlocked = opts.isBlocked;
    if (opts?.tag) where.tags = { contains: `"${opts.tag}"` };
    if (opts?.search) {
      where.OR = [
        { name: { contains: opts.search } },
        { phone: { contains: opts.search } },
        { psid: { contains: opts.search } },
      ];
    }
    const orderBy =
      opts?.orderBy === 'spent'
        ? { totalSpent: 'desc' as const }
        : opts?.orderBy === 'orders'
          ? { totalOrders: 'desc' as const }
          : { lastOrderAt: 'desc' as const };

    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy,
        take: opts?.limit ?? 50,
        skip: opts?.offset ?? 0,
      }),
    ]);
    return {
      total,
      items: items.map((c) => ({ ...c, tags: this.parseTags(c.tags) })),
    };
  }

  // ── Get single customer + order history ───────────────────────────────────
  async getCustomer(pageId: number, customerId: number) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!c || c.pageId !== pageId)
      throw new NotFoundException('Customer not found');
    const orders = await this.prisma.order.findMany({
      where: { pageIdRef: pageId, customerPsid: c.psid },
      include: { items: true, courierShipment: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { ...c, tags: this.parseTags(c.tags), orders };
  }

  // ── Update customer ───────────────────────────────────────────────────────
  async updateCustomer(
    pageId: number,
    customerId: number,
    body: {
      note?: string;
      tags?: string[];
      isBlocked?: boolean;
      name?: string;
      phone?: string;
    },
  ) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!c || c.pageId !== pageId)
      throw new NotFoundException('Customer not found');

    const data: any = {};
    if (body.note !== undefined) data.note = body.note;
    if (body.isBlocked !== undefined) data.isBlocked = body.isBlocked;
    if (body.name !== undefined) data.name = body.name;
    // FIX 5: normalize phone on manual update too
    if (body.phone !== undefined)
      data.phone = normalizePhone(body.phone) ?? body.phone;
    if (body.tags !== undefined) data.tags = JSON.stringify(body.tags);

    return this.prisma.customer.update({ where: { id: customerId }, data });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  async getStats(pageId: number) {
    const [total, blocked, topSpenders] = await Promise.all([
      this.prisma.customer.count({ where: { pageId } }),
      this.prisma.customer.count({ where: { pageId, isBlocked: true } }),
      this.prisma.customer.findMany({
        where: { pageId },
        orderBy: { totalSpent: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          psid: true,
          totalOrders: true,
          totalSpent: true,
        },
      }),
    ]);
    return { total, blocked, topSpenders };
  }

  async getAllTags(pageId: number): Promise<string[]> {
    const customers = await this.prisma.customer.findMany({
      where: { pageId },
      select: { tags: true },
    });
    const tagSet = new Set<string>();
    for (const c of customers) {
      for (const t of this.parseTags(c.tags)) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }

  // ── FIX 4: Check if customer is blocked ───────────────────────────────────
  async isBlocked(pageId: number, psid: string): Promise<boolean> {
    const c = await this.prisma.customer.findUnique({
      where: { pageId_psid: { pageId, psid } },
      select: { isBlocked: true },
    });
    return c?.isBlocked ?? false;
  }

  private parseTags(raw: string): string[] {
    try {
      return JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }
}
