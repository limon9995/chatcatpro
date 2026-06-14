import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoPostService } from '../auto-post/auto-post.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';
import * as cheerio from 'cheerio';

const MAX_POSTS_PER_RUN = 3;

// Notice category detection — maps keywords to emoji + label
const NOTICE_CATEGORIES: Array<{ keywords: RegExp; emoji: string; labelBn: string; labelEn: string }> = [
  { keywords: /exam|পরীক্ষা|result|ফলাফল|grade|cgpa|routine|রুটিন/i, emoji: '📝', labelBn: 'পরীক্ষা বিজ্ঞপ্তি', labelEn: 'Exam Notice' },
  { keywords: /admission|ভর্তি|apply|application|আবেদন/i, emoji: '🎓', labelBn: 'ভর্তি বিজ্ঞপ্তি', labelEn: 'Admission Notice' },
  { keywords: /holiday|ছুটি|বন্ধ|vacation|leave/i, emoji: '📅', labelBn: 'ছুটির বিজ্ঞপ্তি', labelEn: 'Holiday Notice' },
  { keywords: /seminar|workshop|event|অনুষ্ঠান|উৎসব|festival|প্রতিযোগিতা|competition/i, emoji: '🎯', labelBn: 'অনুষ্ঠান বিজ্ঞপ্তি', labelEn: 'Event Notice' },
  { keywords: /fee|ফি|payment|টাকা|tuition|বেতন/i, emoji: '💳', labelBn: 'ফি বিজ্ঞপ্তি', labelEn: 'Fee Notice' },
  { keywords: /scholarship|বৃত্তি|waiver|ছাড়/i, emoji: '🏆', labelBn: 'বৃত্তি বিজ্ঞপ্তি', labelEn: 'Scholarship Notice' },
  { keywords: /class|ক্লাস|lecture|course|semester|সেমিস্টার|schedule|সময়সূচি/i, emoji: '📚', labelBn: 'একাডেমিক বিজ্ঞপ্তি', labelEn: 'Academic Notice' },
  { keywords: /job|চাকরি|career|internship|ইন্টার্ন/i, emoji: '💼', labelBn: 'ক্যারিয়ার বিজ্ঞপ্তি', labelEn: 'Career Notice' },
];

function detectCategory(title: string): { emoji: string; labelBn: string; labelEn: string } {
  for (const cat of NOTICE_CATEGORIES) {
    if (cat.keywords.test(title)) return cat;
  }
  return { emoji: '📢', labelBn: 'সাধারণ বিজ্ঞপ্তি', labelEn: 'General Notice' };
}

@Injectable()
export class UniversityPosterService {
  private readonly logger = new Logger(UniversityPosterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {}

  // Fetch notice URL and extract meaningful text content
  private async fetchNoticeContent(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatcatBot/1.0)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return '';
      const html = await res.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header, .menu, .navbar, noscript, iframe').remove();
      const parts: string[] = [];
      $('h1, h2, h3, p, li, td, .content, article, main').each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t.length > 30) parts.push(t);
      });
      return [...new Set(parts)].join('\n').slice(0, 2000);
    } catch {
      return '';
    }
  }

  // Use Gemini to write a proper bilingual Facebook post from the notice
  private async generatePost(
    title: string,
    content: string,
    category: { labelBn: string; labelEn: string },
  ): Promise<{ bn: string; en: string } | null> {
    try {
      const key = this.geminiRotator.getKey();
      if (!key) return null;

      const prompt = `You are a university social media manager. Write a Facebook post for this university notice.

Notice Title: "${title}"
Notice Category: ${category.labelBn} / ${category.labelEn}
${content ? `Notice Content:\n${content.slice(0, 1000)}` : ''}

Rules:
- Write BOTH Bengali and English versions
- Bengali: 3-5 sentences, friendly and informative, no URLs
- English: 3-5 sentences, friendly and informative, no URLs
- Extract key info: dates, deadlines, departments, requirements if available
- DO NOT include any URLs or web links
- End Bengali with: "বিস্তারিত জানতে বিশ্ববিদ্যালয়ের অফিসে যোগাযোগ করুন।"
- End English with: "Contact the university office for more details."

Reply ONLY with valid JSON:
{"bn": "Bengali post text", "en": "English post text"}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      const json = (await res.json()) as any;
      const text = (json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.bn && parsed.en) return parsed;
      }
    } catch (e) {
      this.logger.warn(`[Poster] AI post generation failed: ${e}`);
    }
    return null;
  }

  // Fallback: simple bilingual translation of title only
  private async translateTitle(title: string): Promise<{ bn: string; en: string }> {
    try {
      const key = this.geminiRotator.getKey();
      if (!key) return { bn: title, en: title };
      const prompt = `Translate this university notice title into both Bengali and English.
Title: "${title}"
Reply ONLY with valid JSON: {"bn": "Bengali translation", "en": "English translation"}
If already in English, keep and translate to Bengali. If already in Bengali, keep and translate to English.`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      const json = (await res.json()) as any;
      const text = (json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      this.logger.warn(`[Poster] Translation failed: ${e}`);
    }
    return { bn: title, en: title };
  }

  async postNewNotices(pageId: number, newNotices: any[]): Promise<void> {
    if (!newNotices.length) return;

    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config?.autoPostEnabled) return;

    const toPost = newNotices.slice(0, MAX_POSTS_PER_RUN);
    for (const notice of toPost) {
      try {
        const category = detectCategory(notice.title);

        // Try to fetch notice page content for richer AI post
        const noticeContent = notice.url ? await this.fetchNoticeContent(notice.url) : '';

        // Try AI-generated full post; fallback to title-only translation
        let bn: string;
        let en: string;

        const generated = await this.generatePost(notice.title, noticeContent, category);
        if (generated) {
          bn = generated.bn;
          en = generated.en;
          this.logger.log(`[Poster] AI-generated post for notice ${notice.id}`);
        } else {
          const translated = await this.translateTitle(notice.title);
          bn = translated.bn;
          en = translated.en;
          this.logger.log(`[Poster] Fallback title post for notice ${notice.id}`);
        }

        // Format date
        const dateStr = notice.publishedAt
          ? new Date(notice.publishedAt).toLocaleDateString('bn-BD', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : new Date().toLocaleDateString('bn-BD', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });

        const divider = '━━━━━━━━━━━━━━━━━━━━';
        const tagLine = `#নোটিশ #${category.labelEn.replace(/\s+/g, '')} #বিশ্ববিদ্যালয় #UAP`;

        const parts: string[] = [
          `${category.emoji} ${category.labelBn.toUpperCase()} | ${category.labelEn.toUpperCase()}`,
          divider,
          `🇧🇩 ${bn}`,
          ``,
          `🇬🇧 ${en}`,
          divider,
          `📅 তারিখ: ${dateStr}`,
          ``,
          tagLine,
        ];

        const caption = parts.join('\n');

        const fbPostId = await this.autoPost.publishToFacebook(pageId, caption);
        await this.prisma.universityNotice.update({
          where: { id: notice.id },
          data: { autoPosted: true, fbPostId },
        });

        this.logger.log(`[Poster] Posted notice ${notice.id} → fbPostId=${fbPostId}`);
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err: any) {
        this.logger.error(`[Poster] Failed to post notice ${notice.id}: ${err.message}`);
        await this.prisma.universityNotice.update({
          where: { id: notice.id },
          data: { postError: err.message?.slice(0, 255) },
        });
      }
    }
  }
}
