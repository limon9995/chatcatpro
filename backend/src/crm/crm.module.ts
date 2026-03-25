import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmService } from './crm.service';
export { CrmService };
@Module({
  imports: [PrismaModule],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
