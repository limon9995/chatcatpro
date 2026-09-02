import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ResellerLookupModule } from './reseller-lookup.module';
import { ResellerService } from './reseller.service';
import { ResellerGuard } from './reseller.guard';
import { ResellerController } from './reseller.controller';
import { AdminResellerController } from './admin-reseller.controller';

@Module({
  imports: [PrismaModule, AuthModule, ResellerLookupModule],
  providers: [ResellerService, ResellerGuard],
  controllers: [ResellerController, AdminResellerController],
  exports: [ResellerService],
})
export class ResellerModule {}
