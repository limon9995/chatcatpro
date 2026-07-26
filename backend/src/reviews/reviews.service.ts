import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: resolve an order by its editToken and list distinct products still reviewable. */
  async getByToken(token: string) {
    if (!token) throw new NotFoundException('Invalid link');
    const order = await this.prisma.order.findUnique({
      where: { editToken: token },
      include: { items: true, reviews: true },
    });
    if (!order) throw new NotFoundException('Invalid or expired link');

    const reviewedProductIds = new Set(order.reviews.map((r) => r.productId));
    const seen = new Set<number>();
    const products: { productId: number; name: string; alreadyReviewed: boolean }[] = [];
    for (const item of order.items) {
      if (!item.productId || seen.has(item.productId)) continue;
      seen.add(item.productId);
      products.push({
        productId: item.productId,
        name: item.productName || item.productCode,
        alreadyReviewed: reviewedProductIds.has(item.productId),
      });
    }
    return { orderId: order.id, products };
  }

  /** Public: submit a review — re-validates the token/order/product relationship server-side. */
  async submit(body: {
    token: string;
    productId: number;
    rating: number;
    comment?: string;
    customerName?: string;
  }) {
    const token = String(body.token || '');
    const productId = Number(body.productId);
    const rating = Math.round(Number(body.rating));
    if (!token) throw new BadRequestException('Invalid link');
    if (!productId) throw new BadRequestException('Product required');
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      throw new BadRequestException('Rating must be 1-5');

    const order = await this.prisma.order.findUnique({
      where: { editToken: token },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Invalid or expired link');
    const belongs = order.items.some((i) => i.productId === productId);
    if (!belongs)
      throw new BadRequestException('This item is not part of your order');

    try {
      return await this.prisma.review.create({
        data: {
          pageId: order.pageIdRef,
          productId,
          orderId: order.id,
          customerName: (body.customerName || order.customerName || '').trim() || null,
          rating,
          comment: (body.comment || '').trim() || null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new BadRequestException('আপনি এই item-টা আগেই review করেছেন');
      throw e;
    }
  }

  /** Public: published reviews + average rating for a product, used by the catalog product page. */
  async listForProduct(pageId: number, code: string) {
    const product = await this.prisma.product.findFirst({
      where: { pageId, code: code.toUpperCase() },
      select: { id: true },
    });
    if (!product) return { avgRating: 0, count: 0, reviews: [] };

    const reviews = await this.prisma.review.findMany({
      where: { pageId, productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, customerName: true, rating: true, comment: true, createdAt: true },
    });
    const count = reviews.length;
    const avgRating = count
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
      : 0;
    return { avgRating, count, reviews };
  }

  /** Merchant: all reviews for a page, with product name. */
  async listForMerchant(pageId: number) {
    return this.prisma.review.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { product: { select: { name: true, code: true } } },
    });
  }

  /** Merchant: delete an inappropriate review. */
  async deleteReview(pageId: number, id: number) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review || review.pageId !== pageId)
      throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id } });
    return { success: true };
  }
}
