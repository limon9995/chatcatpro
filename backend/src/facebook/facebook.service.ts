import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly appId = process.env.FB_APP_ID || '';
  private readonly appSecret = process.env.FB_APP_SECRET || '';
  private readonly stateSecret =
    process.env.FB_OAUTH_STATE_SECRET || this.appSecret || 'dfbot_state_secret';
  private readonly redirectUri =
    process.env.FB_REDIRECT_URI || 'http://localhost:3000/facebook/callback';

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly encryption: EncryptionService,
  ) {}

  getOAuthUrl(userId: string): string {
    if (!this.appId) throw new BadRequestException('FB_APP_ID not configured');
    const payload = Buffer.from(
      JSON.stringify({ userId, ts: Date.now() }),
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.stateSecret)
      .update(payload)
      .digest('hex');
    const state = `${payload}.${sig}`;
    const scope =
      'pages_show_list,pages_read_engagement,pages_messaging,pages_manage_metadata';
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ pages: FacebookPageInfo[]; userId: string }> {
    if (!code) throw new BadRequestException('Missing OAuth code');
    const { userId } = this.parseSignedState(state);
    const userToken = await this.exchangeCodeForToken(code);
    const pages = await this.getUserPages(userToken);
    return { pages, userId };
  }

  async connectPage(
    userId: string,
    pageInfo: {
      pageId: string;
      pageName: string;
      pageToken: string;
      verifyToken?: string;
    },
  ): Promise<any> {
    const verifyToken =
      pageInfo.verifyToken || `dfbot_${pageInfo.pageId}_${Date.now()}`;
    const encryptedToken = this.encryption.encryptIfNeeded(pageInfo.pageToken);
    const existing = await this.prisma.page.findUnique({
      where: { pageId: pageInfo.pageId },
      select: { id: true, ownerId: true, verifyToken: true },
    });

    if (existing?.ownerId && existing.ownerId !== userId) {
      throw new ForbiddenException(
        'This Facebook page is already connected to another account',
      );
    }

    const page = existing
      ? await this.prisma.page.update({
          where: { id: existing.id },
          data: {
            pageName: pageInfo.pageName,
            pageToken: encryptedToken,
            ownerId: userId,
            isActive: true,
            verifyToken: existing.verifyToken || verifyToken,
          },
        })
      : await this.prisma.page.create({
          data: {
            pageId: pageInfo.pageId,
            pageName: pageInfo.pageName,
            pageToken: encryptedToken,
            verifyToken,
            ownerId: userId,
            isActive: true,
            automationOn: false,
          },
        });

    await this.authService.addPageToUser(userId, page.id);
    this.logger.log(
      `[Facebook] Page connected: ${page.pageName} (${page.pageId}) → user ${userId}`,
    );

    return {
      success: true,
      page: {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        verifyToken: page.verifyToken,
      },
      webhookUrl: `${process.env.STORAGE_PUBLIC_URL?.replace('/storage', '') || 'http://localhost:3000'}/webhook`,
      instructions: `Facebook Webhook URL: /webhook | Verify Token: ${page.verifyToken}`,
    };
  }

  async disconnectPage(
    userId: string,
    pageDbId: number,
  ): Promise<{ success: boolean }> {
    const page = await this.prisma.page.findUnique({ where: { id: pageDbId } });
    if (!page || page.ownerId !== userId)
      throw new BadRequestException('Page not found or not yours');
    await this.prisma.page.update({
      where: { id: pageDbId },
      data: { isActive: false, automationOn: false },
    });
    this.authService.removePageFromUser(userId, pageDbId);
    return { success: true };
  }

  async getMyPages(userId: string) {
    return this.prisma.page.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        isActive: true,
        automationOn: true,
        ocrOn: true,
        createdAt: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const url = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${this.appId}&client_secret=${this.appSecret}&redirect_uri=${encodeURIComponent(this.redirectUri)}&code=${code}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.access_token)
      throw new BadRequestException(
        `FB token exchange failed: ${JSON.stringify(data)}`,
      );
    return data.access_token;
  }

  private async getUserPages(userToken: string): Promise<FacebookPageInfo[]> {
    const url = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.data) throw new BadRequestException('Failed to fetch pages');
    return data.data.map((p: any) => ({
      pageId: p.id,
      pageName: p.name,
      pageToken: p.access_token,
    }));
  }

  private parseSignedState(state: string): { userId: string; ts: number } {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) throw new BadRequestException('Invalid state');

    const expected = crypto
      .createHmac('sha256', this.stateSecret)
      .update(payload)
      .digest('hex');
    const sigOk =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!sigOk) throw new BadRequestException('Invalid state signature');

    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid state payload');
    }

    const userId = String(decoded?.userId || '').trim();
    const ts = Number(decoded?.ts || 0);
    if (!userId || !ts) throw new BadRequestException('Invalid state payload');

    const ageMs = Date.now() - ts;
    if (ageMs < 0 || ageMs > 15 * 60 * 1000) {
      throw new BadRequestException('OAuth state expired');
    }

    return { userId, ts };
  }
}

export interface FacebookPageInfo {
  pageId: string;
  pageName: string;
  pageToken: string;
}
