import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IncomingSmsDto } from './dto/incoming-sms.dto';
import { SmsGatewayService } from './sms-gateway.service';

@Controller('sms-gateway')
export class SmsGatewayController {
  constructor(private readonly svc: SmsGatewayService) {}

  // ── Android SMS forwarder webhook — no auth, secured by pageToken ─────────
  @SkipThrottle()
  @Post('incoming')
  @HttpCode(200)
  async incoming(
    @Query('pageToken') pageToken: string,
    @Body() dto: IncomingSmsDto,
  ) {
    if (!pageToken) throw new UnauthorizedException('pageToken required');
    // Admin token path (for chatcat billing verification)
    if (this.svc.isAdminToken(pageToken)) {
      await this.svc.handleAdminIncoming(dto.message, dto.from);
      return { ok: true };
    }
    // Merchant page token path
    const pageId = await this.svc.verifyPageToken(pageToken);
    if (!pageId) throw new UnauthorizedException('Invalid or disabled token');
    await this.svc.handleIncoming(pageId, dto.message, dto.from);
    return { ok: true };
  }

  // ── Client routes (authenticated) ─────────────────────────────────────────
  @UseGuards(AuthGuard)
  @SkipThrottle()
  @Get('token')
  async getToken(@Req() req: any) {
    const pageId = Number(req.query.pageId ?? req.authUser?.pageIds?.[0]);
    const token = await this.svc.getOrCreateToken(pageId);
    return { token };
  }

  @UseGuards(AuthGuard)
  @SkipThrottle()
  @Delete('token')
  async regenerateToken(@Req() req: any, @Query('pageId') pageId: string) {
    const token = await this.svc.regenerateToken(Number(pageId));
    return { token };
  }

  @UseGuards(AuthGuard)
  @SkipThrottle()
  @Patch('enabled')
  async setEnabled(
    @Req() req: any,
    @Body() body: { pageId: number; enabled: boolean },
  ) {
    await this.svc.setEnabled(body.pageId, body.enabled);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @SkipThrottle()
  @Get('status')
  async getStatus(@Query('pageId') pageId: string) {
    return this.svc.getStatus(Number(pageId));
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @SkipThrottle()
  @Get('recent')
  async getRecent(@Query('pageId') pageId: string) {
    return this.svc.getRecent(Number(pageId));
  }

  // ── Admin billing SMS gateway setup ───────────────────────────────────────
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @SkipThrottle()
  @Post('admin-token/regenerate')
  async regenerateAdminToken() {
    const { randomUUID } = await import('crypto');
    const token = randomUUID();
    await this.svc.setAdminToken(token);
    return { token };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @SkipThrottle()
  @Get('admin-status')
  async getAdminStatus() {
    return this.svc.getAdminStatus();
  }
}
