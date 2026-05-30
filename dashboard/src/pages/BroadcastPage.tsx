import { useCallback, useEffect, useState } from 'react';
import { CardHeader, FieldWithInfo, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280', running: '#3b82f6', completed: '#16a34a', failed: '#ef4444',
};

const TARGET_OPTS = [
  { value: 'all',            label: 'সবাই',             desc: 'সব active customer', safe: true },
  { value: 'ordered_before', label: 'আগে Order করেছে',  desc: 'নির্দিষ্ট তারিখের আগে order করেছে', safe: true },
  { value: 'tag',            label: 'Tag অনুযায়ী',      desc: 'নির্দিষ্ট tag এর customer', safe: true },
  { value: 'never_ordered',  label: 'কখনো Order করেনি', desc: 'কোনো order করেনি — re-engagement', safe: true },
];

const BROADCAST_TEMPLATES: {
  id: string; category: string; title: string; message: string; emoji: string; tag: 'promo' | 'update' | 'reengagement';
}[] = [
  {
    id: 'new_collection', category: '🆕 নতুন Collection', title: 'New Collection Launch', emoji: '🎉', tag: 'promo',
    message: `🎉 নতুন কালেকশন এসেছে!\n\nআমাদের latest collection দেখতে এখনই message করুন 💖\nসীমিত stock — তাড়াতাড়ি order করুন!\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'eid_collection', category: '🆕 নতুন Collection', title: 'Eid Special Collection', emoji: '🌙', tag: 'promo',
    message: `🌙 ঈদ স্পেশাল কালেকশন এসেছে!\n\nএই ঈদে নিজেকে সাজিয়ে তুলুন আমাদের exclusive collection দিয়ে ✨\nProduct দেখতে product code পাঠান 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'flash_sale', category: '💸 Offer & Discount', title: 'Flash Sale', emoji: '🔥', tag: 'promo',
    message: `🔥 FLASH SALE চলছে!\n\nআজকেই order করুন — বিশেষ ছাড় পাচ্ছেন 🎁\nএই offer সীমিত সময়ের জন্য!\n\nআজই message করুন 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'discount_offer', category: '💸 Offer & Discount', title: 'Special Discount', emoji: '🎁', tag: 'promo',
    message: `🎁 বিশেষ ছাড়ের অফার!\n\nআমাদের selected products এ এখন special discount চলছে।\nCode পাঠিয়ে price জেনে নিন 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'restock', category: '📦 Stock Update', title: 'Back in Stock', emoji: '📦', tag: 'update',
    message: `📦 Stock এ ফিরে এসেছে!\n\nআপনাদের পছন্দের product আবার available।\nএবার দেরি না করে order করুন 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'last_stock', category: '📦 Stock Update', title: 'Last Few Pieces', emoji: '⚡', tag: 'update',
    message: `⚡ মাত্র কিছু pieces বাকি!\n\nআপনার পছন্দের product এর stock শেষ হয়ে যাচ্ছে।\nএখনই order করুন, না হলে পরে নাও পেতে পারেন! 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'order_update', category: '🚚 Order & Delivery', title: 'Order Confirmed', emoji: '✅', tag: 'update',
    message: `✅ আপনার order confirm হয়েছে!\n\nআমরা আপনার order প্রস্তুত করছি। শীঘ্রই delivery দেওয়া হবে 💖\nকোনো সমস্যা হলে আমাদের জানান।`,
  },
  {
    id: 'delivery_update', category: '🚚 Order & Delivery', title: 'Delivery Update', emoji: '🚚', tag: 'update',
    message: `🚚 Delivery Update\n\nআপনার order রাস্তায় আছে! শীঘ্রই পৌঁছে যাবে 💖\nকোনো সমস্যা হলে আমাদের জানান।`,
  },
  {
    id: 'miss_you', category: '💌 Re-engagement', title: 'Miss You', emoji: '💌', tag: 'reengagement',
    message: `💌 আপনাকে অনেকদিন দেখছি না!\n\nআমাদের নতুন collection দেখেছেন?\nএখনই message করুন, আপনার জন্য special offer আছে 🎁\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'feedback', category: '💌 Re-engagement', title: 'Feedback Request', emoji: '⭐', tag: 'reengagement',
    message: `⭐ আপনার মতামত জানান!\n\nআমাদের service কেমন লাগলো?\nআপনার feedback আমাদের আরো ভালো করতে সাহায্য করে 💖`,
  },
  {
    id: 'winter_collection', category: '🌸 Seasonal', title: 'Winter Collection', emoji: '❄️', tag: 'promo',
    message: `❄️ শীতের কালেকশন এসেছে!\n\nএই শীতে warm ও stylish থাকুন আমাদের collection দিয়ে 🧣\nProduct দেখতে এখনই message করুন 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
  {
    id: 'puja_offer', category: '🌸 Seasonal', title: 'Puja Special', emoji: '🪔', tag: 'promo',
    message: `🪔 পূজা স্পেশাল অফার!\n\nএই পূজায় আপনার প্রিয়জনদের জন্য special gift বেছে নিন।\nআমাদের collection দেখতে message করুন 💖\n\n(বন্ধ করতে STOP লিখুন)`,
  },
];

const CATEGORIES = [...new Set(BROADCAST_TEMPLATES.map((t) => t.category))];

// How many days since last broadcast (from localStorage per pageId)
function getLastBroadcastDays(pageId: number): number | null {
  try {
    const raw = localStorage.getItem(`bc_last_${pageId}`);
    if (!raw) return null;
    const diff = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  } catch { return null; }
}

function setLastBroadcast(pageId: number) {
  try { localStorage.setItem(`bc_last_${pageId}`, String(Date.now())); } catch { /**/ }
}

// ── Compliance checklist before sending ──────────────────────────────────────
function ComplianceModal({ th, onConfirm, onCancel, copy }: {
  th: Theme;
  onConfirm: () => void;
  onCancel: () => void;
  copy: (bn: string, en: string) => string;
}) {
  const [checked, setChecked] = useState([false, false, false, false]);
  const allChecked = checked.every(Boolean);

  const items = [
    copy('আমার customer রা নিজেরাই আমার page এ message করেছে', 'My customers have previously messaged my page themselves'),
    copy('এই message টি promotional spam নয় — customer এর কাজে লাগবে', 'This message provides value — not just a hard sell'),
    copy('Message এ "STOP লিখুন" বা opt-out option আছে', 'The message includes an opt-out option (e.g. "STOP লিখুন")'),
    copy('এই মাসে আমি ইতিমধ্যে ২-৩ বারের বেশি broadcast দিইনি', 'I have not sent more than 2-3 broadcasts this month'),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000066', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: th.panel, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', border: `1px solid ${th.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: th.text }}>
          ✅ {copy('পাঠানোর আগে নিশ্চিত করুন', 'Confirm before sending')}
        </div>
        <div style={{ fontSize: 13, color: th.muted, marginBottom: 20 }}>
          {copy('নিচের সব শর্ত মানলে টিক দিন, তারপর পাঠান।', 'Check all items below to confirm compliance, then send.')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {items.map((item, i) => (
            <label key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => setChecked((prev) => prev.map((v, j) => j === i ? !v : v))}
                style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: th.text, lineHeight: 1.6 }}>{item}</span>
            </label>
          ))}
        </div>

        {/* Facebook policy note */}
        <div style={{ background: '#fef3c744', border: '1px solid #f59e0b44', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', marginBottom: 20 }}>
          ⚠️ {copy('Facebook এর নিয়ম না মানলে page restrict বা block হতে পারে।', 'Violating Facebook\'s policies may result in your page being restricted or blocked.')}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            style={{
              flex: 1, background: allChecked ? '#10b981' : th.border, color: '#fff',
              border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700,
              cursor: allChecked ? 'pointer' : 'not-allowed', opacity: allChecked ? 1 : 0.6,
            }}
          >
            📤 {copy('হ্যাঁ, এখন পাঠান', 'Yes, Send Now')}
          </button>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', color: th.muted, border: `1px solid ${th.border}`, borderRadius: 8, padding: '11px 0', fontSize: 14, cursor: 'pointer' }}>
            {copy('বাতিল করুন', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BroadcastPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [broadcasts, setBroadcasts]   = useState<any[]>([]);
  const [tags, setTags]               = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [sending, setSending]         = useState<number | null>(null);
  const [showNew, setShowNew]         = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showGuide, setShowGuide]     = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [form, setForm] = useState({ title: '', message: '', targetType: 'all', targetValue: '', platform: 'FACEBOOK' });
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [confirmId, setConfirmId]     = useState<number | null>(null);

  const lastDays = getLastBroadcastDays(pageId);
  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bc, tg] = await Promise.all([
        request<any[]>(`${BASE}/broadcast`),
        request<string[]>(`${BASE}/crm/customers/tags`),
      ]);
      setBroadcasts(bc); setTags(tg);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  const generateDraft = async () => {
    if (!form.title.trim()) return onToast(copy('আগে Title দিন', 'Enter a title first'), 'error');
    setGeneratingDraft(true);
    try {
      const result = await request<{ text: string | null }>(`${API_BASE}/ai-generate/broadcast`, {
        method: 'POST',
        body: JSON.stringify({ pageId, title: form.title, targetType: form.targetType }),
      });
      if (result?.text) {
        const withOptOut = result.text.includes('STOP') ? result.text : `${result.text}\n\n(বন্ধ করতে STOP লিখুন)`;
        setForm((f) => ({ ...f, message: withOptOut }));
        onToast(copy('AI draft তৈরি হয়েছে ✓', 'AI draft generated ✓'), 'success');
      } else {
        onToast(copy('AI draft তৈরি করা সম্ভব হয়নি', 'Could not generate draft'), 'error');
      }
    } catch (e: any) {
      onToast(e.message ?? copy('AI draft ব্যর্থ হয়েছে', 'AI draft failed'), 'error');
    } finally { setGeneratingDraft(false); }
  };

  const applyTemplate = (t: typeof BROADCAST_TEMPLATES[0]) => {
    setForm((f) => ({ ...f, title: t.title, message: t.message }));
    setShowTemplates(false);
    setShowNew(true);
    onToast(copy(`✅ "${t.title}" template applied`, `✅ "${t.title}" template applied`));
  };

  const create = async () => {
    if (!form.title.trim() || !form.message.trim()) return onToast(copy('Title এবং Message দিন', 'Enter both title and message'), 'error');
    try {
      await request(`${BASE}/broadcast`, { method: 'POST', body: JSON.stringify(form) });
      onToast(copy('✅ Broadcast তৈরি হয়েছে', '✅ Broadcast created'));
      setShowNew(false);
      setForm({ title: '', message: '', targetType: 'all', targetValue: '', platform: 'FACEBOOK' });
      await load();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const confirmAndSend = (id: number) => setConfirmId(id);

  const send = async (id: number) => {
    setConfirmId(null);
    setSending(id);
    try {
      const r = await request<any>(`${BASE}/broadcast/${id}/send`, { method: 'POST' });
      setLastBroadcast(pageId);
      onToast(copy(`✅ শুরু হয়েছে — ${r.totalTarget} জন পাবে`, `✅ Started — ${r.totalTarget} recipients`));
      await load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSending(null); }
  };

  const del = async (id: number) => {
    try {
      await request(`${BASE}/broadcast/${id}`, { method: 'DELETE' });
      onToast(copy('✅ Deleted', '✅ Deleted')); await load();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const hasOptOut = form.message.includes('STOP');
  const charCount = form.message.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Compliance modal */}
      {confirmId !== null && (
        <ComplianceModal
          th={th}
          copy={copy}
          onConfirm={() => send(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: th.text }}>📣 Broadcast</div>
          <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>
            {copy('সব বা নির্দিষ্ট customer দের একসাথে message পাঠান', 'Send messages to all customers or a targeted segment')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={th.btnGhost} onClick={load}>{loading ? <Spinner size={13} /> : '🔄'}</button>
          <button
            style={{ ...th.btnGhost, color: '#6366f1', borderColor: '#6366f144' }}
            onClick={() => setShowGuide((v) => !v)}
          >
            📖 {copy('গাইড', 'Guide')}
          </button>
          <button
            style={{ ...th.btnGhost, color: '#8b5cf6', borderColor: '#8b5cf644' }}
            onClick={() => { setShowTemplates((v) => !v); setShowNew(false); }}
          >
            {showTemplates ? '✕' : copy('📋 Templates', '📋 Templates')}
          </button>
          <button
            style={th.btnPrimary}
            onClick={() => { setShowNew((v) => !v); setShowTemplates(false); }}
          >
            {showNew ? copy('✕ Cancel', '✕ Cancel') : copy('➕ নতুন Broadcast', '➕ New Broadcast')}
          </button>
        </div>
      </div>

      {/* Frequency Warning — if sent recently */}
      {lastDays !== null && lastDays < 7 && (
        <div style={{ background: '#fef3c744', border: '1px solid #f59e0b66', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#92400e', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <div>
            <strong>{copy('সতর্কতা:', 'Heads up:')}</strong>{' '}
            {copy(
              `মাত্র ${lastDays} দিন আগে আপনি broadcast পাঠিয়েছেন। খুব বেশি message পাঠালে customer বিরক্ত হয় এবং Facebook page block হওয়ার ঝুঁকি থাকে। মাসে ২-৩ বারের বেশি না পাঠানো ভালো।`,
              `You sent a broadcast just ${lastDays} day(s) ago. Sending too frequently can annoy customers and risk your page. Aim for no more than 2-3 times per month.`,
            )}
          </div>
        </div>
      )}

      {/* ── GUIDE PANEL ──────────────────────────────────────────────────────── */}
      {showGuide && (
        <div style={{ ...th.card, border: `1.5px solid #6366f144`, background: th.panel }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, color: th.text }}>
            📖 {copy('Broadcast — সঠিক ব্যবহারের গাইড', 'Broadcast — How to Use Responsibly')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              {
                icon: '✅', color: '#10b981',
                title: copy('কারা পাবে?', 'Who receives it?'),
                body: copy('শুধু সেই customer যারা নিজেরাই আপনার page এ আগে message করেছে। অপরিচিত কাউকে পাঠানো সম্ভব না।', 'Only customers who previously messaged your page. You cannot message strangers.'),
              },
              {
                icon: '📅', color: '#3b82f6',
                title: copy('কতবার পাঠাবেন?', 'How often?'),
                body: copy('মাসে সর্বোচ্চ ২-৩ বার। বেশি পাঠালে customer বিরক্ত হয়, আনsubscribe করে এবং page report হওয়ার ঝুঁকি বাড়ে।', 'Max 2-3 times per month. Too frequent = unsubscribes and page reports.'),
              },
              {
                icon: '🛑', color: '#ef4444',
                title: copy('Opt-out রাখুন', 'Include opt-out'),
                body: copy('Message এ অবশ্যই লিখুন "বন্ধ করতে STOP লিখুন"। এটা professional এবং customer এর অধিকার।', 'Always include "Reply STOP to unsubscribe." It\'s professional and respects customer rights.'),
              },
              {
                icon: '🎯', color: '#8b5cf6',
                title: copy('Targeting করুন', 'Target wisely'),
                body: copy('"সবাই" না পাঠিয়ে "আগে order করেছে" বা "নির্দিষ্ট tag" এ পাঠান। সঠিক মানুষকে সঠিক message = বেশি response।', 'Instead of "All", target by order history or tag. Right message to right person = better results.'),
              },
              {
                icon: '💎', color: '#f59e0b',
                title: copy('Value দিন', 'Always add value'),
                body: copy('শুধু "কিনুন কিনুন" না লিখে নতুন তথ্য, exclusive offer, বা helpful update দিন। তাহলে customer আগ্রহী থাকে।', 'Don\'t just sell — share new info, exclusive offers, or helpful updates. Keep it worth reading.'),
              },
              {
                icon: '⚠️', color: '#ef4444',
                title: copy('Facebook Policy', 'Facebook Policy'),
                body: copy('Promotional message শুধু ২৪ ঘণ্টার মধ্যে কথা বলা customer কে পাঠানো technically safe। Order/delivery update যেকোনো সময় পাঠানো যাবে।', 'Promotional messages are technically safe only within 24hrs of customer interaction. Order/delivery updates can be sent anytime.'),
              },
            ].map((item) => (
              <div key={item.title} style={{ background: th.surface, borderRadius: 10, padding: '12px 14px', border: `1px solid ${th.border}` }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: item.color, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: th.muted, lineHeight: 1.7 }}>{item.body}</div>
              </div>
            ))}
          </div>

          {/* Safe frequency tracker */}
          <div style={{ background: '#10b98110', border: '1px solid #10b98133', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#10b981', marginBottom: 8 }}>
              📊 {copy('আপনার Broadcast স্বাস্থ্য', 'Your Broadcast Health')}
            </div>
            <div style={{ fontSize: 12.5, color: th.text, lineHeight: 1.8 }}>
              {lastDays === null
                ? copy('এখনো কোনো broadcast পাঠাননি। শুরু করুন!', 'No broadcasts sent yet. Get started!')
                : lastDays < 3
                  ? `🔴 ${copy(`মাত্র ${lastDays} দিন আগে broadcast পাঠিয়েছেন। একটু অপেক্ষা করুন।`, `You broadcast just ${lastDays} day(s) ago. Wait a bit longer.`)}`
                  : lastDays < 7
                    ? `🟡 ${copy(`${lastDays} দিন আগে broadcast পাঠিয়েছেন। সপ্তাহে একবারের বেশি না পাঠানোই ভালো।`, `Last broadcast was ${lastDays} day(s) ago. Avoid more than once a week.`)}`
                    : `🟢 ${copy(`শেষ broadcast ${lastDays} দিন আগে। পাঠাতে পারেন!`, `Last broadcast was ${lastDays} day(s) ago. You're good to send!`)}`
              }
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATE LIBRARY ─────────────────────────────────────────────────── */}
      {showTemplates && (
        <div style={{ ...th.card, border: `2px solid #8b5cf644` }}>
          <CardHeader
            th={th}
            title={copy('📋 Template Library', '📋 Template Library')}
            sub={copy('একটা template বেছে নিন — তারপর নিজের মতো edit করুন। সব template এ opt-out line আছে।', 'Pick a template and customize it. All templates include an opt-out line.')}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                background: activeCategory === cat ? '#8b5cf6' : th.surface,
                color: activeCategory === cat ? '#fff' : th.muted,
              }}>{cat}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
            {BROADCAST_TEMPLATES.filter((t) => t.category === activeCategory).map((t) => (
              <button key={t.id} onClick={() => applyTemplate(t)} style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${th.border}`, background: th.panel, fontFamily: 'inherit',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#8b5cf6'; (e.currentTarget as HTMLElement).style.background = '#8b5cf608'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = th.border; (e.currentTarget as HTMLElement).style.background = th.panel; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{t.emoji}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: t.tag === 'update' ? '#3b82f622' : t.tag === 'reengagement' ? '#10b98122' : '#f59e0b22',
                    color: t.tag === 'update' ? '#3b82f6' : t.tag === 'reengagement' ? '#10b981' : '#f59e0b',
                  }}>
                    {t.tag === 'update' ? 'Update' : t.tag === 'reengagement' ? 'Re-engage' : 'Promo'}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: th.text }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: th.muted, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.message}
                </div>
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#8b5cf6', fontWeight: 700 }}>
                  {copy('✏️ এটা ব্যবহার করুন →', 'Use this template →')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── NEW BROADCAST FORM ───────────────────────────────────────────────── */}
      {showNew && (
        <div style={{ ...th.card, border: `2px solid ${th.accent}` }}>
          <CardHeader
            th={th}
            title={copy('➕ নতুন Broadcast', '➕ New Broadcast')}
            action={
              !showTemplates && (
                <button style={{ ...th.btnSmGhost, color: '#8b5cf6', fontSize: 12 }} onClick={() => setShowTemplates(true)}>
                  {copy('📋 Template বেছে নিন', '📋 Pick Template')}
                </button>
              )
            }
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FieldWithInfo th={th} label="Title (internal)" helpText={copy('Dashboard এ দেখার জন্য। Customer দেখবে না।', 'For your reference only. Customers will not see this.')}>
              <input style={th.input} placeholder="Summer Collection Launch" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </FieldWithInfo>

            <FieldWithInfo th={th} label={copy('Platform', 'Platform')} helpText={copy('কোন platform এ broadcast পাঠাবেন।', 'Which platform to send the broadcast on.')}>
              <select style={th.input} value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
                <option value="FACEBOOK">💙 Facebook Messenger</option>
                <option value="INSTAGRAM">📸 Instagram DM</option>
                <option value="WHATSAPP">💚 WhatsApp</option>
              </select>
            </FieldWithInfo>

            <FieldWithInfo th={th} label={copy('কাদের পাঠাবেন', 'Target Audience')} helpText={copy('নির্দিষ্ট group এ পাঠালে response বেশি হয়।', 'Targeted segments get better responses than sending to everyone.')}>
              <select style={th.input} value={form.targetType} onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value, targetValue: '' }))}>
                {TARGET_OPTS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                ))}
              </select>
            </FieldWithInfo>

            {form.targetType === 'tag' && (
              <FieldWithInfo th={th} label="Tag" helpText={copy('কোন tag এর customer দের পাঠাবেন।', 'Send to customers with this tag.')}>
                <select style={th.input} value={form.targetValue} onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}>
                  <option value="">{copy('Tag select করুন...', 'Select a tag...')}</option>
                  {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldWithInfo>
            )}

            {form.targetType === 'ordered_before' && (
              <FieldWithInfo th={th} label={copy('তারিখের আগে', 'Before date')} helpText={copy('এই তারিখের আগে order করা customer দের পাঠাবে।', 'Targets customers who ordered before this date.')}>
                <input style={th.input} type="date" value={form.targetValue} onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))} />
              </FieldWithInfo>
            )}

            <FieldWithInfo
              th={th}
              label="Message"
              helpText={copy('Customer যা দেখবে। Emoji ব্যবহার করুন। শেষে "STOP লিখুন" line টা রাখুন।', 'What customers will see. Use emojis. Always include an opt-out line.')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  style={{ ...th.input, height: 130, resize: 'vertical', lineHeight: 1.7 }}
                  placeholder={copy('নতুন কালেকশন এসেছে! 🎉\nদেখতে এখনই message করুন 💖\n\n(বন্ধ করতে STOP লিখুন)', 'Our new collection is here! 🎉\nMessage us to explore it 💖\n\n(Reply STOP to unsubscribe)')}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" style={{ ...th.btnGhost, color: '#8b5cf6', borderColor: '#8b5cf644' }} onClick={generateDraft} disabled={generatingDraft}>
                    {generatingDraft ? copy('AI লিখছে...', 'AI writing...') : copy('✨ AI Draft করুন', '✨ AI Draft')}
                  </button>
                  {!hasOptOut && form.message.trim() && (
                    <button
                      type="button"
                      style={{ ...th.btnGhost, color: '#f59e0b', borderColor: '#f59e0b44', fontSize: 12 }}
                      onClick={() => setForm((f) => ({ ...f, message: f.message + '\n\n(বন্ধ করতে STOP লিখুন)' }))}
                    >
                      + {copy('Opt-out line যোগ করুন', 'Add opt-out line')}
                    </button>
                  )}
                </div>
              </div>
            </FieldWithInfo>

            {/* Inline hints */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, color: charCount > 640 ? '#ef4444' : th.muted }}>
                {charCount} chars{charCount > 640 ? copy(' — অনেক বড়, ছোট করুন', ' — too long, shorten it') : ''}
              </div>
              {hasOptOut
                ? <div style={{ fontSize: 11.5, color: '#10b981', fontWeight: 600 }}>✅ {copy('Opt-out line আছে', 'Opt-out included')}</div>
                : form.message.trim()
                  ? <div style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>⚠️ {copy('Opt-out line নেই', 'Missing opt-out line')}</div>
                  : null
              }
            </div>

            {/* Message preview */}
            {form.message.trim() && (
              <div>
                <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Preview</div>
                <div style={{
                  background: th.accentSoft, border: `1px solid ${th.accent}33`,
                  borderRadius: 14, padding: '12px 16px', fontSize: 13.5, lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', color: th.text, maxWidth: 380,
                }}>
                  {form.message}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={th.btnPrimary} onClick={create}>{copy('💾 Broadcast তৈরি করুন', 'Create Broadcast')}</button>
              <button style={th.btnGhost} onClick={() => setShowNew(false)}>{copy('Cancel', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BROADCAST LIST ───────────────────────────────────────────────────── */}
      {loading && !broadcasts.length
        ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22} /></div>
        : broadcasts.length === 0 && !showNew && !showTemplates
          ? (
            <div style={{ ...th.card, textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📣</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: th.text }}>{copy('কোনো broadcast নেই', 'No broadcasts yet')}</div>
              <div style={{ fontSize: 13, color: th.muted, marginBottom: 20 }}>{copy('Template থেকে শুরু করুন বা নিজে লিখুন', 'Start from a template or write your own')}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button style={{ ...th.btnGhost, color: '#8b5cf6' }} onClick={() => setShowTemplates(true)}>
                  {copy('📋 Template দেখুন', 'Browse Templates')}
                </button>
                <button style={th.btnPrimary} onClick={() => setShowNew(true)}>
                  {copy('➕ নিজে লিখুন', 'Write Your Own')}
                </button>
              </div>
            </div>
          )
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {broadcasts.map((b) => {
                const pct = b.totalTarget > 0 ? Math.round((b.totalSent / b.totalTarget) * 100) : 0;
                return (
                  <div key={b.id} style={{ ...th.card }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: th.text }}>{b.title}</span>
                          <span style={{ ...th.pill, background: `${STATUS_COLORS[b.status]}22`, color: STATUS_COLORS[b.status], border: `1px solid ${STATUS_COLORS[b.status]}44`, fontSize: 10.5 }}>
                            {b.status}
                          </span>
                          <span style={{ ...th.pill, ...th.pillGray, fontSize: 10.5 }}>
                            {TARGET_OPTS.find((t) => t.value === b.targetType)?.label || b.targetType}
                          </span>
                        </div>

                        <div style={{ fontSize: 12.5, color: th.muted, marginBottom: 8, lineHeight: 1.6, background: th.surface, borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${th.accent}`, whiteSpace: 'pre-wrap' }}>
                          {b.message.length > 120 ? b.message.slice(0, 120) + '…' : b.message}
                        </div>

                        {b.status !== 'draft' && (
                          <div style={{ fontSize: 12 }}>
                            <span style={{ color: th.muted }}>Target: <b>{b.totalTarget}</b> · </span>
                            <span style={{ color: '#16a34a' }}>Sent: <b>{b.totalSent}</b> · </span>
                            <span style={{ color: '#ef4444' }}>Failed: <b>{b.totalFailed}</b></span>
                            {b.status === 'completed' && <span style={{ color: th.muted }}> · {pct}% success</span>}
                            {b.totalTarget > 0 && (
                              <div style={{ height: 5, background: th.border, borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: '#16a34a', borderRadius: 999, transition: 'width .5s' }} />
                              </div>
                            )}
                          </div>
                        )}

                        {b.createdAt && (
                          <div style={{ fontSize: 11, color: th.muted, marginTop: 6 }}>
                            {copy('তৈরি:', 'Created:')} {new Date(b.createdAt).toLocaleString()}
                            {b.completedAt && ` · ${copy('শেষ:', 'Done:')} ${new Date(b.completedAt).toLocaleString()}`}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                        {b.status === 'draft' && (
                          <>
                            <button
                              style={{ ...th.btnSmAccent, padding: '7px 14px' }}
                              onClick={() => confirmAndSend(b.id)}
                              disabled={sending === b.id}
                            >
                              {sending === b.id ? <Spinner size={11} /> : copy('📤 পাঠান', 'Send')}
                            </button>
                            <button style={th.btnSmDanger} onClick={() => del(b.id)}>{copy('✕ Delete', 'Delete')}</button>
                          </>
                        )}
                        {b.status === 'running' && (
                          <button style={th.btnGhost} onClick={load}><Spinner size={13} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}
