import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { FacebookService } from '../facebook/facebook.service';
import { PageService } from './page.service';

@SkipThrottle()
@Controller('page')
@UseGuards(AuthGuard)
export class PageController {
  constructor(
    private readonly pageService: PageService,
    private readonly authService: AuthService,
    private readonly facebookService: FacebookService,
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

  // ── Linked pages endpoints ────────────────────────────────────────────────

  /** GET /page/:id/linked-pages — list all pages linked to this master */
  @Get(':id/linked-pages')
  getLinkedPages(@Param('id') id: string, @Req() req: any) {
    return this.pageService.getLinkedPages(this.pid(req, id));
  }

  /** PATCH /page/:id/set-master — link this page to a master page */
  @Patch(':id/set-master')
  setMaster(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const user = req.user || req.authUser;
    const pageId = this.pid(req, id);
    const masterPageId = Number(body.masterPageId);
    return this.pageService.setMasterPage(pageId, masterPageId, user.id);
  }

  /** PATCH /page/:id/unlink — unlink this page from its master */
  @Patch(':id/unlink')
  unlink(@Param('id') id: string, @Req() req: any) {
    this.pid(req, id); // access check
    return this.pageService.unlinkPage(Number(id));
  }

  /**
   * PATCH /page/:id/reconnect — swap FB credentials while keeping all settings.
   * Body: { newPageToken: string, newPageName?: string }
   */
  @Patch(':id/reconnect')
  async reconnect(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const pageId = this.pid(req, id);
    const rawToken = String(body.newPageToken || '').trim();
    const verified = await this.facebookService.verifyPageToken(rawToken);
    const pageName = String(body.newPageName || verified.pageName || '').trim() || verified.pageName;
    return this.pageService.reconnectFbPage(pageId, verified.pageId, pageName, rawToken);
  }

  /** POST /page/:id/knowledge/scrape — scrape website URL and return extracted text preview */
  @Post(':id/knowledge/scrape')
  async scrapeKnowledge(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.pid(req, id); // access check
    const url = String(body?.url ?? '').trim();
    return this.pageService.scrapeWebsiteKnowledge(url);
  }
}
