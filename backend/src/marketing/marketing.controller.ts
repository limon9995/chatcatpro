import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MarketingSettingsService } from './marketing-settings.service';
import { MarketingAuditLogService } from './marketing-audit-log.service';

// V30 Phase 0: settings (incl. the kill switch) + audit log only. Every
// route requires an internal-staff role; only admin/marketing_manager may
// change settings — sales/viewer are read-only. See auth.service.ts's
// INTERNAL_STAFF_ROLES for the full role list.
@UseGuards(AuthGuard, RolesGuard)
@Controller('marketing')
export class MarketingController {
  constructor(
    private readonly settings: MarketingSettingsService,
    private readonly auditLog: MarketingAuditLogService,
  ) {}

  @Get('settings')
  @Roles('admin', 'marketing_manager', 'sales', 'viewer')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  @Roles('admin', 'marketing_manager')
  updateSettings(@Req() req: any, @Body() body: any) {
    return this.settings.update(req.authUser.id, body);
  }

  @Get('audit-log')
  @Roles('admin', 'marketing_manager', 'sales', 'viewer')
  listAuditLog(
    @Query('eventType') eventType?: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditLog.list({
      eventType,
      entityType,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
