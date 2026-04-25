import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpamCheckerService } from './spam-checker.service';

@Module({
  imports: [PrismaModule],
  providers: [SpamCheckerService],
  exports: [SpamCheckerService],
})
export class SpamCheckerModule {}
