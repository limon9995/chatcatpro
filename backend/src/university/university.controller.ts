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
import { UniversityFaqService } from './university-faq.service';
import type { FaqDto } from './university-faq.service';
import { UniversityCrawlerService } from './university-crawler.service';
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
    private readonly faq: UniversityFaqService,
    private readonly crawler: UniversityCrawlerService,
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

  // ── FAQ ───────────────────────────────────────────────────────────────────

  @Get('faqs/:pageId')
  listFaqs(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.faq.listFaqs(pageId);
  }

  @Post('faqs/:pageId')
  createFaq(@Param('pageId', ParseIntPipe) pageId: number, @Body() body: FaqDto) {
    return this.faq.createFaq(pageId, body);
  }

  @Patch('faqs/:pageId/:id')
  updateFaq(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<FaqDto>,
  ) {
    return this.faq.updateFaq(id, pageId, body);
  }

  @Delete('faqs/:pageId/:id')
  deleteFaq(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.faq.deleteFaq(id, pageId);
  }

  // ── Full Site Crawl ───────────────────────────────────────────────────────

  @Post('crawl/:pageId')
  async fullCrawl(@Param('pageId', ParseIntPipe) pageId: number) {
    const { pagesCrawled } = await this.crawler.runFullCrawlForPage(pageId);
    return { pagesCrawled };
  }
}
