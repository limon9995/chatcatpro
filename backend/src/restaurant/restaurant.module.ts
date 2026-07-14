import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { WalletModule } from '../wallet/wallet.module';
import { CommonModule } from '../common/common.module';
import { VisionAnalysisModule } from '../vision-analysis/vision-analysis.module';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProductsModule,
    WalletModule,
    CommonModule,
    VisionAnalysisModule,
  ],
  providers: [RestaurantService],
  controllers: [RestaurantController],
})
export class RestaurantModule {}
