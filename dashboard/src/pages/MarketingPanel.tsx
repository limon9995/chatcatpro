import { useEffect, useState } from 'react';
import { CardHeader, EmptyState, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

// V30 Phase 0 shell: real, working kill switch + settings + audit log.
// Leads/Campaigns/Pipeline/Analytics land in later phases — this proves the
// DB → API → auth → UI plumbing end-to-end before building on top of it.

interface MarketingSettings {
  killSwitchEnabled: boolean;
  scoringWeights: Record<string, number>;
  sequenceConfig: unknown[];
  dailyOutreachLimit: number;
  outreachRequiresApproval: boolean;
  updatedAt: string;
}

interface AuditLogRow {
  id: number;
  eventType: string;
  entityType: string;
  entityId: number | null;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: string;
}

export function MarketingPanel({ th, role, onToast }: {
  th: Theme; role: string; onToast: (m: string, t?: any) => void;
}) {
  const { request } = useApi();
  const canEdit = role === 'admin' || role === 'marketing_manager';

  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await request<MarketingSettings>(`${API_BASE}/marketing/settings`);
      setSettings(data);
    } catch (e: any) { onToast(e.message || 'Failed to load settings', 'error'); }
    finally { setLoading(false); }
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    try {
      const data = await request<{ rows: AuditLogRow[] }>(`${API_BASE}/marketing/audit-log?limit=20`);
      setAuditRows(data.rows || []);
    } catch (e: any) { onToast(e.message || 'Failed to load audit log', 'error'); }
    finally { setAuditLoading(false); }
  };

  useEffect(() => { load(); loadAuditLog(); }, []);

  const update = async (patch: Partial<MarketingSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const data = await request<MarketingSettings>(`${API_BASE}/marketing/settings`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSettings(data);
      onToast('✅ Saved', 'success');
      loadAuditLog();
    } catch (e: any) { onToast(e.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (loading || !settings) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={20} /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900, margin: '0 auto' }}>
      {/* Kill switch — the single most important control here */}
      <div style={{
        ...th.card, borderRadius: 14, padding: 20,
        border: `2px solid ${settings.killSwitchEnabled ? '#ef4444' : th.border}`,
      }}>
        <CardHeader th={th} title="🛑 Marketing Automation Kill Switch"
          sub="One toggle pauses every automated outreach/campaign action across the whole feature. Nothing below this line matters if this is on." />
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.6 }}>
          <input
            type="checkbox"
            checked={settings.killSwitchEnabled}
            disabled={!canEdit || saving}
            onChange={(e) => update({ killSwitchEnabled: e.target.checked })}
            style={{ width: 20, height: 20 }}
          />
          <span style={{ fontWeight: 800, fontSize: 14, color: settings.killSwitchEnabled ? '#ef4444' : th.text }}>
            {settings.killSwitchEnabled ? 'PAUSED — all automation stopped' : 'Running normally'}
          </span>
        </label>
        {!canEdit && (
          <div style={{ fontSize: 12, color: th.muted, marginTop: 8 }}>Read-only for your role ({role}).</div>
        )}
      </div>

      {/* Basic limits */}
      <div style={{ ...th.card, borderRadius: 14, padding: 20 }}>
        <CardHeader th={th} title="⚙️ Outreach Limits" sub="Applies once campaigns/outreach ship in a later phase." />
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, marginBottom: 4 }}>DAILY OUTREACH LIMIT</div>
            <input
              type="number"
              min={0}
              disabled={!canEdit || saving}
              defaultValue={settings.dailyOutreachLimit}
              onBlur={(e) => {
                const v = Math.max(0, Number(e.target.value) || 0);
                if (v !== settings.dailyOutreachLimit) update({ dailyOutreachLimit: v });
              }}
              style={{ ...th.input, width: 120 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.6 }}>
            <input
              type="checkbox"
              checked={settings.outreachRequiresApproval}
              disabled={!canEdit || saving}
              onChange={(e) => update({ outreachRequiresApproval: e.target.checked })}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: th.text }}>Outreach messages require human approval before sending</span>
          </label>
        </div>
      </div>

      {/* Roadmap placeholder */}
      <div style={{ ...th.card, borderRadius: 14, padding: 20, background: th.accentSoft, border: `1px dashed ${th.accent}` }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>📣 Coming next (Phase 1+)</div>
        <div style={{ fontSize: 13, color: th.muted, lineHeight: 1.7 }}>
          Leads · Lead Research · Campaigns · Outreach · Follow-ups · Sales Pipeline · Demos · Trials · Content · Competitors · Referrals · Analytics
        </div>
      </div>

      {/* Audit log */}
      <div style={{ ...th.card, borderRadius: 14, padding: 20 }}>
        <CardHeader th={th} title="🧾 Recent Activity" sub="Every marketing automation action gets logged here." />
        {auditLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spinner size={16} /></div>
        ) : auditRows.length === 0 ? (
          <EmptyState icon="🧾" title="No activity yet" sub="Actions will show up here once leads/campaigns start flowing." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {auditRows.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 10px', borderRadius: 8, border: `1px solid ${th.border}`, fontSize: 12.5 }}>
                <span style={{ color: th.muted, whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString()}</span>
                <span style={{ fontWeight: 700 }}>{r.eventType}</span>
                <span style={{ color: th.muted }}>{r.entityType}{r.entityId ? `#${r.entityId}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
