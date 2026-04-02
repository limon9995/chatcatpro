import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, FieldWithInfo, InfoButton, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

type AdminTab = 'overview' | 'clients' | 'global-questions' | 'global-replies' | 'learning-log' | 'courier-tutorials' | 'billing' | 'call-servers';

interface TutorialsConfig {
  courier?: { pathao?: string; steadfast?: string; redx?: string; paperfly?: string };
  facebookAccessToken?: string;
  generalOnboarding?: string;
}

interface BillingSupportConfig {
  label?: string;
  phone?: string;
  whatsappUrl?: string;
  messengerUrl?: string;
  email?: string;
  note?: string;
}

const BILLING_FEATURES = [
  { key: 'automationAllowed', label: 'Automation' },
  { key: 'ocrAllowed', label: 'OCR' },
  { key: 'infoModeAllowed', label: 'Info Mode' },
  { key: 'orderModeAllowed', label: 'Order Mode' },
  { key: 'printModeAllowed', label: 'Print' },
  { key: 'callConfirmModeAllowed', label: 'Call Confirm' },
  { key: 'memoSaveModeAllowed', label: 'Memo Save' },
  { key: 'memoTemplateModeAllowed', label: 'Memo Template' },
  { key: 'autoMemoDesignModeAllowed', label: 'Auto Memo Design' },
] as const;

const DEFAULT_FEATURE_ACCESS = Object.fromEntries(
  BILLING_FEATURES.map((item) => [item.key, true]),
) as Record<(typeof BILLING_FEATURES)[number]['key'], boolean>;

interface ClientPage {
  id: number; pageId: string; pageName: string;
  isActive: boolean; automationOn: boolean;
  owner?: { id: string; username: string; name: string };
}

const ADMIN_TABS: { key: AdminTab; label: string; icon: string; help: string }[] = [
  { key: 'overview',          label: 'Overview',          icon: '📊', help: 'System এর সার্বিক অবস্থা দেখুন' },
  { key: 'clients',           label: 'Clients',           icon: '👥', help: 'সব client এর list এবং তাদের bot knowledge পরিচালনা করুন' },
  { key: 'global-questions',  label: 'Global Questions',  icon: '🌐', help: 'সব client এর জন্য default question bank।' },
  { key: 'global-replies',    label: 'System Replies',    icon: '💬', help: 'সব page এর জন্য default bot reply template।' },
  { key: 'learning-log',      label: 'Learning Log',      icon: '🧠', help: 'Bot যে messages বোঝেনি সেগুলো।' },
  { key: 'courier-tutorials', label: 'Courier Tutorials', icon: '🚚', help: 'Client দের courier API setup এর জন্য tutorial video link রাখুন।' },
  { key: 'call-servers',      label: 'Call Servers',      icon: '📞', help: 'Calling feature চালু/বন্ধ করুন এবং call servers manage করুন।' },
  { key: 'billing',           label: 'Billing',           icon: '💳', help: 'Subscriptions, payments, plan management।' },
];

const REPLY_KEY_HELP: Record<string, string> = {
  ocr_processing:    'Customer ছবি পাঠালে প্রথম message। "Processing হচ্ছে" জানান।',
  ocr_fail:          'ছবি থেকে code বোঝা না গেলে এই reply।',
  order_received:    'Order নেওয়া হলে confirmation reply।',
  order_confirmed:   'Order confirm হলে reply।',
  order_cancelled:   'Order cancel হলে reply।',
  product_not_found: 'Product code ভুল হলে reply। {{productCode}} ব্যবহার করুন।',
  stock_out:         'Stock নেই হলে reply। {{productCode}} ব্যবহার করুন।',
  product_info:      'Product info reply। {{productCode}}, {{productPrice}}, {{productStock}} ব্যবহার করুন।',
  order_prompt:      'Customer order করতে চাইলে guide reply।',
  generic_fallback:  'Bot কিছু না বুঝলে default reply।',
};

const REPLY_KEYS = Object.keys(REPLY_KEY_HELP);

export function AdminPanel({ th, onToast, onLogout }: {
  th: Theme; onToast: (m: string, t?: any) => void; onLogout: () => void;
}) {
  const { request } = useApi();
  const [tab, setTab] = useState<AdminTab>(() => {
    const saved = localStorage.getItem('admin_tab') as AdminTab | null;
    const valid: AdminTab[] = ['overview','clients','global-questions','global-replies','learning-log','courier-tutorials','billing','call-servers'];
    return saved && valid.includes(saved) ? saved : 'overview';
  });
  const [overview, setOverview] = useState<any>(null);
  const [pages, setPages]       = useState<ClientPage[]>([]);
  const [globalCfg, setGlobalCfg]       = useState<any>(null);
  const [learningLog, setLearningLog]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [selectedPage, setSelectedPage] = useState<ClientPage | null>(null);
  const [clientCfg, setClientCfg]       = useState<any>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [editReplies, setEditReplies]   = useState<Record<string, string>>({});
  const [tutorials, setTutorials]       = useState<TutorialsConfig>({});
  const [clientPageTab, setClientPageTab] = useState<'bot' | 'settings'>('bot');
  const [pageSettings, setPageSettings]   = useState<any>(null);
  const [pageSettingsSaving, setPageSettingsSaving]   = useState(false);

  // Call Servers state
  const [globalCfgCall, setGlobalCfgCall] = useState<{ callFeatureEnabled: boolean; callServers: any[] } | null>(null);
  const [callCfgSaving, setCallCfgSaving] = useState(false);

  // Billing state — defined after loadBilling callback below
  const [billingData, setBillingData] = useState<{ subscriptions: any[]; pending: any[] }>({ subscriptions: [], pending: [] });
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSubFilter, setBillingSubFilter] = useState('');
  const [billingSupport, setBillingSupport] = useState<BillingSupportConfig>({});

  // Create client form state
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClient, setNewClient] = useState({ identifier: '', name: '', password: '', pageIds: '' });
  const [creating, setCreating]   = useState(false);

  const BASE = `${API_BASE}/admin`;

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try { setOverview(await request(`${BASE}/overview`)); }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const [, pg] = await Promise.all([
        request<ClientPage[]>(`${BASE}/clients`),
        request<ClientPage[]>(`${BASE}/pages`),
      ]);
      setPages(pg);
    }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadGlobal = useCallback(async () => {
    setLoading(true);
    try {
      const g = await request<any>(`${BASE}/bot-knowledge/global`);
      setGlobalCfg(g);
      const r: Record<string, string> = {};
      for (const k of REPLY_KEYS) r[k] = g?.systemReplies?.[k]?.template || '';
      setEditReplies(r);
    }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadLog = useCallback(async () => {
    setLoading(true);
    try { setLearningLog(await request<any[]>(`${BASE}/bot-knowledge/learning-log`)); }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadTutorials = useCallback(async () => {
    try { setTutorials(await request<TutorialsConfig>(`${BASE}/tutorials`)); }
    catch {}
  }, []);

  const loadGlobalCfgCall = useCallback(async () => {
    try { setGlobalCfgCall(await request<any>(`${BASE}/global-config`)); }
    catch (e: any) { onToast(e.message, 'error'); }
  }, []);

  const saveGlobalCfgCall = async () => {
    if (!globalCfgCall) return;
    setCallCfgSaving(true);
    try {
      const updated = await request<any>(`${BASE}/global-config`, { method: 'PATCH', body: JSON.stringify(globalCfgCall) });
      setGlobalCfgCall(updated);
      onToast('✅ Call settings saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setCallCfgSaving(false); }
  };

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const [subs, pending, globalCfg] = await Promise.all([
        request<any[]>(`${API_BASE}/billing/admin/subscriptions${billingSubFilter ? `?status=${billingSubFilter}` : ''}`),
        request<any[]>(`${API_BASE}/billing/admin/pending-payments`),
        request<any>(`${BASE}/global-config`),
      ]);
      setBillingData({ subscriptions: subs || [], pending: pending || [] });
      setBillingSupport(globalCfg?.billingSupport || {});
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setBillingLoading(false); }
  }, [BASE, billingSubFilter]);

  const confirmPayment = async (paymentId: string, planName?: string) => {
    try {
      const r = await request<any>(`${API_BASE}/billing/admin/payments/${paymentId}/confirm`, {
        method: 'POST', body: JSON.stringify({ planName: planName || '' }),
      });
      onToast(r.message || '✅ Payment confirmed'); loadBilling();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const setSubscription = async (userId: string, payload: any) => {
    try {
      await request(`${API_BASE}/billing/admin/users/${userId}/subscription`, {
        method: 'PATCH', body: JSON.stringify(payload),
      });
      onToast('✅ Subscription updated'); loadBilling();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const saveBillingSupport = async (payload: BillingSupportConfig) => {
    try {
      const updated = await request<any>(`${BASE}/global-config`, {
        method: 'PATCH',
        body: JSON.stringify({ billingSupport: payload }),
      });
      setBillingSupport(updated?.billingSupport || payload);
      onToast('✅ Admin contact info saved');
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  const saveTutorials = async () => {
    setSaving(true);
    try {
      await request(`${BASE}/tutorials`, { method: 'PATCH', body: JSON.stringify(tutorials) });
      onToast('✅ Tutorial videos saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const createClient = async () => {
    if (!newClient.identifier.trim()) return onToast('Phone / email / username দিন', 'error');
    if (!newClient.password || newClient.password.length < 6) return onToast('Password কমপক্ষে ৬ character', 'error');
    setCreating(true);
    try {
      const raw     = newClient.identifier.trim();
      const isPhone = /^(\+88)?01[3-9]\d{8}$/.test(raw.replace(/[\s-]/g,''));
      const isEmail = raw.includes('@');
      const body: any = {
        password: newClient.password,
        name:     newClient.name || raw,
        pageIds:  newClient.pageIds ? newClient.pageIds.split(',').map(n => Number(n.trim())).filter(Boolean) : [],
      };
      if (isPhone)      { body.phone = raw.replace(/[\s-]/g,''); body.username = body.phone; }
      else if (isEmail) { body.email = raw.toLowerCase(); body.username = body.email; }
      else              { body.username = raw; }

      await request(`${BASE}/../auth/admin/create-client`, { method: 'POST', body: JSON.stringify(body) });
      onToast(`✅ Client "${newClient.name || raw}" created`);
      setNewClient({ identifier: '', name: '', password: '', pageIds: '' });
      setShowCreateClient(false);
      loadClients();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setCreating(false); }
  };

  useEffect(() => {
    if (tab === 'overview')                                        loadOverview();
    if (tab === 'clients')                                         loadClients();
    if (tab === 'global-questions' || tab === 'global-replies')   loadGlobal();
    if (tab === 'learning-log')                                    loadLog();
    if (tab === 'courier-tutorials')                               loadTutorials();
    if (tab === 'call-servers')                                    loadGlobalCfgCall();
    if (tab === 'billing')                                         loadBilling();
  }, [tab]);

  const loadPageCfg = async (page: ClientPage) => {
    setSelectedPage(page); setClientCfg(null); setClientLoading(true);
    setPageSettings(null); setClientPageTab('settings');
    try {
      const [cfg, settings] = await Promise.all([
        request(`${BASE}/bot-knowledge/page/${page.id}`),
        request(`${BASE}/pages/${page.id}/settings`),
      ]);
      setClientCfg(cfg);
      setPageSettings(settings);
    }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setClientLoading(false); }
  };

  const savePageSettings = async () => {
    if (!selectedPage || !pageSettings) return;
    setPageSettingsSaving(true);
    try {
      const updated = await request(`${BASE}/pages/${selectedPage.id}/settings`, {
        method: 'PATCH', body: JSON.stringify(pageSettings),
      });
      setPageSettings(updated);
      setPages(prev => prev.map(p => p.id === selectedPage.id ? { ...p, automationOn: updated.automationOn } : p));
      onToast('✅ Settings saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPageSettingsSaving(false); }
  };

  const saveGlobalQuestions = async (questions: any[]) => {
    setSaving(true);
    try {
      await request(`${BASE}/bot-knowledge/global/questions`, { method: 'PATCH', body: JSON.stringify({ questions }) });
      onToast('✅ Global questions saved'); await loadGlobal();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveGlobalReplies = async () => {
    setSaving(true);
    const sr: Record<string, any> = {};
    for (const k of REPLY_KEYS) sr[k] = { template: editReplies[k] || '', fallback: editReplies[k] || '', enabled: true };
    try {
      await request(`${BASE}/bot-knowledge/global/system-replies`, { method: 'PATCH', body: JSON.stringify({ systemReplies: sr }) });
      onToast('✅ Global replies saved'); await loadGlobal();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const pushGlobalToPage = async (pageId: number, key: string) => {
    setSaving(true);
    try {
      await request(`${BASE}/bot-knowledge/page/${pageId}/push-global/${key}`, { method: 'POST' });
      onToast(`✅ "${key}" pushed to page`);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveClientQuestions = async (pageId: number, questions: any[]) => {
    setSaving(true);
    try {
      await request(`${BASE}/bot-knowledge/page/${pageId}/questions`, { method: 'PATCH', body: JSON.stringify({ questions }) });
      onToast('✅ Client questions saved'); if (selectedPage?.id === pageId) await loadPageCfg(selectedPage);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const createFromLog = async (entry: any, target: 'global' | 'client', pageId?: number) => {
    setSaving(true);
    try {
      await request(`${BASE}/bot-knowledge/learning-log/create-question`, {
        method: 'POST', body: JSON.stringify({ logId: entry.id, target, pageId }),
      });
      onToast(`✅ Question created → ${target}`); await loadLog();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  // ── Tab Bar ───────────────────────────────────────────────────────────────
  const TabBar = () => {
    const currentTabHelp = ADMIN_TABS.find(t => t.key === tab)?.help || '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: th.surface, borderRadius: 14, padding: 4, border: `1px solid ${th.border}` }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
          {ADMIN_TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); localStorage.setItem('admin_tab', t.key); }} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              background: tab === t.key ? th.accent : 'transparent',
              color: tab === t.key ? '#fff' : th.muted, transition: 'all .15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        {currentTabHelp && (
          <div style={{ fontSize: 12, color: th.muted, padding: '8px 8px 4px', borderTop: `1px solid ${th.border}`, marginTop: 4 }}>
            ℹ️ {currentTabHelp}
          </div>
        )}
      </div>
    );
  };

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  const OverviewTab = () => !overview
    ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={20}/></div>
    : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Health banner */}
        {overview.unmatchedMessages > 10 ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', color: '#991b1b' }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Bot Training Needed</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{overview.unmatchedMessages}টি unmatched message — Learning Log এ গিয়ে নতুন question যোগ করুন</div>
            </div>
            <button onClick={() => { setTab('learning-log'); localStorage.setItem('admin_tab', 'learning-log'); }} style={{ ...th.btnGhost, marginLeft: 'auto', fontSize: 12, color: '#991b1b', borderColor: '#fecaca' }}>
              Learning Log →
            </button>
          </div>
        ) : (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', color: '#166534' }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bot সব question বুঝতে পারছে</div>
          </div>
        )}

        {/* Pages + Users */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
          {[
            { icon: '📄', label: 'Total Pages',    val: overview.totalPages,      color: th.accent },
            { icon: '🟢', label: 'Bot Active',      val: overview.pagesWithBot,    color: '#16a34a' },
            { icon: '🔴', label: 'Bot OFF',          val: overview.pagesWithoutBot, color: overview.pagesWithoutBot > 0 ? '#ef4444' : '#16a34a' },
            { icon: '👥', label: 'Active Clients',  val: overview.activeUsers,     color: '#8b5cf6' },
          ].map(k => (
            <div key={k.label} style={{ ...th.card, padding: '18px 20px' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color, letterSpacing: '-1px' }}>{k.val}</div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Orders */}
        <div style={th.card}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            📦 Orders <InfoButton text="সব client এর combined order statistics" th={th} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { label: 'Total',     val: overview.totalOrders,     color: th.accent },
              { label: 'Today',     val: overview.todayOrders,     color: '#0891b2' },
              { label: 'Pending',   val: overview.pendingOrders,   color: '#f59e0b' },
              { label: 'Confirmed', val: overview.confirmedOrders, color: '#16a34a' },
            ].map(k => (
              <div key={k.label} style={{ ...th.card2, padding: '12px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: 11, color: th.muted, marginTop: 3, fontWeight: 700, textTransform: 'uppercase' }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bot Knowledge Health */}
        <div style={th.card}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            🧠 Bot Knowledge Health
            <InfoButton text="Unmatched messages বেশি হলে Learning Log এ গিয়ে নতুন question যোগ করুন।" th={th} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ ...th.card2, padding: '14px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: overview.unmatchedMessages > 10 ? '#ef4444' : '#16a34a' }}>
                {overview.unmatchedMessages}
              </div>
              <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>
                Unmatched Messages
              </div>
              {overview.unmatchedMessages > 10 && (
                <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 6 }}>
                  ⚠️ Learning Log এ গিয়ে নতুন question যোগ করুন
                </div>
              )}
            </div>
            <div style={{ ...th.card2, padding: '14px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: th.accent }}>{overview.totalProducts}</div>
              <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', marginTop: 3 }}>Total Products</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 10 }}>
            Generated: {new Date(overview.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    );

  // ── CLIENTS ───────────────────────────────────────────────────────────────
  const ClientsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Create Client button + form */}
      <div style={th.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: showCreateClient ? 18 : 0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14.5, letterSpacing:'-0.02em' }}>👤 Create Client</div>
            <div style={{ fontSize:12.5, color:th.muted, marginTop:2 }}>Manually add a new client account</div>
          </div>
          <button style={{ ...th.btnPrimary, fontSize:12.5 }} onClick={() => setShowCreateClient(v => !v)}>
            {showCreateClient ? '✕ Cancel' : '+ New Client'}
          </button>
        </div>

        {showCreateClient && (
          <div style={{ display:'flex', flexDirection:'column', gap:12, animation:'fadeIn .2s ease' }}>
            <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:11.5, fontWeight:600, color:th.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>
                  Phone / Email / Username *
                </div>
                <input style={th.input} placeholder="01XXXXXXXXX বা email@gmail.com"
                  value={newClient.identifier}
                  onChange={e => setNewClient(c => ({ ...c, identifier: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize:11.5, fontWeight:600, color:th.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>
                  Full Name
                </div>
                <input style={th.input} placeholder="Client এর নাম"
                  value={newClient.name}
                  onChange={e => setNewClient(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize:11.5, fontWeight:600, color:th.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>
                  Password *
                </div>
                <input style={th.input} type="password" placeholder="কমপক্ষে ৬ character"
                  value={newClient.password}
                  onChange={e => setNewClient(c => ({ ...c, password: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize:11.5, fontWeight:600, color:th.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>
                  Page IDs (optional)
                </div>
                <input style={th.input} placeholder="1, 2, 3 (comma separated)"
                  value={newClient.pageIds}
                  onChange={e => setNewClient(c => ({ ...c, pageIds: e.target.value }))} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={th.btnPrimary} onClick={createClient} disabled={creating}>
                {creating ? <><Spinner size={13} color="#fff"/> Creating…</> : '✓ Create Account'}
              </button>
              <button style={th.btnGhost} onClick={() => { setShowCreateClient(false); setNewClient({ identifier:'', name:'', password:'', pageIds:'' }); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    <div style={{ display: 'grid', gridTemplateColumns: selectedPage ? '340px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

      {/* Page list */}
      <div style={th.card}>
        <CardHeader th={th} title="📄 All Pages"
          sub={`${pages.length} pages`}
          action={<button style={th.btnGhost} onClick={loadClients}>{loading ? <Spinner size={13}/> : '🔄'}</button>}
        />
        {loading && !pages.length
          ? <div style={{ textAlign: 'center', padding: 30 }}><Spinner size={20}/></div>
          : pages.length === 0
          ? <EmptyState icon="📄" title="কোনো page নেই" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
              {pages.map(pg => (
                <div key={pg.id}
                  onClick={() => loadPageCfg(pg)}
                  style={{
                    ...th.card2, cursor: 'pointer',
                    border: `1.5px solid ${selectedPage?.id === pg.id ? th.accent : th.border}`,
                    background: selectedPage?.id === pg.id ? th.accentSoft : undefined,
                    transition: 'all .12s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{pg.pageName}</div>
                      {pg.owner && <div style={{ fontSize: 11.5, color: th.muted, marginTop: 2 }}>👤 {pg.owner.name || pg.owner.username}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      <span style={{ ...th.pill, ...(pg.automationOn ? th.pillGreen : th.pillRed), fontSize: 10 }}>
                        {pg.automationOn ? '🟢 Bot ON' : '🔴 Bot OFF'}
                      </span>
                      <span style={{ fontSize: 10, color: th.muted }}>#{pg.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Selected page panel */}
      {selectedPage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Header */}
          <div style={{ ...th.card, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{selectedPage.pageName}</div>
              <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>
                {selectedPage.owner?.name || selectedPage.owner?.username} · #{selectedPage.id}
                {pageSettings && <span style={{ marginLeft: 8, ...th.pill, ...(pageSettings.automationOn ? th.pillGreen : th.pillRed), fontSize: 10 }}>{pageSettings.automationOn ? '🟢 Bot ON' : '🔴 Bot OFF'}</span>}
              </div>
            </div>
            <button style={th.btnGhost} onClick={() => { setSelectedPage(null); setClientCfg(null); setPageSettings(null); }}>✕</button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 4, background: th.surface, padding: 4, borderRadius: 10, border: `1px solid ${th.border}` }}>
            {([['settings','⚙️ Settings'],['bot','🤖 Bot Knowledge']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setClientPageTab(k)} style={{
                flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                background: clientPageTab === k ? th.accent : 'transparent',
                color: clientPageTab === k ? '#fff' : th.muted,
              }}>{label}</button>
            ))}
          </div>

          {clientLoading
            ? <div style={{ textAlign: 'center', padding: 32 }}><Spinner size={20}/></div>
            : clientPageTab === 'settings' ? (
              /* ── Settings Panel ── */
              pageSettings && (
                <div style={{ ...th.card, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Bot ON/OFF */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', ...th.card2, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Bot Automation</div>
                      <div style={{ fontSize: 11.5, color: th.muted, marginTop: 2 }}>Messenger webhook থেকে auto reply</div>
                    </div>
                    <button onClick={() => setPageSettings((p: any) => ({ ...p, automationOn: !p.automationOn }))}
                      style={{ ...th.btnPrimary, background: pageSettings.automationOn ? '#16a34a' : '#ef4444', fontSize: 12, padding: '6px 16px' }}>
                      {pageSettings.automationOn ? '🟢 ON' : '🔴 OFF'}
                    </button>
                  </div>

                  {/* Business Info */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Business Info</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        ['businessName','Business Name','Limon Tech Diary'],
                        ['businessPhone','Phone','01XXXXXXXXX'],
                        ['currencySymbol','Currency','৳'],
                        ['codLabel','COD Label','COD'],
                      ].map(([key, label, ph]) => (
                        <div key={key}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                          <input style={th.input} value={pageSettings[key] ?? ''} placeholder={ph}
                            onChange={e => setPageSettings((p: any) => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Product Code Prefix */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Product Code</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>
                          Code Prefix <span style={{ color: th.accent }}>*</span>
                        </div>
                        <input style={{ ...th.input, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em' }}
                          value={pageSettings.productCodePrefix ?? 'DF'} maxLength={6} placeholder="DF"
                          onChange={e => setPageSettings((p: any) => ({ ...p, productCodePrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g,'') }))} />
                        <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                          OCR এই prefix দিয়ে product code খুঁজবে · Preview: <b style={{ color: th.accent }}>{pageSettings.productCodePrefix || 'DF'}-0001</b>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>Catalog Slug</div>
                        <input style={th.input} value={pageSettings.catalogSlug ?? ''} placeholder="limon-tech-diary"
                          onChange={e => setPageSettings((p: any) => ({ ...p, catalogSlug: e.target.value.toLowerCase().replace(/[^\w-]/g,'') }))} />
                        <div style={{ fontSize: 11, color: th.muted, marginTop: 4 }}>
                          /catalog/<b>{pageSettings.catalogSlug || '...'}</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Delivery Fees</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        ['deliveryFeeInsideDhaka','Inside Dhaka','80'],
                        ['deliveryFeeOutsideDhaka','Outside Dhaka','120'],
                        ['deliveryTimeText','Delivery Time','3-5 days'],
                      ].map(([key, label, ph]) => (
                        <div key={key}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                          <input style={th.input} value={pageSettings[key] ?? ''} placeholder={ph}
                            onChange={e => setPageSettings((p: any) => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Payment</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>Mode</div>
                        <select style={th.input} value={pageSettings.paymentMode ?? 'cod'}
                          onChange={e => setPageSettings((p: any) => ({ ...p, paymentMode: e.target.value }))}>
                          <option value="cod">COD (ক্যাশ অন ডেলিভারি)</option>
                          <option value="advance_outside">Advance (Outside Dhaka)</option>
                          <option value="full_advance">Full Advance</option>
                        </select>
                      </div>
                      {[['advanceBkash','Bkash','01XXXXXXXXX'],['advanceNagad','Nagad','01XXXXXXXXX']].map(([key, label, ph]) => (
                        <div key={key}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                          <input style={th.input} value={pageSettings[key] ?? ''} placeholder={ph}
                            onChange={e => setPageSettings((p: any) => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Catalog link */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 4, textTransform: 'uppercase' }}>Catalog Order Button Link</div>
                    <input style={th.input} value={pageSettings.catalogMessengerUrl ?? ''} placeholder="https://m.me/PageName"
                      onChange={e => setPageSettings((p: any) => ({ ...p, catalogMessengerUrl: e.target.value }))} />
                  </div>

                  {/* Feature Toggles */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Feature Toggles</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                      {[
                        ['automationOn','🤖 Bot Automation'],
                        ['ocrOn','📸 OCR Mode'],
                        ['infoModeOn','📦 Info Mode'],['orderModeOn','🛒 Order Mode'],
                        ['printModeOn','🖨️ Print Mode'],['callConfirmModeOn','📞 Call Confirm'],
                        ['memoSaveModeOn','📝 Memo Save'],
                        ['memoTemplateModeOn','📄 Memo Template'],
                        ['autoMemoDesignModeOn','🎨 Auto Memo Design'],
                      ].map(([key, label]) => (
                        <label key={key} style={{ ...th.card2, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 8 }}>
                          <input type="checkbox" checked={Boolean(pageSettings[key])}
                            onChange={e => setPageSettings((p: any) => ({ ...p, [key]: e.target.checked }))} />
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Save button */}
                  <button style={{ ...th.btnPrimary, alignSelf: 'flex-start' }} onClick={savePageSettings} disabled={pageSettingsSaving}>
                    {pageSettingsSaving ? <><Spinner size={13} color="#fff"/> Saving…</> : '💾 Save Settings'}
                  </button>
                </div>
              )
            ) : (
              /* ── Bot Knowledge Panel ── */
              !clientCfg ? null : (
                <div style={{ ...th.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Questions list */}
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      Questions ({clientCfg.questions?.length || 0})
                      <InfoButton text="এই page এ active সব questions। Edit করে helpText বা keyword বদলাতে পারেন।" th={th} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                      {(clientCfg.questions || []).map((q: any) => (
                        <ClientQuestionRow
                          key={q.key} q={q} th={th} saving={saving}
                          onSaveHelpText={(helpText) => {
                            const updated = clientCfg.questions.map((x: any) => x.key === q.key ? { ...x, helpText } : x);
                            saveClientQuestions(selectedPage.id, updated);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Push global question */}
                  {(globalCfg?.questions?.length > 0) && (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Global Question Push করুন
                        <InfoButton text="Global bank থেকে এই page এ question push করুন।" th={th} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(globalCfg.questions || []).map((gq: any) => {
                          const alreadyHas = (clientCfg.questions || []).some((q: any) => q.key === gq.key);
                          return (
                            <button key={gq.key}
                              style={{ ...th.btnSmGhost, fontSize: 11.5, opacity: alreadyHas ? 0.4 : 1 }}
                              disabled={saving || alreadyHas}
                              onClick={() => pushGlobalToPage(selectedPage.id, gq.key)}>
                              {alreadyHas ? '✓' : '⬇️'} {gq.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
        </div>
      )}
    </div>
    </div>  
  );

  // ── GLOBAL QUESTIONS ──────────────────────────────────────────────────────
  const GlobalQuestionsTab = () => {
    const [questions, setQuestions] = useState<any[]>(globalCfg?.questions || []);
    const [editIdx, setEditIdx]     = useState<number | null>(null);
    const [adding, setAdding]       = useState(false);
    const [newQ, setNewQ]           = useState<{ label: string; realMeaning: string; keywords: string[]; helpText: string; replyTemplate: string }>({ label: '', realMeaning: '', keywords: [], helpText: '', replyTemplate: '' });
    const [newKwInput, setNewKwInput] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    useEffect(() => { setQuestions(globalCfg?.questions || []); }, [globalCfg]);

    const upd = (i: number, patch: any) =>
      setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q));

    const addNew = () => {
      if (!newQ.label.trim()) return;
      const autoKey = newQ.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '') || `custom_${Date.now()}`;
      const q = {
        key: autoKey,
        label: newQ.label.trim(),
        realMeaning: newQ.realMeaning.trim(),
        keywords: newQ.keywords,
        helpText: newQ.helpText.trim(),
        replyTemplate: newQ.replyTemplate.trim(),
        priority: questions.length + 1,
      };
      setQuestions(qs => [...qs, q]);
      setNewQ({ label: '', realMeaning: '', keywords: [], helpText: '', replyTemplate: '' });
      setNewKwInput('');
      setAdding(false);
      setEditIdx(questions.length);
    };

    const deleteQ = (i: number) => {
      setQuestions(qs => qs.filter((_, idx) => idx !== i));
      setDeleteConfirm(null);
      if (editIdx === i) setEditIdx(null);
    };

    return (
      <div style={th.card}>
        <CardHeader th={th} title="🌐 Global Question Bank"
          sub={`সব client এর জন্য default questions — ${questions.length} টি question`}
          action={
            <button style={th.btnPrimary} onClick={() => { setAdding(a => !a); setNewQ({ label: '', realMeaning: '', keywords: [], helpText: '', replyTemplate: '' }); setNewKwInput(''); }}>
              {adding ? '✕ Cancel' : '➕ New Question'}
            </button>
          }
        />

        {/* ── Add New Question Form ── */}
        {adding && (
          <div style={{ border: `2px solid ${th.accent}`, borderRadius: 14, padding: '18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, color: th.accent }}>➕ নতুন Global Question তৈরি করুন</div>
                <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>Key স্বয়ংক্রিয়ভাবে Label থেকে তৈরি হবে</div>
              </div>
            </div>

            {/* Step 1 */}
            <div style={{ background: th.surface, borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
                Step 1 · Question পরিচয়
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>
                    প্রশ্নের নাম (Label) <span style={{ color: '#ef4444' }}>*</span>
                  </div>
                  <input style={th.input} placeholder="যেমন: Delivery Time" value={newQ.label}
                    onChange={e => setNewQ(p => ({ ...p, label: e.target.value }))} />
                  {newQ.label && (
                    <div style={{ fontSize: 10.5, color: th.muted, marginTop: 4 }}>
                      Key হবে: <code style={{ background: th.accentSoft, color: th.accent, padding: '1px 5px', borderRadius: 4 }}>
                        {newQ.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '') || '…'}
                      </code>
                    </div>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>Real Meaning</div>
                  <input style={th.input} placeholder="Customer delivery সময় জানতে চাইছে" value={newQ.realMeaning}
                    onChange={e => setNewQ(p => ({ ...p, realMeaning: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Step 2 — Keywords */}
            <div style={{ background: th.surface, borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>
                Step 2 · Keywords
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10, minHeight: 28 }}>
                {newQ.keywords.map((k, i) => (
                  <span key={i} style={{ background: th.accentSoft, color: th.accent, fontSize: 12, padding: '3px 9px', borderRadius: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${th.accent}40` }}>
                    {k}
                    <button onClick={() => setNewQ(p => ({ ...p, keywords: p.keywords.filter((_, j) => j !== i) }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.accent, fontSize: 13, lineHeight: '1', padding: 0, opacity: 0.7 }}>×</button>
                  </span>
                ))}
                {newQ.keywords.length === 0 && <span style={{ fontSize: 12, color: th.muted, fontStyle: 'italic' }}>কোনো keyword নেই</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...th.input, flex: 1 }}
                  placeholder="keyword লিখুন, তারপর Enter — যেমন: delivery, কতদিন"
                  value={newKwInput}
                  onChange={e => setNewKwInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const val = newKwInput.trim();
                      if (val && !newQ.keywords.includes(val)) {
                        setNewQ(p => ({ ...p, keywords: [...p.keywords, val] }));
                        setNewKwInput('');
                      }
                    }
                  }} />
                <button style={th.btnGhost} onClick={() => {
                  const val = newKwInput.trim();
                  if (val && !newQ.keywords.includes(val)) {
                    setNewQ(p => ({ ...p, keywords: [...p.keywords, val] }));
                    setNewKwInput('');
                  }
                }}>+ Add</button>
              </div>
            </div>

            {/* Step 3 — Reply */}
            <div style={{ background: th.surface, borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>
                Step 3 · Reply &amp; Help
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>Reply Template</div>
                <textarea style={{ ...th.input, height: 68, resize: 'vertical' as const, fontFamily: 'inherit', fontSize: 13 }}
                  placeholder="আমাদের delivery time {{deliveryTime}} দিন।" value={newQ.replyTemplate}
                  onChange={e => setNewQ(p => ({ ...p, replyTemplate: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>Help Text (client ⓘ tooltip)</div>
                <input style={th.input} placeholder="Customer delivery সময় জিজ্ঞেস করলে এই reply যাবে..." value={newQ.helpText}
                  onChange={e => setNewQ(p => ({ ...p, helpText: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...th.btnPrimary, padding: '10px 20px' }} onClick={addNew}
                disabled={!newQ.label.trim()}>
                ✅ Add Question
              </button>
              <button style={th.btnGhost} onClick={() => { setAdding(false); setNewKwInput(''); }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((q, i) => (
            <div key={`${q.key}-${i}`} style={{ border: `1.5px solid ${editIdx === i ? th.accent : th.border}`, borderRadius: 12, padding: '12px 14px' }}>
              {editIdx === i ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <FieldWithInfo th={th} label="Key" helpText="Unique identifier। একবার set করলে বদলানো উচিত না।">
                      <input style={th.input} value={q.key} onChange={e => upd(i, { key: e.target.value })} />
                    </FieldWithInfo>
                    <FieldWithInfo th={th} label="Label" helpText="Dashboard এ দেখানো নাম।">
                      <input style={th.input} value={q.label} onChange={e => upd(i, { label: e.target.value })} />
                    </FieldWithInfo>
                    <FieldWithInfo th={th} label="Real Meaning" helpText="এই question এর actual meaning। Bot এটা দেখে বোঝার চেষ্টা করে।">
                      <input style={th.input} value={q.realMeaning || ''} onChange={e => upd(i, { realMeaning: e.target.value })} />
                    </FieldWithInfo>
                    <FieldWithInfo th={th} label="Keywords (comma)" helpText="Customer এই words লিখলে match হবে। Bangla + English দুটোই রাখুন।">
                      <input style={th.input} value={(q.keywords || []).join(', ')}
                        onChange={e => upd(i, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} />
                    </FieldWithInfo>
                  </div>
                  <FieldWithInfo th={th} label="📝 Help Text (ⓘ tooltip)" helpText="Client dashboard এ ⓘ hover করলে এই text দেখাবে।">
                    <input style={th.input} value={q.helpText || ''}
                      placeholder="উদাহরণ: Customer delivery সময় জিজ্ঞেস করলে এই reply যাবে..."
                      onChange={e => upd(i, { helpText: e.target.value })} />
                  </FieldWithInfo>
                  <FieldWithInfo th={th} label="Reply Template" helpText="Bot এই template দিয়ে reply করবে। {{deliveryTime}}, {{insideFee}} ইত্যাদি variables ব্যবহার করুন।">
                    <textarea style={{ ...th.input, height: 72, resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5 }}
                      value={q.replyTemplate || ''} onChange={e => upd(i, { replyTemplate: e.target.value })} />
                  </FieldWithInfo>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={th.btnSmGhost} onClick={() => setEditIdx(null)}>✓ Done editing</button>
                    {deleteConfirm === i ? (
                      <>
                        <span style={{ fontSize: 12, color: '#ef4444', alignSelf: 'center' }}>Delete করবেন?</span>
                        <button style={{ ...th.btnSmGhost, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => deleteQ(i)}>হ্যাঁ, Delete</button>
                        <button style={th.btnSmGhost} onClick={() => setDeleteConfirm(null)}>না</button>
                      </>
                    ) : (
                      <button style={{ ...th.btnSmGhost, color: '#ef4444' }} onClick={() => setDeleteConfirm(i)}>🗑️ Delete</button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: th.accent }}>{q.label}</span>
                      <code style={{ fontSize: 10.5, color: th.muted, fontFamily: 'monospace' }}>{q.key}</code>
                      <InfoButton text={q.helpText || q.realMeaning || ''} th={th} />
                    </div>
                    <div style={{ fontSize: 11.5, color: th.muted, marginBottom: 6 }}>{q.realMeaning}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(q.keywords || []).map((k: string) => (
                        <span key={k} style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 6, fontSize: 10.5 }}>{k}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {pages.length > 0 && (
                      <select
                        style={{ ...th.input, fontSize: 11.5, padding: '4px 8px', width: 'auto', minWidth: 130 }}
                        defaultValue=""
                        onChange={e => { if (e.target.value) { pushGlobalToPage(Number(e.target.value), q.key); e.target.value = ''; } }}
                      >
                        <option value="" disabled>⬇️ Push to page…</option>
                        {pages.map((pg: any) => (
                          <option key={pg.id} value={pg.id}>{pg.pageName || pg.name || `Page #${pg.id}`}</option>
                        ))}
                      </select>
                    )}
                    <button style={th.btnSmGhost} onClick={() => { setEditIdx(i); setDeleteConfirm(null); }}>✏️ Edit</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && !adding && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: th.muted, fontSize: 13 }}>
            কোনো question নেই। "+ New Question" দিয়ে যোগ করুন।
          </div>
        )}

        <button style={{ ...th.btnPrimary, marginTop: 16 }}
          onClick={() => saveGlobalQuestions(questions)} disabled={saving}>
          {saving ? <><Spinner size={13}/> Saving…</> : `💾 Save All (${questions.length} questions)`}
        </button>
      </div>
    );
  };

  // ── GLOBAL REPLIES ────────────────────────────────────────────────────────
  const GlobalRepliesTab = () => (
    <div style={th.card}>
      <CardHeader th={th} title="💬 Global System Replies"
        sub="সব page এর জন্য default replies — client override না করলে এগুলোই ব্যবহার হবে" />

      {/* Variables reference */}
      <div style={{ ...th.card2, marginBottom: 18, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: th.muted, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Available Variables <InfoButton text="Reply template এ এই variables লিখলে bot automatically সঠিক value বসিয়ে দেবে।" th={th} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['{{productCode}}','{{productPrice}}','{{productStock}}','{{insideFee}}','{{outsideFee}}','{{businessName}}','{{deliveryTime}}'].map(v => (
            <code key={v} style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 5, fontSize: 11 }}>{v}</code>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {REPLY_KEYS.map(k => (
          <div key={k}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <code style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 700 }}>{k}</code>
              <InfoButton text={REPLY_KEY_HELP[k] || ''} th={th} />
            </div>
            <textarea
              style={{ ...th.input, height: 68, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              value={editReplies[k] || ''}
              onChange={e => setEditReplies(r => ({ ...r, [k]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <button style={{ ...th.btnPrimary, marginTop: 18 }}
        onClick={saveGlobalReplies} disabled={saving}>
        {saving ? <><Spinner size={13}/> Saving…</> : '💾 Save Global Replies'}
      </button>
    </div>
  );

  // ── LEARNING LOG ──────────────────────────────────────────────────────────
  const LearningLogTab = () => (
    <div style={th.card}>
      <CardHeader th={th} title="🧠 Learning Log"
        sub="Bot যা বোঝেনি — এখান থেকে শিখিয়ে দিন"
        action={<button style={th.btnGhost} onClick={loadLog}>{loading ? <Spinner size={13}/> : '🔄'}</button>}
      />

      <div style={{ ...th.card2, ...th.alert, ...th.alertInfo, marginBottom: 16, fontSize: 12.5 }}>
        💡 এখানে দেখানো messages গুলো bot বুঝতে পারেনি। <b>"→ Global"</b> চাপলে সব page এর জন্য question তৈরি হবে।
        <b> "→ Client"</b> চাপলে শুধু ওই page এর জন্য।
      </div>

      {loading
        ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={20}/></div>
        : learningLog.length === 0
        ? <EmptyState icon="🎉" title="কোনো unmatched message নেই" sub="Bot সব question বুঝতে পারছে!" />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {learningLog.map(l => (
              <div key={l.id} style={{ ...th.card2, borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>"{l.message}"</div>
                    <div style={{ fontSize: 11.5, color: th.muted, marginBottom: 6 }}>
                      Page ID: {l.pageId} · {new Date(l.createdAt).toLocaleString()} · Best guess: <b>{l.bestGuess?.label || 'None'}</b>
                    </div>
                    {l.suggestedKeywords?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {l.suggestedKeywords.map((k: string) => (
                          <span key={k} style={{ background: th.accentSoft, color: th.accent, fontSize: 10.5, padding: '2px 8px', borderRadius: 6 }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                    <button style={th.btnSmAccent} onClick={() => createFromLog(l, 'global')} disabled={saving}>
                      🌐 → Global
                    </button>
                    {l.pageId && (
                      <button style={th.btnSmGhost} onClick={() => createFromLog(l, 'client', l.pageId)} disabled={saving}>
                        👤 → Client
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );

  return (
    <div style={{ ...th.app, minHeight: '100vh' }}>
      <header style={{ ...th.topbar, background: `linear-gradient(135deg, #1e1b4b, #312e81)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🛡️</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.3px', color: '#fff' }}>ChatCat Pro Admin</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>SYSTEM CONTROL PANEL</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ ...th.btnGhost, fontSize: 12.5 }}>Logout</button>
      </header>

      <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <TabBar />
        {tab === 'overview'          && <OverviewTab />}
        {tab === 'clients'           && <ClientsTab />}
        {tab === 'global-questions'  && (globalCfg ? <GlobalQuestionsTab /> : <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22}/></div>)}
        {tab === 'global-replies'    && (globalCfg ? <GlobalRepliesTab /> : <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22}/></div>)}
        {tab === 'learning-log'      && <LearningLogTab />}
        {tab === 'courier-tutorials' && <CourierTutorialsTab th={th} tutorials={tutorials} setTutorials={setTutorials} saveTutorials={saveTutorials} saving={saving} />}
        {tab === 'call-servers' && (
          globalCfgCall
            ? <CallServersTab th={th} cfg={globalCfgCall} setCfg={setGlobalCfgCall} onSave={saveGlobalCfgCall} saving={callCfgSaving} />
            : <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22}/></div>
        )}
        {tab === 'billing' && (
          <BillingTab
            th={th}
            data={billingData}
            supportConfig={billingSupport}
            loading={billingLoading}
            subFilter={billingSubFilter}
            setSubFilter={setBillingSubFilter}
            onRefresh={loadBilling}
            onConfirmPayment={confirmPayment}
            onSetSubscription={setSubscription}
            onSaveSupport={saveBillingSupport}
          />
        )}
      </div>
    </div>
  );
}

// ── Client Question Row — inline helpText edit ────────────────────────────────
function ClientQuestionRow({ q, th, saving, onSaveHelpText }: {
  q: any; th: Theme; saving: boolean; onSaveHelpText: (v: string) => void;
}) {
  const [editHelp, setEditHelp] = useState<string | null>(null);
  return (
    <div style={{ ...th.card2, borderRadius: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: th.accent }}>{q.label}</span>
            <InfoButton text={q.helpText || q.realMeaning || ''} th={th} />
            {!q.enabled && <span style={{ ...th.pill, ...th.pillRed, fontSize: 9 }}>OFF</span>}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(q.keywords || []).slice(0, 4).map((k: string) => (
              <span key={k} style={{ background: th.accentSoft, color: th.accent, fontSize: 10, padding: '1px 6px', borderRadius: 5 }}>{k}</span>
            ))}
          </div>
          {editHelp !== null && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <input style={{ ...th.input, flex: 1, fontSize: 12 }} value={editHelp}
                placeholder="Help text for ⓘ tooltip..."
                onChange={e => setEditHelp(e.target.value)} />
              <button style={th.btnSmSuccess} disabled={saving} onClick={() => { onSaveHelpText(editHelp); setEditHelp(null); }}>
                {saving ? <Spinner size={11}/> : '💾'}
              </button>
              <button style={th.btnSmGhost} onClick={() => setEditHelp(null)}>✕</button>
            </div>
          )}
        </div>
        <button style={{ ...th.btnSmGhost, fontSize: 10.5, whiteSpace: 'nowrap' }}
          onClick={() => setEditHelp(q.helpText || '')}>
          ✏️ Help
        </button>
      </div>
    </div>
  );
}

// ── Call Servers Tab ──────────────────────────────────────────────────────────
const CALL_SERVER_FIELDS: Record<string, { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  MANUAL:      [],
  TWILIO:      [
    { key: 'accountSid',  label: 'Account SID',   placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'authToken',   label: 'Auth Token',     placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
    { key: 'fromNumber',  label: 'From Number',    placeholder: '+1234567890' },
    { key: 'twimlBase',   label: 'TwiML Base URL', placeholder: 'https://your-server.com/twiml' },
  ],
  SSLWIRELESS: [
    { key: 'apiUrl',    label: 'API URL',   placeholder: 'https://api.sslwireless.com/...' },
    { key: 'apiKey',    label: 'API Key',   placeholder: 'xxxx-xxxx-xxxx', secret: true },
    { key: 'callerId',  label: 'Caller ID', placeholder: '01800000000' },
  ],
  BDCALLING: [
    { key: 'apiUrl',    label: 'API URL',   placeholder: 'https://api.bdcalling.com/...' },
    { key: 'apiKey',    label: 'API Key',   placeholder: 'xxxx-xxxx-xxxx', secret: true },
    { key: 'callerId',  label: 'Caller ID', placeholder: '01800000000' },
  ],
};

function CallServersTab({ th, cfg, setCfg, onSave, saving }: {
  th: Theme;
  cfg: { callFeatureEnabled: boolean; callServers: any[] };
  setCfg: (v: any) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const toggleServer = (id: string) => {
    setCfg((prev: any) => ({
      ...prev,
      callServers: prev.callServers.map((s: any) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    }));
  };

  const updateCred = (serverId: string, key: string, value: string) => {
    setCfg((prev: any) => ({
      ...prev,
      callServers: prev.callServers.map((s: any) =>
        s.id === serverId
          ? { ...s, credentials: { ...(s.credentials || {}), [key]: value } }
          : s,
      ),
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Master toggle */}
      <div style={{ ...th.card, border: cfg.callFeatureEnabled ? `2px solid ${th.accent}` : `1px solid ${th.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              📞 Call Confirm Feature
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                background: cfg.callFeatureEnabled ? '#dcfce7' : '#fef2f2',
                color: cfg.callFeatureEnabled ? '#16a34a' : '#dc2626',
              }}>
                {cfg.callFeatureEnabled ? 'LIVE' : 'COMING SOON'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>
              এটি চালু করলে সব client-এর Settings → Call Confirm section থেকে "Coming Soon" overlay সরে যাবে।
            </div>
          </div>
          <button
            onClick={() => setCfg((prev: any) => ({ ...prev, callFeatureEnabled: !prev.callFeatureEnabled }))}
            style={{
              padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
              fontWeight: 800, fontSize: 13, fontFamily: 'inherit', transition: 'all .15s',
              background: cfg.callFeatureEnabled ? th.accent : th.surface,
              color: cfg.callFeatureEnabled ? '#fff' : th.muted,
              border: `2px solid ${cfg.callFeatureEnabled ? th.accent : th.border}`,
              flexShrink: 0,
            } as React.CSSProperties}
          >
            {cfg.callFeatureEnabled ? '✅ চালু আছে' : '🔒 বন্ধ আছে'}
          </button>
        </div>
      </div>

      {/* Server list */}
      <div style={{ ...th.card }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 16 }}>📡 Call Servers</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(cfg.callServers || []).map((srv: any) => {
            const fields = CALL_SERVER_FIELDS[srv.id] || [];
            const isEditing = editingId === srv.id;
            const creds = srv.credentials || {};
            const filledCount = fields.filter(f => creds[f.key]?.trim()).length;

            return (
              <div key={srv.id} style={{
                border: `1.5px solid ${srv.enabled ? th.accent + '88' : th.border}`,
                borderRadius: 12, overflow: 'hidden',
                background: srv.enabled ? th.accentSoft : th.surface,
                transition: 'all .15s',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                  <span style={{ fontSize: 22 }}>{srv.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: srv.enabled ? th.accentText : th.text }}>
                      {srv.name}
                    </div>
                    {fields.length === 0 && (
                      <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>কোনো API key লাগবে না। Agent dashboard থেকে manually trigger করবে।</div>
                    )}
                    {fields.length > 0 && (
                      <div style={{ fontSize: 11.5, color: filledCount === fields.length ? '#16a34a' : th.muted, marginTop: 2 }}>
                        {filledCount === fields.length ? `✅ ${filledCount}/${fields.length} credentials set` : `⚠️ ${filledCount}/${fields.length} credentials set`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {fields.length > 0 && (
                      <button
                        onClick={() => setEditingId(isEditing ? null : srv.id)}
                        style={{
                          padding: '6px 13px', borderRadius: 8, cursor: 'pointer',
                          fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
                          background: isEditing ? th.accent + '22' : th.panel,
                          color: isEditing ? th.accentText : th.muted,
                          border: `1.5px solid ${isEditing ? th.accent : th.border}`,
                          flexShrink: 0,
                        } as React.CSSProperties}
                      >
                        {isEditing ? '✕ বন্ধ' : '✏️ Edit'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleServer(srv.id)}
                      style={{
                        padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                        fontWeight: 700, fontSize: 12, fontFamily: 'inherit', transition: 'all .12s',
                        background: srv.enabled ? th.accent : th.panel,
                        color: srv.enabled ? '#fff' : th.muted,
                        border: `1.5px solid ${srv.enabled ? th.accent : th.border}`,
                        flexShrink: 0,
                      } as React.CSSProperties}
                    >
                      {srv.enabled ? 'Enabled ✓' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Credential edit panel */}
                {isEditing && fields.length > 0 && (
                  <div style={{
                    borderTop: `1px solid ${th.border}`,
                    padding: '16px 16px 18px',
                    background: th.bg,
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    <div style={{ fontSize: 12, color: th.muted, marginBottom: 2 }}>Credentials সংরক্ষিত হবে server-side (global-config.json)। নিচে সব field পূরণ করুন তারপর Save করুন।</div>
                    {fields.map(f => (
                      <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: th.muted }}>{f.label}</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={f.secret && !showSecrets[`${srv.id}_${f.key}`] ? 'password' : 'text'}
                            value={creds[f.key] || ''}
                            onChange={e => updateCred(srv.id, f.key, e.target.value)}
                            placeholder={f.placeholder}
                            style={{
                              ...th.input,
                              width: '100%', boxSizing: 'border-box',
                              fontSize: 12.5,
                              paddingRight: f.secret ? 36 : undefined,
                            } as React.CSSProperties}
                          />
                          {f.secret && (
                            <button
                              type="button"
                              onClick={() => setShowSecrets(prev => ({ ...prev, [`${srv.id}_${f.key}`]: !prev[`${srv.id}_${f.key}`] }))}
                              style={{
                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: th.muted, fontSize: 14,
                              }}
                            >
                              {showSecrets[`${srv.id}_${f.key}`] ? '🙈' : '👁️'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ ...th.btnPrimary, opacity: saving ? 0.6 : 1, fontSize: 13.5, padding: '11px 28px' }}
        >
          {saving ? 'Saving…' : '💾 Save Call Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Tutorials Tab (Courier + Facebook + Onboarding) ──────────────────────────
function CourierTutorialsTab({ th, tutorials, setTutorials, saveTutorials, saving }: {
  th: Theme; tutorials: TutorialsConfig;
  setTutorials: (v: any) => void; saveTutorials: () => void; saving: boolean;
}) {
  const COURIERS = [
    { key: 'pathao',    label: 'Pathao',    color: '#e11d48', icon: '🚴', desc: 'API key ও Store ID কোথায় পাবেন' },
    { key: 'steadfast', label: 'Steadfast', color: '#0369a1', icon: '📦', desc: 'API Key ও Secret Key setup' },
    { key: 'redx',      label: 'RedX',      color: '#dc2626', icon: '🔴', desc: 'API Token setup' },
    { key: 'paperfly',  label: 'Paperfly',  color: '#7c3aed', icon: '✈️', desc: 'API Key ও Password setup' },
  ];

  function extractId(url: string): string | null {
    const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m?.[1] ?? null;
  }

  const setCourier = (key: string, val: string) =>
    setTutorials((t: TutorialsConfig) => ({ ...t, courier: { ...(t.courier || {}), [key]: val } }));

  const setTop = (key: keyof TutorialsConfig, val: string) =>
    setTutorials((t: TutorialsConfig) => ({ ...t, [key]: val }));

  const fbUrl   = tutorials.facebookAccessToken || '';
  const obUrl   = tutorials.generalOnboarding   || '';
  const fbYtId  = extractId(fbUrl);
  const obYtId  = extractId(obUrl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Facebook Access Token Tutorial ─────────────────────────────── */}
      <div style={th.card}>
        <CardHeader th={th} title="🔑 Facebook Access Token Tutorial"
          sub="Client যখন প্রথমবার Facebook Page connect করবে, এই video দেখবে। YouTube URL দিন।"
        />
        <div style={{ ...th.card2, ...th.alert, ...th.alertInfo, marginBottom: 18, fontSize: 12.5 }}>
          💡 এই video ConnectPageScreen এবং Settings → PAGE tab এ দেখাবে।
          Client বুঝতে পারবে কীভাবে Facebook Access Token নিতে হয়।
        </div>
        <div style={{ ...th.card2, borderRadius: 14, border: `1.5px solid #1877f222` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 22 }}>f</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1877f2' }}>Facebook Page Connection</div>
              <div style={{ fontSize: 12, color: th.muted }}>Access Token কোথায় পাবেন তার guide</div>
            </div>
            {fbUrl && <span style={{ ...th.pill, ...th.pillGreen, fontSize: 10, marginLeft: 'auto' }}>✓ Set</span>}
          </div>
          <input
            style={{ ...th.input, marginBottom: fbYtId ? 12 : 0 }}
            placeholder="Facebook Access Token tutorial YouTube URL..."
            value={fbUrl}
            onChange={e => setTop('facebookAccessToken', e.target.value)}
          />
          {fbYtId && (
            <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 400, background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${fbYtId}`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="Facebook Access Token tutorial"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── General Onboarding Tutorial ────────────────────────────────── */}
      <div style={th.card}>
        <CardHeader th={th} title="🎓 General Onboarding Tutorial"
          sub="নতুন client দের জন্য সাধারণ onboarding video। YouTube URL দিন।"
        />
        <div style={{ ...th.card2, borderRadius: 14, border: `1.5px solid #16a34a22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 22 }}>🎓</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#16a34a' }}>ChatCat Pro Onboarding</div>
              <div style={{ fontSize: 12, color: th.muted }}>Platform কীভাবে ব্যবহার করবেন — সম্পূর্ণ guide</div>
            </div>
            {obUrl && <span style={{ ...th.pill, ...th.pillGreen, fontSize: 10, marginLeft: 'auto' }}>✓ Set</span>}
          </div>
          <input
            style={{ ...th.input, marginBottom: obYtId ? 12 : 0 }}
            placeholder="General onboarding YouTube URL..."
            value={obUrl}
            onChange={e => setTop('generalOnboarding', e.target.value)}
          />
          {obYtId && (
            <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 400, background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${obYtId}`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="General onboarding tutorial"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Courier API Tutorials ──────────────────────────────────────── */}
      <div style={th.card}>
        <CardHeader th={th} title="🚚 Courier API Tutorial Videos"
          sub="Client রা courier API setup করার সময় এই video দেখবে। YouTube URL দিন।"
        />
        <div style={{ ...th.card2, ...th.alert, ...th.alertInfo, marginBottom: 18, fontSize: 12.5 }}>
          💡 প্রতিটা courier এর settings page এ এই tutorial video দেখাবে।
          Client সহজেই বুঝতে পারবে কোথায় গিয়ে API key নিতে হবে।
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {COURIERS.map(c => {
            const url  = (tutorials.courier as any)?.[c.key] || '';
            const ytId = extractId(url);
            return (
              <div key={c.key} style={{ ...th.card2, borderRadius: 14, border: `1.5px solid ${c.color}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 20 }}>{c.icon}</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: c.color }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: th.muted }}>{c.desc}</div>
                  </div>
                  {url && <span style={{ ...th.pill, ...th.pillGreen, fontSize: 10, marginLeft: 'auto' }}>✓ Set</span>}
                </div>
                <input
                  style={{ ...th.input, marginBottom: ytId ? 12 : 0 }}
                  placeholder={`${c.label} setup tutorial YouTube URL...`}
                  value={url}
                  onChange={e => setCourier(c.key, e.target.value)}
                />
                {ytId && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 400, background: '#000' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}`}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen title={`${c.label} tutorial`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button style={{ ...th.btnPrimary, marginTop: 18 }} onClick={saveTutorials} disabled={saving}>
          {saving ? <><Spinner size={13}/> Saving…</> : '💾 Save All Tutorial Videos'}
        </button>
      </div>
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  trial: '#f59e0b', active: '#16a34a', expired: '#ef4444',
  grace: '#f97316', cancelled: '#9ca3af', pending: '#3b82f6', confirmed: '#16a34a', failed: '#ef4444',
};

function BillingTab({ th, data, supportConfig, loading, subFilter, setSubFilter, onRefresh, onConfirmPayment, onSetSubscription, onSaveSupport }: {
  th: Theme;
  data: { subscriptions: any[]; pending: any[] };
  supportConfig: BillingSupportConfig;
  loading: boolean;
  subFilter: string;
  setSubFilter: (v: string) => void;
  onRefresh: () => void;
  onConfirmPayment: (id: string, plan?: string) => void;
  onSetSubscription: (userId: string, payload: any) => void;
  onSaveSupport: (payload: BillingSupportConfig) => void;
}) {
  const [setSubModal, setSetSubModal] = useState<any>(null);
  const [setSubForm, setSetSubFormState] = useState<any>({
    planName: 'starter',
    status: 'active',
    days: 30,
    ordersLimit: 500,
    note: '',
    featureAccess: { ...DEFAULT_FEATURE_ACCESS },
  });
  const [supportForm, setSupportForm] = useState<BillingSupportConfig>(supportConfig || {});

  const PLANS = ['starter', 'pro', 'enterprise'];
  const STATUSES = ['trial', 'active', 'grace', 'expired', 'cancelled'];

  useEffect(() => {
    setSupportForm(supportConfig || {});
  }, [supportConfig]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>💳 Billing Management</h2>
          <p style={{ fontSize: 12.5, color: th.muted, margin: '3px 0 0' }}>Subscriptions, payments, and plan management</p>
        </div>
        <button style={th.btnGhost} onClick={onRefresh}>{loading ? <Spinner size={13}/> : '🔄 Refresh'}</button>
      </div>

      <div style={{ ...th.card }}>
        <CardHeader
          th={th}
          title="📞 Client Contact Admin"
          sub="Client dashboard-এ package submit এর বদলে এই contact info দেখাবে"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Label</div>
            <input style={th.input} value={supportForm.label || ''} onChange={e => setSupportForm(f => ({ ...f, label: e.target.value }))} placeholder="Admin Support" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Phone</div>
            <input style={th.input} value={supportForm.phone || ''} onChange={e => setSupportForm(f => ({ ...f, phone: e.target.value }))} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>WhatsApp URL</div>
            <input style={th.input} value={supportForm.whatsappUrl || ''} onChange={e => setSupportForm(f => ({ ...f, whatsappUrl: e.target.value }))} placeholder="https://wa.me/8801..." />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Messenger URL</div>
            <input style={th.input} value={supportForm.messengerUrl || ''} onChange={e => setSupportForm(f => ({ ...f, messengerUrl: e.target.value }))} placeholder="https://m.me/..." />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Email</div>
            <input style={th.input} value={supportForm.email || ''} onChange={e => setSupportForm(f => ({ ...f, email: e.target.value }))} placeholder="support@example.com" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Note</div>
          <textarea
            style={{ ...th.input, minHeight: 82, resize: 'vertical', fontFamily: 'inherit' }}
            value={supportForm.note || ''}
            onChange={e => setSupportForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Client-কে কীভাবে যোগাযোগ করতে হবে সেটা লিখুন"
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={th.btnPrimary} onClick={() => onSaveSupport(supportForm)}>💾 Save Contact Info</button>
        </div>
      </div>

      {/* Pending Payments */}
      {data.pending.length > 0 && (
        <div style={{ ...th.card, border: `1.5px solid #f59e0b44` }}>
          <CardHeader th={th} title={`⏳ Pending Payments (${data.pending.length})`}
            sub="এই payments গুলো confirm করুন subscription activate করতে" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pending.map((p: any) => (
              <div key={p.id} style={{ ...th.card2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {p.subscription?.user?.name || p.subscription?.user?.username}
                    <span style={{ ...th.pill, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', fontSize: 10, marginLeft: 8 }}>PENDING</span>
                  </div>
                  <div style={{ fontSize: 12, color: th.muted }}>
                    ৳{p.amount} · {p.method} · Txn: <b>{p.transactionId}</b>
                  </div>
                  <div style={{ fontSize: 11, color: th.muted }}>
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {PLANS.map(plan => (
                    <button key={plan} style={{ ...th.btnSmAccent, background: plan === 'pro' ? th.accent : undefined }}
                      onClick={() => onConfirmPayment(p.id, plan)}>
                      ✅ {plan}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Subscriptions */}
      <div style={th.card}>
        <CardHeader th={th} title="📋 All Subscriptions"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={{ ...th.input, width: 120, padding: '5px 10px', fontSize: 12 }}
                value={subFilter} onChange={e => { setSubFilter(e.target.value); setTimeout(onRefresh, 50); }}>
                <option value="">All Status</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          }
        />
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}><Spinner size={20}/></div>
        ) : data.subscriptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: th.muted, fontSize: 13 }}>কোনো subscription নেই</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.subscriptions.map((sub: any) => (
              <div key={sub.id} style={{ ...th.card2 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>
                        {sub.user?.name || sub.user?.username}
                      </span>
                      <span style={{ fontSize: 11, color: th.muted }}>{sub.user?.email}</span>
                      <span style={{
                        ...th.pill,
                        background: `${STATUS_COLOR[sub.status] || '#9ca3af'}22`,
                        color: STATUS_COLOR[sub.status] || '#9ca3af',
                        border: `1px solid ${STATUS_COLOR[sub.status] || '#9ca3af'}44`,
                        fontSize: 10,
                      }}>{sub.status.toUpperCase()}</span>
                      <span style={{ ...th.pill, background: th.accentSoft, color: th.accent, fontSize: 10 }}>
                        {sub.plan?.displayName || sub.plan?.name || 'starter'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: th.muted }}>
                      Orders: {sub.ordersUsed}/{sub.ordersLimit === -1 ? '∞' : sub.ordersLimit} ·
                      Period ends: {new Date(sub.periodEnd).toLocaleDateString()} ·
                      Created: {new Date(sub.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button style={th.btnSmGhost}
                    onClick={() => {
                      const firstPage = sub.user?.pages?.[0];
                      const featureAccess = { ...DEFAULT_FEATURE_ACCESS };
                      for (const item of BILLING_FEATURES) {
                        featureAccess[item.key] = firstPage?.[item.key] !== false;
                      }
                      setSetSubModal(sub);
                      setSetSubFormState({
                        planName: sub.plan?.name || 'starter',
                        status: sub.status,
                        days: 30,
                        ordersLimit: sub.ordersLimit === -1 ? -1 : Number(sub.ordersLimit || 0),
                        note: sub.note || '',
                        featureAccess,
                      });
                    }}>
                    ✏️ Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set Subscription Modal */}
      {setSubModal && (
        <div style={{ ...th.card, border: `2px solid ${th.accent}` }}>
          <CardHeader th={th}
            title={`✏️ Edit Subscription — ${setSubModal.user?.name || setSubModal.user?.username}`}
            action={<button style={th.btnGhost} onClick={() => setSetSubModal(null)}>✕</button>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Plan</div>
              <select style={th.input} value={setSubForm.planName}
                onChange={e => setSetSubFormState((f: any) => ({ ...f, planName: e.target.value }))}>
                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Status</div>
              <select style={th.input} value={setSubForm.status}
                onChange={e => setSetSubFormState((f: any) => ({ ...f, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Days</div>
              <input style={th.input} type="number" min={1} max={365}
                value={setSubForm.days}
                onChange={e => setSetSubFormState((f: any) => ({ ...f, days: Number(e.target.value) }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Orders Limit</div>
              <input style={th.input} type="number" min={-1}
                value={setSubForm.ordersLimit}
                onChange={e => setSetSubFormState((f: any) => ({ ...f, ordersLimit: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase' }}>Admin Note</div>
            <textarea
              style={{ ...th.input, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
              value={setSubForm.note}
              onChange={e => setSetSubFormState((f: any) => ({ ...f, note: e.target.value }))}
              placeholder="কেন update/downgrade করা হচ্ছে লিখে রাখুন"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 8, textTransform: 'uppercase' }}>Feature Access</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {BILLING_FEATURES.map(item => (
                <label key={item.key} style={{ ...th.card2, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 12px' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(setSubForm.featureAccess?.[item.key])}
                    onChange={e => setSetSubFormState((f: any) => ({
                      ...f,
                      featureAccess: { ...(f.featureAccess || {}), [item.key]: e.target.checked },
                    }))}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: th.text }}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={th.btnPrimary}
              onClick={() => {
                onSetSubscription(setSubModal.user?.id, {
                  planName: setSubForm.planName,
                  status: setSubForm.status,
                  periodDays: setSubForm.days,
                  ordersLimit: setSubForm.ordersLimit,
                  note: setSubForm.note,
                  featureAccess: setSubForm.featureAccess,
                });
                setSetSubModal(null);
              }}>
              💾 Save
            </button>
            <button style={th.btnGhost} onClick={() => setSetSubModal(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
