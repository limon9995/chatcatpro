import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MarketingLeadService } from './marketing-lead.service';

// V30 Phase 1: manual/CSV lead entry + pipeline. viewer role is read-only;
// admin/marketing_manager/sales can create/edit; delete is restricted
// further (marketing_manager decides to remove bad data, sales shouldn't).
@UseGuards(AuthGuard, RolesGuard)
@Controller('marketing/leads')
export class MarketingLeadController {
  constructor(private readonly leads: MarketingLeadService) {}

  @Get()
  @Roles('admin', 'marketing_manager', 'sales', 'viewer')
  list(
    @Query('pipelineStatus') pipelineStatus?: string,
    @Query('leadTemperature') leadTemperature?: string,
    @Query('campaignId') campaignId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.leads.list({
      pipelineStatus,
      leadTemperature,
      campaignId: campaignId ? Number(campaignId) : undefined,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  @Roles('admin', 'marketing_manager', 'sales', 'viewer')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.leads.get(id);
  }

  @Post()
  @Roles('admin', 'marketing_manager', 'sales')
  create(@Req() req: any, @Body() body: any) {
    return this.leads.create(req.authUser.id, body, Boolean(body?.forceCreate));
  }

  @Post('bulk')
  @Roles('admin', 'marketing_manager')
  bulkCreate(@Req() req: any, @Body() body: any) {
    return this.leads.bulkCreate(req.authUser.id, body?.rows || []);
  }

  @Patch(':id')
  @Roles('admin', 'marketing_manager', 'sales')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.leads.update(req.authUser.id, id, body);
  }

  @Delete(':id')
  @Roles('admin', 'marketing_manager')
  delete(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.leads.delete(req.authUser.id, id);
  }

  @Post(':id/research')
  @Roles('admin', 'marketing_manager', 'sales')
  research(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.leads.research(req.authUser.id, id);
  }
}
