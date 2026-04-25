import { Component, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import type { OrdersPagePreset } from './OrdersPage';
import type { PrintPagePreset } from './PrintPage';
import type { FollowUpPagePreset } from './FollowUpPage';
import type { AccountingPagePreset } from './AccountingPage';
import { getTheme, LanguageSwitch, Spinner, Toast, safeLazy } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Lazy page imports ──────────────────────────────────────────────────────────
const OrdersPage      = safeLazy(() => import('./OrdersPage').then(m => ({ default: m.OrdersPage })));
const ProductsPage    = safeLazy(() => import('./ProductsPage').then(m => ({ default: m.ProductsPage })));
const SettingsPage    = safeLazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage })));
const AccountingPage  = safeLazy(() => import('./AccountingPage').then(m => ({ default: m.AccountingPage })));
const AnalyticsPage   = safeLazy(() => import('./AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const MotivationPage  = safeLazy(() => import('./MotivationPage').then(m => ({ default: m.MotivationPage })));
const AgentTasksPage  = safeLazy(() => import('./AgentTasksPage').then(m => ({ default: m.AgentTasksPage })));
const BotKnowledgePage= safeLazy(() => import('./BotKnowledgePage').then(m => ({ default: m.BotKnowledgePage })));
const PrintPage       = safeLazy(() => import('./PrintPage').then(m => ({ default: m.PrintPage })));
const MemoTemplatePage= safeLazy(() => import('./MemoTemplatePage').then(m => ({ default: m.MemoTemplatePage })));
const CrmPage         = safeLazy(() => import('./CrmPage').then(m => ({ default: m.CrmPage })));
const CourierPage     = safeLazy(() => import('./CourierPage').then(m => ({ default: m.CourierPage })));
const BroadcastPage   = safeLazy(() => import('./BroadcastPage').then(m => ({ default: m.BroadcastPage })));
const FollowUpPage    = safeLazy(() => import('./FollowUpPage').then(m => ({ default: m.FollowUpPage })));
const CatalogPage     = safeLazy(() => import('./CatalogPage').then(m => ({ default: m.CatalogPage })));
const WalletPage      = safeLazy(() => import('./WalletPage') as any);
const FraudCheckerPage = safeLazy(() => import('./FraudCheckerPage') as any);

// ── Error boundary for individual pages ───────────────────────────────────────
class PageErrorBoundary extends Component<{ children: any; name: string }, { error: any }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: e }; }
  componentDidCatch(error: any) {
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      /error loading dynamically imported module/i.test(error.message) ||
      /loading dynamically imported module/i.test(error.message);
    if (isChunkError) {
      console.warn('Chunk error detected in boundary, reloading...', error);
      window.location.reload();
    }
  }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, color: '#ef4444', fontFamily: 'monospace', fontSize: 13 }}>
        <b>Error in {this.props.name}:</b> {this.state.error?.message || String(this.state.error)}
      </div>
    );
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type NavKey = 'OVERVIEW' | 'ORDERS' | 'PRODUCTS' | 'ACCOUNTING' | 'ANALYTICS' |
  'BOT_KNOWLEDGE' | 'PRINT' | 'MEMO_TEMPLATE' |
  'CRM' | 'COURIER' | 'BROADCAST' | 'FOLLOWUP' | 'CATALOG' | 'AGENT_TASKS' |
  'PAGE' | 'NEGOTIATION' | 'CALL' | 'VOICE' | 'WALLET' | 'FRAUD_CHECKER';

interface NavItem {
  key:   NavKey;
  bn: string;
  en: string;
  icon:  string;
  group: 'main' | 'manage' | 'tools' | 'settings';
  badge?: string;
}

const NAV: NavItem[] = [
  { key: 'OVERVIEW',       bn: 'ওভারভিউ',            en: 'Overview',        icon: '⊹', group: 'main' },
  { key: 'AGENT_TASKS',    bn: 'এজেন্ট টাস্ক',       en: 'Agent Tasks',     icon: '✦', group: 'main' },
  { key: 'ORDERS',         bn: 'অর্ডার',             en: 'Orders',          icon: '📦', group: 'main' },
  { key: 'PRODUCTS',       bn: 'প্রোডাক্ট',          en: 'Products',        icon: '🏷', group: 'main' },
  { key: 'ACCOUNTING',     bn: 'হিসাব',              en: 'Accounting',      icon: '💼', group: 'main' },
  { key: 'ANALYTICS',      bn: 'অ্যানালিটিক্স',      en: 'Analytics',       icon: '📊', group: 'main' },
  { key: 'BOT_KNOWLEDGE',  bn: 'বট নলেজ',           en: 'Bot Knowledge',   icon: '🧠', group: 'manage' },
  { key: 'CRM',            bn: 'কাস্টমার',           en: 'Customers',       icon: '👥', group: 'manage' },
  { key: 'CATALOG',        bn: 'ক্যাটালগ',           en: 'Catalog',         icon: '📋', group: 'manage' },
  { key: 'COURIER',        bn: 'কুরিয়ার',            en: 'Courier',         icon: '🚚', group: 'tools' },
  { key: 'FRAUD_CHECKER',  bn: 'ফ্রড চেকার',         en: 'Fraud Checker',   icon: '🛡', group: 'tools' },
  { key: 'BROADCAST',      bn: 'ব্রডকাস্ট',          en: 'Broadcast',       icon: '📣', group: 'tools' },
  { key: 'FOLLOWUP',       bn: 'ফলো-আপ',            en: 'Follow-up',       icon: '🔔', group: 'tools' },
  { key: 'MEMO_TEMPLATE',  bn: 'মেমো টেমপ্লেট',      en: 'Memo Template',   icon: '📄', group: 'tools' },
  { key: 'PRINT',          bn: 'প্রিন্ট / ইনভয়েস',   en: 'Print / Invoice', icon: '🖨', group: 'tools' },
  { key: 'WALLET',         bn: 'ওয়ালেট',            en: 'Wallet',          icon: '💰', group: 'settings' },
  { key: 'PAGE',           bn: 'পেজ সেটিংস',        en: 'Page Settings',   icon: '⚙', group: 'settings' },
  { key: 'NEGOTIATION',    bn: 'নেগোশিয়েশন',        en: 'Negotiation',     icon: '🤝', group: 'settings' },
  { key: 'CALL',           bn: 'কল কনফার্ম',        en: 'Call Confirm',    icon: '📞', group: 'settings' },
  { key: 'VOICE',          bn: 'ভয়েস ও TTS',        en: 'Voice & TTS',     icon: '🎙', group: 'settings' },
];

const GROUPS = [
  { key: 'main',     bn: null,         en: null },
  { key: 'manage',   bn: 'ম্যানেজ',    en: 'Manage' },
  { key: 'tools',    bn: 'টুলস',       en: 'Tools' },
  { key: 'settings', bn: 'সেটিংস',     en: 'Settings' },
];

const NAV_KEYS = new Set<NavKey>(NAV.map((item) => item.key));
const LAST_NAV_KEY = 'dfbot_last_nav';

interface PageItem { id: number; pageId: string; pageName: string; masterPageId?: number | null; }
interface ToastItem { msg: string; type?: 'error' | 'success' | 'info'; id: number; }
interface BillingAdminContact {
  label?: string;
  phone?: string;
  whatsappUrl?: string;
  messengerUrl?: string;
  email?: string;
  note?: string;
  websiteUrl?: string;
}

function buildWhatsAppUrl(rawPhone?: string | null) {
  const digits = String(rawPhone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return `https://wa.me/${digits}`;
  if (digits.startsWith('0')) return `https://wa.me/88${digits}`;
  return `https://wa.me/${digits}`;
}

function navToParam(nav: NavKey) {
  return nav.toLowerCase().replace(/_/g, '-');
}

function paramToNav(value: string | null): NavKey | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/-/g, '_');
  return NAV_KEYS.has(normalized as NavKey) ? (normalized as NavKey) : null;
}

// ── DashboardLayout ────────────────────────────────────────────────────────────
export function DashboardLayout({
  dark,
  setDark,
  user,
  myPages = [],
  activePage: initialActivePage = null,
  onSelectPage,
  onManagePages,
  onLogout,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  user: any;
  myPages?: PageItem[];
  activePage?: PageItem | null;
  onSelectPage?: (page: PageItem) => void;
  onManagePages?: () => void;
  onLogout: () => void;
}) {
  const { copy, language } = useLanguage();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<PageItem | null>(initialActivePage);
  const [nav, setNav] = useState<NavKey>(() => {
    const navFromUrl = paramToNav(new URLSearchParams(window.location.search).get('tab'));
    if (navFromUrl) return navFromUrl;
    const scopedKey = initialActivePage?.id ? `dfbot_nav_${initialActivePage.id}` : '';
    const savedNav =
      (scopedKey ? localStorage.getItem(scopedKey) : null) ||
      localStorage.getItem(LAST_NAV_KEY);
    return savedNav && NAV_KEYS.has(savedNav as NavKey)
      ? (savedNav as NavKey)
      : 'OVERVIEW';
  });
  const [ordersPreset, setOrdersPreset] = useState<OrdersPagePreset | null>(null);
  const [printPreset, setPrintPreset] = useState<PrintPagePreset | null>(null);
  const [followUpPreset, setFollowUpPreset] = useState<FollowUpPagePreset | null>(null);
  const [accountingPreset, setAccountingPreset] = useState<AccountingPagePreset | null>(null);
  const [toasts, setToasts]         = useState<ToastItem[]>([]);
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [pageSubStatus, setPageSubStatus] = useState<any>(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingContact, setBillingContact] = useState<BillingAdminContact | null>(null);
  const [paymentForm, setPaymentForm] = useState({ method: 'bkash', amount: '', transactionId: '', note: '' });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main: true,
    manage: false,
    tools: false,
    settings: false,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { request } = useApi();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const th = getTheme(dark);

  useEffect(() => { setActivePage(initialActivePage); }, [initialActivePage]);

  useEffect(() => {
    if (!activePage?.id) return;
    localStorage.setItem('dfbot_active_page', String(activePage.id));
  }, [activePage?.id]);

  useEffect(() => {
    if (!initialActivePage?.id) return;
    const savedNav =
      localStorage.getItem(`dfbot_nav_${initialActivePage.id}`) ||
      localStorage.getItem(LAST_NAV_KEY);
    if (savedNav && NAV_KEYS.has(savedNav as NavKey)) {
      setNav(savedNav as NavKey);
    }
  }, [initialActivePage?.id]);

  useEffect(() => {
    if (!activePage?.id) return;
    localStorage.setItem(`dfbot_nav_${activePage.id}`, nav);
    localStorage.setItem(LAST_NAV_KEY, nav);
  }, [activePage?.id, nav]);

  useEffect(() => {
    const activeGroup = NAV.find((item) => item.key === nav)?.group;
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
  }, [nav]);

  useEffect(() => {
    if (!activePage?.id) return;
    const params = new URLSearchParams(window.location.search);
    params.set('mode', 'dashboard');
    params.set('page', String(activePage.id));
    params.set('tab', navToParam(nav));
    window.history.replaceState({}, '', `/?${params.toString()}`);
  }, [activePage?.id, nav]);


  useEffect(() => {
    request(`${API_BASE}/billing/status`).then(setBillingStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activePage?.id) return;
    request<any>(`${API_BASE}/client-dashboard/${activePage.id}/wallet`).then(wallet => {
      if (!wallet) return;
      const now = new Date();
      const expiry = wallet.nextBillingDate ? new Date(wallet.nextBillingDate) : null;
      const suspended = wallet.subscriptionStatus === 'SUSPENDED';
      const expired = expiry ? expiry < now : false;
      const daysLeft = expiry && !expired ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : 0;
      setPageSubStatus({ suspended, expired, daysLeft, expiry: wallet.nextBillingDate, status: wallet.subscriptionStatus });
    }).catch(() => {});
  }, [activePage?.id]);

  const loadBillingModalData = useCallback(async () => {
    setBillingLoading(true);
    try {
      const [status, pageSettings] = await Promise.all([
        request<any>(`${API_BASE}/billing/status`),
        activePage?.id
          ? request<any>(`${API_BASE}/client-dashboard/${activePage.id}/settings`).catch(() => null)
          : Promise.resolve(null),
      ]);
      setBillingStatus(status);
      const adminContact = status?.adminContact || {};
      const fallbackContact = {
        label: pageSettings?.businessName || adminContact?.label || 'Admin Support',
        phone: adminContact?.phone || pageSettings?.businessPhone || '',
        messengerUrl:
          adminContact?.messengerUrl ||
          pageSettings?.catalogMessengerUrl ||
          (pageSettings?.fbPageId ? `https://m.me/${pageSettings.fbPageId}` : ''),
        whatsappUrl:
          adminContact?.whatsappUrl ||
          buildWhatsAppUrl(pageSettings?.businessPhone),
        email: adminContact?.email || '',
        websiteUrl: pageSettings?.websiteUrl || '',
        note:
          adminContact?.note ||
          copy(
            'প্রয়োজনে আপনার page link, WhatsApp, বা Messenger দিয়েও admin/contact টিমের সাথে কথা বলতে পারেন।',
            'You can also use your page link, WhatsApp, or Messenger to contact the admin or support team.',
          ),
      };
      setBillingContact(fallbackContact);
    } catch (e: any) {
      showToast(e.message || 'Failed to load billing info', 'error');
    } finally {
      setBillingLoading(false);
    }
  }, [API_BASE, activePage?.id, copy, request]);

  const handleSubmitPayment = useCallback(async () => {
    if (!paymentForm.transactionId.trim()) { showToast('Transaction ID দিন', 'error'); return; }
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) { showToast('Amount দিন', 'error'); return; }
    setPaymentSubmitting(true);
    try {
      await request(`${API_BASE}/billing/payments/submit`, {
        method: 'POST',
        body: JSON.stringify({ method: paymentForm.method, amount: Number(paymentForm.amount), transactionId: paymentForm.transactionId.trim(), note: paymentForm.note }),
      });
      setPaymentSuccess(true);
      setPaymentForm({ method: 'bkash', amount: '', transactionId: '', note: '' });
      showToast('Payment submitted! Admin confirm করলে plan activate হবে।', 'success');
    } catch (e: any) {
      showToast(e.message || 'Payment submit failed', 'error');
    } finally {
      setPaymentSubmitting(false);
    }
  }, [API_BASE, paymentForm, request]);

  const openBillingModal = useCallback(async () => {
    setPaymentSuccess(false);
    setBillingOpen(true);
    await loadBillingModalData();
  }, [loadBillingModalData]);

  const showToast = (msg: string, type?: any) => {
    const id = Date.now();
    setToasts(t => [...t, { msg, type: type || 'success', id }]);
  };

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQ('');
    setSearchResults(null);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // Ctrl+K → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  // Debounced search
  useEffect(() => {
    if (!searchOpen || !activePage) return;
    const q = searchQ.trim();
    if (q.length < 1) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await request(`${API_BASE}/client-dashboard/${activePage.id}/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
      } catch (e: any) { showToast(e.message, 'error'); }
      finally { setSearchLoading(false); }
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQ, searchOpen, activePage]);

  if (!activePage) return (
    <div style={{ ...th.app, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={22} color={th.accent} />
    </div>
  );

  const pageId = activePage.id;
  const navGroups = GROUPS.map(g => ({ ...g, items: NAV.filter(n => n.group === g.key) }));

  const pageFallback = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: th.muted }}>
      <Spinner size={18} /> {copy('লোড হচ্ছে...', 'Loading...')}
    </div>
  );

  const openOrdersWithPreset = useCallback((preset: OrdersPagePreset) => {
    setOrdersPreset(preset);
    setNav('ORDERS');
  }, []);

  const openPrintWithPreset = useCallback((preset: PrintPagePreset) => {
    setPrintPreset(preset);
    setNav('PRINT');
  }, []);

  const openFollowUpWithPreset = useCallback((preset: FollowUpPagePreset) => {
    setFollowUpPreset(preset);
    setNav('FOLLOWUP');
  }, []);

  const openAccountingWithPreset = useCallback((preset: AccountingPagePreset) => {
    setAccountingPreset(preset);
    setNav('ACCOUNTING');
  }, []);

  const openSettingsTab = useCallback((tab: 'PAGE' | 'NEGOTIATION' | 'CALL' | 'VOICE') => {
    setNav(tab);
  }, []);

  const openNavItem = useCallback((key: NavKey) => {
    if (key === 'ORDERS') setOrdersPreset(null);
    if (key === 'PRINT') setPrintPreset(null);
    if (key === 'FOLLOWUP') setFollowUpPreset(null);
    if (key === 'ACCOUNTING') setAccountingPreset(null);
    setNav(key);
    setSidebarOpen(false); // close sidebar on mobile after navigation
  }, []);

  const renderPage = () => {
    // Settings-like tabs share SettingsPage with tab prop
    if (nav === 'PAGE' || nav === 'NEGOTIATION' || nav === 'CALL' || nav === 'VOICE') {
      const tabMap: Record<string, string> = { PAGE: 'PAGE', NEGOTIATION: 'NEGOTIATION', CALL: 'CALL', VOICE: 'VOICE' };
      return (
        <PageErrorBoundary name="SettingsPage">
          <Suspense fallback={pageFallback}>
            <SettingsPage th={th} pageId={pageId} tab={tabMap[nav]} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
    }
    switch (nav) {
      case 'OVERVIEW':    return (
        <PageErrorBoundary name="MotivationPage">
          <Suspense fallback={pageFallback}>
            <MotivationPage
              th={th}
              pageId={pageId}
              onToast={showToast}
              onOpenAgentTasks={() => setNav('AGENT_TASKS')}
              onOpenOrders={openOrdersWithPreset}
            />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'AGENT_TASKS': return (
        <PageErrorBoundary name="AgentTasksPage">
          <Suspense fallback={pageFallback}>
            <AgentTasksPage th={th} pageId={pageId} onToast={showToast} onOpenOrders={openOrdersWithPreset} onOpenPrint={openPrintWithPreset} onOpenFollowUp={openFollowUpWithPreset} onOpenAccounting={openAccountingWithPreset} onOpenSettings={openSettingsTab} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'ORDERS':      return (
        <PageErrorBoundary name="OrdersPage">
          <Suspense fallback={pageFallback}>
            <OrdersPage th={th} pageId={pageId} onToast={showToast} preset={ordersPreset} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'PRODUCTS':    return (
        <PageErrorBoundary name="ProductsPage">
          <Suspense fallback={pageFallback}>
            <ProductsPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'ACCOUNTING':  return (
        <PageErrorBoundary name="AccountingPage">
          <Suspense fallback={pageFallback}>
            <AccountingPage th={th} pageId={pageId} onToast={showToast} preset={accountingPreset} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'ANALYTICS':   return (
        <PageErrorBoundary name="AnalyticsPage">
          <Suspense fallback={pageFallback}>
            <AnalyticsPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'BOT_KNOWLEDGE': return (
        <PageErrorBoundary name="BotKnowledgePage">
          <Suspense fallback={pageFallback}>
            <BotKnowledgePage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'CRM':         return (
        <PageErrorBoundary name="CrmPage">
          <Suspense fallback={pageFallback}>
            <CrmPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'CATALOG':     return (
        <PageErrorBoundary name="CatalogPage">
          <Suspense fallback={pageFallback}>
            <CatalogPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'COURIER':     return (
        <PageErrorBoundary name="CourierPage">
          <Suspense fallback={pageFallback}>
            <CourierPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'BROADCAST':   return (
        <PageErrorBoundary name="BroadcastPage">
          <Suspense fallback={pageFallback}>
            <BroadcastPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'FOLLOWUP':    return (
        <PageErrorBoundary name="FollowUpPage">
          <Suspense fallback={pageFallback}>
            <FollowUpPage th={th} pageId={pageId} onToast={showToast} preset={followUpPreset} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'PRINT':       return (
        <PageErrorBoundary name="PrintPage">
          <Suspense fallback={pageFallback}>
            <PrintPage th={th} pageId={pageId} onToast={showToast} preset={printPreset} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'MEMO_TEMPLATE': return (
        <PageErrorBoundary name="MemoTemplatePage">
          <Suspense fallback={pageFallback}>
            <MemoTemplatePage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'WALLET': return (
        <PageErrorBoundary name="WalletPage">
          <Suspense fallback={pageFallback}>
            <WalletPage th={th} pageId={pageId} onToast={showToast} />
          </Suspense>
        </PageErrorBoundary>
      );
      case 'FRAUD_CHECKER': return (
        <PageErrorBoundary name="FraudCheckerPage">
          <Suspense fallback={pageFallback}>
            <FraudCheckerPage th={th} pageId={pageId} />
          </Suspense>
        </PageErrorBoundary>
      );
      default: return null;
    }
  };

  return (
    <div style={th.app}>
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header style={th.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              style={{ ...th.btnGhost, padding: '6px 9px', fontSize: 18, borderRadius: 8, lineHeight: 1 }}
              aria-label="Toggle menu"
            >
              ☰
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="Chatcat" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%' }} />
            {!isMobile && <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em', color: th.text }}>Chatcat</span>}
          </div>

          {myPages.length > 1 ? (
            <select
              value={String(activePage.id)}
              onChange={(e) => {
                const next = myPages.find((page) => page.id === Number(e.target.value));
                if (!next) return;
                setActivePage(next);
                onSelectPage?.(next);
                setSearchOpen(false);
              }}
              style={{
                minWidth: isMobile ? 110 : 220,
                maxWidth: isMobile ? 160 : 320,
                padding: '7px 8px',
                borderRadius: 8,
                border: `1px solid ${th.border}`,
                background: th.panel,
                color: th.text,
                fontSize: isMobile ? 12 : 13,
                fontWeight: 600,
                outline: 'none',
              }}
              title={copy('পেজ পরিবর্তন করুন', 'Switch page')}
            >
              {myPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.masterPageId ? `↳ ${page.pageName || page.pageId}` : (page.pageName || page.pageId)}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: isMobile ? 12 : 13, color: th.muted, fontWeight: 500, maxWidth: isMobile ? 110 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activePage.pageName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8 }}>
          {/* Search — icon only on mobile */}
          <button onClick={openSearch}
            style={{ ...th.btnGhost, padding: isMobile ? '7px 9px' : '6px 14px', fontSize: 13, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7, color: th.muted }}>
            🔍
            {!isMobile && <><span>{copy('সার্চ', 'Search')}</span>
            <span style={{ fontSize: 10.5, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 4, padding: '1px 5px', color: th.muted, letterSpacing: '0.02em' }}>Ctrl+K</span></>}
          </button>

          {/* Facebook Page — hidden on mobile */}
          {!isMobile && (
            <button
              onClick={onManagePages}
              style={{ ...th.btnGhost, padding: '6px 10px', fontSize: 12, borderRadius: 8 }}
              title={copy('পেজ connect / disconnect করুন', 'Manage connected Facebook pages')}
            >
              {copy('Facebook Page', 'Facebook Page')}
            </button>
          )}

          <LanguageSwitch dark={dark} compact />

          <button onClick={() => setDark(!dark)} style={{ ...th.btnGhost, padding: '6px 10px', fontSize: 15, borderRadius: 8 }}>
            {dark ? '☀' : '☾'}
            {!isMobile && <span style={{ fontSize: 13 }}>{dark ? copy(' লাইট', ' Light') : copy(' ডার্ক', ' Dark')}</span>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: th.accentSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: th.accentText, flexShrink: 0,
            }}>
              {(user?.name || user?.username || 'U')[0].toUpperCase()}
            </div>
            {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: th.textSub }}>{user?.name || user?.username}</span>}
            <button onClick={onLogout} style={{ ...th.btnGhost, padding: '5px 10px', fontSize: 12 }}>{copy('লগআউট', 'Logout')}</button>
          </div>
        </div>
      </header>

      {/* ── Server Subscription Banner (per-page, admin-controlled) ─────── */}
      {pageSubStatus && (() => {
        if (pageSubStatus.suspended || pageSubStatus.expired) return (
          <div style={{ background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>❌ Subscription মেয়াদ শেষ — admin update না করা পর্যন্ত নতুন অর্ডার নেওয়া বন্ধ আছে</span>
            <button onClick={() => void openBillingModal()} style={{ background: '#fff', color: '#ef4444', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Contact Admin</button>
          </div>
        );
        if (pageSubStatus.daysLeft <= 2 && pageSubStatus.daysLeft > 0) return (
          <div style={{ background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>⚠️ Server subscription আর মাত্র {pageSubStatus.daysLeft} দিন বাকি — WhatsApp এ payment করুন</span>
            <button onClick={() => void openBillingModal()} style={{ background: '#fff', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Contact Admin</button>
          </div>
        );
        return null;
      })()}

      <div style={{ ...th.layout, ...(isMobile ? { display: 'block', gridTemplateColumns: undefined } : {}) }}>
        {/* ── Mobile sidebar backdrop ──────────────────────────────────── */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <nav style={{
          ...th.sidebar,
          ...(isMobile ? {
            position: 'fixed',
            top: 0,
            left: sidebarOpen ? 0 : -290,
            bottom: 0,
            width: 272,
            height: '100vh',
            zIndex: 200,
            transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
            paddingTop: 56,
          } : {}),
        }}>
          {/* Mobile close button inside sidebar */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'absolute', top: 14, right: 14, ...th.btnGhost, padding: '4px 10px', fontSize: 16, borderRadius: 8, lineHeight: 1 }}
            >✕</button>
          )}

          {navGroups.map(g => (
            <div key={g.key} style={{ marginBottom: 4 }}>
              {(() => {
                const label = language === 'en' ? g.en : g.bn;
                const isOpen = openGroups[g.key];
                const hasLabel = Boolean(label);
                if (hasLabel) {
                  return (
                    <button
                      onClick={() => setOpenGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'transparent',
                        border: 'none',
                        color: th.muted,
                        padding: '10px 10px 5px',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.09em',
                        textTransform: 'uppercase',
                        opacity: 0.6,
                      }}
                    >
                      <span>{label}</span>
                      <span style={{
                        fontSize: 9, opacity: 0.7,
                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.18s ease',
                        display: 'inline-block',
                      }}>▾</span>
                    </button>
                  );
                }
                return null;
              })()}
              {(openGroups[g.key] || !(language === 'en' ? g.en : g.bn)) && g.items.map(item => {
                const isActive = nav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => openNavItem(item.key)}
                    className={`nav-lift${isActive ? ' nav-active-glow' : ''}`}
                    style={{ ...th.navBtn, ...(isActive ? th.navBtnActive : {}), marginBottom: 2 }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, lineHeight: 1,
                      background: isActive
                        ? 'rgba(99,102,241,0.22)'
                        : 'rgba(255,255,255,0.05)',
                      transition: 'background .12s',
                    }}>{item.icon}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{language === 'en' ? item.en : item.bn}</span>
                    {item.badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 6px',
                        borderRadius: 5, background: th.accentSoft,
                        color: th.accentText, letterSpacing: '0.05em',
                      }}>{item.badge}</span>
                    )}
                    {isActive && (
                      <span style={{ width: 5, height: 16, borderRadius: 3, background: th.accent, flexShrink: 0, boxShadow: `0 0 8px ${th.accent}99` }} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── Main Content ─────────────────────────────────────────────── */}
        <main style={{ ...th.main, ...(isMobile ? { padding: '16px 14px' } : {}) }}>
          <div key={nav} className="page-enter" style={{ minHeight: '100%' }}>
            {renderPage()}
          </div>
        </main>
      </div>

      {/* ── Toasts ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 16, right: isMobile ? 8 : 24, left: isMobile ? 8 : 'auto', zIndex: 10020, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(ts => ts.filter(x => x.id !== t.id))} />
        ))}
      </div>

      {billingOpen && (
        <div
          onClick={() => setBillingOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 720, maxHeight: isMobile ? '88vh' : '86vh', overflowY: 'auto', background: th.panel, border: `1px solid ${th.border}`, borderRadius: isMobile ? '18px 18px 0 0' : 18, boxShadow: '0 24px 80px rgba(0,0,0,0.45)', padding: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: th.text }}>{copy('Subscription Access', 'Subscription Access')}</div>
                <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>
                  {copy('Subscription, feature access, আর usage duration এখন admin manually control করবে।', 'Subscription, feature access, and usage duration are now controlled manually by the admin.')}
                </div>
              </div>
              <button onClick={() => setBillingOpen(false)} style={{ ...th.btnGhost, padding: '6px 10px', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            {billingLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 36 }}>
                <Spinner size={22} color={th.accent} />
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr', gap: 16, marginBottom: 18 }}>
                  <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      {copy('Contact Admin', 'Contact Admin')}
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ ...th.card2, borderRadius: 12, lineHeight: 1.7, fontSize: 13, color: th.text }}>
                        {copy('Plan কিনতে Messenger বা WhatsApp-এ admin-এর সাথে কথা বলুন। তারপর bKash/Nagad-এ payment করে নিচে Transaction ID submit করুন।', 'Contact admin via Messenger or WhatsApp to buy a plan. Then send payment via bKash/Nagad and submit the Transaction ID below.')}
                      </div>

                      {billingContact?.note && (
                        <div style={{ ...th.card2, borderRadius: 12, lineHeight: 1.65, fontSize: 12.5, color: th.muted }}>
                          {billingContact.note}
                        </div>
                      )}

                      {billingContact?.phone && (
                        <div style={{ ...th.card2, borderRadius: 12, display: 'grid', gap: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {copy('bKash / Nagad নম্বর', 'bKash / Nagad Number')}
                          </div>
                          <div style={{ color: th.text, fontWeight: 800, fontSize: 15 }}>{billingContact.phone}</div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>{copy('Send Money করুন এই নম্বরে', 'Send Money to this number')}</div>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {billingContact?.messengerUrl && (
                          <a href={billingContact.messengerUrl} target="_blank" rel="noreferrer" style={{ ...th.btn, padding: '9px 16px', textDecoration: 'none' }}>
                            💬 {copy('Messenger এ কথা বলুন', 'Message on Messenger')}
                          </a>
                        )}
                        {billingContact?.whatsappUrl && (
                          <a href={billingContact.whatsappUrl} target="_blank" rel="noreferrer" style={{ ...th.btnGhost, padding: '9px 16px', textDecoration: 'none' }}>
                            💚 {copy('WhatsApp এ কথা বলুন', 'Message on WhatsApp')}
                          </a>
                        )}
                      </div>

                      {/* Payment submission form */}
                      <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 12, display: 'grid', gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {copy('Payment Submit করুন', 'Submit Payment')}
                        </div>
                        {paymentSuccess ? (
                          <div style={{ background: '#10b98122', border: '1px solid #10b98144', borderRadius: 10, padding: 14, color: '#10b981', fontWeight: 700, fontSize: 13 }}>
                            ✅ {copy('Payment submitted! Admin confirm করলে plan activate হবে।', 'Payment submitted! Plan will activate after admin confirms.')}
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {(['bkash', 'nagad'] as const).map(m => (
                                <button key={m} onClick={() => setPaymentForm(f => ({ ...f, method: m }))}
                                  style={{ ...paymentForm.method === m ? th.btn : th.btnGhost, padding: '7px 18px', fontSize: 13, fontWeight: 700 }}>
                                  {m === 'bkash' ? '🔴 bKash' : '🟠 Nagad'}
                                </button>
                              ))}
                            </div>
                            <input
                              style={{ ...th.input, fontSize: 13 }}
                              placeholder={copy('Amount (৳)', 'Amount (৳)')}
                              type="number"
                              min={1}
                              value={paymentForm.amount}
                              onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                            />
                            <input
                              style={{ ...th.input, fontSize: 13 }}
                              placeholder={copy('Transaction ID', 'Transaction ID')}
                              value={paymentForm.transactionId}
                              onChange={e => setPaymentForm(f => ({ ...f, transactionId: e.target.value }))}
                            />
                            <input
                              style={{ ...th.input, fontSize: 13 }}
                              placeholder={copy('Note (optional) — কোন plan নিতে চান ইত্যাদি', 'Note (optional)')}
                              value={paymentForm.note}
                              onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                            />
                            <button
                              onClick={handleSubmitPayment}
                              disabled={paymentSubmitting}
                              style={{ ...th.btn, opacity: paymentSubmitting ? 0.6 : 1 }}
                            >
                              {paymentSubmitting ? copy('Submitting…', 'Submitting…') : copy('✅ Payment Submit করুন', '✅ Submit Payment')}
                            </button>
                          </>
                        )}
                      </div>

                      <button onClick={() => setBillingOpen(false)} style={{ ...th.btnGhost, padding: '9px 16px', marginTop: 2 }}>
                        {copy('বন্ধ করুন', 'Close')}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        {copy('Current Plan', 'Current Plan')}
                      </div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: th.text }}>{billingStatus?.planDisplay || 'Starter'}</div>
                      <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>
                        {copy('Status', 'Status')}: <span style={{ color: th.text, fontWeight: 700 }}>{billingStatus?.status || '-'}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>
                        {copy('Monthly Price', 'Monthly Price')}: <span style={{ color: th.text, fontWeight: 700 }}>{billingStatus?.priceMonthly || 0} BDT</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>
                        {copy('Days Left', 'Days Left')}: <span style={{ color: th.text, fontWeight: 700 }}>{billingStatus?.daysLeft ?? '-'}</span>
                      </div>
                    </div>

                    <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        {copy('Admin Controlled Access', 'Admin Controlled Access')}
                      </div>
                      <div style={{ fontSize: 12.5, color: th.muted, lineHeight: 1.7 }}>
                        {copy('Admin চাইলে আপনার package upgrade/downgrade, feature চালু/বন্ধ, order limit, আর কতদিন use করবেন সব change করতে পারবে।', 'The admin can upgrade or downgrade your package, enable or disable features, set order limits, and decide how long your access stays active.')}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: th.accentSoft, border: `1px solid ${th.border}`, borderRadius: 12, padding: 14, color: th.textSub, fontSize: 12.5, lineHeight: 1.7 }}>
                  {copy('bKash/Nagad-এ Send Money করুন → Transaction ID submit করুন → Admin confirm করলেই plan activate হবে।', 'Send Money via bKash/Nagad → Submit Transaction ID → Admin will confirm and activate your plan.')}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Global Search Modal ──────────────────────────────────────── */}
      {searchOpen && (
        <div onClick={() => setSearchOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-end' : 'flex-start', paddingTop: isMobile ? 0 : 80 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, maxHeight: isMobile ? '85vh' : '70vh', display: 'flex', flexDirection: 'column',
              background: th.panel, borderRadius: isMobile ? '16px 16px 0 0' : 16, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', border: `1px solid ${th.border}`, overflow: 'hidden',
              ...(isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0 } : {}) }}>

            {/* Search input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${th.border}` }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
              <input ref={searchInputRef} value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder={copy('নাম, ফোন, অর্ডার ID, প্রোডাক্ট কোড…', 'Search by name, phone, order ID, product code...')}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: th.text, padding: 0 }} />
              {searchLoading && <Spinner size={16} />}
              <kbd onClick={() => setSearchOpen(false)}
                style={{ fontSize: 11, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 4, padding: '2px 7px', color: th.muted, cursor: 'pointer' }}>Esc</kbd>
            </div>

            {/* Results */}
            <div style={{ overflowY: 'auto', flex: 1, padding: 12 }}>
              {!searchQ.trim() && (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: th.muted, fontSize: 13 }}>
                  {copy('নাম, ফোন, অর্ডার #ID, প্রোডাক্ট কোড দিয়ে খুঁজুন', 'Search using name, phone, order ID, or product code')}
                </div>
              )}

              {searchResults && searchResults.orders.length === 0 && searchResults.customers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: th.muted, fontSize: 13 }}>{copy('কোনো ফলাফল পাওয়া যায়নি', 'No results found')}</div>
              )}

              {/* Orders */}
              {searchResults?.orders?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 8px 8px' }}>
                    {copy(`অর্ডার (${searchResults.orders.length})`, `Orders (${searchResults.orders.length})`)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {searchResults.orders.map((o: any) => {
                      const statusColor: Record<string, string> = {
                        RECEIVED: '#3b82f6', CONFIRMED: '#10b981', CANCELLED: '#ef4444',
                        DELIVERED: '#8b5cf6', RETURNED: '#f97316',
                      };
                      const sc = statusColor[o.status] || th.muted;
                      const totalRefund = o.returnEntries?.reduce((s: number, r: any) => s + (r.refundAmount || 0), 0) || 0;
                      const totalCollected = o.collections?.reduce((s: number, c: any) => s + (c.amount || 0), 0) || 0;
                      return (
                        <div key={o.id}
                          style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px', cursor: 'default' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: th.text }}>#{o.id}</span>
                            <span style={{ background: sc + '22', color: sc, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{o.status}</span>
                            <span style={{ fontSize: 12, color: th.text, fontWeight: 600, marginLeft: 2 }}>{o.customerName || '—'}</span>
                            {o.phone && <span style={{ fontSize: 11.5, color: th.muted }}>📞 {o.phone}</span>}
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: th.muted }}>{new Date(o.createdAt).toLocaleDateString('en-BD')}</span>
                          </div>

                          {/* Items */}
                          {o.items?.length > 0 && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                              {o.items.map((it: any) => (
                                <span key={it.id} style={{ background: th.accentSoft, color: th.accentText, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                                  {it.productCode} ×{it.qty}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Stats row */}
                          <div style={{ display: 'flex', gap: 12, fontSize: 11.5, flexWrap: 'wrap' }}>
                            {totalCollected > 0 && (
                              <span style={{ color: '#10b981', fontWeight: 600 }}>{copy('💰 কালেকশন:', '💰 Collection:')} {totalCollected.toLocaleString()}</span>
                            )}
                            {o.returnEntries?.length > 0 && (
                              <span style={{ color: '#f97316', fontWeight: 600 }}>{copy('↩ রিটার্ন:', '↩ Returns:')} {o.returnEntries.length}{copy('টি', '')} {totalRefund > 0 ? copy(`(রিফান্ড: ${totalRefund.toLocaleString()})`, `(Refund: ${totalRefund.toLocaleString()})`) : ''}</span>
                            )}
                            {o.exchangeEntries?.length > 0 && (
                              <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{copy('🔄 এক্সচেঞ্জ:', '🔄 Exchanges:')} {o.exchangeEntries.length}{copy('টি', '')}</span>
                            )}
                            {o.address && <span style={{ color: th.muted }}>📍 {o.address}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Customers */}
              {searchResults?.customers?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 8px 8px' }}>
                    {copy(`কাস্টমার (${searchResults.customers.length})`, `Customers (${searchResults.customers.length})`)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {searchResults.customers.map((c: any) => (
                      <div key={c.id}
                        style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: th.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: th.accentText, flexShrink: 0 }}>
                          {(c.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: th.text }}>{c.name || '—'}</div>
                          <div style={{ fontSize: 11.5, color: th.muted, marginTop: 1 }}>
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.totalOrders != null && <span style={{ marginLeft: 10 }}>🛒 {c.totalOrders} {copy('অর্ডার', 'orders')}</span>}
                            {c.totalSpent != null && <span style={{ marginLeft: 10 }}>💰 {c.totalSpent?.toLocaleString()}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 99px; }
        select option { background: ${dark ? '#1a1a24' : '#fff'}; color: ${th.text}; }
        input::placeholder, textarea::placeholder { color: ${th.muted}; }
        @media (max-width: 767px) {
          /* Force all multi-column inline grids to single column on mobile */
          [style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
          /* Tables / fixed-column row grids: let them scroll horizontally */
          [style*="gridTemplateColumns: '1fr"] {
            overflow-x: auto;
          }
          /* Reduce card padding on mobile */
          [style*="border-radius: 24px"] {
            padding: 16px 14px !important;
            border-radius: 16px !important;
          }
          /* Prevent horizontal overflow */
          main > * { max-width: 100%; }
          /* Allow tables/rows to scroll horizontally instead of breaking layout */
          .mobile-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>
    </div>
  );
}
