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
import { AuthService } from '../auth/auth.service';
import { ProductsService } from './products.service';

@SkipThrottle()
@Controller('products')
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly auth: AuthService,
  ) {}

  private pid(req: any, pageId: string | number): number {
    const n = Number(pageId);
    this.auth.ensurePageAccess(req.user || req.authUser, n);
    return n;
  }

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      pageId: number;
      code: string;
      price: number;
      stockQty?: number;
    },
  ) {
    this.auth.ensurePageAccess(req.user || req.authUser, Number(body.pageId));
    return this.products.create(body);
  }

  @Get()
  list(@Req() req: any, @Query('pageId') pageId: string, @Query('q') q?: string) {
    return this.products.listByPage(this.pid(req, pageId), q);
  }

  @Get(':code')
  get(@Req() req: any, @Param('code') code: string, @Query('pageId') pageId: string) {
    return this.products.findByCode(this.pid(req, pageId), code);
  }

  @Patch(':code')
  update(
    @Req() req: any,
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { stockQty?: number; price?: number },
  ) {
    return this.products.updateOne(this.pid(req, pageId), code, body);
  }

  @Patch(':code/stock')
  stock(
    @Req() req: any,
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { delta: number },
  ) {
    return this.products.updateStock(this.pid(req, pageId), code, body.delta);
  }

  @Patch(':code/price')
  price(
    @Req() req: any,
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { price: number },
  ) {
    return this.products.updatePrice(this.pid(req, pageId), code, body.price);
  }
}
