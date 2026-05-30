import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, useApi } from '../hooks/useApi';

function LizaAvatar({ size }: { size: number }) {
  const id = 'lz';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: '50%', display: 'block' }}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
        <linearGradient id={`${id}-skin`} x1="32" y1="14" x2="32" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDDBB4" />
          <stop offset="100%" stopColor="#F5C28A" />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="20" y1="6" x2="44" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2d1b69" />
          <stop offset="60%" stopColor="#1a0a3d" />
          <stop offset="100%" stopColor="#0f0720" />
        </linearGradient>
        <linearGradient id={`${id}-dress`} x1="32" y1="44" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={`${id}-lip`} x1="27" y1="37" x2="37" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e05a7a" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Background */}
      <circle cx="32" cy="32" r="32" fill={`url(#${id}-bg)`} />

      {/* Subtle bg glow */}
      <ellipse cx="32" cy="20" rx="18" ry="12" fill="#a78bfa" opacity="0.08" />

      {/* Long hair — back layer flowing down */}
      <path d="M20 26 Q15 44 17 64 L32 64 L47 64 Q49 44 44 26 Q40 15 32 13 Q24 15 20 26Z" fill={`url(#${id}-hair)`} />

      {/* Neck */}
      <rect x="29" y="42" width="6" height="6" rx="2" fill="#F5C28A" />

      {/* Face — slim high-cheekbone oval */}
      <ellipse cx="32" cy="30" rx="9.5" ry="14" fill={`url(#${id}-skin)`} />

      {/* Jaw shadow */}
      <ellipse cx="32" cy="42.5" rx="6.5" ry="2" fill="#d4956a" opacity="0.25" />

      {/* Hair — natural flowing top, NO flat cap shape */}
      <path d="M22 24 Q22 10 32 8 Q42 10 42 24 Q40 15 32 13 Q24 15 22 24Z" fill={`url(#${id}-hair)`} />
      {/* Hair parting detail */}
      <path d="M32 8 Q32.5 11 32 16" stroke="#4c1d95" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Side hair — left, soft curve */}
      <path d="M22 24 Q17 30 18 40 Q19 33 22 28Z" fill={`url(#${id}-hair)`} />
      {/* Side hair — right, soft curve */}
      <path d="M42 24 Q47 30 46 40 Q45 33 42 28Z" fill={`url(#${id}-hair)`} />

      {/* Hair highlight strands */}
      <path d="M29 9 Q30 13 29.5 18" stroke="#6d28d9" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M35 9 Q34 13 34.5 18" stroke="#5b21b6" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.35" />

      {/* Eyebrows — sharp, arched */}
      <path d="M23 21.5 Q26.5 19.5 29.5 21" stroke="#1a0a3d" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M34.5 21 Q37.5 19.5 41 21.5" stroke="#1a0a3d" strokeWidth="1.6" strokeLinecap="round" fill="none" />

      {/* Eyes — almond shaped, more mature */}
      {/* Left eye */}
      <path d="M23.5 26.5 Q26.5 24 29.5 26.5 Q26.5 29.5 23.5 26.5Z" fill="white" />
      <ellipse cx="26.5" cy="26.8" rx="1.9" ry="2.1" fill="#1a0a3d" />
      <circle cx="27.4" cy="25.8" r="0.75" fill="white" />
      <circle cx="25.8" cy="27.5" r="0.35" fill="white" opacity="0.6" />
      {/* Left eyelid line */}
      <path d="M23.5 26.5 Q26.5 24 29.5 26.5" stroke="#1a0a3d" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Left lashes */}
      <path d="M23.5 26.5 L22.5 25.5" stroke="#1a0a3d" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M29.5 26.5 L30.5 25.5" stroke="#1a0a3d" strokeWidth="0.8" strokeLinecap="round" />

      {/* Right eye */}
      <path d="M34.5 26.5 Q37.5 24 40.5 26.5 Q37.5 29.5 34.5 26.5Z" fill="white" />
      <ellipse cx="37.5" cy="26.8" rx="1.9" ry="2.1" fill="#1a0a3d" />
      <circle cx="38.4" cy="25.8" r="0.75" fill="white" />
      <circle cx="36.8" cy="27.5" r="0.35" fill="white" opacity="0.6" />
      {/* Right eyelid line */}
      <path d="M34.5 26.5 Q37.5 24 40.5 26.5" stroke="#1a0a3d" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Right lashes */}
      <path d="M34.5 26.5 L33.5 25.5" stroke="#1a0a3d" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M40.5 26.5 L41.5 25.5" stroke="#1a0a3d" strokeWidth="0.8" strokeLinecap="round" />

      {/* Nose — subtle, elegant */}
      <path d="M31 32 Q32 33.5 33 32" stroke="#d4956a" strokeWidth="0.9" strokeLinecap="round" fill="none" />
      <circle cx="30.5" cy="33" r="0.55" fill="#d4956a" opacity="0.7" />
      <circle cx="33.5" cy="33" r="0.55" fill="#d4956a" opacity="0.7" />

      {/* Lips — full, with gloss */}
      <path d="M27.5 37 Q29.5 35.5 32 36 Q34.5 35.5 36.5 37 Q34 38.5 32 38.5 Q30 38.5 27.5 37Z" fill={`url(#${id}-lip)`} />
      <path d="M27.5 37 Q30 39.5 32 39.5 Q34 39.5 36.5 37" stroke="#9d174d" strokeWidth="0.6" strokeLinecap="round" fill="none" />
      {/* Lip gloss */}
      <ellipse cx="30.5" cy="36.8" rx="1.5" ry="0.5" fill="white" opacity="0.25" />

      {/* Blush — very subtle, high cheekbone */}
      <ellipse cx="23" cy="32" rx="2.2" ry="1.3" fill="#f472b6" opacity="0.14" />
      <ellipse cx="41" cy="32" rx="2.2" ry="1.3" fill="#f472b6" opacity="0.14" />

      {/* Earring — left */}
      <circle cx="22.5" cy="31" r="1.1" fill="#a78bfa" />
      <circle cx="22.5" cy="33.2" r="0.75" fill="#c4b5fd" />
      {/* Earring — right */}
      <circle cx="41.5" cy="31" r="1.1" fill="#a78bfa" />
      <circle cx="41.5" cy="33.2" r="0.75" fill="#c4b5fd" />

      {/* Dress / top */}
      <path d="M20 56 Q21 47 27 45 L32 48 L37 45 Q43 47 44 56 L44 64 L20 64Z" fill={`url(#${id}-dress)`} />
      {/* Neckline V */}
      <path d="M27 45 Q32 50 37 45" stroke="#818cf8" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      {/* Dress shimmer */}
      <path d="M24 50 Q28 48 32 49 Q36 48 40 50" stroke="#a5b4fc" strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Subtle sparkle top-right */}
      <path d="M52 9 L53 12 L56 13 L53 14 L52 17 L51 14 L48 13 L51 12Z" fill="#fbbf24" opacity="0.85" />
      <circle cx="56" cy="8" r="1" fill="#fde68a" opacity="0.6" />
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
