import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export interface ScrapedNotice {
  title: string;
  url: string | null;
  publishedAt: string | null;
  contentHash: string;
}

@Injectable()
export class UniversityScraperService {
  private readonly logger = new Logger(UniversityScraperService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Titles that are clearly navigation menu items, not notices
  private static readonly JUNK_TITLES = new Set([
    'home', 'about', 'contact', 'login', 'logout', 'register', 'search',
    'menu', 'back', 'next', 'previous', 'more', 'read more', 'view all',
    'click here', 'here', 'download', 'print', 'share', 'submit',
    'for support', 'on campus links', 'picture gallery', 'photo gallery',
    'e-journals access', 'e-journals', 'journals', 'uap news letter',
    'statistics: faculty and students', 'statistics', 'advertisement',
    'advertisement / tender', 'tender', 'facebook', 'twitter', 'youtube',
    'linkedin', 'instagram', 'social media', 'sitemap', 'privacy policy',
    'terms', 'faq', 'help', 'career', 'alumni', 'library', 'portal',
    'student portal', 'teacher portal', 'email', 'webmail',
  ]);

  async scrapeNotices(scrapeUrl: string): Promise<ScrapedNotice[]> {
    const res = await fetch(scrapeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatcatBot/1.0)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${scrapeUrl}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove navigation, menu, sidebar, footer noise BEFORE selecting links
    $('nav, header, footer, .navbar, .nav, .menu, .sidebar, .breadcrumb, .pagination, aside, .social, .footer, #footer, #header, #nav, #menu').remove();

    const selectors = [
      // Specific notice/news containers first
      '.notice-list li a',
      '.news-list li a',
      '.notice-board li a',
      '.notification-list li a',
      '#notice li a',
      '#news li a',
      '.announcement li a',
      'table.notice-table td a',
      // Generic containers — only if specific ones not found
      '.content-area ul li a',
      'ul.list-group li a',
      '.main-content ul li a',
      '#content ul li a',
      // Fallback
      'ul li a',
      'table td a',
    ];

    let links: cheerio.Cheerio<AnyNode> | null = null;
    for (const sel of selectors) {
      const found = $(sel);
      if (found.length > 2) {
        links = found;
        this.logger.log(`[Scraper] Using selector: ${sel} (${found.length} links)`);
        break;
      }
    }

    if (!links || links.length === 0) {
      this.logger.warn(`[Scraper] No notices found at ${scrapeUrl}`);
      return [];
    }

    const notices: ScrapedNotice[] = [];
    links.each((_, el) => {
      const $el = $(el);
      const title = $el.text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 10) return; // skip very short titles

      // Skip known menu/nav items
      const titleLower = title.toLowerCase();
      if (UniversityScraperService.JUNK_TITLES.has(titleLower)) return;

      // Skip single-word titles (likely menu items)
      if (!title.includes(' ') && title.length < 20) return;

      // Skip titles that look like file extensions / generic links
      if (/\.(pdf|jpg|png|doc|xlsx)$/i.test(title)) return;

      let href = $el.attr('href') || null;
      if (href && !href.startsWith('http')) {
        try {
          const base = new URL(scrapeUrl);
          href = new URL(href, base.origin).toString();
        } catch {
          href = null;
        }
      }
      // Skip anchor-only links
      if (href && href.startsWith('#')) href = null;

      const parentText = $el.parent().text().replace(title, '').trim();
      const dateMatch = parentText.match(/\d{1,2}[-\/]\w{2,9}[-\/]\d{2,4}/);
      const publishedAt = dateMatch ? dateMatch[0] : null;

      const contentHash = crypto
        .createHash('sha256')
        .update(title + (href || ''))
        .digest('hex');

      notices.push({ title, url: href, publishedAt, contentHash });
    });

    this.logger.log(`[Scraper] Found ${notices.length} valid notices at ${scrapeUrl}`);
    return notices;
  }

  async runScrapeForPage(pageId: number): Promise<{ newNotices: any[] }> {
    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config || !config.scrapeUrl) return { newNotices: [] };

    let scraped: ScrapedNotice[] = [];
    try {
      scraped = await this.scrapeNotices(config.scrapeUrl);
    } catch (err: any) {
      this.logger.error(`[Scraper] Page ${pageId} scrape failed: ${err.message}`);
      return { newNotices: [] };
    }

    const newNotices: any[] = [];
    for (const item of scraped) {
      try {
        const created = await this.prisma.universityNotice.create({
          data: {
            configId: config.id,
            pageId,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            contentHash: item.contentHash,
          },
        });
        newNotices.push(created);
      } catch {
        // unique constraint violation = already exists, skip
      }
    }

    await this.prisma.universityConfig.update({
      where: { id: config.id },
      data: { lastScrapedAt: new Date() },
    });

    this.logger.log(`[Scraper] Page ${pageId}: ${newNotices.length} new notices`);
    return { newNotices };
  }

  async runScrapeForAllPages(): Promise<void> {
    const configs = await this.prisma.universityConfig.findMany({
      where: { scrapeEnabled: true, page: { universityModeOn: true } },
      include: { page: { select: { id: true } } },
    });

    for (const config of configs) {
      const intervalMs = config.scrapeInterval * 60 * 1000;
      const lastScrape = config.lastScrapedAt?.getTime() ?? 0;
      if (Date.now() - lastScrape < intervalMs) continue;

      try {
        await this.runScrapeForPage(config.pageId);
      } catch (err: any) {
        this.logger.error(`[Scraper] runScrapeForAllPages error for pageId=${config.pageId}: ${err.message}`);
      }
    }
  }
}
