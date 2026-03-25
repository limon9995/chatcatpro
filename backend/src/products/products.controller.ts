import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ProductsService } from './products.service';

@SkipThrottle()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  create(
    @Body()
    body: {
      pageId: number;
      code: string;
      price: number;
      stockQty?: number;
    },
  ) {
    return this.products.create(body);
  }

  @Get()
  list(@Query('pageId') pageId: string, @Query('q') q?: string) {
    return this.products.listByPage(Number(pageId), q);
  }

  @Get(':code')
  get(@Param('code') code: string, @Query('pageId') pageId: string) {
    return this.products.findByCode(Number(pageId), code);
  }

  @Patch(':code')
  update(
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { stockQty?: number; price?: number },
  ) {
    return this.products.updateOne(Number(pageId), code, body);
  }

  @Patch(':code/stock')
  stock(
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { delta: number },
  ) {
    return this.products.updateStock(Number(pageId), code, body.delta);
  }

  @Patch(':code/price')
  price(
    @Param('code') code: string,
    @Query('pageId') pageId: string,
    @Body() body: { price: number },
  ) {
    return this.products.updatePrice(Number(pageId), code, body.price);
  }
}
