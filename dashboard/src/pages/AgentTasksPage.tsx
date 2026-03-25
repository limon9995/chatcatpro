import { useCallback, useEffect, useState } from 'react';
import { EmptyState, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';
import type { OrdersPagePreset } from './OrdersPage';
import type { PrintPagePreset } from './PrintPage';
import type { FollowUpPagePreset } from './FollowUpPage';
import type { AccountingPagePreset } from './AccountingPage';

type SettingsTabKey = 'PAGE' | 'NEGOTIATION' | 'CALL' | 'VOICE';

interface OrderItem {
  productCode: string;
  qty: number;
  unitPrice: number;
}

interface Order {
  id: number;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  source: string;
  callStatus: string;
  paymentStatus: string;
  printedAt?: string | null;
  createdAt: string;
  items: OrderItem[];
  courierShipment?: { status: string; courierName: string | null } | null;
}

interface FollowUpItem {
  id: number;
  status: string;
  triggerType: string;
  message: string;
  scheduledAt: string;
}

interface RefundQueueItem {
  id: number;
  orderId: number;
  refundAmount: number;
  refundStatus: string;
  createdAt: string;
  order?: {
    customerName: string | null;
    phone?: string | null;
  } | null;
}

interface SettingsSummary {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  catalogMessengerUrl: string;
  catalogSlug: string;
  paymentMode: string;
  advanceBkash: string;
  advanceNagad: string;
  infoModeOn: boolean;
  orderModeOn: boolean;
  printModeOn: boolean;
  callConfirmModeOn: boolean;
  memoSaveModeOn: boolean;
  memoTemplateModeOn: boolean;
  autoMemoDesignModeOn: boolean;
  callSettings: {
    callConfirmModeOn: boolean;
    callMode: string;
    callProvider: string;
  };
  voiceSettings: {
    banglaVoiceFileUrl: string;
    englishVoiceFileUrl: string;
  };
}

interface TaskCard {
  key: string;
  section: string;
  bn: string;
  en: string;
  descBn: string;
  descEn: string;
  color: string;
  orders: Order[];
  count: number;
  preset: OrdersPagePreset;
  printPreset?: PrintPagePreset;
  followUpPreset?: FollowUpPagePreset;
  accountingPreset?: AccountingPagePreset;
  settingsTab?: SettingsTabKey;
  openTarget?: 'orders' | 'print' | 'followup' | 'accounting' | 'settings';
}

function Ring({ pct, colorA, colorB, value, label, sub, th }: {
  pct: number;
  colorA: string;
  colorB: string;
  value: string;
  label: string;
  sub: string;
  th: Theme;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        background: `conic-gradient(${colorA} 0 ${pct}%, ${colorB} ${pct}% 100%)`,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{
          width: 68,
          height: 68,
          borderRadius: '50%',
          background: th.panel,
          border: `1px solid ${th.border}`,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: th.text }}>{value}</div>
            <div style={{ fontSize: 10.5, color: th.muted, marginTop: 4 }}>{label}</div>
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 14, color: th.text }}>{label}</div>
        <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4, maxWidth: 360 }}>{sub}</div>
      </div>
    </div>
  );
}

export function AgentTasksPage({ th, pageId, onToast, onOpenOrders, onOpenPrint, onOpenFollowUp, onOpenAccounting, onOpenSettings }: {
  th: Theme;
  pageId: number;
  onToast: (m: string, t?: any) => void;
  onOpenOrders: (preset: OrdersPagePreset) => void;
  onOpenPrint?: (preset: PrintPagePreset) => void;
  onOpenFollowUp?: (preset: FollowUpPagePreset) => void;
  onOpenAccounting?: (preset: AccountingPagePreset) => void;
  onOpenSettings?: (tab: SettingsTabKey) => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [orders, setOrders] = useState<Order[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [refundQueue, setRefundQueue] = useState<RefundQueueItem[]>([]);
  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderData, followUpData, refundData, settingsData] = await Promise.all([
        request<Order[]>(`${API_BASE}/client-dashboard/${pageId}/orders?status=ALL`),
        request<FollowUpItem[]>(`${API_BASE}/client-dashboard/${pageId}/followup?status=pending`),
        request<RefundQueueItem[]>(`${API_BASE}/client-dashboard/${pageId}/accounting/refund-queue`),
        request<SettingsSummary>(`${API_BASE}/client-dashboard/${pageId}/settings`),
      ]);
      setOrders(orderData);
      setFollowUps(followUpData);
      setRefundQueue(refundData);
      setSettings(settingsData);
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  const orderModeActive = Boolean(settings?.orderModeOn);
  const callModeActive = Boolean(
    settings?.callConfirmModeOn && settings?.callSettings.callConfirmModeOn,
  );
  const printModeActive = Boolean(
    settings?.printModeOn ||
      settings?.memoSaveModeOn ||
      settings?.memoTemplateModeOn ||
      settings?.autoMemoDesignModeOn,
  );

  const onboardingTasks: TaskCard[] = settings
    ? [
        {
          key: 'setup_business',
          section: 'Setup',
          bn: 'Business তথ্য সেটআপ করুন',
          en: 'Set Up Business Info',
          descBn: 'Business name, phone, address পূরণ করুন যাতে invoice, memo, ar catalog ঠিকমতো কাজ করে।',
          descEn: 'Add your business name, phone, and address so invoices, memos, and the catalog work properly.',
          color: '#2563eb',
          orders: [],
          count:
            !settings.businessName.trim() ||
            !settings.businessPhone.trim() ||
            !settings.businessAddress.trim()
              ? 1
              : 0,
          preset: { label: 'Complete Business Info' },
          settingsTab: 'PAGE' as const,
          openTarget: 'settings' as const,
        },
        {
          key: 'setup_catalog',
          section: 'Setup',
          bn: 'Catalog link সেটআপ করুন',
          en: 'Set Up Catalog Link',
          descBn: 'Catalog slug ar order link set করলে customer সহজে order page-এ যেতে পারবে।',
          descEn: 'Set the catalog slug and order link so customers can open your catalog and order easily.',
          color: '#0f766e',
          orders: [],
          count:
            !settings.catalogSlug.trim()
              ? 1
              : 0,
          preset: { label: 'Complete Catalog Setup' },
          settingsTab: 'PAGE' as const,
          openTarget: 'settings' as const,
        },
        {
          key: 'setup_payment',
          section: 'Setup',
          bn: 'Payment setup complete করুন',
          en: 'Complete Payment Setup',
          descBn: 'Advance payment mode use করলে Bkash/Nagad number আগে set করা দরকার।',
          descEn: 'If you use advance payment, set the Bkash or Nagad number first.',
          color: '#b45309',
          orders: [],
          count:
            orderModeActive &&
            settings.paymentMode !== 'cod' &&
            !settings.advanceBkash.trim() &&
            !settings.advanceNagad.trim()
              ? 1
              : 0,
          preset: { label: 'Complete Payment Setup' },
          settingsTab: 'PAGE' as const,
          openTarget: 'settings' as const,
        },
        {
          key: 'setup_call',
          section: 'Setup',
          bn: 'Call confirm setup করুন',
          en: 'Complete Call Setup',
          descBn: 'Call confirm on থাকলে provider ar call mode set করা দরকার।',
          descEn: 'If call confirmation is enabled, choose the provider and call mode.',
          color: '#d97706',
          orders: [],
          count:
            callModeActive &&
            (!settings.callSettings.callProvider.trim() ||
              !settings.callSettings.callMode.trim())
              ? 1
              : 0,
          preset: { label: 'Complete Call Setup' },
          settingsTab: 'CALL' as const,
          openTarget: 'settings' as const,
        },
        {
          key: 'setup_voice',
          section: 'Setup',
          bn: 'Voice setup complete করুন',
          en: 'Complete Voice Setup',
          descBn: 'Call confirm use করলে কমপক্ষে একটি Bangla বা English voice ready রাখা দরকার।',
          descEn: 'If call confirmation is enabled, keep at least one Bangla or English voice ready.',
          color: '#7c3aed',
          orders: [],
          count:
            callModeActive &&
            !settings.voiceSettings.banglaVoiceFileUrl.trim() &&
            !settings.voiceSettings.englishVoiceFileUrl.trim()
              ? 1
              : 0,
          preset: { label: 'Complete Voice Setup' },
          settingsTab: 'VOICE' as const,
          openTarget: 'settings' as const,
        },
      ].filter((task) => task.count > 0)
    : [];

  const tasks: TaskCard[] = [
    ...onboardingTasks,
    {
      key: 'not_answered',
      section: 'Orders',
      bn: 'কল ধরেনি / উত্তর দেয়নি',
      en: 'Call Not Answered',
      descBn: 'Bot call দিয়েছে, কিন্তু customer ধরেনি বা key press করেনি।',
      descEn: 'The bot called, but the customer did not answer or did not press any key.',
      color: '#6b7280',
      orders: orders.filter((o) => o.callStatus === 'NOT_ANSWERED'),
      count: callModeActive ? orders.filter((o) => o.callStatus === 'NOT_ANSWERED').length : 0,
      preset: { callFilter: 'NOT_ANSWERED', label: 'Not Answered Calls' },
    },
    {
      key: 'needs_agent',
      section: 'Orders',
      bn: 'Agent এর সাথে কথা বলতে চায়',
      en: 'Needs Agent Conversation',
      descBn: 'Customer call-এ agent option নিয়েছে।',
      descEn: 'The customer requested to speak with an agent during the call.',
      color: '#d97706',
      orders: orders.filter((o) => o.callStatus === 'NEEDS_AGENT'),
      count: callModeActive ? orders.filter((o) => o.callStatus === 'NEEDS_AGENT').length : 0,
      preset: { callFilter: 'NEEDS_AGENT', label: 'Needs Agent Calls' },
    },
    {
      key: 'call_failed',
      section: 'Orders',
      bn: 'Call failed হয়েছে',
      en: 'Call Failed',
      descBn: 'Bot retry করেও call complete করতে পারেনি।',
      descEn: 'The bot could not complete the call successfully.',
      color: '#dc2626',
      orders: orders.filter((o) => o.callStatus === 'CALL_FAILED'),
      count: callModeActive ? orders.filter((o) => o.callStatus === 'CALL_FAILED').length : 0,
      preset: { callFilter: 'CALL_FAILED', label: 'Failed Calls' },
    },
    {
      key: 'payment_approval',
      section: 'Orders',
      bn: 'Payment agent approval লাগবে',
      en: 'Payment Needs Approval',
      descBn: 'Bot payment proof পেয়েছে, কিন্তু human approval দরকার।',
      descEn: 'The bot collected payment proof, but a human approval is still needed.',
      color: '#b45309',
      orders: orders.filter((o) => o.paymentStatus === 'agent_required'),
      count: orderModeActive ? orders.filter((o) => o.paymentStatus === 'agent_required').length : 0,
      preset: { paymentFilter: 'agent_required', label: 'Payment Approval Pending' },
    },
    {
      key: 'payment_proof',
      section: 'Orders',
      bn: 'Payment proof review',
      en: 'Pending Proof Review',
      descBn: 'Customer payment proof দিয়েছে, review করা বাকি।',
      descEn: 'The customer submitted payment proof and it still needs review.',
      color: '#7c3aed',
      orders: orders.filter((o) => o.paymentStatus === 'pending_proof'),
      count: orderModeActive ? orders.filter((o) => o.paymentStatus === 'pending_proof').length : 0,
      preset: { paymentFilter: 'pending_proof', label: 'Pending Proof Review' },
    },
    {
      key: 'issue_orders',
      section: 'Orders',
      bn: 'Issue orders',
      en: 'Issue Orders',
      descBn: 'যেসব order-এ human intervention দরকার হয়েছে।',
      descEn: 'Orders that require human intervention.',
      color: '#ef4444',
      orders: orders.filter((o) => o.status === 'ISSUE'),
      count: orderModeActive ? orders.filter((o) => o.status === 'ISSUE').length : 0,
      preset: { status: 'ISSUE', label: 'Issue Orders' },
    },
    {
      key: 'courier_booking',
      section: 'Courier',
      bn: 'Courier booking pending',
      en: 'Courier Booking Pending',
      descBn: 'Confirmed order আছে, কিন্তু courier booking এখনো করা হয়নি।',
      descEn: 'These confirmed orders still need courier booking.',
      color: '#ea580c',
      orders: orders.filter((o) => o.status === 'CONFIRMED' && !o.courierShipment),
      count: orders.filter((o) => o.status === 'CONFIRMED' && !o.courierShipment).length,
      preset: { status: 'CONFIRMED', label: 'Confirmed Orders Pending Courier Booking' },
    },
    {
      key: 'print_ready',
      section: 'Print',
      bn: 'মেমো / প্রিন্ট Ready',
      en: 'Memo / Print Ready',
      descBn: 'Confirmed order গুলো print বা memo generate করার জন্য ready আছে।',
      descEn: 'Confirmed orders are ready for memo generation or printing.',
      color: '#2563eb',
      orders: orders.filter((o) => o.status === 'CONFIRMED' && !o.printedAt),
      count: printModeActive ? orders.filter((o) => o.status === 'CONFIRMED' && !o.printedAt).length : 0,
      preset: { status: 'CONFIRMED', label: 'Confirmed Orders Ready for Print' },
      printPreset: { filter: 'CONFIRMED', autoSelectAll: true, onlyPendingPrint: true, label: 'Confirmed Orders Ready for Print' },
      openTarget: 'print' as const,
    },
    {
      key: 'followup_pending',
      section: 'Follow-up',
      bn: 'Follow-up pending',
      en: 'Follow-up Pending',
      descBn: 'Scheduled follow-up message গুলো pending আছে।',
      descEn: 'Scheduled follow-up messages are still pending.',
      color: '#0f766e',
      orders: followUps.map((f) => ({
        id: f.id,
        customerName: f.triggerType,
        phone: null,
        address: f.message,
        status: f.status,
        source: 'FOLLOWUP',
        callStatus: 'NONE',
        paymentStatus: 'not_required',
        createdAt: f.scheduledAt,
        items: [],
        courierShipment: null,
      })),
      count: followUps.length,
      preset: { label: 'Pending Follow-ups' },
      followUpPreset: { tab: 'list' as const, filterStatus: 'pending', label: 'Pending Follow-ups' },
      openTarget: 'followup' as const,
    },
    {
      key: 'refund_pending',
      section: 'Accounting',
      bn: 'Refund pending',
      en: 'Refund Pending',
      descBn: 'Advance refund যেগুলো এখনো customer-কে দেওয়া হয়নি।',
      descEn: 'Advance refunds that still need to be paid to customers.',
      color: '#f97316',
      orders: refundQueue
        .filter((r) => r.refundStatus === 'pending')
        .map((r) => ({
          id: r.orderId,
          customerName: r.order?.customerName || '—',
          phone: r.order?.phone || null,
          address: `Refund ${r.refundAmount}`,
          status: 'REFUND_PENDING',
          source: 'ACCOUNTING',
          callStatus: 'NONE',
          paymentStatus: 'not_required',
          createdAt: r.createdAt,
          items: [],
          courierShipment: null,
        })),
      count: refundQueue.filter((r) => r.refundStatus === 'pending').length,
      preset: { label: 'Pending Refunds' },
      accountingPreset: { tab: 'refund_queue' as const, label: 'Pending Refunds' },
      openTarget: 'accounting' as const,
    },
  ].filter((task) => task.count > 0);

  const totalOrders = orders.length;
  const onboardingTotal =
    (settings ? 2 : 0) +
    (settings && orderModeActive && settings.paymentMode !== 'cod' ? 1 : 0) +
    (settings && callModeActive ? 2 : 0);
  const onboardingDone = Math.max(onboardingTotal - onboardingTasks.length, 0);
  const pendingIds = new Set<number>();
  tasks.forEach((task) => task.orders.forEach((order) => pendingIds.add(order.id)));
  const setupPending = onboardingTasks.reduce((sum, task) => sum + task.count, 0);
  const pending = pendingIds.size + setupPending;
  const botHandled = Math.max(totalOrders - pending, 0);
  const totalWithSetup = totalOrders + setupPending;
  const botPct = totalWithSetup ? Math.round((botHandled / totalWithSetup) * 100) : 100;
  const agentPct = totalWithSetup ? 100 - botPct : 0;

  if (loading && !orders.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
        <Spinner size={24} color={th.accent} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>
            {copy('Agent Tasks', 'Agent Tasks')}
          </h1>
          <p style={{ fontSize: 13, color: th.muted, margin: '4px 0 0' }}>
            {copy('Bot যেসব কাজ শেষ করতে পারেনি, সেগুলো এখানে agent-এর জন্য জমা থাকবে।', 'Tasks the bot could not finish are collected here for the agent.')}
          </p>
        </div>
        <button style={th.btnGhost} onClick={load}>
          {loading ? <Spinner size={13} /> : '↺'} {copy('Refresh', 'Refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
        <div style={{ ...th.card, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            {copy('Automation Impact', 'Automation Impact')}
          </div>
          <Ring
            pct={botPct}
            colorA="#16a34a"
            colorB="#f59e0b"
            value={`${botPct}%`}
            label={copy('Bot handled automatically', 'Bot handled automatically')}
            sub={copy(`${botHandled}টি order flow bot complete করেছে. মাত্র ${pending}টি কাজ agent-এর জন্য বাকি আছে.`, `The bot completed ${botHandled} order flows automatically. Only ${pending} tasks are waiting for the agent.`)}
            th={th}
          />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, fontSize: 12.5 }}>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>{copy(`Bot done: ${botHandled}`, `Bot done: ${botHandled}`)}</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{copy(`Agent pending: ${pending}`, `Agent pending: ${pending}`)}</span>
            <span style={{ color: th.muted }}>{copy(`Manual share: ${agentPct}%`, `Manual share: ${agentPct}%`)}</span>
          </div>
        </div>

        <div style={{ ...th.card, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            {copy('Queue Snapshot', 'Queue Snapshot')}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {tasks.length > 0 ? tasks.map((task) => (
              <div key={task.key} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${task.color}30`, background: `${task.color}12` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: task.color }}>{copy(task.bn, task.en)}</div>
                    <div style={{ fontSize: 11.5, color: th.muted, marginTop: 3 }}>{task.count} {copy('টি pending', 'pending')}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: task.color }}>{task.count}</div>
                </div>
              </div>
            )) : <EmptyState icon="✅" title={copy('কোনো agent task নেই', 'No agent tasks pending')} sub={copy('Bot এখন সবকিছু smoothভাবে handle করছে', 'The bot is handling everything smoothly right now')} />}
          </div>
        </div>
      </div>

      {settings && (
        <div style={{ ...th.card, padding: '18px 20px', border: `1px solid ${onboardingTasks.length ? '#f59e0b33' : '#16a34a33'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {copy('Setup Progress', 'Setup Progress')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, color: onboardingTasks.length ? '#f59e0b' : '#16a34a' }}>
                {onboardingTasks.length
                  ? copy('Setup বাকি আছে', 'Setup still pending')
                  : copy('Your setup is complete', 'Your setup is complete')}
              </div>
              <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4, maxWidth: 720 }}>
                {onboardingTasks.length
                  ? copy(
                      `মোট ${onboardingTotal}টি setup step-এর মধ্যে ${onboardingDone}টি complete হয়েছে। Client বা admin যেই settings save করুক, completed step এখান থেকে auto remove হবে।`,
                      `${onboardingDone} of ${onboardingTotal} setup steps are complete. Whether the client or admin saves the settings, completed steps are removed from here automatically.`,
                    )
                  : copy(
                      'সব initial setup complete. এখন bot smoothly run করার জন্য আর কোনো setup action বাকি নেই।',
                      'All initial setup steps are complete. No more setup action is pending before the bot runs smoothly.',
                    )}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: onboardingTasks.length ? '#f59e0b' : '#16a34a' }}>
              {onboardingDone}/{onboardingTotal}
            </div>
          </div>

          {onboardingTasks.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 16 }}>
              {onboardingTasks.map((task) => (
                <button
                  key={task.key}
                  style={{
                    ...th.card2,
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: `1px solid ${task.color}30`,
                    background: `${task.color}12`,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (task.settingsTab && onOpenSettings) onOpenSettings(task.settingsTab);
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: task.color }}>{copy(task.bn, task.en)}</div>
                  <div style={{ fontSize: 11.5, color: th.muted, marginTop: 5 }}>{copy(task.descBn, task.descEn)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <EmptyState
                icon="✅"
                title={copy('Setup সম্পূর্ণ', 'Setup complete')}
                sub={copy(
                  'Business info, catalog, payment, call, voice — যেগুলো প্রয়োজন ছিল সব complete আছে।',
                  'Business info, catalog, payment, call, and voice setup are all complete where required.',
                )}
              />
            </div>
          )}
        </div>
      )}

      {tasks.length > 0 ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {tasks.map((task) => (
            <div key={task.key} style={{ ...th.card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {task.section}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, color: task.color }}>{copy(task.bn, task.en)}</div>
                  <div style={{ fontSize: 12.5, color: th.muted, marginTop: 4 }}>{copy(task.descBn, task.descEn)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: task.color }}>{task.count}</div>
                  <button
                    style={th.btnPrimary}
                    onClick={() => {
                      if (task.openTarget === 'print' && task.printPreset && onOpenPrint) onOpenPrint(task.printPreset);
                      else if (task.openTarget === 'followup' && task.followUpPreset && onOpenFollowUp) onOpenFollowUp(task.followUpPreset);
                      else if (task.openTarget === 'accounting' && task.accountingPreset && onOpenAccounting) onOpenAccounting(task.accountingPreset);
                      else if (task.openTarget === 'settings' && task.settingsTab && onOpenSettings) onOpenSettings(task.settingsTab);
                      else onOpenOrders(task.preset);
                    }}
                  >
                    {copy('Open Section', 'Open Section')}
                  </button>
                </div>
              </div>

              {task.orders.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  {task.orders.slice(0, 4).map((order) => (
                    <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 10, background: th.surface, border: `1px solid ${th.border}` }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>#{order.id} {order.customerName || '—'}</div>
                        <div style={{ fontSize: 12, color: th.muted, marginTop: 3 }}>{order.phone || '—'} {order.address ? `• ${order.address}` : ''}</div>
                      </div>
                      <button
                        style={th.btnGhost}
                        onClick={() => {
                          if (task.openTarget === 'print' && task.printPreset && onOpenPrint) {
                            onOpenPrint({ ...task.printPreset, autoSelectAll: false, label: `${task.printPreset.label} · #${order.id}` });
                          } else if (task.openTarget === 'followup' && task.followUpPreset && onOpenFollowUp) {
                            onOpenFollowUp(task.followUpPreset);
                          } else if (task.openTarget === 'accounting' && task.accountingPreset && onOpenAccounting) {
                            onOpenAccounting(task.accountingPreset);
                          } else {
                            onOpenOrders({ ...task.preset, search: order.phone || String(order.id), label: `${task.preset.label} · #${order.id}` });
                          }
                        }}
                      >
                        {copy('Open', 'Open')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: th.surface, border: `1px solid ${th.border}`, fontSize: 12.5, color: th.muted }}>
                  {copy(
                    'এই setup item complete হলেই এটা list থেকে auto remove হবে। Client বা admin settings save করলেই status update হবে।',
                    'As soon as this setup item is completed, it will be removed from the list automatically. The status updates when either the client or the admin saves the settings.',
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...th.card }}>
          <EmptyState
            icon="🤖"
            title={copy('Agent queue একদম clean', 'The agent queue is fully clear')}
            sub={copy('এটাই highlight করে যে bot অনেক কাজ save করে দিচ্ছে', 'This clearly shows how much work the bot is saving for the team')}
          />
        </div>
      )}
    </div>
  );
}
