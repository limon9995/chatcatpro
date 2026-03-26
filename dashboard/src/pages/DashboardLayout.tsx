import { Component, Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import type { OrdersPagePreset } from './OrdersPage';
import type { PrintPagePreset } from './PrintPage';
import type { FollowUpPagePreset } from './FollowUpPage';
import type { AccountingPagePreset } from './AccountingPage';
import { getTheme, LanguageSwitch, Spinner, Toast } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Lazy page imports ──────────────────────────────────────────────────────────
const OrdersPage      = lazy(() => import('./OrdersPage').then(m => ({ default: m.OrdersPage })));
const ProductsPage    = lazy(() => import('./ProductsPage').then(m => ({ default: m.ProductsPage })));
const SettingsPage    = lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage })));
const AccountingPage  = lazy(() => import('./AccountingPage').then(m => ({ default: m.AccountingPage })));
const AnalyticsPage   = lazy(() => import('./AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const MotivationPage  = lazy(() => import('./MotivationPage').then(m => ({ default: m.MotivationPage })));
const AgentTasksPage  = lazy(() => import('./AgentTasksPage').then(m => ({ default: m.AgentTasksPage })));
const BotKnowledgePage= lazy(() => import('./BotKnowledgePage').then(m => ({ default: m.BotKnowledgePage })));
const PrintPage       = lazy(() => import('./PrintPage').then(m => ({ default: m.PrintPage })));
const MemoTemplatePage= lazy(() => import('./MemoTemplatePage').then(m => ({ default: m.MemoTemplatePage })));
const CrmPage         = lazy(() => import('./CrmPage').then(m => ({ default: m.CrmPage })));
const CourierPage     = lazy(() => import('./CourierPage').then(m => ({ default: m.CourierPage })));
const BroadcastPage   = lazy(() => import('./BroadcastPage').then(m => ({ default: m.BroadcastPage })));
const FollowUpPage    = lazy(() => import('./FollowUpPage').then(m => ({ default: m.FollowUpPage })));
const CatalogPage     = lazy(() => import('./CatalogPage').then(m => ({ default: m.CatalogPage })));

// ── Error boundary for individual pages ───────────────────────────────────────
class PageErrorBoundary extends Component<{ children: any; name: string }, { error: any }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: e }; }
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
  'PAGE' | 'NEGOTIATION' | 'CALL' | 'VOICE';

interface NavItem {
  key:   NavKey;
  bn: string;
  en: string;
  icon:  string;
  group: 'main' | 'manage' | 'tools' | 'settings';
  badge?: string;
}

const NAV: NavItem[] = [
  { key: 'OVERVIEW',       bn: 'ওভারভিউ',            en: 'Overview',        icon: '◈', group: 'main' },
  { key: 'AGENT_TASKS',    bn: 'এজেন্ট টাস্ক',       en: 'Agent Tasks',     icon: '◎', group: 'main' },
  { key: 'ORDERS',         bn: 'অর্ডার',             en: 'Orders',          icon: '⊡', group: 'main' },
  { key: 'PRODUCTS',       bn: 'প্রোডাক্ট',          en: 'Products',        icon: '⊞', group: 'main' },
  { key: 'ACCOUNTING',     bn: 'হিসাব',              en: 'Accounting',      icon: '⊟', group: 'main' },
  { key: 'ANALYTICS',      bn: 'অ্যানালিটিক্স',      en: 'Analytics',       icon: '◷', group: 'main' },
  { key: 'BOT_KNOWLEDGE',  bn: 'বট নলেজ',           en: 'Bot Knowledge',   icon: '⊛', group: 'manage' },
  { key: 'CRM',            bn: 'কাস্টমার',           en: 'Customers',       icon: '⊙', group: 'manage' },
  { key: 'CATALOG',        bn: 'ক্যাটালগ',           en: 'Catalog',         icon: '⊘', group: 'manage' },
  { key: 'COURIER',        bn: 'কুরিয়ার',            en: 'Courier',         icon: '⊕', group: 'tools' },
  { key: 'BROADCAST',      bn: 'ব্রডকাস্ট',          en: 'Broadcast',       icon: '⊗', group: 'tools' },
  { key: 'FOLLOWUP',       bn: 'ফলো-আপ',            en: 'Follow-up',       icon: '⊖', group: 'tools' },
  { key: 'MEMO_TEMPLATE',  bn: 'মেমো টেমপ্লেট',      en: 'Memo Template',   icon: '⊝', group: 'tools' },
  { key: 'PRINT',          bn: 'প্রিন্ট / ইনভয়েস',   en: 'Print / Invoice', icon: '⊜', group: 'tools' },
  { key: 'PAGE',           bn: 'পেজ সেটিংস',        en: 'Page Settings',   icon: '⊞', group: 'settings' },
  { key: 'NEGOTIATION',    bn: 'নেগোশিয়েশন',        en: 'Negotiation',     icon: '⊟', group: 'settings' },
  { key: 'CALL',           bn: 'কল কনফার্ম',        en: 'Call Confirm',    icon: '⊡', group: 'settings' },
  { key: 'VOICE',          bn: 'ভয়েস ও TTS',        en: 'Voice & TTS',     icon: '⊢', group: 'settings' },
];

const GROUPS = [
  { key: 'main',     bn: null,         en: null },
  { key: 'manage',   bn: 'ম্যানেজ',    en: 'Manage' },
  { key: 'tools',    bn: 'টুলস',       en: 'Tools' },
  { key: 'settings', bn: 'সেটিংস',     en: 'Settings' },
];

const NAV_KEYS = new Set<NavKey>(NAV.map((item) => item.key));
const LAST_NAV_KEY = 'dfbot_last_nav';

interface PageItem { id: number; pageId: string; pageName: string; }
interface ToastItem { msg: string; type?: 'error' | 'success' | 'info'; id: number; }

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
  const [activePage, setActivePage] = useState<PageItem | null>(initialActivePage);
  const [nav, setNav] = useState<NavKey>(() => {
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
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { request } = useApi();

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
    request(`${API_BASE}/billing/status`).then(setBillingStatus).catch(() => {});
  }, []);

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
      default: return null;
    }
  };

  return (
    <div style={th.app}>
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header style={th.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="ChatCat Pro" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%' }} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em', color: th.text }}>ChatCat Pro</span>
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
                minWidth: 220,
                maxWidth: 320,
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${th.border}`,
                background: th.panel,
                color: th.text,
                fontSize: 13,
                fontWeight: 600,
                outline: 'none',
              }}
              title={copy('পেজ পরিবর্তন করুন', 'Switch page')}
            >
              {myPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.pageName || page.pageId}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 13, color: th.muted, fontWeight: 500 }}>
              {activePage.pageName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={openSearch}
            style={{ ...th.btnGhost, padding: '6px 14px', fontSize: 13, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7, color: th.muted }}>
            🔍 <span>{copy('সার্চ', 'Search')}</span>
            <span style={{ fontSize: 10.5, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 4, padding: '1px 5px', color: th.muted, letterSpacing: '0.02em' }}>Ctrl+K</span>
          </button>
          <button
            onClick={onManagePages}
            style={{ ...th.btnGhost, padding: '6px 10px', fontSize: 12, borderRadius: 8 }}
            title={copy('পেজ connect / disconnect করুন', 'Manage connected Facebook pages')}
          >
            {copy('Facebook Page', 'Facebook Page')}
          </button>
          <LanguageSwitch dark={dark} compact />
          <button onClick={() => setDark(!dark)} style={{ ...th.btnGhost, padding: '6px 10px', fontSize: 15, borderRadius: 8 }}>
            {dark ? copy('☀ লাইট', '☀ Light') : copy('☾ ডার্ক', '☾ Dark')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: th.accentSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: th.accentText,
            }}>
              {(user?.name || user?.username || 'U')[0].toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: th.textSub }}>{user?.name || user?.username}</span>
            <button onClick={onLogout} style={{ ...th.btnGhost, padding: '5px 10px', fontSize: 12 }}>{copy('লগআউট', 'Logout')}</button>
          </div>
        </div>
      </header>

      {/* ── Trial / Billing Banner ───────────────────────────────────────── */}
      {billingStatus && (() => {
        const { status, daysLeft, canTakeOrders } = billingStatus;
        if (status === 'trial' && daysLeft <= 3) return (
          <div style={{ background: '#f59e0b', color: '#1c1917', fontSize: 13, fontWeight: 600, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>⏳ Trial আর মাত্র {daysLeft} দিন বাকি — এখনই upgrade করুন!</span>
            <button onClick={() => setNav('PAGE' as any)} style={{ background: '#1c1917', color: '#fef3c7', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Upgrade</button>
          </div>
        );
        if (status === 'trial') return (
          <div style={{ background: dark ? '#1e3a5f' : '#dbeafe', color: dark ? '#93c5fd' : '#1e40af', fontSize: 13, fontWeight: 500, padding: '7px 20px' }}>
            🎉 Trial চলছে — {daysLeft} দিন বাকি
          </div>
        );
        if (status === 'expired' || !canTakeOrders) return (
          <div style={{ background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>❌ Subscription মেয়াদ শেষ — নতুন অর্ডার নেওয়া বন্ধ আছে</span>
            <button onClick={() => setNav('PAGE' as any)} style={{ background: '#fff', color: '#ef4444', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Payment করুন</button>
          </div>
        );
        if (status === 'grace') return (
          <div style={{ background: '#f97316', color: '#fff', fontSize: 13, fontWeight: 600, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>⚠️ Grace period চলছে — দ্রুত payment করুন</span>
            <button onClick={() => setNav('PAGE' as any)} style={{ background: '#fff', color: '#f97316', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Payment করুন</button>
          </div>
        );
        return null;
      })()}

      <div style={th.layout}>
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <nav style={th.sidebar}>
          {navGroups.map(g => (
            <div key={g.key} style={{ marginBottom: (language === 'en' ? g.en : g.bn) ? 12 : 6 }}>
              {(language === 'en' ? g.en : g.bn) && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: th.muted,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '12px 12px 6px',
                }}>{language === 'en' ? g.en : g.bn}</div>
              )}
              {g.items.map(item => {
                const isActive = nav === item.key;
                return (
                  <button key={item.key} onClick={() => {
                    if (item.key === 'ORDERS') setOrdersPreset(null);
                    if (item.key === 'PRINT') setPrintPreset(null);
                    if (item.key === 'FOLLOWUP') setFollowUpPreset(null);
                    if (item.key === 'ACCOUNTING') setAccountingPreset(null);
                    setNav(item.key);
                  }}
                    style={{ ...th.navBtn, ...(isActive ? th.navBtnActive : {}), marginBottom: 1 }}
                  >
                    <span style={{ fontSize: 13, opacity: isActive ? 1 : 0.6, width: 16, textAlign: 'center' }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{language === 'en' ? item.en : item.bn}</span>
                    {item.badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 5px',
                        borderRadius: 4, background: th.accentSoft,
                        color: th.accentText, letterSpacing: '0.05em',
                      }}>{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── Main Content ─────────────────────────────────────────────── */}
        <main style={th.main}>
          {renderPage()}
        </main>
      </div>

      {/* ── Toasts ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(ts => ts.filter(x => x.id !== t.id))} />
        ))}
      </div>

      {/* ── Global Search Modal ──────────────────────────────────────── */}
      {searchOpen && (
        <div onClick={() => setSearchOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
              background: th.panel, borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', border: `1px solid ${th.border}`, overflow: 'hidden' }}>

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
      `}</style>
    </div>
  );
}
