import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductMatchService } from './product-match.service';

@Module({
  imports: [PrismaModule],
  providers: [ProductMatchService],
  exports: [ProductMatchService],
})
export class ProductMatchModule {}
