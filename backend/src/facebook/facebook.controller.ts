import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { FacebookService } from './facebook.service';
import type { Response } from 'express';

@SkipThrottle({ global: true, auth: true })
@Controller('facebook')
export class FacebookController {
  constructor(private readonly fb: FacebookService) {}

  // GET /facebook/oauth-url  → returns login URL for frontend
  @Get('oauth-url')
  @UseGuards(AuthGuard)
  getOAuthUrl(@Req() req: any) {
    return { url: this.fb.getOAuthUrl(req.authUser.id) };
  }

  // GET /facebook/callback?code=...&state=...  → called by Facebook after login
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const result = await this.fb.handleCallback(code, state);

    if (result.purpose === 'admin_approve_page_request') {
      const approval = await this.fb.approvePageRequestViaFacebookLogin(
        result.pageRequestId,
        result.pages,
      );
      return res.type('html').send(this.renderApprovalResult(approval));
    }

    const resultId = this.fb.createPendingOAuthResult(
      result.userId,
      result.pages,
    );
    const redirectBase = this.fb.getFrontendBaseUrl();
    return res.redirect(
      `${redirectBase}/?mode=connect-page&oauthResult=${encodeURIComponent(resultId)}`,
    );
  }

  // POST /facebook/admin-approve/finalize/:resultId  → admin picks a page when
  // multiple candidates matched (ambiguous case from the callback above).
  // Public: possession of the opaque, short-lived resultId is the credential
  // (same trust model as the existing oauth-result/:id endpoint).
  @Post('admin-approve/finalize/:resultId')
  async finalizeAdminApprove(
    @Param('resultId') resultId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const approval = await this.fb.finalizeAmbiguousApproval(
      resultId,
      String(body?.pageId || ''),
    );
    return res.type('html').send(this.renderApprovalResult(approval));
  }

  private renderApprovalResult(
    result:
      | { status: 'connected'; pageName: string }
      | { status: 'no_match' }
      | { status: 'ambiguous'; resultId: string; candidates: { pageId: string; pageName: string }[] },
  ): string {
    const escape = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

    const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1526;color:#e2e8ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{background:#141d33;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4)}
button{width:100%;padding:12px;border-radius:10px;border:none;background:#6366f1;color:#fff;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px}
</style></head><body><div class="card">${body}</div></body></html>`;

    if (result.status === 'connected') {
      return page(
        'Connected',
        `<h2>✅ Successfully connected ${escape(result.pageName)}!</h2><p>You can close this tab.</p>`,
      );
    }

    if (result.status === 'no_match') {
      return page(
        'No match found',
        `<h2>❌ No matching Facebook Page found</h2><p>Confirm you were added as moderator and try the Telegram link again.</p>`,
      );
    }

    const buttons = result.candidates
      .map(
        (c) => `<form method="post" action="/facebook/admin-approve/finalize/${result.resultId}">
      <input type="hidden" name="pageId" value="${escape(c.pageId)}" />
      <button type="submit">${escape(c.pageName)}</button>
    </form>`,
      )
      .join('');
    return page(
      'Choose a page',
      `<h2>Multiple pages found</h2><p>Choose which page to connect:</p>${buttons}`,
    );
  }

  @Get('oauth-result/:id')
  @UseGuards(AuthGuard)
  oauthResult(@Req() req: any, @Param('id') id: string) {
    return this.fb.consumePendingOAuthResult(req.authUser.id, id);
  }

  // POST /facebook/connect  → client selects a page to connect
  @Post('connect')
  @UseGuards(AuthGuard)
  connect(@Req() req: any, @Body() body: any) {
    return this.fb.connectPage(req.authUser.id, {
      pageId: String(body.pageId || ''),
      pageName: String(body.pageName || ''),
      pageToken: String(body.pageToken || ''),
      verifyToken: body.verifyToken,
      masterPageId: body.masterPageId ? Number(body.masterPageId) : undefined,
      fbAppId: body.fbAppId ? String(body.fbAppId).trim() : undefined,
      fbAppSecret: body.fbAppSecret ? String(body.fbAppSecret).trim() : undefined,
    });
  }

  @Post('resolve-page')
  @UseGuards(AuthGuard)
  resolvePage(@Body() body: any) {
    return this.fb.resolvePageIdentity(
      String(body.pageUrl || ''),
      String(body.pageToken || ''),
    );
  }

  // GET /facebook/my-pages  → list all connected pages for logged-in user
  @Get('my-pages')
  @UseGuards(AuthGuard)
  myPages(@Req() req: any) {
    return this.fb.getMyPages(req.authUser.id);
  }

  // DELETE /facebook/disconnect/:pageId
  @Delete('disconnect/:pageId')
  @UseGuards(AuthGuard)
  disconnect(@Req() req: any, @Param('pageId') pageId: string) {
    return this.fb.disconnectPage(req.authUser.id, Number(pageId));
  }

  // POST /facebook/page-request  → client submits page access request
  @Post('page-request')
  @UseGuards(AuthGuard)
  submitPageRequest(@Req() req: any, @Body() body: any) {
    return this.fb.submitPageRequest(
      req.authUser.id,
      String(body.pageUrl || ''),
      body.fbProfile ? String(body.fbProfile) : undefined,
      body.note ? String(body.note) : undefined,
    );
  }

  // GET /facebook/page-request/my  → client sees their own requests
  @Get('page-request/my')
  @UseGuards(AuthGuard)
  myPageRequests(@Req() req: any) {
    return this.fb.getMyPageRequests(req.authUser.id);
  }

  // GET /facebook/moderator-access-info  → admin's FB profile/Gmail to add as moderator
  @Get('moderator-access-info')
  @UseGuards(AuthGuard)
  moderatorAccessInfo() {
    return this.fb.getModeratorAccessInfo();
  }
}
