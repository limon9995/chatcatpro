import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ResellerLookupService } from './reseller-lookup.service';

@Module({
  imports: [PrismaModule],
  providers: [ResellerLookupService],
  exports: [ResellerLookupService],
})
export class ResellerLookupModule {}
