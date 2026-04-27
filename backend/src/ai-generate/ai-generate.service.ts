import { Injectable, Logger } from '@nestjs/common';
import { GlobalSettingsService } from '../common/global-settings.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AiGenerateService {
  private readonly logger = new Logger(AiGenerateService.name);
  private readonly ollamaBaseUrl: string;
  private readonly ollamaChatModel: string;
  private readonly openaiApiKey: string;
  private ollamaBusy = false;

  constructor(
    private readonly globalSettings: GlobalSettingsService,
    private readonly walletService: WalletService,
  ) {
    this.ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    this.ollamaChatModel = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2:1.5b';
    this.openaiApiKey = process.env.OPENAI_API_KEY ?? '';
  }

  private async callOllama(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (this.ollamaBusy) {
      this.logger.log('[AiGenerate] Ollama busy → OpenAI handles this one');
      return null;
    }
    this.ollamaBusy = true;
    try {
      this.logger.log(`[AiGenerate] Ollama (${this.ollamaChatModel})`);
      const res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          model: this.ollamaChatModel,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json() as any;
      return (data?.message?.content ?? '').trim() || null;
    } catch (err: any) {
      this.logger.warn(`[AiGenerate] Ollama failed: ${err?.message ?? err}`);
      return null;
    } finally {
      this.ollamaBusy = false;
    }
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string, maxTokens = 250): Promise<string | null> {
    if (!this.openaiApiKey) return null;
    try {
      this.logger.log('[AiGenerate] OpenAI gpt-4o-mini');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json() as any;
      return (data?.choices?.[0]?.message?.content ?? '').trim() || null;
    } catch (err: any) {
      this.logger.warn(`[AiGenerate] OpenAI failed: ${err?.message ?? err}`);
      return null;
    }
  }

  private async generate(systemPrompt: string, userPrompt: string, maxTokens = 250): Promise<string | null> {
    const { localAiMode } = await this.globalSettings.get();

    // Ollama for AI Generate if mode is 'all' or 'generate_only'
    if ((localAiMode === 'all' || localAiMode === 'generate_only') && this.ollamaBaseUrl) {
      const result = await this.callOllama(systemPrompt, userPrompt);
      if (result) return result;
      this.logger.warn('[AiGenerate] Ollama failed — falling back to OpenAI');
    }

    return this.callOpenAI(systemPrompt, userPrompt, maxTokens);
  }

  async generateProductDescription(
    pageId: number,
    params: { name: string; category?: string | null; color?: string | null; keywords?: string | null },
  ): Promise<string | null> {
    const systemPrompt = `তুমি একটি Bangladeshi e-commerce shop-এর product description writer।
নিচের product attributes দেখে ২-৩ sentence-এর engaging Bangla/Banglish description লেখো।
শুধু description লেখো — কোনো extra text না।`;

    const parts = [`Product: ${params.name}`];
    if (params.category) parts.push(`Category: ${params.category}`);
    if (params.color) parts.push(`Color: ${params.color}`);
    if (params.keywords) parts.push(`Keywords: ${params.keywords}`);

    const result = await this.generate(systemPrompt, parts.join('\n'));
    if (!result) return null;

    await this.walletService.deductUsage(pageId, 'AI_GENERATE');
    return result;
  }

  async generateBroadcastMessage(
    pageId: number,
    params: { title: string; targetType: string; businessName?: string | null },
  ): Promise<string | null> {
    const shop = params.businessName ? `"${params.businessName}"` : 'আমাদের shop';
    const targetLabel: Record<string, string> = {
      all: 'সব customer',
      ordered_before: 'আগে order করেছে এমন customer',
      never_ordered: 'এখনো order করেনি এমন customer',
    };
    const target = targetLabel[params.targetType] ?? params.targetType;

    const systemPrompt = `তুমি ${shop}-এর Facebook Messenger marketing copywriter।
নিচের campaign info দেখে engaging Bangla/Banglish broadcast message লেখো।
Emoji ব্যবহার করো। ২-৪ লাইন। Friendly এবং persuasive।
শুধু message লেখো — কোনো extra text না।`;

    const userPrompt = `Campaign: ${params.title}\nTarget audience: ${target}`;

    const result = await this.generate(systemPrompt, userPrompt, 200);
    if (!result) return null;

    await this.walletService.deductUsage(pageId, 'AI_GENERATE');
    return result;
  }
}
