import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AgentCatalogService } from './agent-catalog.service';

@Controller('agents')
@UseGuards(AuthGuard)
export class AgentCatalogController {
  constructor(private readonly catalog: AgentCatalogService) {}

  @Get()
  list() {
    return this.catalog.listActive();
  }

  @Get('contact')
  contact() {
    return this.catalog.getContact();
  }
}
