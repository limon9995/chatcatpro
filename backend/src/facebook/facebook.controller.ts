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
    const resultId = this.fb.createPendingOAuthResult(
      result.userId,
      result.pages,
    );
    const redirectBase = this.fb.getFrontendBaseUrl();
    return res.redirect(
      `${redirectBase}/?mode=connect-page&oauthResult=${encodeURIComponent(resultId)}`,
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
}
