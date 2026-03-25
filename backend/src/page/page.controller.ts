import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PageService } from './page.service';

@SkipThrottle()
@Controller('page')
@UseGuards(AuthGuard)
export class PageController {
  constructor(
    private readonly pageService: PageService,
    private readonly authService: AuthService,
  ) {}

  private pid(req: any, id: string): number {
    const pageId = Number(id);
    this.authService.ensurePageAccess(req.user || req.authUser, pageId);
    return pageId;
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.pageService.getById(this.pid(req, id));
  }

  @Patch(':id')
  updateOne(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.pageService.updateById(this.pid(req, id), body);
  }

  @Get(':id/business-settings')
  getBusinessSettings(@Param('id') id: string, @Req() req: any) {
    return this.pageService.getBusinessSettings(this.pid(req, id));
  }

  @Patch(':id/business-settings')
  updateBusinessSettings(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.pageService.updateBusinessSettings(this.pid(req, id), body);
  }
}
