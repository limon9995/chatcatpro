import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { MarketingController } from './marketing.controller';
import { MarketingLeadController } from './marketing-lead.controller';
import { MarketingSettingsService } from './marketing-settings.service';
import { MarketingAuditLogService } from './marketing-audit-log.service';
import { MarketingScoringService } from './marketing-scoring.service';
import { MarketingLeadService } from './marketing-lead.service';
import { MarketingAiService } from './marketing-ai.service';

// V30: AI Marketing & Sales Automation. Phase 0 = settings/kill-switch/audit
// log. Phase 1 = leads + scoring. Phase 2 = AI business-research agent.
// Later phases (campaigns, outreach, follow-ups, sales pipeline, analytics)
// add their services/controllers here rather than starting a new module.
@Module({
  imports: [PrismaModule, AuthModule, CommonModule],
  controllers: [MarketingController, MarketingLeadController],
  providers: [
    MarketingSettingsService,
    MarketingAuditLogService,
    MarketingScoringService,
    MarketingLeadService,
    MarketingAiService,
  ],
  exports: [
    MarketingSettingsService,
    MarketingAuditLogService,
    MarketingLeadService,
  ],
})
export class MarketingModule {}
