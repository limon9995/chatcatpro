import { Injectable, Logger } from '@nestjs/common';
import { ApiKeysService } from '../common/api-keys.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';
import { AiUsageService } from '../common/ai-usage.service';

// V30 Phase 2: business-research agent. Deliberately does NOT scrape
// Facebook/Instagram/websites (see the architecture report — directly
// scraping FB/IG violates Meta's ToS regardless of implementation). Instead
// it synthesizes a summary + pain points from the *structured fields and
// staff-entered notes already on the lead* — legitimate, no ToS exposure,
// and still real AI value (turning raw notes into a structured brief).
// Mirrors SmartBotService's Gemini-call pattern (same rotator/key/model
// resolution) rather than inventing a new one — see the architecture
// report's call for a shared LLM layer; this is step one of that.

export interface PainPoint {
  painPoint: string;
  evidence: string;
  confidence: number; // 0-100
  solution: string;
}

export interface ResearchResult {
  summary: string;
  opportunity: 'HIGH' | 'MEDIUM' | 'LOW';
  painPoints: PainPoint[];
  usage: {
    provider: string;
    model: string;
    promptTokens: number;
    outputTokens: number;
  };
}

interface ResearchableLead {
  businessName: string;
  category?: string | null;
  location?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  followerCount?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
  onlineOrderPresence?: boolean | null;
  estimatedMessageVolume?: string | null;
  notes?: string | null;
}

const SYSTEM_PROMPT = `You are a B2B research analyst for ChatCat, a Facebook/Instagram/WhatsApp commerce-automation SaaS for Bengali-speaking e-commerce sellers in Bangladesh (AI auto-replies, order management, courier integration, accounting).
Given structured facts about a prospective business, write a concise internal summary and identify realistic pain points ChatCat could solve.
Rules:
1. Only state a pain point if the given facts/notes actually support it. If there is no direct evidence for a pain point, either omit it entirely or give it low confidence (below 40) — never invent specifics you weren't given.
2. Base "opportunity" on concrete signals (message volume, followers, online ordering, notes) — not optimism.
3. Output valid JSON only, matching exactly this shape, no markdown fences, no extra text:
{"summary": string, "opportunity": "HIGH"|"MEDIUM"|"LOW", "painPoints": [{"painPoint": string, "evidence": string, "confidence": number, "solution": string}]}
4. Write "summary", "painPoint", "evidence", and "solution" text in Bengali (বাংলা), mixing in English business/product terms where that's how a Bangladeshi ops team would actually write it.`;

@Injectable()
export class MarketingAiService {
  private readonly logger = new Logger(MarketingAiService.name);

  constructor(
    private readonly geminiRotator: GeminiKeyRotatorService,
    private readonly apiKeys: ApiKeysService,
    private readonly aiUsage: AiUsageService,
  ) {}

  private buildPrompt(lead: ResearchableLead): string {
    const lines = [
      `Business: ${lead.businessName}`,
      lead.category ? `Category: ${lead.category}` : null,
      lead.location ? `Location: ${lead.location}` : null,
      lead.website ? `Website: ${lead.website}` : null,
      lead.facebookUrl ? `Facebook: ${lead.facebookUrl}` : null,
      lead.instagramUrl ? `Instagram: ${lead.instagramUrl}` : null,
      lead.followerCount != null ? `Followers: ${lead.followerCount}` : null,
      lead.reviewCount != null
        ? `Reviews: ${lead.reviewCount}${lead.rating != null ? ` (rating ${lead.rating})` : ''}`
        : null,
      `Online ordering present: ${lead.onlineOrderPresence ? 'yes' : 'no'}`,
      lead.estimatedMessageVolume
        ? `Estimated customer message volume: ${lead.estimatedMessageVolume}`
        : null,
      `Staff notes/observations: ${lead.notes?.trim() || '(none provided)'}`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  async researchLead(lead: ResearchableLead): Promise<ResearchResult | null> {
    const model =
      this.apiKeys.getSync('aiIntentModel') || 'gemini-2.5-flash-lite';
    const prompt = this.buildPrompt(lead);

    while (this.geminiRotator.isAvailable()) {
      const key = this.geminiRotator.getKey();
      if (!key) break;
      const outcome = await this.callGemini(key, model, prompt);
      if (outcome === 'RETRY') continue;
      if (!outcome) return null;

      void this.aiUsage.record({
        provider: 'gemini',
        model,
        usageType: 'LEAD_RESEARCH',
        promptTokens: outcome.promptTokens,
        outputTokens: outcome.outputTokens,
      });

      const parsed = this.parseResponse(outcome.text);
      if (!parsed) return null;
      return {
        ...parsed,
        usage: {
          provider: 'gemini',
          model,
          promptTokens: outcome.promptTokens,
          outputTokens: outcome.outputTokens,
        },
      };
    }
    this.logger.warn('[MarketingAi] No Gemini key available for lead research');
    return null;
  }

  private async callGemini(
    geminiKey: string,
    model: string,
    prompt: string,
  ): Promise<
    | { text: string; promptTokens: number; outputTokens: number }
    | null
    | 'RETRY'
  > {
    const start = Date.now();
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        // thinkingBudget: 0 — gemini-2.5-* defaults to "thinking" mode, which
        // burns the maxOutputTokens budget on internal reasoning and
        // truncates the actual JSON output (confirmed against the live API
        // during development: without this, candidatesTokenCount was ~35
        // against a ~1150-token thinking spend, cutting the JSON off
        // mid-string). Same fix already applied everywhere else in this
        // codebase that calls gemini-2.5 — see ocr.service.ts, auto-post,
        // support-chat, vision-analysis, university-crawler.
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });

      if (
        res.status === 429 ||
        res.status === 402 ||
        res.status === 500 ||
        res.status === 503 ||
        res.status === 504
      ) {
        this.geminiRotator.markError(geminiKey, res.status);
        return 'RETRY';
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const errText = await res.text();
        this.geminiRotator.markError(geminiKey, res.status, errText);
        return 'RETRY';
      }
      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(
          `[MarketingAi] Gemini error ${res.status}: ${errText.slice(0, 200)}`,
        );
        this.geminiRotator.markError(geminiKey, res.status, errText);
        return null;
      }

      const data: any = await res.json();
      this.geminiRotator.markSuccess(geminiKey, Date.now() - start);
      const text = (
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      ).trim();
      if (!text) return null;
      return {
        text,
        promptTokens: data?.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (err: any) {
      this.logger.warn(
        `[MarketingAi] Gemini network error: ${err?.message ?? err}`,
      );
      this.geminiRotator.markError(geminiKey, 500, err?.message ?? String(err));
      return 'RETRY';
    }
  }

  private parseResponse(text: string): {
    summary: string;
    opportunity: 'HIGH' | 'MEDIUM' | 'LOW';
    painPoints: PainPoint[];
  } | null {
    try {
      const raw = JSON.parse(text);
      const opportunity = ['HIGH', 'MEDIUM', 'LOW'].includes(raw.opportunity)
        ? raw.opportunity
        : 'MEDIUM';
      const painPoints: PainPoint[] = Array.isArray(raw.painPoints)
        ? raw.painPoints
            .filter((p: any) => p?.painPoint && p?.evidence && p?.solution)
            .map((p: any) => ({
              painPoint: String(p.painPoint),
              evidence: String(p.evidence),
              confidence: Math.max(0, Math.min(100, Number(p.confidence) || 0)),
              solution: String(p.solution),
            }))
            .slice(0, 10)
        : [];
      return { summary: String(raw.summary || ''), opportunity, painPoints };
    } catch (e) {
      this.logger.warn(
        `[MarketingAi] Failed to parse AI response as JSON: ${(e as Error).message}`,
      );
      return null;
    }
  }
}
