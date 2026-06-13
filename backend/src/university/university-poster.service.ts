import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoPostService } from '../auto-post/auto-post.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';

const MAX_POSTS_PER_RUN = 3;

@Injectable()
export class UniversityPosterService {
  private readonly logger = new Logger(UniversityPosterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {}

  private async translateTitle(title: string): Promise<{ bn: string; en: string }> {
    try {
      const key = this.geminiRotator.getKey();
      if (!key) return { bn: title, en: title };
      const prompt = `Translate this university notice title into both Bengali and English.
Title: "${title}"
Reply ONLY with valid JSON: {"bn": "Bengali translation", "en": "English translation"}
If the title is already in English, keep it as the English version and translate to Bengali.
If the title is already in Bengali, keep it as the Bengali version and translate to English.`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      const json = await res.json() as any;
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
        const { bn, en } = await this.translateTitle(notice.title);

        const parts: string[] = [
          `📢 নতুন নোটিশ / New Notice`,
          ``,
          `🇧🇩 ${bn}`,
          `🇬🇧 ${en}`,
        ];
        if (notice.url) parts.push(``, `🔗 ${notice.url}`);
        parts.push(``, `#Notice #University #নোটিশ`);
        const caption = parts.join('\n');

        const fbPostId = await this.autoPost.publishToFacebook(pageId, caption);
        await this.prisma.universityNotice.update({
          where: { id: notice.id },
          data: { autoPosted: true, fbPostId },
        });

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
