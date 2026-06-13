import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from '../common/api-keys.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';
import type { Page } from '@prisma/client';

interface GroupLink {
  id: number;
  label: string;
  semester: string | null;
  department: string | null;
  course: string | null;
  linkType: string;
  link: string;
  isActive: boolean;
}

const GROUP_KEYWORDS = ['group', 'গ্রুপ', 'join', 'যোগ', 'add', 'যুক্ত', 'link', 'লিংক'];
const SEMESTER_MAP: Record<string, string[]> = {
  '1': ['1st', '১ম', '১', 'first', 'প্রথম'],
  '2': ['2nd', '২য়', '২', 'second', 'দ্বিতীয়'],
  '3': ['3rd', '৩য়', '৩', 'third', 'তৃতীয়'],
  '4': ['4th', '৪র্থ', '৪', 'fourth', 'চতুর্থ'],
  '5': ['5th', '৫ম', '৫', 'fifth', 'পঞ্চম'],
  '6': ['6th', '৬ষ্ঠ', '৬', 'sixth', 'ষষ্ঠ'],
  '7': ['7th', '৭ম', '৭', 'seventh', 'সপ্তম'],
  '8': ['8th', '৮ম', '৮', 'eighth', 'অষ্টম'],
};

@Injectable()
export class UniversityBotService {
  private readonly logger = new Logger(UniversityBotService.name);
  private provider: string;
  private model: string;
  private openaiKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {
    this.openaiKey = apiKeys.getSync('openaiApiKey');
    this.provider = apiKeys.getSync('aiIntentProvider') || 'gemini';
    this.model = apiKeys.getSync('aiIntentModel') || 'gemini-2.0-flash';
  }

  async handleMessage(page: Page, psid: string, text: string): Promise<string | null> {
    const config = await this.prisma.universityConfig.findUnique({ where: { pageId: page.id } });
    if (!config) return null;

    const normalized = text.toLowerCase();

    const isGroupRequest = GROUP_KEYWORDS.some((kw) => normalized.includes(kw));
    if (isGroupRequest) {
      const links = await this.prisma.groupLink.findMany({ where: { pageId: page.id, isActive: true } });
      const match = this.findGroupLink(normalized, links);
      if (match) {
        return `✅ এখানে আপনার গ্রুপের লিংক:\n\n${match.label}\n${match.link}`;
      }
      if (links.length > 0) {
        return '📚 কোন সেমিস্টার বা ডিপার্টমেন্টের গ্রুপ লিংক চাইছেন? যেমন: "CSE ৫ম সেমিস্টার গ্রুপ"';
      }
    }

    return this.answerWithAI(config, text);
  }

  findGroupLink(text: string, links: GroupLink[]): GroupLink | null {
    if (!links.length) return null;

    let bestMatch: GroupLink | null = null;
    let bestScore = 0;

    for (const link of links) {
      let score = 0;
      const dept = link.department?.toLowerCase();
      const sem = link.semester;
      const course = link.course?.toLowerCase();

      if (dept && text.includes(dept)) score += 3;
      if (course && text.includes(course)) score += 3;
      if (sem) {
        const aliases = SEMESTER_MAP[sem] || [];
        if (aliases.some((a) => text.includes(a.toLowerCase()))) score += 2;
        if (text.includes(sem)) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = link;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  private async answerWithAI(config: any, question: string): Promise<string | null> {
    const recentNotices = await this.prisma.universityNotice.findMany({
      where: { pageId: config.pageId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { title: true, publishedAt: true },
    });

    const noticeList = recentNotices
      .map((n, i) => `${i + 1}. ${n.title}${n.publishedAt ? ` (${n.publishedAt})` : ''}`)
      .join('\n');

    const systemPrompt = `তুমি একটি বিশ্ববিদ্যালয়ের সহকারী বট। শিক্ষার্থীদের প্রশ্নের সংক্ষিপ্ত ও সহায়ক উত্তর দাও।

নিচের তথ্য ব্যবহার করো:
${config.knowledgeText || '(কোনো বিশেষ তথ্য যোগ করা হয়নি)'}

সাম্প্রতিক নোটিশ:
${noticeList || '(কোনো নোটিশ নেই)'}

উত্তর বাংলায় দাও, সংক্ষিপ্ত (২-৪ লাইন)।`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];

    try {
      if (this.provider === 'gemini' && this.geminiRotator.isAvailable()) {
        return await this.callGemini(messages);
      }
      if (this.openaiKey) {
        return await this.callOpenAI(messages);
      }
    } catch (err: any) {
      this.logger.error(`[UniversityBot] AI call failed: ${err.message}`);
    }

    return 'আপনার প্রশ্নের উত্তর এই মুহূর্তে দেওয়া সম্ভব হচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।';
  }

  private async callGemini(messages: { role: string; content: string }[]): Promise<string | null> {
    const key = this.geminiRotator.getKey();
    if (!key) return null;
    const systemMsg = messages.find((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    const contents = rest.map((m) => ({ role: 'user', parts: [{ text: m.content }] }));
    const body: any = { contents, generationConfig: { temperature: 0.4, maxOutputTokens: 300 } };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  private async callOpenAI(messages: { role: string; content: string }[]): Promise<string | null> {
    if (!this.openaiKey) return null;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.openaiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 300, temperature: 0.4 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }
}
