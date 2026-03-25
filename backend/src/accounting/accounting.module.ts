import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [PrismaModule, AuthModule, BotKnowledgeModule],
  providers: [AccountingService, AnalyticsService],
  controllers: [AccountingController],
  exports: [AccountingService, AnalyticsService],
})
export class AccountingModule {}
