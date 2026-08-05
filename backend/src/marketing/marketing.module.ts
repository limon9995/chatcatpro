import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MarketingController } from './marketing.controller';
import { MarketingSettingsService } from './marketing-settings.service';
import { MarketingAuditLogService } from './marketing-audit-log.service';

// V30: AI Marketing & Sales Automation — Phase 0 foundation. Later phases
// (leads, campaigns, outreach, follow-ups, sales pipeline, analytics) add
// their services/controllers here rather than starting a new module.
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MarketingController],
  providers: [MarketingSettingsService, MarketingAuditLogService],
  exports: [MarketingSettingsService, MarketingAuditLogService],
})
export class MarketingModule {}
