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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UniversityConfigService } from './university-config.service';
import { UniversityGroupLinksService } from './university-group-links.service';
import type { GroupLinkDto } from './university-group-links.service';
import { UniversityScraperService } from './university-scraper.service';
import { UniversityPosterService } from './university-poster.service';

@UseGuards(AuthGuard)
@Controller('university')
export class UniversityController {
  constructor(
    private readonly config: UniversityConfigService,
    private readonly groups: UniversityGroupLinksService,
    private readonly scraper: UniversityScraperService,
    private readonly poster: UniversityPosterService,
  ) {}

  // ── Config ────────────────────────────────────────────────────────────────

  @Get('config/:pageId')
  getConfig(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.config.getConfig(pageId);
  }

  @Post('config/:pageId')
  upsertConfig(@Param('pageId', ParseIntPipe) pageId: number, @Body() body: any) {
    return this.config.upsertConfig(pageId, body);
  }

  @Patch('config/:pageId/autopost')
  toggleAutoPost(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body('enabled') enabled: boolean,
  ) {
    return this.config.toggleAutoPost(pageId, enabled);
  }

  // ── Notices ───────────────────────────────────────────────────────────────

  @Get('notices/:pageId')
  getNotices(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Query('limit') limit?: string,
  ) {
    return this.config.getRecentNotices(pageId, limit ? parseInt(limit, 10) : 20);
  }

  @Delete('notices/:pageId/:id')
  deleteNotice(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.config.deleteNotice(id, pageId);
  }

  @Post('scrape/:pageId')
  async manualScrape(@Param('pageId', ParseIntPipe) pageId: number) {
    const { newNotices } = await this.scraper.runScrapeForPage(pageId);
    await this.poster.postNewNotices(pageId, newNotices);
    return { newCount: newNotices.length };
  }

  // ── Group Links ───────────────────────────────────────────────────────────

  @Get('groups/:pageId')
  listLinks(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.groups.listLinks(pageId);
  }

  @Post('groups/:pageId')
  createLink(@Param('pageId', ParseIntPipe) pageId: number, @Body() body: GroupLinkDto) {
    return this.groups.createLink(pageId, body);
  }

  @Patch('groups/:pageId/:id')
  updateLink(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<GroupLinkDto>,
  ) {
    return this.groups.updateLink(id, pageId, body);
  }

  @Delete('groups/:pageId/:id')
  deleteLink(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groups.deleteLink(id, pageId);
  }
}
