import { Module } from '@nestjs/common';
import { ProductNameMatchService } from './product-name-match.service';

@Module({
  providers: [ProductNameMatchService],
  exports: [ProductNameMatchService],
})
export class ProductNameMatchModule {}
