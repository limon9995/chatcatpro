import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ResellerService } from './reseller.service';

// Platform-superadmin management of resellers. Verified against
// admin.controller.ts: the live admin dashboard authenticates every /admin/*
// route via AuthGuard + RolesGuard + @Roles('admin') (a normal Bearer-token
// session whose User.role === 'admin') — the separate AdminGuard/ADMIN_KEY
// class exists in this codebase but is not wired to any route the dashboard
// actually calls, so it must NOT be used here or these endpoints would be
// unreachable from the real admin UI. Deliberately a separate tier from
// reseller_owner: a reseller manages their own branding/pricing/clients via
// /reseller/me/*, the platform owner manages resellers themselves here.
@Controller('admin/resellers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminResellerController {
  constructor(private readonly resellerService: ResellerService) {}

  @Get()
  list() {
    return this.resellerService.adminListResellers();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.resellerService.adminUpdateReseller(id, body);
  }

  @Post(':id/settle')
  settle(@Param('id') id: string, @Body() body: any) {
    return this.resellerService.adminSettleReseller(id, body.amountBdt, body.note);
  }

  // ── Self-serve settlement requests (Phase 3) ───────────────────────────────
  @Get('settlements')
  listSettlements(@Query('status') status?: string) {
    return this.resellerService.adminListSettlementRequests(status);
  }

  @Post('settlements/:id/approve')
  approveSettlement(@Param('id') id: string, @Req() req: any) {
    const adminUsername = req.authUser?.username || req.user?.username || 'admin';
    return this.resellerService.adminApproveSettlement(Number(id), adminUsername);
  }

  @Post('settlements/:id/reject')
  rejectSettlement(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.resellerService.adminRejectSettlement(Number(id), reason);
  }
}
