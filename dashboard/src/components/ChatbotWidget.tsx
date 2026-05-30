import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, useApi } from '../hooks/useApi';

function LizaAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: '50%', display: 'block' }}>
      <defs>
        <linearGradient id="liza-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="liza-face" x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde8d8" />
          <stop offset="100%" stopColor="#fcd5bd" />
        </linearGradient>
        <linearGradient id="liza-hair" x1="12" y1="8" x2="52" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>
      {/* Background circle */}
      <circle cx="32" cy="32" r="32" fill="url(#liza-bg)" />
      {/* Hair back */}
      <ellipse cx="32" cy="25" rx="13" ry="16" fill="url(#liza-hair)" />
      {/* Face — slim oval */}
      <ellipse cx="32" cy="31" rx="10.5" ry="13.5" fill="url(#liza-face)" />
      {/* Hair top/sides */}
      <path d="M19 25 Q18 10 32 8 Q46 10 45 25 Q43 14 32 13 Q21 14 19 25Z" fill="url(#liza-hair)" />
      {/* Side hair strands */}
      <path d="M21 29 Q17 34 18 41 Q20 35 22 31Z" fill="url(#liza-hair)" />
      <path d="M43 29 Q47 34 46 41 Q44 35 42 31Z" fill="url(#liza-hair)" />
      {/* Eyes */}
      <ellipse cx="27" cy="28.5" rx="2.2" ry="2.7" fill="#1e1b4b" />
      <ellipse cx="37" cy="28.5" rx="2.2" ry="2.7" fill="#1e1b4b" />
      {/* Eye shine */}
      <circle cx="28" cy="27.4" r="0.8" fill="white" />
      <circle cx="38" cy="27.4" r="0.8" fill="white" />
      {/* Eyebrows */}
      <path d="M24.5 25.2 Q27 23.8 29.5 25.2" stroke="#312e81" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M34.5 25.2 Q37 23.8 39.5 25.2" stroke="#312e81" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      {/* Nose */}
      <circle cx="32" cy="33" r="0.7" fill="#e8a98a" />
      {/* Smile */}
      <path d="M28.5 37 Q32 40.5 35.5 37" stroke="#c97b5a" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      {/* Cheeks */}
      <ellipse cx="22.5" cy="34.5" rx="2.8" ry="1.8" fill="#f9a8d4" opacity="0.45" />
      <ellipse cx="41.5" cy="34.5" rx="2.8" ry="1.8" fill="#f9a8d4" opacity="0.45" />
      {/* Shirt/body */}
      <path d="M22 54 Q22 47 32 45 Q42 47 42 54 L42 64 L22 64Z" fill="#6366f1" />
      {/* Collar */}
      <path d="M28 45 L32 51 L36 45" stroke="#a5b4fc" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Star/sparkle decoration */}
      <path d="M50 10 L51 13 L54 14 L51 15 L50 18 L49 15 L46 14 L49 13Z" fill="#fbbf24" opacity="0.9" />
    </svg>
  );
}

type NavKey =
  | 'OVERVIEW' | 'AGENT_TASKS' | 'ORDERS' | 'PRODUCTS' | 'ACCOUNTING'
  | 'ANALYTICS' | 'BOT_KNOWLEDGE' | 'PRINT' | 'MEMO_TEMPLATE' | 'CRM'
  | 'COURIER' | 'BROADCAST' | 'FOLLOWUP' | 'CATALOG' | 'FRAUD_CHECKER'
  | 'AUTO_POST' | 'WALLET' | 'CONNECT_FB_PAGE'
  | 'SETTINGS_BUSINESS' | 'SETTINGS_DELIVERY' | 'SETTINGS_BOT'
  | 'SETTINGS_KNOWLEDGE' | 'SETTINGS_CALL' | 'SETTINGS_VOICE';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  currentPage: NavKey;
  dark: boolean;
  pageId?: number;
}

const PAGE_LABELS: Record<NavKey, string> = {
  OVERVIEW: 'ওভারভিউ',
  AGENT_TASKS: 'এজেন্ট টাস্ক',
  ORDERS: 'অর্ডার',
  COURIER: 'কুরিয়ার',
  PRINT: 'প্রিন্ট',
  PRODUCTS: 'প্রোডাক্ট',
  CATALOG: 'ক্যাটালগ',
  ACCOUNTING: 'হিসাব',
  ANALYTICS: 'অ্যানালিটিক্স',
  BOT_KNOWLEDGE: 'বট নলেজ',
  CRM: 'কাস্টমার',
  BROADCAST: 'ব্রডকাস্ট',
  AUTO_POST: 'অটো পোস্ট',
  FOLLOWUP: 'ফলো-আপ',
  MEMO_TEMPLATE: 'মেমো টেমপ্লেট',
  FRAUD_CHECKER: 'ফ্রড চেকার',
  CONNECT_FB_PAGE: 'FB পেজ',
  WALLET: 'ওয়ালেট',
  SETTINGS_BUSINESS: 'বিজনেস সেটিংস',
  SETTINGS_DELIVERY: 'ডেলিভারি সেটিংস',
  SETTINGS_BOT: 'বট সেটিংস',
  SETTINGS_KNOWLEDGE: 'নলেজ সেটিংস',
  SETTINGS_CALL: 'কল সেটিংস',
  SETTINGS_VOICE: 'ভয়েস সেটিংস',
};

const PAGE_SUGGESTIONS: Record<NavKey, string[]> = {
  OVERVIEW: [
    'আজকের কতটা অর্ডার এসেছে?',
    'ওভারভিউতে কী কী দেখা যায়?',
    'Agent Tasks কীভাবে কাজ করে?',
    'Pending notifications কোথায় দেখব?',
    'Dashboard এর তথ্য কীভাবে refresh হয়?',
  ],
  AGENT_TASKS: [
    'Agent Tasks কীভাবে কাজ করে?',
    'Task complete করব কীভাবে?',
    'কোন task গুলো manually করতে হয়?',
    'Task pending থাকলে কী করব?',
    'নতুন task কীভাবে তৈরি হয়?',
  ],
  ORDERS: [
    'নতুন অর্ডার কীভাবে যোগ করব?',
    'অর্ডার status পরিবর্তন করব কীভাবে?',
    'কুরিয়ারে order পাঠাব কীভাবে?',
    'Bulk print কীভাবে করব?',
    'Cancelled order filter করব কীভাবে?',
  ],
  COURIER: [
    'Pathao-এ order book করব কীভাবে?',
    'Courier API connect করব কীভাবে?',
    'Delivery charge কীভাবে set করব?',
    'Return shipment track করব কীভাবে?',
    'Steadfast vs Pathao কোনটা ভালো?',
  ],
  PRINT: [
    'Invoice print করব কীভাবে?',
    'Bulk invoice print করা যায়?',
    'Invoice template কীভাবে customize করব?',
    'Print-এ logo যোগ করব কীভাবে?',
    'PDF export করা যায়?',
  ],
  PRODUCTS: [
    'নতুন product add করব কীভাবে?',
    'Product code কী এবং কেন দরকার?',
    'OCR দিয়ে product কীভাবে detect হয়?',
    'Product image upload করব কীভাবে?',
    'Stock update করব কীভাবে?',
  ],
  CATALOG: [
    'Public catalog কীভাবে share করব?',
    'Catalog-এ কোন products দেখাবে?',
    'Catalog link কোথায় পাব?',
    'Customer catalog থেকে order দিতে পারে?',
    'Catalog customize করা যায়?',
  ],
  ACCOUNTING: [
    'মোট profit কীভাবে দেখব?',
    'Expense add করব কীভাবে?',
    'Monthly report export করা যায়?',
    'COD collection record করব কীভাবে?',
    'Courier charge কি automatically ধরা হয়?',
  ],
  ANALYTICS: [
    'Best selling product কোনটি?',
    'Revenue trend কোথায় দেখব?',
    'কোন সময়ে বেশি order আসে?',
    'Customer retention rate দেখব কীভাবে?',
    'Analytics কতদিনের data দেখায়?',
  ],
  BOT_KNOWLEDGE: [
    'Bot reply কীভাবে customize করব?',
    'নতুন keyword add করব কীভাবে?',
    'Greeting message set করব কীভাবে?',
    'Bot Bengali বোঝে?',
    'Bot কীভাবে test করব?',
  ],
  CRM: [
    'Customer order history দেখব কীভাবে?',
    'Customer block করব কীভাবে?',
    'VIP tag দেব কীভাবে?',
    'Customer data export করা যায়?',
    'Customer segment তৈরি করব কীভাবে?',
  ],
  BROADCAST: [
    'Broadcast message পাঠাব কীভাবে?',
    'Facebook broadcast limit কত?',
    'Schedule করে broadcast পাঠানো যায়?',
    'Targeted broadcast কীভাবে করব?',
    'Broadcast fail হলে কী করব?',
  ],
  AUTO_POST: [
    'Auto post কীভাবে schedule করব?',
    'Image সহ auto post করা যায়?',
    'Post template কীভাবে তৈরি করব?',
    'Auto post বন্ধ করব কীভাবে?',
    'Multiple page-এ একসাথে post করা যায়?',
  ],
  FOLLOWUP: [
    'Follow-up sequence কীভাবে তৈরি করব?',
    'Abandoned order-এ follow-up দেওয়া যায়?',
    'Follow-up delay কীভাবে set করব?',
    'Follow-up pause করব কীভাবে?',
    'Follow-up message customize করব কীভাবে?',
  ],
  MEMO_TEMPLATE: [
    'নতুন memo template কীভাবে তৈরি করব?',
    'Template-এ variable কীভাবে ব্যবহার করব?',
    'Default template কোনটি?',
    'Template PDF export করা যায়?',
    'Template-এ logo add করব কীভাবে?',
  ],
  FRAUD_CHECKER: [
    'Fraud checker কীভাবে কাজ করে?',
    'Phone number check করব কীভাবে?',
    'Fraud customer block করব কীভাবে?',
    'Fraud score কীভাবে calculate হয়?',
    'False positive হলে কী করব?',
  ],
  CONNECT_FB_PAGE: [
    'Facebook page connect করব কীভাবে?',
    'কোন permission গুলো দিতে হবে?',
    'Connect fail হলে কী করব?',
    'Multiple page add করা যায়?',
    'Page disconnect করব কীভাবে?',
  ],
  WALLET: [
    'Wallet-এ balance add করব কীভাবে?',
    'AI usage charge কত?',
    'Balance শেষ হলে কী হয়?',
    'Transaction history কোথায় দেখব?',
    'AI কত টাকা খরচ হচ্ছে দেখব?',
  ],
  SETTINGS_BUSINESS: [
    'Business name কীভাবে পরিবর্তন করব?',
    'Logo upload করব কীভাবে?',
    'Contact number update করব কীভাবে?',
    'Business address কোথায় set করব?',
    'বিজনেস ইনফো invoice-এ দেখাবে?',
  ],
  SETTINGS_DELIVERY: [
    'Default delivery charge কীভাবে set করব?',
    'Zone-wise charge কীভাবে configure করব?',
    'COD charge আলাদা রাখা যায়?',
    'Payment method কীভাবে যোগ করব?',
    'Free delivery threshold set করা যায়?',
  ],
  SETTINGS_BOT: [
    'Bot on/off করব কীভাবে?',
    'Human handover কীভাবে কাজ করে?',
    'Response delay set করব কীভাবে?',
    'Bot mode পরিবর্তন করব কীভাবে?',
    'Bot কোন ভাষায় reply করবে?',
  ],
  SETTINGS_KNOWLEDGE: [
    'Product knowledge কীভাবে update করব?',
    'Price list bot-এ কীভাবে দেব?',
    'FAQ কীভাবে add করব?',
    'Knowledge base test করব কীভাবে?',
    'Pricing rules কীভাবে configure করব?',
  ],
  SETTINGS_CALL: [
    'Call confirm কীভাবে কাজ করে?',
    'Call script কীভাবে customize করব?',
    'Auto call কখন trigger হয়?',
    'Call log কোথায় দেখব?',
    'Call confirm বন্ধ করব কীভাবে?',
  ],
  SETTINGS_VOICE: [
    'Voice message কীভাবে enable করব?',
    'Bengali voice support আছে?',
    'Voice message charge কত?',
    'TTS ভয়েস কীভাবে পরিবর্তন করব?',
    'Voice quality কীভাবে improve করব?',
  ],
};

export function ChatbotWidget({ currentPage, dark, pageId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [liveSummary, setLiveSummary] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { request } = useApi();

  const bg = dark ? '#1a1b2e' : '#ffffff';
  const surface = dark ? '#252640' : '#f3f4f6';
  const border = dark ? '#2e3050' : '#e5e7eb';
  const text = dark ? '#e2e3f0' : '#111827';
  const muted = dark ? '#6b7280' : '#9ca3af';
  const accent = '#6366f1';
  const userBubble = accent;
  const aiBubble = dark ? '#252640' : '#f3f4f6';
  const aiText = text;

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setLoading(true);

    try {
      const res = await request<{ reply: string }>(`${API_BASE}/support-chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          pageContext: currentPage,
          history: messages.slice(-10),
          liveData: liveSummary ?? undefined,
        }),
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleOpen = async () => {
    setOpen(true);
    setMessages([]);
    setShowSuggestions(true);
    setInput('');
    if (pageId) {
      try {
        const [summary, senders] = await Promise.all([
          request<any>(`${API_BASE}/client-dashboard/${pageId}/summary`),
          request<any>(`${API_BASE}/client-dashboard/${pageId}/sender-count`),
        ]);
        setLiveSummary({ ...summary, uniqueSenders: senders?.uniqueSenders ?? 0 });
      } catch {
        // non-critical — chatbot still works without live data
      }
    }
  };

  const handleClose = () => setOpen(false);

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth < 768;

  const suggestions = PAGE_SUGGESTIONS[currentPage] ?? [];
  const pageLabel = PAGE_LABELS[currentPage] ?? '';

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9500 }}>
      {/* Chat Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, top: 'auto', borderRadius: '16px 16px 0 0', width: '100%' }
              : { right: 24, bottom: 88, width: 370, borderRadius: 16 }),
            height: isMobile ? '85vh' : 520,
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9500,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: dark ? '#1e1f35' : '#f9fafb',
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <LizaAvatar size={38} />
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 10, height: 10, borderRadius: '50%',
                background: '#22c55e',
                border: `2px solid ${dark ? '#1e1f35' : '#f9fafb'}`,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: text, letterSpacing: -0.2 }}>
                Liza ✨
              </div>
              <div style={{ fontSize: 11, color: '#22c55e', marginTop: 1, fontWeight: 600 }}>
                ● অনলাইন · AI সহকারী
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: muted,
                cursor: 'pointer',
                padding: 4,
                fontSize: 18,
                lineHeight: 1,
                borderRadius: 6,
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 14px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Welcome */}
            <div
              style={{
                background: aiBubble,
                color: aiText,
                borderRadius: '4px 14px 14px 14px',
                padding: '10px 13px',
                fontSize: 13.5,
                lineHeight: 1.5,
                maxWidth: '88%',
              }}
            >
              👋 হ্যালো! আমি <strong>Liza</strong> — Chatcat-এর AI সহকারী। <strong>{pageLabel}</strong> পেজের অর্ডার, পণ্য, বিক্রি সব বিষয়ে আমাকে জিজ্ঞেস করুন!
            </div>

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: muted, paddingLeft: 2 }}>
                  সাধারণ প্রশ্ন:
                </div>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    style={{
                      background: 'none',
                      border: `1px solid ${border}`,
                      borderRadius: 20,
                      padding: '7px 13px',
                      fontSize: 12.5,
                      color: dark ? '#a5b4fc' : accent,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background = dark ? '#2a2b45' : '#eef2ff')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background = 'none')
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Chat messages */}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    background: m.role === 'user' ? userBubble : aiBubble,
                    color: m.role === 'user' ? '#fff' : aiText,
                    borderRadius:
                      m.role === 'user'
                        ? '14px 4px 14px 14px'
                        : '4px 14px 14px 14px',
                    padding: '10px 13px',
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    maxWidth: '88%',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: 5, padding: '6px 4px', alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: muted,
                      animation: `chatbotDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: `1px solid ${border}`,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
              background: dark ? '#1e1f35' : '#f9fafb',
              flexShrink: 0,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="প্রশ্ন করুন..."
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                background: surface,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13.5,
                color: text,
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                maxHeight: 100,
                overflowY: 'auto',
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 100) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: !input.trim() || loading ? (dark ? '#2e3050' : '#e5e7eb') : accent,
                border: 'none',
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: !input.trim() || loading ? muted : '#fff',
                fontSize: 16,
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={open ? handleClose : handleOpen}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${accent}, #8b5cf6)`,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          color: '#fff',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
        title="Liza — AI সহকারী"
      >
        {open ? (
          <span style={{ fontSize: 20, fontWeight: 700 }}>✕</span>
        ) : (
          <LizaAvatar size={52} />
        )}
      </button>

      {/* Typing animation keyframes */}
      <style>{`
        @keyframes chatbotDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes liza-pulse {
          0%,100% { box-shadow: 0 4px 20px rgba(99,102,241,0.5); }
          50% { box-shadow: 0 4px 28px rgba(139,92,246,0.7); }
        }
      `}</style>
    </div>
  );
}
