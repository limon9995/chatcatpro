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

type PendingOAuthResult = {
  userId: string;
  pages: FacebookPageInfo[];
  createdAt: number;
};

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly appId = process.env.FB_APP_ID || '';
  private readonly appSecret = process.env.FB_APP_SECRET || '';
  private readonly stateSecret =
    process.env.FB_OAUTH_STATE_SECRET || this.appSecret || 'dfbot_state_secret';
  private readonly redirectUri =
    process.env.FB_REDIRECT_URI || 'http://localhost:3000/facebook/callback';
  private readonly pendingOAuthResults = new Map<string, PendingOAuthResult>();

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

  createPendingOAuthResult(userId: string, pages: FacebookPageInfo[]): string {
    const id = crypto.randomUUID();
    this.pendingOAuthResults.set(id, {
      userId,
      pages,
      createdAt: Date.now(),
    });
    this.cleanupPendingOAuthResults();
    return id;
  }

  consumePendingOAuthResult(userId: string, id: string) {
    const item = this.pendingOAuthResults.get(id);
    if (!item) throw new BadRequestException('OAuth result not found or expired');
    if (item.userId !== userId) throw new ForbiddenException('OAuth result does not belong to this user');
    this.pendingOAuthResults.delete(id);
    return { pages: item.pages };
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
    const submittedPageId = String(pageInfo.pageId || '').trim();
    const submittedPageName = String(pageInfo.pageName || '').trim();
    const submittedPageToken = String(pageInfo.pageToken || '').trim();

    if (!submittedPageToken) {
      throw new BadRequestException('Facebook page token is required');
    }

    const verifiedPage = await this.verifyPageToken(submittedPageToken);
    if (submittedPageId && submittedPageId !== verifiedPage.pageId) {
      this.logger.warn(
        `[Facebook] Rejected page connect due to ID mismatch: submitted=${submittedPageId} verified=${verifiedPage.pageId}`,
      );
      throw new BadRequestException(
        `Page ID mismatch. Facebook token belongs to page ${verifiedPage.pageId} (${verifiedPage.pageName}).`,
      );
    }

    const verifyToken =
      pageInfo.verifyToken || `dfbot_${verifiedPage.pageId}_${Date.now()}`;
    const encryptedToken = this.encryption.encryptIfNeeded(submittedPageToken);
    const existing = await this.prisma.page.findUnique({
      where: { pageId: verifiedPage.pageId },
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
            pageId: verifiedPage.pageId,
            pageName: verifiedPage.pageName,
            pageToken: encryptedToken,
            ownerId: userId,
            isActive: true,
            verifyToken: existing.verifyToken || verifyToken,
          },
        })
      : await this.prisma.page.create({
          data: {
            pageId: verifiedPage.pageId,
            pageName: verifiedPage.pageName,
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

  async resolvePageIdentity(pageUrl: string, pageToken: string): Promise<{
    pageId: string;
    pageName: string;
  }> {
    const submittedPageUrl = String(pageUrl || '').trim();
    const submittedPageToken = String(pageToken || '').trim();

    if (!submittedPageToken) {
      throw new BadRequestException('Facebook page token is required');
    }

    const verifiedPage = await this.verifyPageToken(submittedPageToken);
    const parsedRef = this.parsePageReference(submittedPageUrl);

    if (!parsedRef) {
      return {
        pageId: verifiedPage.pageId,
        pageName: verifiedPage.pageName,
      };
    }

    if (/^\d+$/.test(parsedRef)) {
      if (parsedRef !== verifiedPage.pageId) {
        throw new BadRequestException(
          `Page link mismatch. The link points to ${parsedRef}, but the token belongs to page ${verifiedPage.pageId} (${verifiedPage.pageName}).`,
        );
      }

      return {
        pageId: verifiedPage.pageId,
        pageName: verifiedPage.pageName,
      };
    }

    const resolvedPage = await this.fetchPageIdentityByReference(
      parsedRef,
      submittedPageToken,
    );

    if (resolvedPage.pageId !== verifiedPage.pageId) {
      this.logger.warn(
        `[Facebook] Rejected page resolve due to mismatch: link=${submittedPageUrl} resolved=${resolvedPage.pageId} verified=${verifiedPage.pageId}`,
      );
      throw new BadRequestException(
        `Page link mismatch. Token belongs to page ${verifiedPage.pageId} (${verifiedPage.pageName}).`,
      );
    }

    return {
      pageId: verifiedPage.pageId,
      pageName: verifiedPage.pageName,
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

  getFrontendBaseUrl() {
    const landingUrl = String(process.env.LANDING_PAGE_URL || '').trim();
    if (landingUrl) return landingUrl.replace(/\/+$/, '');

    const storageUrl = String(process.env.STORAGE_PUBLIC_URL || '').trim();
    if (storageUrl) return storageUrl.replace(/\/storage\/?$/, '').replace(/\/+$/, '');

    try {
      return new URL(this.redirectUri).origin;
    } catch {
      return 'http://localhost:3000';
    }
  }

  private cleanupPendingOAuthResults() {
    const now = Date.now();
    for (const [key, value] of this.pendingOAuthResults.entries()) {
      if (now - value.createdAt > 10 * 60 * 1000) {
        this.pendingOAuthResults.delete(key);
      }
    }
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

  private async verifyPageToken(pageToken: string): Promise<FacebookPageInfo> {
    const url = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || !data?.id) {
      const msg =
        data?.error?.message ||
        data?.message ||
        'Failed to verify Facebook page token';
      throw new BadRequestException(`Facebook page token verification failed: ${msg}`);
    }

    return {
      pageId: String(data.id),
      pageName: String(data.name || '').trim() || 'Untitled Facebook Page',
      pageToken,
    };
  }

  private async fetchPageIdentityByReference(
    reference: string,
    pageToken: string,
  ): Promise<FacebookPageInfo> {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(reference)}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || !data?.id) {
      const msg =
        data?.error?.message ||
        data?.message ||
        'Failed to resolve Facebook page link';
      throw new BadRequestException(`Facebook page link resolution failed: ${msg}`);
    }

    return {
      pageId: String(data.id),
      pageName: String(data.name || '').trim() || 'Untitled Facebook Page',
      pageToken,
    };
  }

  private parsePageReference(pageUrl: string): string | null {
    const raw = String(pageUrl || '').trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) return raw;

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'facebook.com' && host !== 'm.facebook.com') {
      return null;
    }

    const profileId = url.searchParams.get('id');
    if (profileId && /^\d+$/.test(profileId)) {
      return profileId;
    }

    const segments = url.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) return null;

    if (segments[0] === 'pages' || segments[0] === 'people') {
      const numericTail = [...segments].reverse().find((segment) => /^\d+$/.test(segment));
      if (numericTail) return numericTail;
    }

    if (segments[0] === 'pg' && segments[1]) {
      return segments[1];
    }

    const blockedRoots = new Set([
      'share',
      'watch',
      'reel',
      'story.php',
      'photo',
      'photos',
      'videos',
      'posts',
      'permalink.php',
      'groups',
      'marketplace',
      'login',
      'dialog',
      'plugins',
    ]);

    if (blockedRoots.has(segments[0])) return null;

    return segments[0];
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
