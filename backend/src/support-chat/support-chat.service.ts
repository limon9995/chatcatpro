import { Injectable, Logger } from '@nestjs/common';
import { ApiKeysService } from '../common/api-keys.service';

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

const BASE_SYSTEM_PROMPT = `তুমি Chatcat ড্যাশবোর্ডের AI সহকারী "Liza"। তুমি Bengali e-commerce seller দের Chatcat platform ব্যবহারে সাহায্য করো।

## Chatcat কী?
Chatcat হলো multi-channel automation platform — Facebook Messenger, WhatsApp Business, Instagram — তিনটাই একসাথে manage করা যায়। Automatically order নেয়, AI দিয়ে product detect করে, courier book করে, accounting করে। Price: ৳৬৯৯/মাস platform fee + prepaid AI wallet।

## Channel সংযোগ (VERY IMPORTANT — এই তথ্য সবসময় সঠিকভাবে দাও):

### Facebook Page Connect
Settings > Connect FB Page থেকে:
- "Access Token" tab → Graph API Explorer (developers.facebook.com/tools/explorer) → আপনার App ও Page select → permissions add → Token generate → paste করুন
- Custom App থাকলে App ID ও App Secret দিন (Settings → Basic থেকে)
- Webhook: api.chatcat.pro/webhook | Permission: pages_messaging, pages_read_engagement, pages_manage_engagement, pages_manage_metadata, pages_show_list, pages_manage_posts

### WhatsApp Setup (Settings > WhatsApp Connection)
WhatsApp সংযোগ করা সম্পূর্ণ সম্ভব। ধাপগুলো:
1. developers.facebook.com → আপনার App → "Add Product" → WhatsApp → "Set Up"
2. App → WhatsApp → "Getting Started" → Phone Number ID copy করুন → Settings-এ দিন
3. business.facebook.com → Settings → Users → System Users → "Add" → নাম দিন, Role: Admin
4. System User → "Add Assets" → Pages → আপনার Page → "Manage Page" ON → Save
5. System User → "Generate New Token" → আপনার App select → permissions: whatsapp_business_messaging, whatsapp_business_management, pages_messaging → "Generate Token"
6. Token (EAAxxxxx...) copy → Settings-এ "Access Token" field-এ দিন
7. Settings-এ "Generate" করে Webhook Verify Token তৈরি করুন
8. developers.facebook.com → App → WhatsApp → Configuration → Callback URL: api.chatcat.pro/wa-webhook + Verify Token দিন → "Verify and Save" → "messages" Subscribe
Webhook URL: https://api.chatcat.pro/wa-webhook

### Instagram Setup (Settings > Instagram Connection)
Instagram automation সম্পূর্ণ সম্ভব। ধাপগুলো:
1. Instagram account-কে Facebook Page-এর সাথে link করুন: Instagram → Settings → Account → Linked accounts → Facebook → Page select
2. developers.facebook.com → App → "Add Product" → "Instagram" → "Set Up" (Graph API, Basic Display নয়)
3. Instagram Business Account ID পেতে: Graph API Explorer → /me?fields=instagram_business_account → "id" value copy → Settings-এ দিন
4. Token-এর জন্য: business.facebook.com → System Users → একই System User → "Generate New Token" → permissions: instagram_basic, instagram_manage_messages, instagram_manage_comments, pages_messaging, pages_read_engagement → Token copy → Settings-এ দিন
5. Webhook: developers.facebook.com → App → Webhooks → "Instagram" → Callback URL: api.chatcat.pro/ig-webhook + Verify Token → Subscribe to "messages" ও "comments"
Webhook URL: https://api.chatcat.pro/ig-webhook

### Custom Meta App (প্রতিটা customer-এর নিজের App)
প্রতিটা customer-এর জন্য আলাদা Meta App তৈরি করা যায়:
- developers.facebook.com → "Create App" → Type: "Business" → App ID ও App Secret নিন
- Connect Page screen-এ "App ID" ও "App Secret" দিন
- এই একটা App দিয়েই Facebook Messenger + WhatsApp + Instagram তিনটাই চলবে
- Webhook HMAC verification customer-এর নিজের App Secret দিয়ে হয় — সম্পূর্ণ secure

## সব পেজের বিবরণ:

### ওভারভিউ (OVERVIEW)
আজকের orders সংখ্যা, revenue summary, pending agent tasks, সাম্প্রতিক order notifications।

### এজেন্ট টাস্ক (AGENT_TASKS)
AI-generated action items — কোন order confirm করতে হবে, কোন customer কে follow up করতে হবে।

### অর্ডার (ORDERS)
সব order list। Status: RECEIVED → CONFIRMED → DELIVERED (বা CANCELLED/RETURNED)। Filter, bulk print, bulk status update। Order manually add করা যায়।

### কুরিয়ার (COURIER)
Pathao, Steadfast, RedX, Paperfly — courier API integration। Order book করা, consignment create, tracking। Settings-এ API key দিতে হয়।

### প্রিন্ট / ইনভয়েস (PRINT)
Single বা bulk invoice print। PDF export। Template: Memo Template পেজ থেকে customize করা যায়।

### প্রোডাক্ট (PRODUCTS)
Product catalog management। Product code, price, stock, image। OCR দিয়ে Facebook post ছবি থেকে auto product detection।

### ওয়েবসাইট / ক্যাটালগ (CATALOG)
Public product catalog। Shareable link। Customer দেখতে পারে।

### হিসাব (ACCOUNTING)
Revenue, expenses, profit। COD collection। Courier charge auto-deduct। Monthly report।

### অ্যানালিটিক্স (ANALYTICS)
Sales trends, best selling products, customer behavior, time-based reports।

### বট নলেজ (BOT_KNOWLEDGE)
Bot training data — keywords, intents, greeting, FAQ। Bot কী বলবে এখান থেকে শেখানো হয়।

### কাস্টমার / CRM (CRM)
Customer profiles, order history, tags (VIP/blocked), segment। Export করা যায়।

### ব্রডকাস্ট (BROADCAST)
Bulk Messenger campaigns। Segmented targeting। Schedule করা যায়।

### অটো পোস্ট (AUTO_POST)
Facebook page-এ auto-posting। Schedule। Image সহ post।

### ফলো-আপ (FOLLOWUP)
Automated follow-up sequences। Abandoned order recovery। Delay-based triggers।

### মেমো টেমপ্লেট (MEMO_TEMPLATE)
Custom challan/memo templates। Variable: {{order_id}}, {{customer_name}} ইত্যাদি।

### ফ্রড চেকার (FRAUD_CHECKER)
Customer fraud risk scoring। Phone check। Blacklist management।

### Facebook পেজ কানেক্ট (CONNECT_FB_PAGE)
Facebook page connect। Multiple pages সাপোর্ট। WhatsApp ও Instagram-এর setup-ও এখান থেকে শুরু। Custom App credentials দেওয়া যায়।

### ওয়ালেট (WALLET)
AI usage credits। Balance topup। Rate: text ৳০.০৫, image ৳০.৩০, voice ৳০.৫০।

### ব্যবসার তথ্য সেটিংস (SETTINGS_BUSINESS)
Business name, address, phone, logo। Invoice-এ দেখায়।

### ডেলিভারি সেটিংস (SETTINGS_DELIVERY)
Delivery zones, charges, COD settings। Zone-wise আলাদা charge।

### বট মোড সেটিংস (SETTINGS_BOT)
Bot on/off, response delay, human handover, language। WhatsApp ও Instagram automation toggle এখানে।

### নলেজ সেটিংস (SETTINGS_KNOWLEDGE)
Product pricing rules, FAQ database, knowledge base।

### কল কনফার্ম সেটিংস (SETTINGS_CALL)
Auto call confirmation flow। Call script customize।

### ভয়েস সেটিংস (SETTINGS_VOICE)
Text-to-speech। Bengali voice। Voice message enable/disable।

## RULES:
- User যে ভাষায় লিখবে (Bengali/Banglish/English) সেই ভাষায় উত্তর দাও
- WhatsApp বা Instagram connect করা যায় কিনা জিজ্ঞেস করলে — অবশ্যই বলো "হ্যাঁ, সম্পূর্ণ সম্ভব" এবং উপরের সঠিক steps দাও
- Concise থাকো — max 4-5 sentences, step-by-step হলে numbered list ব্যবহার করো
- Platform-এর বাইরের বিষয়ে: info@chatcat.pro-তে contact করতে বলো
- Friendly tone রাখো`;

const FALLBACK_REPLY =
  'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।';

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger(SupportChatService.name);
  private readonly geminiKey: string;
  private readonly openaiKey: string;

  constructor(private readonly apiKeysService: ApiKeysService) {
    this.geminiKey = apiKeysService.getSync('geminiApiKey');
    this.openaiKey = apiKeysService.getSync('openaiApiKey');
  }

  async chat(
    message: string,
    pageContext: string,
    history: ChatMessage[],
    liveData?: Record<string, any>,
  ): Promise<{ reply: string }> {
    const systemPrompt = this.buildSystemPrompt(pageContext, liveData);

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

  private buildSystemPrompt(
    pageContext: string,
    liveData?: Record<string, any>,
  ): string {
    const pageName = PAGE_NAMES[pageContext] ?? '';
    const contextLine = pageName
      ? `\n\n## বর্তমান পেজ:\nব্যবহারকারী এখন "${pageName}" পেজে আছেন। এই পেজ সংক্রান্ত প্রশ্নে বিশেষভাবে সাহায্য করুন।`
      : '';

    let liveDataLine = '';
    if (liveData) {
      const m = liveData?.metrics ?? {};
      const pageName2 = liveData?.page?.businessName || liveData?.page?.pageName || '';
      const uniqueSenders = liveData?.uniqueSenders ?? 0;
      liveDataLine = `

## লাইভ ড্যাশবোর্ড ডেটা (এই তথ্য সরাসরি ব্যবহার করো):
- ব্যবসার নাম: ${pageName2 || 'অজানা'}
- মোট অর্ডার: ${m.totalOrders ?? 0}
- কনফার্মড অর্ডার: ${m.confirmedOrders ?? 0}
- পেন্ডিং অর্ডার: ${m.pendingOrders ?? 0}
- ইস্যু অর্ডার: ${m.issueOrders ?? 0}
- মোট প্রোডাক্ট: ${m.products ?? 0}
- পেন্ডিং কল: ${m.pendingCalls ?? 0}
- কনফার্মড কল: ${m.confirmedCalls ?? 0}
- ফেইলড কল: ${m.failedCalls ?? 0}
- ইউনিক মেসেঞ্জার: ${uniqueSenders}

এই তথ্য দিয়ে সরাসরি উত্তর দাও। অন্য পেজে যেতে বলো না।`;
    }

    return BASE_SYSTEM_PROMPT + contextLine + liveDataLine;
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
