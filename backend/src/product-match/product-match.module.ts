import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { ProductMatchService } from './product-match.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  providers: [ProductMatchService],
  exports: [ProductMatchService],
})
export class ProductMatchModule {}
