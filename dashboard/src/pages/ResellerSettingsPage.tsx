import { useEffect, useState } from 'react';
import { getTheme, useToast } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  onLogout: () => void;
}

type Tab = 'branding' | 'clients' | 'ledger' | 'settlement';

// Same 13-field whitelist as backend/src/common/pricing-fields.ts — kept in
// sync by hand since the frontend build doesn't share code with the backend.
const PRICING_FIELD_LABELS: { key: string; bn: string; en: string }[] = [
  { key: 'costPerTextMsgBdt', bn: 'টেক্সট রিপ্লাই', en: 'Text reply' },
  { key: 'costPerVoiceMsgBdt', bn: 'ভয়েস মেসেজ', en: 'Voice message' },
  { key: 'costPerImageBdt', bn: 'ছবি (AI)', en: 'Image (AI)' },
  { key: 'costPerImageLocalBdt', bn: 'ছবি (Local)', en: 'Image (local)' },
  { key: 'costPerAnalyzeBdt', bn: 'পণ্য বিশ্লেষণ', en: 'Product analyze' },
  { key: 'costPerOcrLocalBdt', bn: 'OCR (Local)', en: 'OCR (local)' },
  { key: 'costPerOcrAiBdt', bn: 'OCR (AI)', en: 'OCR (AI)' },
  { key: 'costPerRecurringNotifBdt', bn: 'রিকারিং নোটিফিকেশন', en: 'Recurring notif' },
  { key: 'costPerBroadcastMsgBdt', bn: 'ব্রডকাস্ট মেসেজ', en: 'Broadcast msg' },
  { key: 'costPerKeywordReplyBdt', bn: 'কীওয়ার্ড রিপ্লাই', en: 'Keyword reply' },
  { key: 'costPerAiGenerateBdt', bn: 'AI কন্টেন্ট তৈরি', en: 'AI generate' },
  { key: 'costPerMemoPrintBdt', bn: 'মেমো প্রিন্ট', en: 'Memo print' },
  { key: 'costPerCommentReplyBdt', bn: 'কমেন্ট রিপ্লাই', en: 'Comment reply' },
];

export function ResellerSettingsPage({ dark, setDark, onLogout }: Props) {
  const th = getTheme(dark);
  const { copy } = useLanguage();
  const { request } = useApi();
  const { show: showToast, ToastNode } = useToast();

  const [tab, setTab] = useState<Tab>('branding');
  const [me, setMe] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [ledger, setLedger] = useState<{ entries: any[]; walletOwedBdt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState<any>({});
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [pricingDraft, setPricingDraft] = useState<Record<string, number>>({});
  const [domainInput, setDomainInput] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainMsg, setDomainMsg] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('bkash');
  const [settleTxId, setSettleTxId] = useState('');
  const [settleNote, setSettleNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [meData, clientsData, ledgerData] = await Promise.all([
        request(`${API_BASE}/reseller/me`),
        request(`${API_BASE}/reseller/me/clients`),
        request(`${API_BASE}/reseller/me/ledger`),
      ]);
      setMe(meData);
      setBranding(meData);
      setDomainInput(meData?.customDomain || '');
      setClients(clientsData);
      setLedger(ledgerData);
      const settlementData = await request(`${API_BASE}/reseller/me/settlement`).catch(() => []);
      setSettlements(settlementData);
    } catch (e: any) {
      showToast(e.message || copy('লোড করা যায়নি', 'Failed to load'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveBranding = async () => {
    setSaving(true);
    try {
      await request(`${API_BASE}/reseller/me/branding`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: branding.companyName,
          logoUrl: branding.logoUrl,
          faviconUrl: branding.faviconUrl,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          tagline: branding.tagline,
          supportEmail: branding.supportEmail,
          supportPhone: branding.supportPhone,
          websiteUrl: branding.websiteUrl,
        }),
      });
      showToast(copy('ব্র্যান্ডিং সেভ হয়েছে', 'Branding saved'), 'success');
      void load();
    } catch (e: any) {
      showToast(e.message || copy('সেভ করা যায়নি', 'Failed to save'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openPricing = async (pageId: number) => {
    if (expandedPage === pageId) { setExpandedPage(null); return; }
    try {
      const pricing = await request(`${API_BASE}/reseller/clients/pages/${pageId}/pricing`);
      setPricingDraft(pricing);
      setExpandedPage(pageId);
    } catch (e: any) {
      showToast(e.message || copy('লোড করা যায়নি', 'Failed to load'), 'error');
    }
  };

  const savePricing = async (pageId: number) => {
    setSaving(true);
    try {
      await request(`${API_BASE}/reseller/clients/pages/${pageId}/pricing`, {
        method: 'PATCH',
        body: JSON.stringify(pricingDraft),
      });
      showToast(copy('প্রাইসিং সেভ হয়েছে', 'Pricing saved'), 'success');
      setExpandedPage(null);
    } catch (e: any) {
      showToast(e.message || copy('সেভ করা যায়নি', 'Failed to save'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const token = localStorage.getItem('dfbot_token') || '';
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/reseller/me/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('আপলোড ব্যর্থ হয়েছে', 'Upload failed'));
      setBranding((b: any) => ({ ...b, logoUrl: data.logoUrl }));
      showToast(copy('লোগো আপলোড হয়েছে', 'Logo uploaded'), 'success');
    } catch (e: any) {
      showToast(e.message || copy('আপলোড ব্যর্থ হয়েছে', 'Upload failed'), 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const saveDomain = async () => {
    setDomainBusy(true); setDomainMsg('');
    try {
      const updated = await request(`${API_BASE}/reseller/me/custom-domain`, {
        method: 'POST',
        body: JSON.stringify({ domain: domainInput }),
      });
      setMe(updated);
      showToast(copy('ডোমেইন সেভ হয়েছে', 'Domain saved'), 'success');
    } catch (e: any) {
      showToast(e.message || copy('সেভ করা যায়নি', 'Failed to save'), 'error');
    } finally {
      setDomainBusy(false);
    }
  };

  const activateDomain = async () => {
    setDomainBusy(true); setDomainMsg('');
    try {
      const result = await request(`${API_BASE}/reseller/me/custom-domain/activate`, { method: 'POST' });
      setDomainMsg(result.message || '');
      void load();
    } catch (e: any) {
      setDomainMsg(e.message || copy('Activation ব্যর্থ হয়েছে', 'Activation failed'));
    } finally {
      setDomainBusy(false);
    }
  };

  const submitSettlement = async () => {
    const amount = Number(settleAmount);
    if (!amount || amount <= 0) return showToast(copy('সঠিক পরিমাণ দিন', 'Enter a valid amount'), 'error');
    if (!settleTxId.trim()) return showToast(copy('Transaction ID দিন', 'Enter transaction ID'), 'error');
    setSaving(true);
    try {
      await request(`${API_BASE}/reseller/me/settlement`, {
        method: 'POST',
        body: JSON.stringify({ amountBdt: amount, method: settleMethod, transactionId: settleTxId.trim(), note: settleNote }),
      });
      showToast(copy('জমা দেওয়া হয়েছে, অ্যাডমিন verify করবে', 'Submitted — admin will verify'), 'success');
      setSettleAmount(''); setSettleTxId(''); setSettleNote('');
      void load();
    } catch (e: any) {
      showToast(e.message || copy('জমা দেওয়া যায়নি', 'Failed to submit'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${th.border}`,
    outline: 'none', background: th.panel, color: th.text, width: '100%',
    boxSizing: 'border-box', fontSize: 13.5, fontFamily: 'inherit',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11.5, fontWeight: 600, color: th.muted,
    letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6,
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.text }}>{copy('লোড হচ্ছে...', 'Loading...')}</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: th.bg, fontFamily: "'DM Sans','Noto Sans Bengali',system-ui,sans-serif" }}>
      {ToastNode}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${th.border}` }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: th.text }}>
          {copy('রিসেলার ড্যাশবোর্ড', 'Reseller Dashboard')} — {me?.companyName}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setDark(!dark)} style={{ background: 'transparent', border: `1px solid ${th.border}`, borderRadius: 8, padding: '6px 12px', color: th.muted, cursor: 'pointer', fontSize: 12.5 }}>
            {dark ? '☀' : '☾'}
          </button>
          <button onClick={onLogout} style={{ background: 'transparent', border: `1px solid ${th.border}`, borderRadius: 8, padding: '6px 12px', color: th.muted, cursor: 'pointer', fontSize: 12.5 }}>
            {copy('লগ আউট', 'Log out')}
          </button>
        </div>
      </div>

      {me && (
        <div style={{ display: 'flex', gap: 16, padding: '16px 24px 0' }}>
          <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13, color: th.textSub }}>
            {copy('ডোমেইন', 'Domain')}: <b>{me.slug}.chatcat.pro</b>
          </div>
          <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13, color: th.textSub }}>
            {copy('ক্লায়েন্ট', 'Clients')}: <b>{me.clientCount}</b>
          </div>
          <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13, color: th.textSub }}>
            {copy('প্ল্যাটফর্মকে পাওনা', 'Owed to platform')}: <b>৳{(ledger?.walletOwedBdt ?? 0).toFixed(2)}</b>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '16px 24px 0' }}>
        {(['branding', 'clients', 'ledger', 'settlement'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${tab === t ? th.accent : th.border}`,
              background: tab === t ? th.accentSoft : 'transparent', color: tab === t ? th.accentText : th.muted,
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
            {t === 'branding' ? copy('ব্র্যান্ডিং', 'Branding') : t === 'clients' ? copy('ক্লায়েন্ট ও প্রাইসিং', 'Clients & Pricing') : t === 'ledger' ? copy('লেজার', 'Ledger') : copy('সেটেলমেন্ট', 'Settlement')}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 720 }}>
        {tab === 'branding' && (
          <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={label}>{copy('কোম্পানির নাম', 'Company Name')}</label>
              <input style={inp} value={branding.companyName || ''} onChange={e => setBranding({ ...branding, companyName: e.target.value })} />
            </div>
            <div>
              <label style={label}>{copy('লোগো', 'Logo')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {branding.logoUrl && (
                  <img src={branding.logoUrl} alt="logo" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: `1px solid ${th.border}` }} />
                )}
                <label style={{
                  padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${th.border}`,
                  background: 'transparent', color: th.accentText, fontSize: 12.5, fontWeight: 700,
                  cursor: logoUploading ? 'wait' : 'pointer',
                }}>
                  {logoUploading ? copy('আপলোড হচ্ছে...', 'Uploading...') : copy('ছবি আপলোড করুন', 'Upload image')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={logoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
                </label>
              </div>
              <input style={{ ...inp, marginTop: 8 }} value={branding.logoUrl || ''} onChange={e => setBranding({ ...branding, logoUrl: e.target.value })} placeholder="অথবা সরাসরি URL দিন" />
            </div>
            <div>
              <label style={label}>{copy('ফ্যাভিকন URL', 'Favicon URL')}</label>
              <input style={inp} value={branding.faviconUrl || ''} onChange={e => setBranding({ ...branding, faviconUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>{copy('প্রাইমারি কালার', 'Primary Color')}</label>
                <input style={inp} value={branding.primaryColor || ''} onChange={e => setBranding({ ...branding, primaryColor: e.target.value })} placeholder="#5b63f5" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>{copy('অ্যাকসেন্ট কালার', 'Accent Color')}</label>
                <input style={inp} value={branding.accentColor || ''} onChange={e => setBranding({ ...branding, accentColor: e.target.value })} placeholder="#7c3aed" />
              </div>
            </div>
            <div>
              <label style={label}>{copy('ট্যাগলাইন', 'Tagline')}</label>
              <input style={inp} value={branding.tagline || ''} onChange={e => setBranding({ ...branding, tagline: e.target.value })} />
            </div>
            <div>
              <label style={label}>{copy('ওয়েবসাইট নাম ও লিংক', 'Website Name & Link')}</label>
              <div style={{ fontSize: 12, color: th.muted, marginBottom: 6 }}>
                {copy('আপনার ক্লায়েন্টদের catalog পেজের নিচে "Powered by" badge-এ এই নাম ও লিংক দেখাবে (খালি রাখলে আপনার ডোমেইন ব্যবহার হবে)।', 'Shown on your clients\' catalog pages in the "Powered by" badge (leave blank to use your domain instead).')}
              </div>
              <input style={inp} value={branding.websiteUrl || ''} onChange={e => setBranding({ ...branding, websiteUrl: e.target.value })} placeholder="https://yourbrand.com" />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>{copy('সাপোর্ট ইমেইল', 'Support Email')}</label>
                <input style={inp} value={branding.supportEmail || ''} onChange={e => setBranding({ ...branding, supportEmail: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>{copy('সাপোর্ট ফোন', 'Support Phone')}</label>
                <input style={inp} value={branding.supportPhone || ''} onChange={e => setBranding({ ...branding, supportPhone: e.target.value })} />
              </div>
            </div>
            <button onClick={saveBranding} disabled={saving}
              style={{ padding: '11px', borderRadius: 9, border: 'none', background: th.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? copy('সেভ হচ্ছে...', 'Saving...') : copy('সেভ করুন', 'Save')}
            </button>

            <div style={{ borderTop: `1px solid ${th.border}`, marginTop: 6, paddingTop: 18 }}>
              <label style={label}>{copy('নিজস্ব ডোমেইন (ঐচ্ছিক)', 'Custom Domain (optional)')}</label>
              <div style={{ fontSize: 12, color: th.muted, marginBottom: 8 }}>
                {copy(`ডিফল্টভাবে আপনার ড্যাশবোর্ড ${me?.slug}.chatcat.pro থেকে চলবে। চাইলে নিজের ডোমেইন যোগ করতে পারেন।`, `By default your dashboard runs on ${me?.slug}.chatcat.pro. You can optionally point your own domain at it.`)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inp} value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="app.yourbrand.com" />
                <button onClick={saveDomain} disabled={domainBusy}
                  style={{ padding: '0 16px', borderRadius: 8, border: `1.5px solid ${th.border}`, background: 'transparent', color: th.text, fontWeight: 700, fontSize: 13, cursor: domainBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                  {copy('সেভ', 'Save')}
                </button>
              </div>
              {me?.customDomain && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                    background: me.customDomainActive ? 'rgba(16,185,129,0.12)' : 'rgba(234,179,8,0.12)',
                    color: me.customDomainActive ? '#10b981' : '#eab308',
                  }}>
                    {me.customDomainActive ? copy('✓ সক্রিয়', '✓ Active') : copy('⏳ যাচাই বাকি', '⏳ Pending')}
                  </span>
                  {!me.customDomainActive && (
                    <button onClick={activateDomain} disabled={domainBusy}
                      style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${th.border}`, background: 'transparent', color: th.accentText, fontSize: 12, fontWeight: 700, cursor: domainBusy ? 'wait' : 'pointer' }}>
                      {domainBusy ? copy('চেক হচ্ছে...', 'Checking...') : copy('Activate করুন', 'Activate')}
                    </button>
                  )}
                </div>
              )}
              {domainMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: th.textSub }}>{domainMsg}</div>}
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {clients.length === 0 && (
              <div style={{ color: th.muted, fontSize: 13.5 }}>{copy('এখনো কোনো ক্লায়েন্ট নেই', 'No clients yet')}</div>
            )}
            {clients.map((c) => (
              <div key={c.id} style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, color: th.text, fontSize: 14 }}>{c.name || c.username}</div>
                <div style={{ fontSize: 12.5, color: th.muted, marginBottom: 8 }}>{c.email || c.username}</div>
                {(c.pages || []).map((p: any) => (
                  <div key={p.id} style={{ marginTop: 8, borderTop: `1px solid ${th.border}`, paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, color: th.textSub }}>
                        {p.pageName || `Page #${p.id}`} — ৳{p.walletBalanceBdt?.toFixed?.(2) ?? p.walletBalanceBdt}
                      </div>
                      <button onClick={() => openPricing(p.id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${th.border}`, background: 'transparent', color: th.accentText, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {expandedPage === p.id ? copy('বন্ধ করুন', 'Close') : copy('প্রাইসিং', 'Pricing')}
                      </button>
                    </div>
                    {expandedPage === p.id && (
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {PRICING_FIELD_LABELS.map((f) => (
                          <div key={f.key}>
                            <label style={{ ...label, marginBottom: 3 }}>{copy(f.bn, f.en)}</label>
                            <input
                              style={{ ...inp, padding: '7px 10px', fontSize: 12.5 }}
                              type="number"
                              step="0.01"
                              value={pricingDraft[f.key] ?? ''}
                              onChange={e => setPricingDraft({ ...pricingDraft, [f.key]: Number(e.target.value) })}
                            />
                          </div>
                        ))}
                        <button onClick={() => savePricing(p.id)} disabled={saving}
                          style={{ gridColumn: '1 / -1', padding: '9px', borderRadius: 8, border: 'none', background: th.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer' }}>
                          {saving ? copy('সেভ হচ্ছে...', 'Saving...') : copy('এই দাম সেভ করুন', 'Save this pricing')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'ledger' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(ledger?.entries || []).length === 0 && (
              <div style={{ color: th.muted, fontSize: 13.5 }}>{copy('কোনো লেনদেন নেই', 'No transactions yet')}</div>
            )}
            {(ledger?.entries || []).map((e) => (
              <div key={e.id} style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <div style={{ color: th.textSub }}>
                  <div style={{ fontWeight: 700 }}>{e.type}</div>
                  <div style={{ fontSize: 11.5, color: th.muted }}>{e.description}</div>
                </div>
                <div style={{ fontWeight: 700, color: e.amountBdt >= 0 ? '#ef4444' : '#16a34a' }}>
                  {e.amountBdt >= 0 ? '+' : ''}৳{e.amountBdt.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'settlement' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: th.textSub, marginBottom: -6 }}>
                {copy('আপনি প্ল্যাটফর্মকে যে পেমেন্ট করেছেন তা এখানে জমা দিন — অ্যাডমিন verify করে আপনার balance আপডেট করবে।', 'Submit a payment you made to the platform — an admin will verify it and update your balance.')}
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>{copy('পরিমাণ (৳)', 'Amount (৳)')}</label>
                  <input style={inp} type="number" step="0.01" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label}>{copy('মাধ্যম', 'Method')}</label>
                  <select style={inp} value={settleMethod} onChange={e => setSettleMethod(e.target.value)}>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="bank">Bank</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={label}>Transaction ID</label>
                <input style={inp} value={settleTxId} onChange={e => setSettleTxId(e.target.value)} />
              </div>
              <div>
                <label style={label}>{copy('নোট (ঐচ্ছিক)', 'Note (optional)')}</label>
                <input style={inp} value={settleNote} onChange={e => setSettleNote(e.target.value)} />
              </div>
              <button onClick={submitSettlement} disabled={saving}
                style={{ padding: '11px', borderRadius: 9, border: 'none', background: th.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? copy('জমা হচ্ছে...', 'Submitting...') : copy('জমা দিন', 'Submit')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settlements.length === 0 && (
                <div style={{ color: th.muted, fontSize: 13.5 }}>{copy('কোনো সেটেলমেন্ট রিকোয়েস্ট নেই', 'No settlement requests yet')}</div>
              )}
              {settlements.map((s) => (
                <div key={s.id} style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <div style={{ color: th.textSub }}>
                    <div style={{ fontWeight: 700 }}>৳{s.amountBdt.toFixed(2)} — {s.method}</div>
                    <div style={{ fontSize: 11.5, color: th.muted }}>Trx: {s.transactionId}</div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, height: 'fit-content',
                    background: s.status === 'approved' ? 'rgba(16,185,129,0.12)' : s.status === 'rejected' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                    color: s.status === 'approved' ? '#10b981' : s.status === 'rejected' ? '#ef4444' : '#eab308',
                  }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
