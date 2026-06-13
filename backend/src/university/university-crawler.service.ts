import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as cheerio from 'cheerio';

const MAX_PAGES = 40;
const MAX_TEXT_PER_PAGE = 3000;
const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|zip|doc|docx|xls|xlsx|mp4|mp3)(\?|$)/i;
const SKIP_PATHS = /\/(login|logout|cart|checkout|admin|wp-admin|search)\b/i;

interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

@Injectable()
export class UniversityCrawlerService {
  private readonly logger = new Logger(UniversityCrawlerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async crawlSite(baseUrl: string): Promise<CrawledPage[]> {
    const base = new URL(baseUrl);
    const visited = new Set<string>();
    const queue: string[] = [base.href];
    const results: CrawledPage[] = [];

    while (queue.length > 0 && results.length < MAX_PAGES) {
      const url = queue.shift()!;
      const normalized = url.split('#')[0];
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      try {
        const res = await fetch(normalized, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatcatBot/1.0)' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) continue;

        const html = await res.text();
        const $ = cheerio.load(html);

        // Remove noise elements
        $('script, style, nav, footer, header, .menu, .navbar, .sidebar, .advertisement, .ad, noscript, iframe').remove();

        const title = $('title').text().trim() || $('h1').first().text().trim();

        // Extract meaningful text blocks
        const textParts: string[] = [];
        $('h1, h2, h3, h4, p, li, td, th, .content, article, main, section').each((_, el) => {
          const t = $(el).text().replace(/\s+/g, ' ').trim();
          if (t.length > 20) textParts.push(t);
        });

        const text = [...new Set(textParts)].join('\n').slice(0, MAX_TEXT_PER_PAGE);
        if (text.length > 100) {
          results.push({ url: normalized, title, text });
        }

        // Collect internal links
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') || '';
          if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
          if (SKIP_EXTENSIONS.test(href)) return;
          try {
            const abs = new URL(href, normalized);
            if (abs.hostname !== base.hostname) return;
            if (SKIP_PATHS.test(abs.pathname)) return;
            const key = abs.href.split('#')[0];
            if (!visited.has(key)) queue.push(key);
          } catch {}
        });

        // Small delay to be polite
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        this.logger.warn(`[Crawler] Skip ${normalized}: ${err.message}`);
      }
    }

    this.logger.log(`[Crawler] Crawled ${results.length} pages from ${baseUrl}`);
    return results;
  }

  async runFullCrawlForPage(pageId: number): Promise<{ pagesCrawled: number }> {
    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config) return { pagesCrawled: 0 };

    const crawlUrl = config.crawlBaseUrl || config.scrapeUrl;
    if (!crawlUrl) return { pagesCrawled: 0 };

    let pages: CrawledPage[] = [];
    try {
      pages = await this.crawlSite(crawlUrl);
    } catch (err: any) {
      this.logger.error(`[Crawler] Page ${pageId} crawl failed: ${err.message}`);
      return { pagesCrawled: 0 };
    }

    // Build knowledge text: "Page Title\nURL\n<text>\n---\n"
    const knowledge = pages
      .map((p) => `### ${p.title}\n${p.url}\n${p.text}`)
      .join('\n\n---\n\n')
      .slice(0, 80_000); // keep under 80k chars

    await this.prisma.universityConfig.update({
      where: { id: config.id },
      data: { scrapedKnowledgeText: knowledge, lastFullCrawlAt: new Date() },
    });

    return { pagesCrawled: pages.length };
  }
}
