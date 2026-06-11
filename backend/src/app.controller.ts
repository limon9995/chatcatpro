import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { AdminService } from './admin/admin.service';

@SkipThrottle({ global: true, auth: true, chat: true })
@Controller()
export class AppController {
  private readonly startTime = Date.now();
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  @Get('public/pricing')
  getPublicPricing() {
    return this.adminService.getGlobalPricing();
  }

  @Get('health')
  async health() {
    let dbStatus = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      db: dbStatus,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: 'v12',
      ts: new Date().toISOString(),
    };
  }
}
