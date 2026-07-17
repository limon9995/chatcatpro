import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { WaConnectRequestService } from './wa-connect-request.service';

@SkipThrottle({ global: true, auth: true })
@Controller('whatsapp')
@UseGuards(AuthGuard)
export class WaConnectRequestController {
  constructor(
    private readonly svc: WaConnectRequestService,
    private readonly authService: AuthService,
  ) {}

  // POST /whatsapp/connect-request  → client requests WA automation for one of their pages
  @Post('connect-request')
  submit(@Req() req: any, @Body() body: any) {
    const user = req.user || req.authUser;
    const pageId = Number(body.pageId);
    this.authService.ensurePageAccess(user, pageId);
    return this.svc.submit(
      user.id,
      pageId,
      String(body.phoneNumber || ''),
      body.note ? String(body.note) : undefined,
    );
  }

  // GET /whatsapp/connect-request/my  → client sees their own requests
  @Get('connect-request/my')
  myRequests(@Req() req: any) {
    return this.svc.myRequests(req.authUser.id);
  }
}
