import { Injectable, Logger } from '@nestjs/common';
import { GlobalSettingsService } from '../common/global-settings.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful customer service assistant for Chatcat — a Facebook Messenger automation platform for Bangladeshi e-commerce businesses.

You help customers understand:
- What Chatcat does (automates Facebook Messenger orders, product detection via AI, courier booking, accounting)
- Pricing: ৳৬৯৯/month platform fee + prepaid AI wallet (৳০.০৫/text, ৳০.৫০/voice, ৳০.৩০-০.৫০/image)
- Features: bot automation, OCR, AI image recognition, Pathao/Steadfast/RedX/Paperfly courier integration, CRM, broadcast
- How to get started: visit chatcat.pro and click "শুরু করুন"

Be friendly, concise, and helpful. Reply in the same language the user writes in (Bengali or English). If asked something you don't know, suggest contacting support.`;

const FALLBACK_REPLY = 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন। 🙏';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ollamaBaseUrl: string;
  private readonly ollamaChatModel: string;
  private readonly openaiApiKey: string;

  constructor(private readonly globalSettings: GlobalSettingsService) {
    this.ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    this.ollamaChatModel = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2:1.5b';
    this.openaiApiKey = process.env.OPENAI_API_KEY ?? '';
  }

  async chat(message: string, history: ChatMessage[]): Promise<string> {
    const { localAiEnabled } = await this.globalSettings.get();

    const messages: ChatMessage[] = history.slice(-8);
    messages.push({ role: 'user', content: message });

    if (localAiEnabled && this.ollamaBaseUrl) {
      try {
        return await this.chatWithOllama(messages);
      } catch (err: any) {
        this.logger.warn(`[Chat] Ollama failed — falling back to OpenAI: ${err?.message ?? err}`);
      }
    }

    try {
      return await this.chatWithOpenAI(messages);
    } catch (err: any) {
      this.logger.error(`[Chat] OpenAI also failed: ${err?.message ?? err}`);
      return FALLBACK_REPLY;
    }
  }

  private async chatWithOllama(messages: ChatMessage[]): Promise<string> {
    this.logger.log(`[Chat] Ollama (${this.ollamaChatModel})`);
    const res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({
        model: this.ollamaChatModel,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json() as any;
    const reply = (data?.message?.content ?? '').trim();
    return reply || FALLBACK_REPLY;
  }

  private async chatWithOpenAI(messages: ChatMessage[]): Promise<string> {
    if (!this.openaiApiKey) return FALLBACK_REPLY;
    this.logger.log('[Chat] OpenAI gpt-4o-mini');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = await res.json() as any;
    const reply = (data?.choices?.[0]?.message?.content ?? '').trim();
    return reply || FALLBACK_REPLY;
  }
}
