import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ResellerService } from './reseller.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ResellerGuard } from './reseller.guard';

@Controller('reseller')
export class ResellerController {
  constructor(private readonly resellerService: ResellerService) {}

  // Public — resolves a hostname to reseller branding. Used by the dashboard
  // SPA on every load, and internally by AuthService for signup scoping.
  @Get('by-domain')
  byDomain(@Query('host') host: string) {
    return this.resellerService.resolveByDomain(host || '');
  }

  @Get('slug-available')
  slugAvailable(@Query('slug') slug: string) {
    return this.resellerService.slugAvailable(slug || '');
  }

  @Throttle({ auth: { ttl: 60_000, limit: 3 } })
  @Post('signup/send-otp')
  sendSignupOtp(@Body('email') email: string) {
    return this.resellerService.sendSignupOtp(email);
  }

  @Throttle({ auth: { ttl: 3_600_000, limit: 5 } })
  @Post('signup/verify')
  verifySignup(@Body() body: any) {
    return this.resellerService.verifySignupOtp({
      email: body.email,
      code: body.code,
      companyName: body.companyName,
      slug: body.slug,
      password: body.password,
    });
  }

  // ── reseller_owner-scoped routes ────────────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('me')
  me(@Req() req: any) {
    return this.resellerService.me(req.reseller);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Patch('me/branding')
  updateBranding(@Req() req: any, @Body() body: any) {
    return this.resellerService.updateBranding(req.reseller, body);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('me/clients')
  listClients(@Req() req: any) {
    return this.resellerService.listClients(req.reseller);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('me/wholesale-pricing')
  wholesalePricing(@Req() req: any) {
    return this.resellerService.getWholesalePricing(req.reseller);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('me/ledger')
  ledger(@Req() req: any, @Query('limit') limit?: string) {
    return this.resellerService.getLedger(req.reseller, limit ? Number(limit) : undefined);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('clients/pages/:pageId/pricing')
  getClientPagePricing(@Req() req: any, @Param('pageId') pageId: string) {
    return this.resellerService.getClientPagePricing(req.reseller, Number(pageId));
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Patch('clients/pages/:pageId/pricing')
  updateClientPagePricing(
    @Req() req: any,
    @Param('pageId') pageId: string,
    @Body() body: any,
  ) {
    return this.resellerService.updateClientPagePricing(req.reseller, Number(pageId), body);
  }

  // ── Custom domain (Phase 2) ────────────────────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Post('me/custom-domain')
  updateCustomDomain(@Req() req: any, @Body('domain') domain: string) {
    return this.resellerService.updateCustomDomain(req.reseller, domain);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Post('me/custom-domain/activate')
  activateCustomDomain(@Req() req: any) {
    return this.resellerService.activateCustomDomain(req.reseller.id);
  }

  // ── Logo upload (Phase 2) ──────────────────────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Post('me/logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Req() req: any, @UploadedFile() file: any) {
    return this.resellerService.uploadLogo(req.reseller, file);
  }

  // ── Self-serve settlement (Phase 3) ────────────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Post('me/settlement')
  submitSettlement(@Req() req: any, @Body() body: any) {
    return this.resellerService.submitSettlement(req.reseller, body);
  }

  @UseGuards(AuthGuard, RolesGuard, ResellerGuard)
  @Roles('reseller_owner')
  @Get('me/settlement')
  listSettlements(@Req() req: any) {
    return this.resellerService.getSettlementRequests(req.reseller);
  }
}
