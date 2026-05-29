import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner, Toggle } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Settings {
  businessName: string; businessPhone: string; businessAddress: string;
  websiteUrl: string;
  catalogMessengerUrl: string;
  catalogSlug: string;
  currencySymbol: string; codLabel: string; productCodePrefix: string;
  deliveryFeeInsideDhaka: number; deliveryFeeOutsideDhaka: number;
  deliveryTimeText: string;
  paymentMode: string; advanceAmount: number; advanceBkash: string; advanceNagad: string; advancePaymentMessage: string;
  automationOn: boolean; ocrOn: boolean;
  waEnabled: boolean; waPhoneNumberId: string; waVerifyToken: string; waTokenSet: boolean;
  igEnabled: boolean; igBusinessAccountId: string; igVerifyToken: string; igTokenSet: boolean;
  infoModeOn: boolean; orderModeOn: boolean; printModeOn: boolean;
  callConfirmModeOn: boolean; memoSaveModeOn: boolean; memoTemplateModeOn: boolean;
  smartBotOn: boolean;
  businessBotOn: boolean;
  businessInfo: string;
  commentReplyOn: boolean;
  // V18: Image recognition
  imageRecognitionOn: boolean; imageHighConfidence: number;
  imageMediumConfidence: number; imageFallbackAiOn: boolean;
  textFallbackAiOn: boolean;
  pricingPolicy: {
    priceMode: string; allowCustomerOffer: boolean; agentApprovalRequired: boolean;
    fixedPriceReplyText: string; negotiationReplyText: string;
    minNegotiationType: string; minNegotiationValue: number;
  };
  callSettings: {
    callConfirmModeOn: boolean; callMode: string; callConfirmationScope: string;
    initialCallDelayMinutes: number; retryIntervalMinutes: number; maxCallRetries: number; callProvider: string;
  };
  voiceSettings: {
    callLanguage: string; voiceType: string; voiceStyle: string; ttsProvider: string;
    banglaVoiceId: string; englishVoiceId: string;
    banglaCallScript: string; englishCallScript: string;
    banglaVoiceFileUrl: string; englishVoiceFileUrl: string;
    voiceGeneratedAt: string | null;
  };
  modeAccess?: Record<string, boolean>;
  knowledgeText: string;
}

const S0: Settings = {
  businessName: '', businessPhone: '', businessAddress: '',
  websiteUrl: '',
  catalogMessengerUrl: '',
  catalogSlug: '',
  currencySymbol: '৳', codLabel: 'COD', productCodePrefix: 'DF',
  deliveryFeeInsideDhaka: 80, deliveryFeeOutsideDhaka: 120, deliveryTimeText: '',
  paymentMode: 'cod', advanceAmount: 0, advanceBkash: '', advanceNagad: '', advancePaymentMessage: '',
  knowledgeText: '',
  automationOn: false, ocrOn: false,
  waEnabled: false, waPhoneNumberId: '', waVerifyToken: '', waTokenSet: false,
  igEnabled: false, igBusinessAccountId: '', igVerifyToken: '', igTokenSet: false,
  infoModeOn: true, orderModeOn: true, printModeOn: false,
  callConfirmModeOn: false, memoSaveModeOn: false, memoTemplateModeOn: false,
  smartBotOn: false,
  businessBotOn: false,
  businessInfo: '',
  commentReplyOn: false,
  imageRecognitionOn: false, imageHighConfidence: 0.75, imageMediumConfidence: 0.45, imageFallbackAiOn: false, textFallbackAiOn: false,
  pricingPolicy: {
    priceMode: 'FIXED', allowCustomerOffer: false, agentApprovalRequired: true,
    fixedPriceReplyText: 'দুঃখিত, আমাদের price fixed 💖',
    negotiationReplyText: 'আমরা আপনার offer বিবেচনা করব।',
    minNegotiationType: 'PERCENT', minNegotiationValue: 0,
  },
  callSettings: {
    callConfirmModeOn: false, callMode: 'MANUAL', callConfirmationScope: 'ALL',
    initialCallDelayMinutes: 30, retryIntervalMinutes: 30, maxCallRetries: 3, callProvider: '',
  },
  voiceSettings: {
    callLanguage: 'BN', voiceType: 'FEMALE', voiceStyle: 'NATURAL', ttsProvider: 'MANUAL_UPLOAD',
    banglaVoiceId: '', englishVoiceId: '', banglaCallScript: '', englishCallScript: '',
    banglaVoiceFileUrl: '', englishVoiceFileUrl: '', voiceGeneratedAt: null,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 28, marginBottom: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.02em' }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, opacity: 0.5, marginTop: 3 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
      {children}
    </div>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.45 }}>{text}</span>
      {hint && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
            style={{ background: 'rgba(79,70,229,0.1)', border: 'none', cursor: 'pointer', width: 15, height: 15, borderRadius: '50%', fontSize: 9, color: '#4f46e5', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            i
          </button>
          {show && (
            <div style={{
              position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--panel)', border: '1px solid var(--border-md)',
              boxShadow: '0 8px 32px rgba(0,0,0,.12)', borderRadius: 9,
              padding: '9px 12px', width: 200, zIndex: 999,
              fontSize: 11.5, lineHeight: 1.6, pointerEvents: 'none',
            }}>{hint}</div>
          )}
        </span>
      )}
    </div>
  );
}

function SaveRow({ onClick, saving, label = 'Save Changes' }: { onClick: () => void; saving: boolean; label?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
      <button onClick={onClick} disabled={saving} style={{
        padding: '9px 22px', borderRadius: 8, border: 'none',
        background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 13.5,
        cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        boxShadow: '0 1px 4px rgba(79,70,229,.4)',
        opacity: saving ? 0.7 : 1, transition: 'opacity .15s',
      }}>
        {saving && <Spinner size={13} color="#fff"/>} {label}
      </button>
    </div>
  );
}

// ── Voice ID hints per provider ───────────────────────────────────────────────
const VOICE_ID_HINTS: Record<string, { bn: string; en: string; bnPlaceholder: string; enPlaceholder: string }> = {
  GOOGLE: {
    bn: 'Google voice names যেমন: bn-BD-Standard-A (female), bn-BD-Standard-B (male)',
    en: 'Google voice names যেমন: en-US-Standard-C (female), en-US-Standard-D (male)',
    bnPlaceholder: 'bn-BD-Standard-A',
    enPlaceholder: 'en-US-Standard-C',
  },
  ELEVENLABS: {
    bn: 'ElevenLabs voice ID (UUID format) — multilingual_v2 model ব্যবহার করে',
    en: 'ElevenLabs voice ID (UUID format) যেমন: 21m00Tcm4TlvDq8ikWAM (Rachel)',
    bnPlaceholder: '21m00Tcm4TlvDq8ikWAM',
    enPlaceholder: '21m00Tcm4TlvDq8ikWAM',
  },
  AWS_POLLY: {
    bn: 'AWS Polly voice name যেমন: Kajal (Bengali female, neural engine)',
    en: 'AWS Polly voice name যেমন: Joanna (female), Matthew (male), Ruth (neural)',
    bnPlaceholder: 'Kajal',
    enPlaceholder: 'Joanna',
  },
};

const CALL_PROVIDERS = [
  { v: 'MANUAL',      icon: '👤', label: 'Manual Call', desc: 'Agent নিজে call করবে dashboard থেকে' },
  { v: 'SSLWIRELESS', icon: '🇧🇩', label: 'Server 2',    desc: 'Automatic calling server - option 2' },
  { v: 'BDCALLING',   icon: '📲', label: 'Server 3',    desc: 'Automatic calling server - option 3' },
  { v: 'TWILIO',      icon: '📡', label: 'Server 1',    desc: 'Only for international clients' },
] as const;

const TTS_PROVIDERS = [
  { v: 'MANUAL_UPLOAD', icon: '📤', label: 'নিজের Voice Upload', desc: 'সবচেয়ে সহজ - নিজের recorded audio upload করুন', featured: true },
  { v: 'GOOGLE',     icon: '🔵', label: 'Google TTS',  desc: 'High quality, multilingual' },
  { v: 'ELEVENLABS', icon: '🟣', label: 'ElevenLabs',  desc: 'Ultra-realistic AI voice' },
  { v: 'AWS_POLLY',  icon: '🟠', label: 'AWS Polly',   desc: 'Reliable, cost-effective' },
] as const;

const DTMF_KEYS = [
  { key: '1', action: 'Order Confirm ✅', color: '#16a34a', bg: '#f0fdf4' },
  { key: '2', action: 'Order Cancel ❌',  color: '#dc2626', bg: '#fef2f2' },
  { key: '3', action: 'Agent দরকার 👋',  color: '#d97706', bg: '#fffbeb' },
  { key: '?', action: 'Retry call হবে',  color: '#6b7280', bg: '#f9fafb' },
] as const;

function extractYouTubeId(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

// ── Main Component ────────────────────────────────────────────────────────────
export function SettingsPage({ th, pageId, tab, onToast, autoOpenReconnect }: {
  th: Theme; pageId: number; tab: string; onToast: (m: string, t?: any) => void; autoOpenReconnect?: boolean;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [s, setS]       = useState<Settings>(S0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<Record<string, boolean>>({});
  const [fbTutorialUrl, setFbTutorialUrl] = useState<string>('');
  // Facebook connection / linked pages state
  const [linkedPages, setLinkedPages] = useState<{ id: number; pageId: string; pageName: string; isActive: boolean }[]>([]);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [reconnectTab, setReconnectTab] = useState<'request' | 'manual'>('request');
  const [reconnectToken, setReconnectToken] = useState('');
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectReqPageUrl, setReconnectReqPageUrl] = useState('');
  const [reconnectReqFbProfile, setReconnectReqFbProfile] = useState('');
  const [reconnectReqNote, setReconnectReqNote] = useState('');
  const [reconnectReqBusy, setReconnectReqBusy] = useState(false);
  const [reconnectReqSubmitted, setReconnectReqSubmitted] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapePreview, setScrapePreview] = useState<string | null>(null);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  // WhatsApp settings state
  const [waToken, setWaToken] = useState('');
  const [waSaving, setWaSaving] = useState(false);
  // Instagram settings state
  const [igToken, setIgToken] = useState('');
  const [igSaving, setIgSaving] = useState(false);
  const banglaVoiceUploadRef = useRef<HTMLInputElement>(null);
  const englishVoiceUploadRef = useRef<HTMLInputElement>(null);
  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  // ── CSS vars for inner components ─────────────────────────────────────────
  const cssVars = {
    '--panel':     th.panel,
    '--border':    th.border,
    '--border-md': th.borderMd,
    '--text':      th.text,
    '--muted':     th.muted,
    '--accent':    th.accent,
  } as React.CSSProperties;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [biz, modes, tut, linked] = await Promise.all([
        request<any>(`${BASE}/settings`),
        request<any>(`${BASE}/modes`),
        request<any>(`${BASE}/tutorials`).catch(() => null),
        request<any>(`${API_BASE}/page/${pageId}/linked-pages`).catch(() => []),
      ]);
      setS(prev => ({
        ...prev, ...biz, ...modes,
        pricingPolicy: biz?.pricingPolicy || prev.pricingPolicy,
        callSettings:  biz?.callSettings  || prev.callSettings,
        voiceSettings: biz?.voiceSettings || prev.voiceSettings,
      }));
      if (tut?.facebookAccessToken) setFbTutorialUrl(tut.facebookAccessToken);
      setLinkedPages(Array.isArray(linked) ? linked : []);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoOpenReconnect && !loading) {
      setReconnectTab('request');
      setReconnectToken('');
      setReconnectReqSubmitted(false);
      setReconnectReqPageUrl('');
      setReconnectReqFbProfile('');
      setReconnectReqNote('');
      setShowReconnectModal(true);
    }
  }, [autoOpenReconnect, loading]);

  const save = async (body: any) => {
    setSaving(true);
    try {
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
      onToast('✓ Saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const scrapeWebsite = async () => {
    if (!s.websiteUrl) { onToast('Website URL দিন আগে', 'error'); return; }
    setScraping(true);
    try {
      const res = await request<{ text: string }>(`${API_BASE}/page/${pageId}/knowledge/scrape`, {
        method: 'POST',
        body: JSON.stringify({ url: s.websiteUrl }),
      });
      if (res.text) setScrapePreview(res.text);
      else onToast('কোনো text পাওয়া যায়নি', 'error');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setScraping(false); }
  };

  const saveKnowledge = async () => {
    setKnowledgeSaving(true);
    try {
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify({ knowledgeText: s.knowledgeText }) });
      onToast('✓ AI Knowledge saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setKnowledgeSaving(false); }
  };

  const reconnectPage = async () => {
    if (!reconnectToken.trim()) { onToast(copy('নতুন Page Access Token দিন', 'Enter the new Page Access Token'), 'error'); return; }
    setReconnectBusy(true);
    try {
      const res = await request<any>(`${API_BASE}/page/${pageId}/reconnect`, {
        method: 'PATCH',
        body: JSON.stringify({ newPageToken: reconnectToken.trim() }),
      });
      onToast(`✅ ${copy('Page পরিবর্তন হয়েছে', 'Page reconnected')}: ${res?.page?.pageName || ''}`);
      setShowReconnectModal(false);
      setReconnectToken('');
      load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setReconnectBusy(false); }
  };

  const submitReconnectRequest = async () => {
    if (!reconnectReqPageUrl.trim()) { onToast(copy('Facebook Page link দিন', 'Enter your Facebook Page link'), 'error'); return; }
    if (!reconnectReqFbProfile.trim()) { onToast(copy('আপনার Facebook profile link দিন', 'Enter your Facebook profile link'), 'error'); return; }
    setReconnectReqBusy(true);
    try {
      await request(`${API_BASE}/facebook/page-request`, {
        method: 'POST',
        body: JSON.stringify({ pageUrl: reconnectReqPageUrl.trim(), fbProfile: reconnectReqFbProfile.trim(), note: reconnectReqNote.trim() || undefined }),
      });
      setReconnectReqSubmitted(true);
      onToast(copy('✅ Request submit হয়েছে!', '✅ Request submitted!'));
    } catch (e: any) {
      onToast(e.message || copy('Submit করা যায়নি', 'Submit failed'), 'error');
    } finally {
      setReconnectReqBusy(false);
    }
  };

  const saveWhatsApp = async () => {
    setWaSaving(true);
    try {
      const body: any = {
        waEnabled: s.waEnabled,
        waPhoneNumberId: s.waPhoneNumberId.trim(),
        waVerifyToken: s.waVerifyToken.trim(),
      };
      if (waToken.trim()) body.waToken = waToken.trim();
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
      onToast('✅ WhatsApp settings saved');
      setWaToken('');
      load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setWaSaving(false); }
  };

  const saveInstagram = async () => {
    setIgSaving(true);
    try {
      const body: any = {
        igEnabled: s.igEnabled,
        igBusinessAccountId: s.igBusinessAccountId.trim(),
        igVerifyToken: s.igVerifyToken.trim(),
      };
      if (igToken.trim()) body.igToken = igToken.trim();
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
      onToast('✅ Instagram settings saved');
      setIgToken('');
      load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setIgSaving(false); }
  };

  const unlinkPage = async (linkedPageId: number) => {
    if (!window.confirm(copy('এই page টি unlink করলে এটি নিজের settings/products পাবে না — standalone হয়ে যাবে। Continue?', 'This page will become standalone and lose access to shared settings/products. Continue?'))) return;
    setUnlinkingId(linkedPageId);
    try {
      await request(`${API_BASE}/page/${linkedPageId}/unlink`, { method: 'PATCH' });
      setLinkedPages(prev => prev.filter(p => p.id !== linkedPageId));
      onToast(copy('✓ Page unlink হয়েছে', '✓ Page unlinked'));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setUnlinkingId(null); }
  };

  const saveMode = async (key: string, val: boolean) => {
    if (val && s.modeAccess?.[key] === false) {
      const msg = copy(
        'এই mode টি আপনার current plan-এ available না। এটি চালু করতে Admin-এর সাথে যোগাযোগ করে plan update করুন।',
        'This mode is not available on your current plan. Please contact the admin to upgrade your plan.',
      );
      window.alert(msg);
      onToast(msg, 'error');
      return;
    }
    setS(p => ({ ...p, [key]: val }));
    try {
      await request(`${BASE}/modes`, { method: 'PATCH', body: JSON.stringify({ [key]: val }) });
    } catch (e: any) { onToast(e.message, 'error'); setS(p => ({ ...p, [key]: !val })); }
  };

  const savePricing = async () => {
    setSaving(true);
    try {
      await request(`${BASE}/bot-knowledge/pricing-policy`, { method: 'PATCH', body: JSON.stringify(s.pricingPolicy) });
      onToast('✓ Pricing policy saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveCall = async () => {
    setSaving(true);
    try {
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify({ callSettings: s.callSettings }) });
      onToast('✅ Call settings saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveVoice = async (showToast = true) => {
    if (showToast) setSaving(true);
    try {
      await request(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify({ voiceSettings: s.voiceSettings }) });
      if (showToast) onToast('✅ Voice settings saved');
    } catch (e: any) { if (showToast) onToast(e.message, 'error'); }
    finally { if (showToast) setSaving(false); }
  };

  const generateVoice = async (lang: 'BN' | 'EN') => {
    // Save latest script to DB first so generate uses updated text
    await saveVoice(false);
    setVoiceBusy(b => ({ ...b, [lang]: true }));
    try {
      const result = await request<any>(`${BASE}/voice/generate`, { method: 'POST', body: JSON.stringify({ language: lang }) });
      if (result?.success === false) {
        onToast(result.message || 'Voice generation failed', 'error');
      } else {
        onToast(copy(`✅ ${lang === 'BN' ? 'বাংলা' : 'English'} voice তৈরি হয়েছে!`, `✅ ${lang === 'BN' ? 'Bangla' : 'English'} voice generated!`), 'success');
        void load();
      }
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setVoiceBusy(b => ({ ...b, [lang]: false })); }
  };

  const uploadVoice = async (lang: 'BN' | 'EN', file?: File | null) => {
    if (!file) return;
    setVoiceBusy(b => ({ ...b, [lang]: true }));
    try {
      const token = localStorage.getItem('dfbot_token') || '';
      const form = new FormData();
      form.append('language', lang);
      form.append('file', file);
      const res = await fetch(`${BASE}/voice/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try { message = JSON.parse(text)?.message || text; } catch {}
        throw new Error(message || `HTTP ${res.status}`);
      }
      const result = await res.json();
      if (result?.success === false) {
        onToast(result.message || 'Voice upload failed', 'error');
      } else {
        onToast(copy(`✅ ${lang === 'BN' ? 'বাংলা' : 'English'} voice upload হয়েছে!`, `✅ ${lang === 'BN' ? 'Bangla' : 'English'} voice uploaded!`), 'success');
        void load();
      }
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setVoiceBusy(b => ({ ...b, [lang]: false }));
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Spinner size={22} color={th.accent}/>
    </div>
  );

  const inp = { ...th.input };
  const showPlanUpgradePopup = () => {
    const msg = copy(
      'এই mode টি আপনার current plan-এ locked আছে। এটি চালু করতে Admin-এর সাথে যোগাযোগ করে plan update করুন।',
      'This mode is locked on your current plan. Please contact the admin to upgrade your plan.',
    );
    window.alert(msg);
    onToast(msg, 'error');
  };

  // ── SETTINGS_BUSINESS ────────────────────────────────────────────────────
  if (tab === 'SETTINGS_BUSINESS') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, ...cssVars }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>🏪 Business</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('ব্যবসার তথ্য, ক্যাটালগ ও Facebook সংযোগ', 'Business info, catalog and Facebook connection')}</p>
      </div>

      {/* Facebook Access Token Tutorial — shown only when admin has set a URL */}
      {(() => {
        const ytId = extractYouTubeId(fbTutorialUrl);
        if (!ytId) return null;
        return (
          <div style={{ ...th.card, marginBottom: 24 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              📺 How to get your Facebook Access Token
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 480, background: '#000', marginBottom: 10 }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="Facebook Access Token tutorial"
              />
            </div>
            <div style={{ fontSize: 12, color: th.muted }}>
              {copy('👆 Facebook Page connect করার আগে এই video দেখুন — Access Token কোথায় পাবেন বুঝতে পারবেন।', '👆 Watch this video before connecting your Facebook Page to learn where to find the Access Token.')}
            </div>
          </div>
        );
      })()}

      <div style={{ ...th.card }}>
        {/* Business Info */}
        <Section title="Business Information" desc="Your business details shown on invoices and memos">
          <Grid>
            <div>
              <Label text="Business Name" hint={copy('Memo এবং invoice এ দেখাবে', 'Shown on memos and invoices')}/>
              <input style={inp} value={s.businessName} onChange={e => setS(p => ({ ...p, businessName: e.target.value }))} placeholder="My Shop"/>
            </div>
            <div>
              <Label text="Phone" hint="Contact number"/>
              <input style={inp} value={s.businessPhone} onChange={e => setS(p => ({ ...p, businessPhone: e.target.value }))} placeholder="01700000000"/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label text="Address"/>
              <input style={inp} value={s.businessAddress} onChange={e => setS(p => ({ ...p, businessAddress: e.target.value }))} placeholder="Dhaka, Bangladesh"/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label text="Website / Store Link" hint={copy('আপনার নিজের website/store link থাকলে bot catalog এর বদলে এই link পাঠাবে', 'If you already have your own website/store, the bot will send this instead of the hosted catalog link')}/>
              <input
                style={inp}
                value={s.websiteUrl}
                onChange={e => setS(p => ({ ...p, websiteUrl: e.target.value }))}
                placeholder="https://yourstore.com"
              />
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 5 }}>
                {copy('খালি রাখলে bot আপনার ChatCat catalog link পাঠাবে।', 'Leave empty to use your ChatCat hosted catalog link.')}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label text="🌐 Website URL Slug" hint={copy('আপনার website-এর সুন্দর URL — যেমন: limon-tech-diary → /catalog/limon-tech-diary', 'Your website friendly URL, for example: limon-tech-diary -> /catalog/limon-tech-diary')}/>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: th.muted, pointerEvents: 'none' }}>
                    /catalog/
                  </span>
                  <input style={{ ...inp, paddingLeft: 72 }}
                    value={s.catalogSlug}
                    onChange={e => setS(p => ({ ...p, catalogSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') }))}
                    placeholder="your-shop-name"
                  />
                </div>
                <button style={{ ...th.btnGhost, whiteSpace: 'nowrap', fontSize: 12 }}
                  onClick={() => {
                    const raw = (s.businessName || '').toLowerCase().replace(/[^\w\s-]/g,'').replace(/[\s_]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
                    setS(p => ({ ...p, catalogSlug: raw }));
                  }}>
                  {copy('✨ Auto', '✨ Auto')}
                </button>
              </div>
              {s.catalogSlug && (
                <div style={{ fontSize: 11.5, color: th.accent, marginTop: 5, fontFamily: 'monospace' }}>
                  {API_BASE}/catalog/{s.catalogSlug}
                </div>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label text="🔗 Catalog Page Link" hint={copy(`Catalog এ 'Order করুন' button এ এই link যাবে — Facebook page, Messenger বা WhatsApp link দিন`, `This link will open when customers click the 'Order Now' button in the catalog - use a Facebook page, Messenger, or WhatsApp link`)}/>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} value={s.catalogMessengerUrl}
                  onChange={e => setS(p => ({ ...p, catalogMessengerUrl: e.target.value }))}
                  placeholder={copy('https://m.me/your-page  বা  https://wa.me/8801700000000', 'https://m.me/your-page or https://wa.me/8801700000000')}/>
                {(s as any).fbPageId && (
                  <button style={{ ...th.btnGhost, whiteSpace: 'nowrap', fontSize: 12 }}
                    onClick={() => setS(p => ({ ...p, catalogMessengerUrl: `https://m.me/${(s as any).fbPageId}` }))}>
                    {copy('✨ Auto', '✨ Auto')}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 5 }}>
                {(s as any).fbPageId
                  ? copy(`Auto বাটনে click করলে https://m.me/${(s as any).fbPageId} set হবে`, `Click Auto to set https://m.me/${(s as any).fbPageId}`)
                  : copy('খালি রাখলে Facebook Messenger auto-detect হবে', 'Leave this empty to auto-detect Facebook Messenger')}
              </div>
            </div>
          </Grid>
        </Section>

        {/* Branding */}
        <Section title="Branding" desc="Currency, labels, and product code format">
          <Grid cols={3}>
            <div>
              <Label text="Currency Symbol" hint={copy('যেমন: ৳, $, £', 'For example: ৳, $, £')}/>
              <input style={inp} value={s.currencySymbol} maxLength={4}
                onChange={e => setS(p => ({ ...p, currencySymbol: e.target.value }))}/>
            </div>
            <div>
              <Label text="COD Label" hint="Cash on delivery label"/>
              <input style={inp} value={s.codLabel}
                onChange={e => setS(p => ({ ...p, codLabel: e.target.value }))}/>
            </div>
            <div>
              <Label text="Product Code Prefix" hint={copy('যেমন: DF → DF-0001, SK → SK-0001', 'For example: DF -> DF-0001, SK -> SK-0001')}/>
              <input style={{ ...inp, textTransform: 'uppercase' }} value={s.productCodePrefix} maxLength={6} placeholder="DF"
                onChange={e => setS(p => ({ ...p, productCodePrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g,'') }))}/>
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 5 }}>
                Preview: <code style={{ background: th.accentSoft, color: th.accentText, padding: '1px 7px', borderRadius: 5, fontSize: 11 }}>
                  {(s.productCodePrefix||'DF')}-0001
                </code>
              </div>
            </div>
          </Grid>
        </Section>

        {/* ── Facebook Connection ── */}
        <Section title={copy('Facebook Connection', 'Facebook Connection')} desc={copy('Connected page পরিবর্তন করুন — settings ও products অক্ষুণ্ণ থাকবে', 'Change the connected Facebook page while keeping all settings & products intact')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {(s as any).pageName || copy('(নাম জানা নেই)', '(unknown)')}
              </div>
              <div style={{ fontSize: 11.5, color: th.muted }}>
                FB Page ID: {(s as any).fbPageId || '—'}
              </div>
            </div>
            <button
              onClick={() => { setReconnectToken(''); setReconnectTab('request'); setReconnectReqSubmitted(false); setReconnectReqPageUrl(''); setReconnectReqFbProfile(''); setReconnectReqNote(''); setShowReconnectModal(true); }}
              style={{ ...th.btnGhost, whiteSpace: 'nowrap', fontSize: 12 }}
            >
              🔄 {copy('Change FB Page', 'Change FB Page')}
            </button>
          </div>
          {showReconnectModal && (
            <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${th.borderMd}`, background: th.surface, overflow: 'hidden' }}>
              {/* Tab bar — 2 tabs: Request first (Recommended), Access Token second */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${th.border}` }}>
                {(['request', 'manual'] as const).map(t => {
                  const labels: Record<string, string> = {
                    request: copy('📋 Request Access', '📋 Request Access'),
                    manual: copy('🔑 Access Token', '🔑 Access Token'),
                  };
                  return (
                    <div key={t} style={{ position: 'relative' }}>
                      <button onClick={() => setReconnectTab(t)} style={{
                        width: '100%', padding: '10px 6px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', borderBottom: `2px solid ${reconnectTab === t ? th.accent : 'transparent'}`,
                        background: reconnectTab === t ? th.accentSoft : 'transparent',
                        color: reconnectTab === t ? th.accentText : th.muted,
                        transition: 'all .15s',
                      }}>{labels[t]}</button>
                      {t === 'request' && (
                        <span style={{ position: 'absolute', top: 4, right: 8, background: '#22c55e', color: '#fff', fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 20, letterSpacing: '0.04em', pointerEvents: 'none' }}>
                          {copy('প্রস্তাবিত', 'Recommended')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: th.muted }}>
                  {copy('সব settings, products ও bot training অক্ষুণ্ণ থাকবে।', 'All settings, products, and bot training will be preserved.')}
                </div>

                {/* ── Request tab ── */}
                {reconnectTab === 'request' && (
                  <>
                    <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, color: th.text, lineHeight: 1.9 }}>
                      📋 <strong>{copy('কীভাবে কাজ করে?', 'How does this work?')}</strong><br />
                      <span style={{ color: th.muted }}>
                        {copy('১. নিচের form পূরণ করুন — আপনার Facebook page link ও profile link দিন', '1. Fill the form below with your Facebook page & profile links')}<br />
                        {copy('২. Admin আপনাকে Facebook App-এ Tester হিসেবে add করবে', '2. Admin will add you as a Tester in the Facebook App')}<br />
                        {copy('৩. Facebook থেকে invite notification আসবে — Accept করুন', '3. You will get an invite notification on Facebook — Accept it')}<br />
                        {copy('৪. Accepted হলে "Access Token" tab থেকে page connect করুন', '4. After accepting, use the "Access Token" tab to connect your page')}
                      </span>
                    </div>
                    {reconnectReqSubmitted ? (
                      <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#16a34a', fontWeight: 700, textAlign: 'center' }}>
                        ✅ {copy('Request submit হয়েছে! Admin review করে approve করবে।', 'Request submitted! Admin will review and approve.')}
                      </div>
                    ) : (
                      <>
                        <div>
                          <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                            {copy('Facebook Page Link *', 'Facebook Page Link *')}
                          </label>
                          <input style={{ ...inp }} value={reconnectReqPageUrl} onChange={e => setReconnectReqPageUrl(e.target.value)}
                            placeholder="https://facebook.com/yourpage" />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                            {copy('আপনার Facebook Profile Link *', 'Your Facebook Profile Link *')}
                          </label>
                          <input style={{ ...inp }} value={reconnectReqFbProfile} onChange={e => setReconnectReqFbProfile(e.target.value)}
                            placeholder="https://facebook.com/yourprofile" />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                            {copy('Note (optional)', 'Note (optional)')}
                          </label>
                          <textarea style={{ ...inp, resize: 'vertical', minHeight: 56, lineHeight: 1.5 }}
                            value={reconnectReqNote} onChange={e => setReconnectReqNote(e.target.value)}
                            placeholder={copy('অতিরিক্ত কিছু জানাতে চাইলে লিখুন...', 'Any additional info for the admin...')} />
                        </div>
                        <button onClick={submitReconnectRequest} disabled={reconnectReqBusy}
                          style={{ ...th.btnPrimary, width: '100%', justifyContent: 'center', opacity: reconnectReqBusy ? 0.6 : 1 }}>
                          {reconnectReqBusy ? <><Spinner size={13} /> {copy('Submitting...', 'Submitting...')}</> : copy('📤 Request Submit করুন', 'Submit Request')}
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* ── Access Token (manual) tab ── */}
                {reconnectTab === 'manual' && (
                  <>
                    <div style={{ background: th.accentSoft, border: `1px solid rgba(99,102,241,0.2)`, borderRadius: 10, padding: '12px 14px', fontSize: 12, color: th.text, lineHeight: 1.85, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontWeight: 800, color: th.accent }}>📌 {copy('কিভাবে Page Access Token পাবেন?', 'How to get a Page Access Token?')}</div>
                      <div style={{ color: th.muted }}>
                        {copy('১. ', '1. ')} <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: th.accent }}>Graph API Explorer</a> {copy('খুলুন', '— open it')}<br />
                        {copy('২. "Meta App" dropdown থেকে আপনার App বেছে নিন। "User or Page" dropdown থেকে আপনার Page select করুন (User নয়, Page)।', '2. Select your App from "Meta App" dropdown. Select your Page (not User) from "User or Page" dropdown.')}<br />
                        {copy('৩. নিচের permissions একটি একটি করে add করুন:', '3. Add the following permissions one by one:')}
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {['pages_messaging', 'pages_read_engagement', 'pages_manage_engagement', 'pages_manage_metadata', 'pages_show_list'].map(p => (
                            <code key={p} style={{ background: th.accentSoft, color: th.accent, padding: '2px 6px', borderRadius: 5, fontSize: 10.5, fontWeight: 700 }}>{p}</code>
                          ))}
                        </div>
                        {copy('৪. "Generate Access Token" click করুন → Facebook login করুন → সব permission allow করুন → token copy করুন।', '4. Click "Generate Access Token" → log in to Facebook → allow all permissions → copy the token.')}
                      </div>
                      <div style={{ fontSize: 11, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '6px 9px', color: th.text }}>
                        ✅ {copy('Token আমাদের system automatically long-lived (never-expiring)-এ convert করে নেবে।', 'Our system automatically converts the token to long-lived (never-expiring).')}
                      </div>
                    </div>

                    <textarea
                      style={{ ...inp, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }}
                      placeholder="EAAxxxxxx..."
                      value={reconnectToken}
                      onChange={e => setReconnectToken(e.target.value)}
                    />
                    <button onClick={reconnectPage} disabled={reconnectBusy}
                      style={{ ...th.btnPrimary, width: '100%', justifyContent: 'center', opacity: reconnectBusy ? 0.6 : 1 }}>
                      {reconnectBusy ? <><Spinner size={13} /> {copy('Verifying...', 'Verifying...')}</> : copy('✓ Change Page', '✓ Change Page')}
                    </button>
                  </>
                )}

                <button onClick={() => setShowReconnectModal(false)} style={{ ...th.btnGhost, alignSelf: 'flex-start', fontSize: 12 }}>
                  {copy('বাতিল', 'Cancel')}
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ── WhatsApp Connection ── */}
        <Section title="📱 WhatsApp Connection" desc="WhatsApp Business API দিয়ে automation চালু করুন — bot একইভাবে কাজ করবে">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>WhatsApp Automation</div>
              <div style={{ fontSize: 11.5, color: th.muted }}>
                {s.waTokenSet
                  ? (s.waPhoneNumberId ? `Phone Number ID: ${s.waPhoneNumberId}` : 'Token saved — Phone Number ID নেই')
                  : 'এখনো connect করা হয়নি'}
              </div>
            </div>
            <Toggle
              th={th}
              checked={s.waEnabled}
              onChange={v => setS(prev => ({ ...prev, waEnabled: v }))}
              label=""
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Phone Number ID
              </label>
              <input
                style={{ ...inp }}
                placeholder="123456789012345"
                value={s.waPhoneNumberId}
                onChange={e => setS(prev => ({ ...prev, waPhoneNumberId: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: th.muted, marginTop: 3 }}>
                Meta Developer Console → WhatsApp → Phone Numbers
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Access Token {s.waTokenSet && <span style={{ color: '#22c55e', fontWeight: 400 }}>✓ saved</span>}
              </label>
              <input
                type="password"
                style={{ ...inp }}
                placeholder={s.waTokenSet ? '••••••• (পরিবর্তন করতে নতুন token দিন)' : 'EAAxxxxxx...'}
                value={waToken}
                onChange={e => setWaToken(e.target.value)}
              />
              <div style={{ fontSize: 11, color: th.muted, marginTop: 3 }}>
                Meta Business Manager → System User Token (whatsapp_business_messaging permission)
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Webhook Verify Token
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  placeholder="my-secret-verify-token"
                  value={s.waVerifyToken}
                  onChange={e => setS(prev => ({ ...prev, waVerifyToken: e.target.value }))}
                />
                <button
                  onClick={() => {
                    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                    setS(prev => ({ ...prev, waVerifyToken: rand }));
                  }}
                  style={{ ...th.btnGhost, fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  🔀 Generate
                </button>
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: th.surface, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>📋 Webhook URL (Meta Console-এ দিন)</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: th.accent, wordBreak: 'break-all' }}>
                {`${(typeof window !== 'undefined' ? window.location.origin.replace(/:\d+$/, ':3000') : 'https://api.chatcat.pro')}/wa-webhook`}
              </div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                Meta App → Webhook → Edit → এই URL দিন, Verify Token-ও দিন
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              onClick={saveWhatsApp}
              disabled={waSaving}
              style={{ ...th.btnPrimary, opacity: waSaving ? 0.6 : 1 }}
            >
              {waSaving ? <><Spinner size={13} /> Saving...</> : '💾 WhatsApp Save করুন'}
            </button>
          </div>
        </Section>

        {/* ── Instagram Connection ── */}
        <Section title="📸 Instagram Connection" desc="Instagram Business API দিয়ে DM ও post comment automation চালু করুন">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Toggle
              label={<div><div style={{ fontSize: 13, fontWeight: 700 }}>Instagram Automation</div>
                <div style={{ fontSize: 11.5, color: th.muted }}>
                  {s.igTokenSet
                    ? (s.igBusinessAccountId ? `IG Account ID: ${s.igBusinessAccountId}` : 'Token saved — IG Account ID নেই')
                    : 'Instagram DM ও comment reply automation'}
                </div>
              </div>}
              checked={s.igEnabled}
              onChange={v => setS(prev => ({ ...prev, igEnabled: v }))}
              dark={dark}
            />
            <div>
              <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                Instagram Business Account ID
              </label>
              <input
                style={th.input}
                value={s.igBusinessAccountId}
                onChange={e => setS(prev => ({ ...prev, igBusinessAccountId: e.target.value }))}
                placeholder="e.g. 17841400455057828"
              />
              <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                Meta Developer Console → Instagram → Instagram Business Account ID
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                Access Token {s.igTokenSet && <span style={{ color: '#22c55e', fontWeight: 400 }}>✓ saved</span>}
              </label>
              <input
                style={th.input}
                type="password"
                autoComplete="new-password"
                placeholder={s.igTokenSet ? '••••••• (পরিবর্তন করতে নতুন token দিন)' : 'EAAxxxxxx... (Graph API Explorer থেকে)'}
                value={igToken}
                onChange={e => setIgToken(e.target.value)}
              />
              <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                Graph API Explorer → আপনার IG-linked Page select → instagram_basic + instagram_manage_messages + instagram_manage_comments → Token generate করুন
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: th.muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                Webhook Verify Token
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...th.input, flex: 1 }}
                  value={s.igVerifyToken}
                  onChange={e => setS(prev => ({ ...prev, igVerifyToken: e.target.value }))}
                  placeholder="যেকোনো random string"
                />
                <button
                  onClick={() => {
                    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                    setS(prev => ({ ...prev, igVerifyToken: rand }));
                  }}
                  style={{ ...th.btnSecondary, whiteSpace: 'nowrap', fontSize: 12 }}
                >
                  Generate
                </button>
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: th.surface, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>📋 Webhook URL (Meta Console-এ দিন)</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: th.accent, wordBreak: 'break-all' }}>
                {`${(typeof window !== 'undefined' ? window.location.origin.replace(/:\d+$/, ':3000') : 'https://api.chatcat.pro')}/ig-webhook`}
              </div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                Meta App → Instagram → Webhooks → এই URL দিন। Subscribe করুন: messages, comments
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              onClick={saveInstagram}
              disabled={igSaving}
              style={{ ...th.btnPrimary, opacity: igSaving ? 0.6 : 1 }}
            >
              {igSaving ? <><Spinner size={13} /> Saving...</> : '💾 Instagram Save করুন'}
            </button>
          </div>
        </Section>

        {/* ── Linked Pages ── */}
        <Section title={copy('Linked Pages', 'Linked Pages')} desc={copy('এই page এর settings ও products share করছে এমন pages', 'Pages that share this profile\'s settings and products')}>
          {linkedPages.length === 0 ? (
            <div style={{ fontSize: 12.5, color: th.muted, padding: '10px 0' }}>
              {copy('কোনো linked page নেই।', 'No linked pages yet.')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {linkedPages.map(lp => (
                <div key={lp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderRadius: 10, border: `1px solid ${th.border}`, background: th.surface }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{lp.isActive ? '🔗' : '⏸️'}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{lp.pageName}</div>
                      <div style={{ fontSize: 11.5, color: th.muted }}>FB ID: {lp.pageId}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => unlinkPage(lp.id)}
                    disabled={unlinkingId === lp.id}
                    style={{ ...th.btnGhost, fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', opacity: unlinkingId === lp.id ? 0.5 : 1 }}
                  >
                    {unlinkingId === lp.id ? copy('Unlinking...', 'Unlinking...') : copy('Unlink', 'Unlink')}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: th.muted }}>
            {copy('নতুন page link করতে "পেজ কানেক্ট" থেকে নতুন page add করুন এবং "Link to existing profile" option select করুন।', 'To add a linked page, go to "Connect Page", add a new page, and select "Link to existing profile".')}
          </div>
        </Section>

        <SaveRow onClick={() => save({
          businessName: s.businessName, businessPhone: s.businessPhone,
          businessAddress: s.businessAddress, websiteUrl: s.websiteUrl,
          catalogSlug: s.catalogSlug || null, catalogMessengerUrl: s.catalogMessengerUrl,
          currencySymbol: s.currencySymbol, codLabel: s.codLabel,
          productCodePrefix: s.productCodePrefix,
        })} saving={saving}/>
      </div>
    </div>
  );

  // ── SETTINGS_DELIVERY ──────────────────────────────────────────────────────
  if (tab === 'SETTINGS_DELIVERY') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, ...cssVars }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>🚀 Fulfillment</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('ডেলিভারি ফি, সময় ও পেমেন্ট পদ্ধতি', 'Delivery fees, time and payment method')}</p>
      </div>
      <div style={{ ...th.card }}>
        {/* Delivery */}
        <Section title="Delivery Settings" desc={copy('Bot এই settings থেকে পড়ে customer-কে delivery fee ও সময় বলে', 'Bot reads these to tell customers about delivery fees and time')}>
          <Grid cols={3}>
            <div>
              <Label text="Inside Dhaka (৳)" hint={copy('ঢাকার ভেতরে delivery fee', 'Delivery fee inside Dhaka')}/>
              <input style={inp} type="number" min={0} value={s.deliveryFeeInsideDhaka}
                onChange={e => setS(p => ({ ...p, deliveryFeeInsideDhaka: Number(e.target.value) }))}/>
            </div>
            <div>
              <Label text="Outside Dhaka (৳)" hint={copy('ঢাকার বাইরে delivery fee', 'Delivery fee outside Dhaka')}/>
              <input style={inp} type="number" min={0} value={s.deliveryFeeOutsideDhaka}
                onChange={e => setS(p => ({ ...p, deliveryFeeOutsideDhaka: Number(e.target.value) }))}/>
            </div>
            <div>
              <Label text="Delivery Time" hint={copy('Unit সহ লিখুন — এটাই bot হুবহু বলবে। যেমন: ৩-৪ কার্যদিবস, 4 দিন', 'Write with unit — bot will say exactly this. e.g. 3-4 business days')}/>
              <input style={inp} value={s.deliveryTimeText} placeholder="যেমন: ৩-৪ কার্যদিবস"
                onChange={e => setS(p => ({ ...p, deliveryTimeText: e.target.value }))}/>
            </div>
          </Grid>
        </Section>

        {/* Payment Mode */}
        <Section title="Payment Mode" desc={copy('Bot কীভাবে payment নেবে order confirm করার আগে', 'How the bot will collect payment before confirming the order')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { value: 'cod',             label: '💵 Full COD (Cash on Delivery)',        sub: copy('কোনো advance নেই — delivery-র সময় সম্পূর্ণ payment', 'No advance needed - full payment on delivery') },
              { value: 'advance_outside', label: '🔄 Advance + COD (Outside Dhaka)',       sub: copy('ঢাকার বাইরে হলে আগে advance নেবে, ভেতরে normal COD', 'Collect advance outside Dhaka, use normal COD inside Dhaka') },
              { value: 'full_advance',    label: '💳 Full Advance (সম্পূর্ণ অগ্রিম)',     sub: copy('সব order-এই আগে full payment — তারপর order confirm', 'Require full payment before confirming any order') },
            ] as const).map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${s.paymentMode === opt.value ? th.accent : th.border}`,
                background: s.paymentMode === opt.value ? th.accentSoft : th.surface }}>
                <input type="radio" name="paymentMode" value={opt.value} checked={s.paymentMode === opt.value}
                  onChange={() => setS(p => ({ ...p, paymentMode: opt.value }))}
                  style={{ accentColor: th.accent, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>{opt.sub}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Extra config for advance modes */}
          {s.paymentMode !== 'cod' && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
              <div>
                <Label text="Advance Amount (৳)" hint={copy('0 দিলে শুধু delivery fee নেবে, >0 দিলে ওই পরিমাণ', 'Use 0 to collect only the delivery fee; use a higher amount to collect that value')}/>
                <input style={inp} type="number" min={0} value={s.advanceAmount || ''}
                  onChange={e => setS(p => ({ ...p, advanceAmount: Number(e.target.value) }))} placeholder="0"/>
              </div>
              <div>
                <Label text="Bkash Number" hint={copy('Customer কে দেখানো হবে', 'Shown to customers')}/>
                <input style={inp} value={s.advanceBkash} placeholder="01XXXXXXXXX"
                  onChange={e => setS(p => ({ ...p, advanceBkash: e.target.value }))} />
              </div>
              <div>
                <Label text="Nagad Number" hint={copy('Customer কে দেখানো হবে', 'Shown to customers')}/>
                <input style={inp} value={s.advanceNagad} placeholder="01XXXXXXXXX"
                  onChange={e => setS(p => ({ ...p, advanceNagad: e.target.value }))} />
              </div>
            </div>
          )}
          {s.paymentMode !== 'cod' && (
            <div style={{ marginTop: 14 }}>
              <Label text={copy('Advance Payment Message', 'Advance Payment Message')} hint={copy('Customer কে যে message যাবে। খালি রাখলে default message যাবে।', 'Message sent to customer when advance is needed. Leave empty for default.')}/>
              <textarea
                style={{ ...inp, minHeight: 100, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                value={s.advancePaymentMessage}
                placeholder={copy(
                  '💳 Advance Payment প্রয়োজন\nপরিমাণ: {{amount}}\nBkash: {{bkash}}\nNagad: {{nagad}}\n\nPayment করার পর Transaction ID পাঠান 💖',
                  '💳 Advance payment required\nAmount: {{amount}}\nBkash: {{bkash}}\nNagad: {{nagad}}\n\nSend Transaction ID after payment 💖'
                )}
                onChange={e => setS(p => ({ ...p, advancePaymentMessage: e.target.value }))}
              />
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 6, lineHeight: 1.7 }}>
                {copy('Available variables:', 'Available variables:')}{' '}
                {['{{amount}}', '{{bkash}}', '{{nagad}}', '{{currency}}'].map(v => (
                  <code key={v} style={{ background: th.accentSoft, color: th.accentText, padding: '1px 6px', borderRadius: 4, fontSize: 11, marginRight: 5 }}>{v}</code>
                ))}
              </div>
            </div>
          )}
        </Section>

        <SaveRow onClick={() => save({
          deliveryFeeInsideDhaka: s.deliveryFeeInsideDhaka,
          deliveryFeeOutsideDhaka: s.deliveryFeeOutsideDhaka,
          deliveryTimeText: s.deliveryTimeText,
          paymentMode: s.paymentMode, advanceAmount: s.advanceAmount,
          advanceBkash: s.advanceBkash, advanceNagad: s.advanceNagad,
          advancePaymentMessage: s.advancePaymentMessage,
        })} saving={saving}/>
      </div>
    </div>
  );

  // ── SETTINGS_BOT ───────────────────────────────────────────────────────────
  if (tab === 'SETTINGS_BOT') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, ...cssVars }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>⚙ Bot Modes</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('Bot কী কী করতে পারবে তা এখানে চালু/বন্ধ করো', 'Control which features the bot can use')}</p>
      </div>
      <div style={{ ...th.card }}>
        {/* Business Info Bot */}
        <Section title="🏢 Business Info Bot" desc="Product বিক্রি না করে শুধু business সম্পর্কে তথ্য দিতে চাইলে এটি চালু করুন। Customer যেকোনো প্রশ্ন করলে AI আপনার দেওয়া business তথ্য থেকে উত্তর দেবে।">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Toggle th={th}
              label="Business Info Bot চালু করুন"
              sub="চালু থাকলে নিচের তথ্য দিয়ে সব message-এর AI reply দেবে। SmartBot ও Order mode-এর দরকার নেই।"
              checked={s.businessBotOn}
              onChange={v => saveMode('businessBotOn', v)} />
            {s.businessBotOn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Label text="Business সম্পর্কে বিস্তারিত তথ্য" hint="আপনার business-এর নাম, কী সেবা দেন, যোগাযোগ, ঠিকানা, সময়সূচি, FAQ — সব লিখুন। এই তথ্য থেকে AI customer-দের reply করবে।" />
                <textarea
                  style={{ ...th.input, minHeight: 200, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}
                  placeholder={`উদাহরণ:\nআমাদের business-এর নাম: Limon Tech Diary\nআমরা যা করি: ওয়েব ডিজাইন, গ্রাফিক্স ডিজাইন, ডিজিটাল মার্কেটিং সেবা প্রদান করি\nযোগাযোগ: 01XXXXXXXXX\nইমেইল: info@example.com\nঅফিস সময়: শনি-বৃহস্পতি, সকাল ১০টা - রাত ৮টা\nঠিকানা: ঢাকা, বাংলাদেশ\n\nকাজের ধরন:\n- ওয়েবসাইট তৈরি: ৳৫,০০০ থেকে শুরু\n- লোগো ডিজাইন: ৳১,৫০০\n- ফেসবুক পেজ ম্যানেজমেন্ট: মাসে ৳৩,০০০`}
                  value={s.businessInfo}
                  onChange={e => setS(p => ({ ...p, businessInfo: e.target.value }))}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <p style={{ fontSize: 11.5, color: th.muted, margin: 0 }}>
                    💡 যত বেশি তথ্য দেবেন, AI তত ভালো উত্তর দিতে পারবে।
                  </p>
                  <SaveRow onClick={() => save({ businessInfo: s.businessInfo })} saving={saving} />
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* SmartBot */}
        <Section title="🧠 SmartBot Mode" desc="ChatGPT-style AI — customer যেকোনো ভাষায় কথা বলবে, bot বুঝে order নেবে। Knowledge box-এর তথ্য দিয়ে reply দেবে।">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Toggle th={th}
              label="SmartBot চালু করুন"
              sub="Keyword matching বন্ধ — AI সরাসরি customer-এর সব message বুঝে reply দেবে এবং order নেবে। OPENAI_API_KEY প্রয়োজন।"
              checked={s.smartBotOn}
              onChange={v => saveMode('smartBotOn', v)} />
            {s.smartBotOn && (
              <div style={{ fontSize: 12, color: th.muted, padding: '10px 14px', borderRadius: 8, background: th.surface, border: `1px solid ${th.border}`, lineHeight: 1.7 }}>
                <strong style={{ color: th.text }}>SmartBot চালু আছে।</strong> উপরের "AI Business Knowledge" box-এ আপনার business-এর সব তথ্য লিখুন — size chart, return policy, payment info, FAQ — AI এই তথ্য দিয়ে customer-দের reply করবে।
              </div>
            )}
          </div>
        </Section>

        {/* Bot Modes */}
        <Section title="Bot Modes" desc="Toggle bot features on or off">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'automationOn',      label: 'Bot Automation',    sub: copy('Bot সব message handle করবে', 'The bot will handle all messages') },
              { key: 'infoModeOn',        label: 'Info Mode',         sub: copy('Product info দিতে পারবে', 'The bot can answer product information questions') },
              { key: 'orderModeOn',       label: 'Order Mode',        sub: copy('Order নিতে পারবে', 'The bot can take orders') },
              { key: 'ocrOn',             label: 'OCR Mode',          sub: copy('Screenshot থেকে product code detect করবে', 'Detect product codes from screenshots') },
              { key: 'printModeOn',       label: 'Print Mode',        sub: copy('Invoice/memo print করা যাবে', 'Enable invoice and memo printing') },
              { key: 'memoSaveModeOn',    label: 'Memo Save Mode',    sub: copy('Memo auto-save হবে', 'Memos will be auto-saved') },
              { key: 'callConfirmModeOn', label: 'Call Confirm Mode', sub: copy('Phone call দিয়ে order confirm করবে', 'Confirm orders by phone call') },
              { key: 'commentReplyOn',   label: 'Comment Reply',     sub: copy('Post-এর comment-এ auto reply দেবে', 'Auto-reply to Facebook post comments') },
            ].map(m => (
              <Toggle key={m.key} th={th} label={m.label} sub={m.sub}
                checked={(s as any)[m.key] ?? false}
                onChange={v => saveMode(m.key, v)} />
            ))}
          </div>
            <div style={{ background: th.accentSoft, border: `1px solid rgba(99,102,241,0.2)`, borderRadius: 10, padding: '10px 14px', fontSize: 11.5, color: th.muted, lineHeight: 1.8, marginTop: 4 }}>
              💬 <strong style={{ color: th.text }}>{copy('Comment Reply কিভাবে কাজ করে?', 'How does Comment Reply work?')}</strong><br />
              {copy(
                'আপনার Page-এর কোনো Post-এ কেউ comment করলে bot সেটি detect করে। Comment-এ product, price বা order সংক্রান্ত কিছু থাকলে bot স্বয়ংক্রিয়ভাবে সেই comment-এ public reply দেয়।',
                'When someone comments on your Page Post, the bot detects it. If the comment mentions a product, price, or order, the bot automatically posts a public reply to that comment.',
              )}<br />
              <strong style={{ color: th.text }}>{copy('⚠️ প্রয়োজনীয় Permissions:', '⚠️ Required Permissions:')}</strong>{' '}
              {['pages_read_engagement', 'pages_manage_engagement'].map(p => (
                <code key={p} style={{ background: th.accentSoft, color: th.accent, padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, marginRight: 4 }}>{p}</code>
              ))}<br />
              <span style={{ fontSize: 11 }}>{copy('এই দুটি permission ছাড়া comment reply কাজ করবে না। Settings → Facebook Page → Reconnect করে নতুন token নিন।', 'Without these two permissions, comment reply will not work. Go to Settings → Facebook Page → Reconnect to get a new token.')}</span>
            </div>

        </Section>

        {/* V18: Image Recognition */}
        <Section title={copy('Image Recognition (AI)', 'Image Recognition (AI)')} desc={copy('ছবি থেকে product চেনার feature। Customer product code না দিয়ে ছবি পাঠালে bot বুঝতে চেষ্টা করবে।', 'Let the bot recognize products from customer images — no product code needed.')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Toggle th={th}
              label={copy('Image Recognition চালু', 'Enable Image Recognition')}
              sub={copy('Customer ছবি পাঠালে AI দিয়ে product match করার চেষ্টা করবে', 'When a customer sends an image, the bot will try to match it with products using AI')}
              checked={s.imageRecognitionOn}
              onChange={v => setS(p => ({ ...p, imageRecognitionOn: v }))} />
            <Toggle th={th}
              label={copy('Image AI Fallback চালু', 'Enable Image AI Fallback')}
              sub={copy('ছবিতে low confidence হলে AI fallback reply দেবে। OPENAI_API_KEY প্রয়োজন।', 'Use AI to generate a reply when image confidence is too low. Requires OPENAI_API_KEY in server .env')}
              checked={s.imageFallbackAiOn}
              onChange={v => setS(p => ({ ...p, imageFallbackAiOn: v }))} />
            <Toggle th={th}
              label={copy('Text AI Fallback চালু', 'Enable Text AI Fallback')}
              sub={copy('Bot বুঝতে না পারলে OpenAI context বুঝে জবাব দেবে। OPENAI_API_KEY প্রয়োজন।', 'When the bot cannot match a message, OpenAI will understand the context and reply. Requires OPENAI_API_KEY in server .env')}
              checked={s.textFallbackAiOn}
              onChange={v => setS(p => ({ ...p, textFallbackAiOn: v }))} />
            {s.imageRecognitionOn && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                <div>
                  <Label text={copy('High Confidence Threshold', 'High Confidence Threshold')} hint={copy('এই মানের উপরে হলে bot সরাসরি product দেখাবে (0–1)', 'Above this score the bot auto-proceeds with the top match (0.0–1.0)')}/>
                  <input style={th.input} type="number" min={0} max={1} step={0.05}
                    value={s.imageHighConfidence}
                    onChange={e => setS(p => ({ ...p, imageHighConfidence: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label text={copy('Medium Confidence Threshold', 'Medium Confidence Threshold')} hint={copy('এই মানের উপরে হলে bot কয়েকটি option দেখাবে (0–1)', 'Above this score the bot shows 2–4 product options (0.0–1.0)')}/>
                  <input style={th.input} type="number" min={0} max={1} step={0.05}
                    value={s.imageMediumConfidence}
                    onChange={e => setS(p => ({ ...p, imageMediumConfidence: Number(e.target.value) }))} />
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: th.muted, padding: '8px 12px', borderRadius: 8, background: th.surface, border: `1px solid ${th.border}` }}>
              {copy('Note: Server-এ VISION_PROVIDER=openai এবং OPENAI_API_KEY set না থাকলে এই feature কাজ করবে না। Product এর Category, Color, Keywords field fill করুন matching ভালো হওয়ার জন্য।', 'Note: This feature requires VISION_PROVIDER=openai and OPENAI_API_KEY set in the server .env file. Fill in Category, Color, and Keywords on each product for better matching accuracy.')}
            </div>

          </div>
        </Section>

        <SaveRow onClick={() => save({
          imageRecognitionOn: s.imageRecognitionOn,
          imageHighConfidence: s.imageHighConfidence,
          imageMediumConfidence: s.imageMediumConfidence,
          imageFallbackAiOn: s.imageFallbackAiOn,
          textFallbackAiOn: s.textFallbackAiOn,
          businessBotOn: s.businessBotOn,
          businessInfo: s.businessInfo,
        })} saving={saving}/>
      </div>
    </div>
  );

  // ── SETTINGS_KNOWLEDGE ─────────────────────────────────────────────────────
  if (tab === 'SETTINGS_KNOWLEDGE') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, ...cssVars }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>🧠 Knowledge & Pricing</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('Bot যা জানবে এবং দাম নিয়ে কীভাবে কথা বলবে', 'What the bot knows and how it handles pricing')}</p>
      </div>
      <div style={{ ...th.card }}>
        {/* AI Knowledge */}
        <Section title="🤖 AI Business Knowledge" desc="এখানে লেখো — AI bot এই তথ্য দিয়ে customer-দের সঠিক reply দেবে">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label text="FAQ / Product Info / Policies" hint="AI bot এই text পড়ে customer-এর প্রশ্নের উত্তর দেবে। Products, delivery, payment, return policy লেখো।"/>
              <span style={{ fontSize: 11, color: s.knowledgeText.length > 2800 ? '#f87171' : th.muted }}>
                {s.knowledgeText.length}/3000
              </span>
            </div>
            <textarea
              style={{ ...inp, minHeight: 140, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              value={s.knowledgeText}
              maxLength={3000}
              onChange={e => setS(p => ({ ...p, knowledgeText: e.target.value }))}
              placeholder={`উদাহরণ:\nআমাদের products: সব ধরনের মেয়েদের পোশাক — saree, kameez, kurti। দাম: ৳৩৫০-৳২৫০০।\nDelivery: ঢাকার ভিতরে ৳৮০, বাইরে ৳১৩০। ২-৩ দিনে পাবেন।\nPayment: Cash on Delivery। Outside Dhaka-তে ৳১০০ advance।\nReturn: ৭ দিনের মধ্যে exchange। Cash refund নেই।\nFAQ: রং বদলানো যাবে কি? — হ্যাঁ, order-এর সময় বলুন।`}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={{ ...th.btnGhost, fontSize: 12, opacity: scraping ? 0.6 : 1 }}
                onClick={scrapeWebsite}
                disabled={scraping || !s.websiteUrl}
                title={s.websiteUrl ? 'Website থেকে text extract করবে' : 'আগে Website URL দিন'}
              >
                {scraping ? '⏳ Scraping...' : '🌐 Website থেকে Auto-fill'}
              </button>
              <button
                style={{ ...th.btn, fontSize: 12, opacity: knowledgeSaving ? 0.6 : 1 }}
                onClick={saveKnowledge}
                disabled={knowledgeSaving}
              >
                {knowledgeSaving ? '...' : '💾 Save Knowledge'}
              </button>
            </div>
            {scrapePreview !== null && (
              <div style={{ marginTop: 10, padding: 10, background: th.surface, borderRadius: 6, border: `1px solid ${th.border}` }}>
                <div style={{ fontSize: 11, color: th.muted, marginBottom: 6 }}>Preview (click "Use This" to apply):</div>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', color: th.text, margin: 0 }}>{scrapePreview.slice(0, 500)}{scrapePreview.length > 500 ? '...' : ''}</pre>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...th.btn, fontSize: 11 }} onClick={() => {
                    setS(p => ({ ...p, knowledgeText: scrapePreview.slice(0, 3000) }));
                    setScrapePreview(null);
                  }}>✓ Use This</button>
                  <button style={{ ...th.btnGhost, fontSize: 11 }} onClick={() => setScrapePreview(null)}>✕ Cancel</button>
                </div>
              </div>
            )}
          </div>
        </Section>

        <SaveRow onClick={saveKnowledge} saving={knowledgeSaving} label="Save Knowledge"/>
      </div>
      <div style={{ ...th.card, marginTop: 16 }}>
        <Section title="Pricing Policy" desc="How the bot handles customer price requests">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label text="Price Mode"/>
              <div style={{ display: 'flex', gap: 8 }}>
                {['FIXED','NEGOTIABLE'].map(m => (
                  <button key={m} onClick={() => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, priceMode: m } }))}
                    style={{
                      ...th.btnSm, flex: 1, justifyContent: 'center',
                      background: s.pricingPolicy.priceMode === m ? th.accent : th.surface,
                      color: s.pricingPolicy.priceMode === m ? '#fff' : th.textSub,
                      border: `1px solid ${s.pricingPolicy.priceMode === m ? th.accent : th.border}`,
                    }}>
                    {m === 'FIXED' ? '🔒 Fixed Price' : '💬 Negotiable'}
                  </button>
                ))}
              </div>
            </div>

            {s.pricingPolicy.priceMode === 'NEGOTIABLE' && (
              <>
                <Toggle th={th} label="Allow Customer Offers" sub={copy('Customer কে নিজে দাম propose করতে দেবে', 'Allow customers to suggest their own price')}
                  checked={s.pricingPolicy.allowCustomerOffer}
                  onChange={v => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, allowCustomerOffer: v } }))}/>
                <Toggle th={th} label="Agent Approval Required" sub={copy('Offer agent approve করার পরেই confirm হবে', 'Offers will be confirmed only after agent approval')}
                  checked={s.pricingPolicy.agentApprovalRequired}
                  onChange={v => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, agentApprovalRequired: v } }))}/>
                <Grid>
                  <div>
                    <Label text="Min Discount Type"/>
                    <select style={inp} value={s.pricingPolicy.minNegotiationType}
                      onChange={e => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, minNegotiationType: e.target.value } }))}>
                      <option value="PERCENT">Percent (%)</option>
                      <option value="FIXED">Fixed Amount (৳)</option>
                    </select>
                  </div>
                  <div>
                    <Label text="Min Discount Value" hint={copy('০ দিলে কোনো minimum নেই', 'Use 0 for no minimum limit')}/>
                    <input style={inp} type="number" min={0} value={s.pricingPolicy.minNegotiationValue}
                      onChange={e => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, minNegotiationValue: Number(e.target.value) } }))}/>
                  </div>
                </Grid>
              </>
            )}

            <div>
              <Label text="Fixed Price Reply" hint="Negotiation reject করলে bot এই message পাঠাবে"/>
              <input style={inp} value={s.pricingPolicy.fixedPriceReplyText}
                onChange={e => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, fixedPriceReplyText: e.target.value } }))}/>
            </div>
            <div>
              <Label text="Negotiation Reply" hint="Offer accept করলে এই message"/>
              <input style={inp} value={s.pricingPolicy.negotiationReplyText}
                onChange={e => setS(p => ({ ...p, pricingPolicy: { ...p.pricingPolicy, negotiationReplyText: e.target.value } }))}/>
            </div>
          </div>
        </Section>

        <SaveRow onClick={savePricing} saving={saving} label="Save Pricing"/>
      </div>
    </div>
  );
  // ── CALL ──────────────────────────────────────────────────────────────────
  if (tab === 'SETTINGS_CALL') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', ...cssVars }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>📞 Call Confirm</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('Order আসলে customer কে call করে confirm নেওয়া', 'Call the customer to confirm each order')}</p>
      </div>

      {/* How it works */}
      <div style={{ background: th.accentSoft, border: `1px solid ${th.accent}44`, borderRadius: 14, padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: th.accentText, marginBottom: 10 }}>{copy('ℹ️ কীভাবে কাজ করে?', 'ℹ️ How it works')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: th.textSub, lineHeight: 1.7 }}>
          <div>{copy('① Order receive হলে bot customer কে automatically call করে।', '① When an order is received, the bot automatically calls the customer.')}</div>
          <div>{copy('② Customer একটি pre-recorded message শোনে (Voice tab-এ set করো)।', '② The customer hears a pre-recorded message set from the Voice tab.')}</div>
          <div>{copy('③ Customer DTMF key চাপে → order status automatically update হয়।', '③ The customer presses a DTMF key and the order status updates automatically.')}</div>
          <div>{copy('④ Call না ধরলে Retry Interval পরে আবার call করে, সর্বোচ্চ Max Retries বার।', '④ If the call is not answered, the system retries after the Retry Interval up to Max Retries times.')}</div>
        </div>
      </div>

      <div style={th.card}>
        {/* Call Provider */}
        <Section title="📡 Call Provider" desc={copy('কোন service দিয়ে call যাবে', 'Choose which service will place the calls')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {CALL_PROVIDERS.map(opt => {
              const sel = (s.callSettings.callProvider || 'MANUAL') === opt.v;
              return (
                <button key={opt.v} onClick={() => setS(p => ({ ...p, callSettings: { ...p.callSettings, callProvider: opt.v } }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', fontFamily: 'inherit',
                    border: `2px solid ${sel ? th.accent : th.border}`, borderRadius: 12,
                    background: sel ? th.accentSoft : th.panel, cursor: 'pointer', textAlign: 'left', transition: 'all .12s' }}>
                  <span style={{ fontSize: 20 }}>{opt.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: sel ? th.accentText : th.text }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>{opt.desc}</div>
                  </div>
                  {sel && <span style={{ color: th.accent, fontWeight: 800 }}>✓</span>}
                </button>
              );
            })}
          </div>
          {s.callSettings.callProvider && s.callSettings.callProvider !== 'MANUAL' && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 12, color: '#92400e', lineHeight: 1.7 }}>
              ⚠️ <b>{s.callSettings.callProvider}</b> ব্যবহার করতে server-এর <code>.env</code> file-এ API credentials add করতে হবে।
              {s.callSettings.callProvider === 'TWILIO' && <><br/>Keys: <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM_NUMBER</code>, <code>TWILIO_TWIML_BASE</code></>}
              {s.callSettings.callProvider === 'SSLWIRELESS' && <><br/>Keys: <code>SSLWIRELESS_API_KEY</code>, <code>SSLWIRELESS_CALLER_ID</code>, <code>SSLWIRELESS_API_URL</code></>}
              {s.callSettings.callProvider === 'BDCALLING' && <><br/>BDCalling API credentials সেট করুন .env-এ।</>}
            </div>
          )}
        </Section>

        {/* Call Rules */}
          <Section title="⚙️ Call Rules" desc={copy('কখন এবং কতবার call করবে', 'Choose when and how often calls should be placed')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Toggle th={th}
              label={s.callSettings.callConfirmModeOn
                ? copy('Call Confirm Mode চালু', 'Call Confirm Mode is on')
                : copy('Call Confirm Mode বন্ধ', 'Call Confirm Mode is off')}
              sub={s.callSettings.callConfirmModeOn
                ? copy('নতুন order আসলে automatically call দেবে', 'New orders will trigger calls automatically')
                : copy('এখন call automatically যাবে না', 'Calls will not be placed automatically right now')}
              checked={s.callSettings.callConfirmModeOn}
              onChange={v => {
                if (v && s.modeAccess?.callConfirmModeOn === false) {
                  showPlanUpgradePopup();
                  return;
                }
                setS(p => ({ ...p, callSettings: { ...p.callSettings, callConfirmModeOn: v } }));
              }}/>
            <Grid>
              <div>
                <Label text="Call Mode" hint={copy('কখন call যাবে', 'Choose when the call should be placed')}/>
                <select style={inp} value={s.callSettings.callMode}
                  onChange={e => setS(p => ({ ...p, callSettings: { ...p.callSettings, callMode: e.target.value } }))}>
                  <option value="MANUAL">{copy('👤 Manual — Agent dashboard থেকে trigger করবে', '👤 Manual - triggered by an agent from the dashboard')}</option>
                  <option value="AUTO">{copy('🤖 Auto — Order আসার সাথে সাথে', '🤖 Auto - immediately after order creation')}</option>
                  <option value="AUTO_AFTER_DELAY">{copy('⏳ Auto after delay — custom time পরে', '⏳ Auto after delay - after your custom time')}</option>
                </select>
                {s.callSettings.callMode === 'AUTO_AFTER_DELAY' && (
                  <div style={{ fontSize: 11.5, color: th.muted, marginTop: 6 }}>
                    {copy(
                      `এই mode-এ order আসার ${s.callSettings.initialCallDelayMinutes} মিনিট পরে first call যাবে।`,
                      `In this mode, the first call will be placed ${s.callSettings.initialCallDelayMinutes} minute(s) after the order arrives.`,
                    )}
                  </div>
                )}
              </div>
              <div>
                <Label text="Confirmation Scope" hint={copy('কোন order এ call যাবে', 'Choose which orders should receive calls')}/>
                <select style={inp} value={s.callSettings.callConfirmationScope}
                  onChange={e => setS(p => ({ ...p, callSettings: { ...p.callSettings, callConfirmationScope: e.target.value } }))}>
                  <option value="ALL">{copy('সব orders', 'All orders')}</option>
                  <option value="NEW_CUSTOMERS">{copy('শুধু নতুন customers', 'New customers only')}</option>
                  <option value="HIGH_VALUE">High value orders only</option>
                </select>
              </div>
              <div>
                <Label text={copy('First Call Delay (মিনিট)', 'First Call Delay (minutes)')} hint={copy('Auto after delay mode-এ order আসার কত মিনিট পরে প্রথম call যাবে', 'How many minutes after the order arrives the first call should be placed in Auto after delay mode')}/>
                <input style={inp} type="number" min={1} value={s.callSettings.initialCallDelayMinutes}
                  onChange={e => setS(p => ({ ...p, callSettings: { ...p.callSettings, initialCallDelayMinutes: Number(e.target.value) } }))}/>
              </div>
              <div>
                <Label text={copy('Retry Interval (মিনিট)', 'Retry Interval (minutes)')} hint={copy('Call fail বা not answered হলে next retry এর আগে কত মিনিট wait করবে', 'How many minutes to wait before the next retry after a failed or unanswered call')}/>
                <input style={inp} type="number" min={5} value={s.callSettings.retryIntervalMinutes}
                  onChange={e => setS(p => ({ ...p, callSettings: { ...p.callSettings, retryIntervalMinutes: Number(e.target.value) } }))}/>
              </div>
              <div>
                <Label text={copy('সর্বোচ্চ Retry সংখ্যা', 'Maximum Retries')} hint={copy('কতবার পর্যন্ত try করবে তারপর CALL_FAILED', 'Number of retry attempts before marking the call as failed')}/>
                <input style={inp} type="number" min={1} max={10} value={s.callSettings.maxCallRetries}
                  onChange={e => setS(p => ({ ...p, callSettings: { ...p.callSettings, maxCallRetries: Number(e.target.value) } }))}/>
              </div>
            </Grid>
          </div>
        </Section>

        {/* DTMF keys reference */}
        <div style={{ background: th.surface, borderRadius: 12, padding: '14px 16px', marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {copy('📱 Customer এর DTMF Keys', '📱 Customer DTMF Keys')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {DTMF_KEYS.map(d => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', background: d.bg, borderRadius: 10, border: `1px solid ${d.color}30` }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: d.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{d.key}</div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: d.color }}>{d.action}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: th.muted }}>
            {copy('💡 Voice script-এ এই keys mention করুন: "order confirm করতে ১ চাপুন, cancel করতে ২ চাপুন, agent-এর সাহায্য নিতে ৩ চাপুন।"', '💡 Mention these keys in the voice script: "Press 1 to confirm, 2 to cancel, 3 to speak with an agent."')}
          </div>
        </div>

        <SaveRow onClick={saveCall} saving={saving} label="Save Call Settings"/>
      </div>

      {/* ── Coming Soon Overlay ── */}
      {!s.modeAccess?.callFeatureEnabled && <div style={{
        position: 'absolute', inset: 0, zIndex: 20,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 52 }}>🚀</div>
        <div style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', color: '#fff',
          textShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>Coming Soon</div>
        <div style={{
          fontSize: 13.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
          maxWidth: 280, lineHeight: 1.7,
        }}>
          Call Confirm feature টি শীঘ্রই চালু হবে।<br/>Stay tuned! 🎉
        </div>
      </div>}
    </div>
  );

  // ── VOICE ─────────────────────────────────────────────────────────────────
  if (tab === 'SETTINGS_VOICE') {
    const voiceHints = VOICE_ID_HINTS[s.voiceSettings.ttsProvider] ?? null;
    const codeStyle: React.CSSProperties = { background: th.accentSoft, color: th.accentText, padding: '1px 6px', borderRadius: 4, fontSize: 11 };
    const isManualUpload = s.voiceSettings.ttsProvider === 'MANUAL_UPLOAD';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', ...cssVars }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>🎙 Voice & TTS</h1>
          <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('Call confirmation-এ customer কোন voice শুনবে — script লেখো, audio তৈরি করো', 'Choose the voice customers hear during confirmation calls, write the script, and generate the audio')}</p>
        </div>

        <div style={th.card}>
          {/* TTS Provider */}
          <Section title="🤖 TTS Provider" desc={copy('কোন AI service দিয়ে voice তৈরি হবে', 'Choose which AI service will generate the voice')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {TTS_PROVIDERS.map(opt => {
                const sel = (s.voiceSettings.ttsProvider || '') === opt.v;
                return (
                  <button key={opt.v} onClick={() => setS(p => ({ ...p, voiceSettings: { ...p.voiceSettings, ttsProvider: opt.v } }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', fontFamily: 'inherit',
                      border: `2px solid ${sel ? th.accent : th.border}`, borderRadius: 12,
                      background: sel ? th.accentSoft : th.panel, cursor: 'pointer', textAlign: 'left', transition: 'all .12s' }}>
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: sel ? th.accentText : th.text }}>{opt.label}</div>
                        {'featured' in opt && opt.featured && (
                          <span style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: '#dcfce7',
                            color: '#166534',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}>
                            {copy('Recommended', 'Recommended')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>{opt.desc}</div>
                    </div>
                    {sel && <span style={{ color: th.accent, fontWeight: 800 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            {s.voiceSettings.ttsProvider === 'MANUAL_UPLOAD' && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
                {copy(
                  '✅ এই option select করলে নিচে নিজের recorded voice upload করে calling-এ use করতে পারবেন। এটা সবচেয়ে সহজ setup।',
                  '✅ Select this option to upload your own recorded voice below and use it for calling. This is the easiest setup.',
                )}
              </div>
            )}
            {s.voiceSettings.ttsProvider && s.voiceSettings.ttsProvider !== 'MANUAL_UPLOAD' && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 12, color: '#92400e', lineHeight: 1.7 }}>
                {copy(
                  `⚠️ ${s.voiceSettings.ttsProvider} ব্যবহার করতে চাইলে Admin এর সাথে যোগাযোগ করুন।`,
                  `⚠️ To use ${s.voiceSettings.ttsProvider}, please contact the Admin.`,
                )}
              </div>
            )}
          </Section>


          {!isManualUpload && (
            <Section title="🔑 Voice IDs" desc={copy('Provider-এর নিজস্ব voice identifier — খালি রাখলে default ব্যবহার হবে', 'Provider-specific voice IDs. Leave empty to use the default voice')}>
              <Grid>
                <div>
                  <Label text="Bangla Voice ID" hint={voiceHints?.bn}/>
                  <input style={inp} value={s.voiceSettings.banglaVoiceId}
                    placeholder={voiceHints?.bnPlaceholder || 'Default (empty)'}
                    onChange={e => setS(p => ({ ...p, voiceSettings: { ...p.voiceSettings, banglaVoiceId: e.target.value } }))}/>
                </div>
                <div>
                  <Label text="English Voice ID" hint={voiceHints?.en}/>
                  <input style={inp} value={s.voiceSettings.englishVoiceId}
                    placeholder={voiceHints?.enPlaceholder || 'Default (empty)'}
                    onChange={e => setS(p => ({ ...p, voiceSettings: { ...p.voiceSettings, englishVoiceId: e.target.value } }))}/>
                </div>
              </Grid>
            </Section>
          )}

          {/* Scripts + audio player */}
          <Section
            title={isManualUpload ? copy('📤 Voice Upload', '📤 Voice Upload') : '📜 Call Scripts'}
            desc={
              isManualUpload
                ? copy('নিজের recorded audio upload করুন - calling system এ এটিই play হবে', 'Upload your own recorded audio - this exact file will be played in the calling system')
                : copy('Customer call ধরলে এই message শুনবে', 'This message will play when the customer answers the call')
            }
          >
            <div style={{ fontSize: 12, color: th.muted, marginBottom: 12, padding: '8px 12px', background: th.surface, borderRadius: 8, lineHeight: 1.8 }}>
              {isManualUpload ? (
                <>
                  <b>{copy('কি বলা উচিত:', 'What should the voice say:')}</b>{' '}
                  {copy(
                    'ছোট, পরিষ্কার, ভদ্র message দিন। যেমন: "আসসালামু আলাইকুম। আপনার অর্ডার confirm করতে ১ চাপুন, cancel করতে ২ চাপুন, agent-এর সাথে কথা বলতে ৩ চাপুন।"',
                    'Keep it short, clear, and polite. Example: "Hello. To confirm your order press 1, to cancel press 2, and to speak with an agent press 3."',
                  )}
                </>
              ) : (
                <>
                  {copy('💡 Script-এ variables ব্যবহার করো:', '💡 You can use variables in the script:')}&nbsp;
                  <code style={codeStyle}>{'{{customerName}}'}</code>&nbsp;
                  <code style={codeStyle}>{'{{orderId}}'}</code>&nbsp;
                  <code style={codeStyle}>{'{{total}}'}</code>
                </>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <input
                ref={banglaVoiceUploadRef}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  void uploadVoice('BN', file);
                  e.currentTarget.value = '';
                }}
              />
              <input
                ref={englishVoiceUploadRef}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  void uploadVoice('EN', file);
                  e.currentTarget.value = '';
                }}
              />
              {/* Bangla */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <Label text={isManualUpload ? copy('🇧🇩 বাংলা Audio', '🇧🇩 Bangla Audio') : copy('🇧🇩 বাংলা Script', '🇧🇩 Bangla Script')}/>
                  {s.voiceSettings.banglaVoiceFileUrl
                    ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 6 }}>✅ Audio ready</span>
                    : <span style={{ fontSize: 11, color: th.muted }}>No audio file</span>}
                </div>
                {!isManualUpload && (
                  <textarea style={{ ...inp, height: 80, resize: 'vertical' as const, fontFamily: 'inherit' }}
                    value={s.voiceSettings.banglaCallScript}
                    onChange={e => setS(p => ({ ...p, voiceSettings: { ...p.voiceSettings, banglaCallScript: e.target.value } }))}
                    placeholder={copy('আপনার order confirm করতে ১ চাপুন, cancel করতে ২ চাপুন, agent-এর সাথে কথা বলতে ৩ চাপুন।', 'Press 1 to confirm your order, 2 to cancel, and 3 to speak with an agent.')}/>
                )}
                {s.voiceSettings.banglaVoiceFileUrl && (
                  <div style={{ marginTop: 8, background: th.surface, borderRadius: 10, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: th.muted, marginBottom: 5 }}>{copy('🎵 বাংলা Voice Preview:', '🎵 Bangla Voice Preview:')}</div>
                    <audio controls src={s.voiceSettings.banglaVoiceFileUrl} style={{ width: '100%', height: 36 }}/>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {!isManualUpload && (
                    <button style={{ ...th.btnPrimary, fontSize: 12 }}
                      onClick={() => generateVoice('BN')}
                      disabled={voiceBusy['BN'] || !s.voiceSettings.banglaCallScript || !s.voiceSettings.ttsProvider || s.voiceSettings.ttsProvider === 'MANUAL_UPLOAD'}>
                      {voiceBusy['BN'] ? <><Spinner size={12}/> {copy('Generating...', 'Generating...')}</> : copy('🎙 বাংলা Voice তৈরি করো', 'Generate Bangla Voice')}
                    </button>
                  )}
                  <button
                    style={{ ...(isManualUpload ? th.btnPrimary : th.btnGhost), fontSize: 12 }}
                    onClick={() => banglaVoiceUploadRef.current?.click()}
                    disabled={voiceBusy['BN']}
                  >
                    {voiceBusy['BN'] ? <><Spinner size={12}/> {copy('Uploading...', 'Uploading...')}</> : copy('📤 নিজের Audio Upload', 'Upload your own audio')}
                  </button>
                  {!s.voiceSettings.ttsProvider && <span style={{ fontSize: 12, color: '#d97706', alignSelf: 'center' }}>{copy('উপরে একটি option select করুন', 'Select an option above')}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: th.muted, marginTop: 8 }}>
                  {copy('চাইলে mp3/wav/m4a নিজের voice upload করতে পারেন। Call-এর সময় এই audio-টাই use হবে।', 'You can also upload your own mp3, wav, or m4a file. This audio will be used during calls.')}
                </div>
              </div>

              {/* English */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <Label text={isManualUpload ? '🇺🇸 English Audio' : '🇺🇸 English Script'}/>
                  {s.voiceSettings.englishVoiceFileUrl
                    ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 6 }}>✅ Audio ready</span>
                    : <span style={{ fontSize: 11, color: th.muted }}>No audio file</span>}
                </div>
                {!isManualUpload && (
                  <textarea style={{ ...inp, height: 80, resize: 'vertical' as const, fontFamily: 'inherit' }}
                    value={s.voiceSettings.englishCallScript}
                    onChange={e => setS(p => ({ ...p, voiceSettings: { ...p.voiceSettings, englishCallScript: e.target.value } }))}
                    placeholder="Press 1 to confirm your order, press 2 to cancel, press 3 to speak with an agent."/>
                )}
                {s.voiceSettings.englishVoiceFileUrl && (
                  <div style={{ marginTop: 8, background: th.surface, borderRadius: 10, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: th.muted, marginBottom: 5 }}>🎵 English Voice Preview:</div>
                    <audio controls src={s.voiceSettings.englishVoiceFileUrl} style={{ width: '100%', height: 36 }}/>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {!isManualUpload && (
                    <button style={{ ...th.btnGhost, fontSize: 12 }}
                      onClick={() => generateVoice('EN')}
                      disabled={voiceBusy['EN'] || !s.voiceSettings.englishCallScript || !s.voiceSettings.ttsProvider || s.voiceSettings.ttsProvider === 'MANUAL_UPLOAD'}>
                      {voiceBusy['EN'] ? <><Spinner size={12}/> {copy('Generating...', 'Generating...')}</> : copy('🎙 English Voice তৈরি করো', 'Generate English Voice')}
                    </button>
                  )}
                  <button
                    style={{ ...(isManualUpload ? th.btnPrimary : th.btnGhost), fontSize: 12 }}
                    onClick={() => englishVoiceUploadRef.current?.click()}
                    disabled={voiceBusy['EN']}
                  >
                    {voiceBusy['EN'] ? <><Spinner size={12}/> {copy('Uploading...', 'Uploading...')}</> : copy('📤 নিজের Audio Upload', 'Upload your own audio')}
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: th.muted, marginTop: 8 }}>
                  {copy('নিজের recorded English audio upload করলেও call system সেটা use করবে।', 'You can upload your own recorded English audio and the call system will use it.')}
                </div>
              </div>
            </div>
            {s.voiceSettings.voiceGeneratedAt && (
              <div style={{ marginTop: 12, fontSize: 12, color: th.muted }}>
                🕐 Last generated: {new Date(s.voiceSettings.voiceGeneratedAt).toLocaleString()}
              </div>
            )}
          </Section>

          <SaveRow onClick={() => saveVoice(true)} saving={saving} label="Save Voice Settings"/>
        </div>

        {/* ── Coming Soon Overlay ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 52 }}>🚀</div>
          <div style={{
            fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', color: '#fff',
            textShadow: '0 2px 16px rgba(0,0,0,0.4)',
          }}>Coming Soon</div>
          <div style={{
            fontSize: 13.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
            maxWidth: 280, lineHeight: 1.7,
          }}>
            Voice & TTS feature টি শীঘ্রই চালু হবে।<br/>Stay tuned! 🎉
          </div>
        </div>
      </div>
    );
  }

  return null;
}
