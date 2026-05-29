import { Injectable, Logger } from '@nestjs/common';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const PAGE_NAMES: Record<string, string> = {
  OVERVIEW: 'ওভারভিউ',
  AGENT_TASKS: 'এজেন্ট টাস্ক',
  ORDERS: 'অর্ডার',
  COURIER: 'কুরিয়ার',
  PRINT: 'প্রিন্ট / ইনভয়েস',
  PRODUCTS: 'প্রোডাক্ট',
  CATALOG: 'ওয়েবসাইট / ক্যাটালগ',
  ACCOUNTING: 'হিসাব',
  ANALYTICS: 'অ্যানালিটিক্স',
  BOT_KNOWLEDGE: 'বট নলেজ',
  CRM: 'কাস্টমার / CRM',
  BROADCAST: 'ব্রডকাস্ট',
  AUTO_POST: 'অটো পোস্ট',
  FOLLOWUP: 'ফলো-আপ',
  MEMO_TEMPLATE: 'মেমো টেমপ্লেট',
  FRAUD_CHECKER: 'ফ্রড চেকার',
  CONNECT_FB_PAGE: 'Facebook পেজ কানেক্ট',
  WALLET: 'ওয়ালেট',
  SETTINGS_BUSINESS: 'ব্যবসার তথ্য সেটিংস',
  SETTINGS_DELIVERY: 'ডেলিভারি সেটিংস',
  SETTINGS_BOT: 'বট মোড সেটিংস',
  SETTINGS_KNOWLEDGE: 'নলেজ সেটিংস',
  SETTINGS_CALL: 'কল কনফার্ম সেটিংস',
  SETTINGS_VOICE: 'ভয়েস সেটিংস',
};

const BASE_SYSTEM_PROMPT = `তুমি Chatcat ড্যাশবোর্ডের AI সহকারী। তুমি Bengali e-commerce seller দের Chatcat platform ব্যবহারে সাহায্য করো।

## Chatcat কী?
Chatcat হলো Facebook Messenger automation platform। এটা automatically order নেয়, AI দিয়ে product detect করে, courier book করে, accounting করে। Price: ৳৬৯৯/মাস platform fee + prepaid AI wallet।

## সব পেজের বিবরণ:

### ওভারভিউ (OVERVIEW)
আজকের orders সংখ্যা, revenue summary, pending agent tasks, সাম্প্রতিক order notifications।

### এজেন্ট টাস্ক (AGENT_TASKS)
AI-generated action items — কোন order confirm করতে হবে, কোন customer কে follow up করতে হবে। Task complete করলে সেটা সরে যায়।

### অর্ডার (ORDERS)
সব order list। Status: RECEIVED → CONFIRMED → DELIVERED (বা CANCELLED/RETURNED)। Filter by date/status/courier। Bulk print, bulk status update। Order manually add করা যায়।

### কুরিয়ার (COURIER)
Pathao, Steadfast, RedX, Paperfly — courier API integration। Order book করা, consignment create, tracking, return management। Settings-এ API key দিতে হয়।

### প্রিন্ট / ইনভয়েস (PRINT)
Single বা bulk invoice print। Template customize করা যায় Memo Template পেজ থেকে। PDF export সাপোর্টেড।

### প্রোডাক্ট (PRODUCTS)
Product catalog management। Product code, price, stock, image add করা। OCR feature দিয়ে Facebook post-এর ছবি থেকে auto product detection হয়।

### ওয়েবসাইট / ক্যাটালগ (CATALOG)
Public product catalog। Shareable link পাওয়া যায়। Customer সেখান থেকে দেখতে পারে।

### হিসাব (ACCOUNTING)
Revenue, expenses, profit calculation। COD collection tracking। Courier charge auto-deduct। Monthly report।

### অ্যানালিটিক্স (ANALYTICS)
Sales trends, best selling products, customer behavior, time-based reports, week-over-week growth।

### বট নলেজ (BOT_KNOWLEDGE)
Bot training data। Keywords, intents, greeting message, FAQ। Bot কে কী বলতে হবে সেটা এখান থেকে শেখানো হয়।

### কাস্টমার / CRM (CRM)
Customer profiles, order history, tags (VIP/blocked), segment। Customer export করা যায়।

### ব্রডকাস্ট (BROADCAST)
Bulk Messenger campaigns। Segmented targeting। Schedule করা যায়। Facebook-এর broadcast limit মানতে হয় (24h window)।

### অটো পোস্ট (AUTO_POST)
Facebook page-এ auto-posting। Schedule করা posts। Image সহ post করা যায়।

### ফলো-আপ (FOLLOWUP)
Automated follow-up sequences। Abandoned order recovery। Delay-based triggers। Sequence pause/resume করা যায়।

### মেমো টেমপ্লেট (MEMO_TEMPLATE)
Custom challan/memo templates। Variable substitution ({{order_id}}, {{customer_name}}, ইত্যাদি)। Invoice print-এ ব্যবহার হয়।

### ফ্রড চেকার (FRAUD_CHECKER)
Customer fraud risk scoring। Phone number check। Blacklist management। Suspicious order pattern detection।

### Facebook পেজ কানেক্ট (CONNECT_FB_PAGE)
Facebook OAuth দিয়ে page connect। Multiple pages add করা যায়। Permission: pages_messaging, pages_manage_metadata দিতে হবে।

### ওয়ালেট (WALLET)
AI usage credits। Balance topup (bKash/card)। Rate: text ৳০.০৫, image ৳০.৩০, voice ৳০.৫০। Balance শেষ হলে bot AI features কাজ করবে না।

### ব্যবসার তথ্য সেটিংস (SETTINGS_BUSINESS)
Business name, address, phone number, logo upload। Invoice-এ এই তথ্য দেখায়।

### ডেলিভারি সেটিংস (SETTINGS_DELIVERY)
Delivery zones, charges, COD settings, payment methods। Zone-wise আলাদা charge রাখা যায়।

### বট মোড সেটিংস (SETTINGS_BOT)
Bot on/off, response delay, human handover mode, language settings। Business bot এবং text fallback AI আলাদাভাবে control করা যায়।

### নলেজ সেটিংস (SETTINGS_KNOWLEDGE)
Product pricing rules, FAQ database, knowledge base text। Bot এই তথ্য দিয়ে customer-কে জানায়।

### কল কনফার্ম সেটিংস (SETTINGS_CALL)
Auto call confirmation flow। Call script customize। Auto call কখন trigger হবে সেটা set করা।

### ভয়েস সেটিংস (SETTINGS_VOICE)
Text-to-speech settings। Bengali voice support। Voice message enable/disable।

## RULES:
- User যে ভাষায় লিখবে (Bengali/Banglish/English) সেই ভাষায় উত্তর দাও
- Concise থাকো — max 3-4 sentences, step-by-step হলে numbered list ব্যবহার করো
- Platform-এর বাইরের বিষয়ে: info@chatcat.pro-তে contact করতে বলো
- Friendly tone রাখো`;

const FALLBACK_REPLY =
  'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।';

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger(SupportChatService.name);
  private readonly geminiKey: string;
  private readonly openaiKey: string;

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY ?? '';
    this.openaiKey = process.env.OPENAI_API_KEY ?? '';
  }

  async chat(
    message: string,
    pageContext: string,
    history: ChatMessage[],
  ): Promise<{ reply: string }> {
    const systemPrompt = this.buildSystemPrompt(pageContext);

    try {
      const reply = await this.callGemini(message, history, systemPrompt);
      return { reply };
    } catch (geminiErr: any) {
      this.logger.warn(
        `[SupportChat] Gemini failed: ${geminiErr?.message ?? geminiErr} — trying OpenAI fallback`,
      );
      try {
        const reply = await this.callOpenAI(message, history, systemPrompt);
        return { reply };
      } catch (openaiErr: any) {
        this.logger.error(
          `[SupportChat] OpenAI fallback also failed: ${openaiErr?.message ?? openaiErr}`,
        );
        return { reply: FALLBACK_REPLY };
      }
    }
  }

  private buildSystemPrompt(pageContext: string): string {
    const pageName = PAGE_NAMES[pageContext] ?? '';
    const contextLine = pageName
      ? `\n\n## বর্তমান পেজ:\nব্যবহারকারী এখন "${pageName}" পেজে আছেন। এই পেজ সংক্রান্ত প্রশ্নে বিশেষভাবে সাহায্য করুন।`
      : '';
    return BASE_SYSTEM_PROMPT + contextLine;
  }

  private async callGemini(
    message: string,
    history: ChatMessage[],
    systemPrompt: string,
  ): Promise<string> {
    if (!this.geminiKey) throw new Error('No GEMINI_API_KEY');

    const contents = [
      ...history.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text.trim()) throw new Error('Gemini returned empty response');
    return text.trim();
  }

  private async callOpenAI(
    message: string,
    history: ChatMessage[],
    systemPrompt: string,
  ): Promise<string> {
    if (!this.openaiKey) throw new Error('No OPENAI_API_KEY');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        temperature: 0.7,
        messages,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    const text: string =
      (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error('OpenAI returned empty response');
    return text;
  }
}
