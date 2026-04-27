import { Injectable, Logger } from '@nestjs/common';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `তুমি Chatcat-এর customer service assistant। Chatcat হলো Bangladeshi Facebook seller দের জন্য একটি Messenger automation platform।

তুমি যা জানো:
- Chatcat কী করে: Facebook Messenger-এ automatically order নেয়, AI দিয়ে product detect করে, courier book করে (Pathao/Steadfast/RedX/Paperfly), accounting করে
- Price: ৳৬৯৯/মাস platform fee + prepaid AI wallet (text ৳০.০৫, voice ৳০.৫০, image ৳০.৩০-০.৫০)
- Features: bot automation, OCR (ছবি থেকে product code), AI image recognition, CRM, broadcast, courier integration
- শুরু করতে: chatcat.pro তে গিয়ে "শুরু করুন" বাটনে ক্লিক করুন

উত্তর দেবে Bengali বা Banglish-এ — যে ভাষায় customer লিখবে সেই ভাষায়। Concise ও friendly থাকো। না জানলে support-এ যোগাযোগ করতে বলো (info@chatcat.pro)।`;

const FALLBACK_REPLY = 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন 🙏';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly openaiApiKey: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY ?? '';
  }

  async chat(message: string, history: ChatMessage[]): Promise<string> {
    const messages: ChatMessage[] = [...history.slice(-8), { role: 'user', content: message }];
    try {
      return await this.callOpenAI(messages);
    } catch (err: any) {
      this.logger.error(`[Chat] OpenAI failed: ${err?.message ?? err}`);
      return FALLBACK_REPLY;
    }
  }

  private async callOpenAI(messages: ChatMessage[]): Promise<string> {
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
        max_tokens: 250,
        temperature: 0.7,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json() as any;
    return (data?.choices?.[0]?.message?.content ?? '').trim() || FALLBACK_REPLY;
  }
}
