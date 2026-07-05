import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AgentRequestService } from './agent-request.service';

@Controller('agent-requests')
@UseGuards(AuthGuard)
export class AgentRequestController {
  constructor(private readonly requests: AgentRequestService) {}

  @Post()
  submit(@Req() req: any, @Body() body: any) {
    return this.requests.submit(
      req.authUser.id,
      String(body.pageUrl || ''),
      String(body.description || ''),
      body.contactInfo ? String(body.contactInfo) : undefined,
    );
  }

  @Get('my')
  mine(@Req() req: any) {
    return this.requests.getMine(req.authUser.id);
  }
}
