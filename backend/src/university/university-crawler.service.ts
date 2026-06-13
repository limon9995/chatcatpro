import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {}

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

    // Extract structured metadata (departments, semesters, courses) using AI
    const extractedMeta = await this.extractStructuredMeta(knowledge);

    await this.prisma.universityConfig.update({
      where: { id: config.id },
      data: {
        scrapedKnowledgeText: knowledge,
        lastFullCrawlAt: new Date(),
        extractedMeta: JSON.stringify(extractedMeta),
      },
    });

    return { pagesCrawled: pages.length };
  }

  private async extractStructuredMeta(knowledgeText: string): Promise<{
    departments: string[];
    semesters: string[];
    courses: string[];
  }> {
    const empty = { departments: [], semesters: [], courses: [] };
    if (!this.geminiRotator.isAvailable()) return empty;

    const key = this.geminiRotator.getKey();
    if (!key) return empty;

    // Use first 15k chars — enough to find programs/departments
    const sample = knowledgeText.slice(0, 15_000);

    const prompt = `From the university website content below, extract:
1. All department/faculty/program names (e.g. CSE, EEE, BBA, Civil Engineering)
2. Semester/year structure used by this university (e.g. 1st Semester, 2nd Year, Spring 2025)
3. Course/subject names mentioned (e.g. Data Structures, Calculus, Business Law)

Return ONLY valid JSON in this exact format:
{
  "departments": ["CSE", "EEE", ...],
  "semesters": ["1st", "2nd", ...],
  "courses": ["Data Structures", ...]
}

University content:
${sample}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return empty;
      const data: any = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      // Extract JSON block (may be wrapped in ```json)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return empty;
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        departments: Array.isArray(parsed.departments) ? parsed.departments.slice(0, 30) : [],
        semesters: Array.isArray(parsed.semesters) ? parsed.semesters.slice(0, 20) : [],
        courses: Array.isArray(parsed.courses) ? parsed.courses.slice(0, 50) : [],
      };
    } catch (err: any) {
      this.logger.warn(`[Crawler] Meta extraction failed: ${err.message}`);
      return empty;
    }
  }
}
