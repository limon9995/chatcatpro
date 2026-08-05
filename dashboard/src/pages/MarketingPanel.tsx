import { useEffect, useMemo, useState } from 'react';
import { CardHeader, EmptyState, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

// V30 — AI Marketing & Sales Automation.
// Phase 0: kill switch + settings + audit log (SettingsSection).
// Phase 1: manual/CSV lead entry + pipeline (LeadsSection) — this file.

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

interface Lead {
  id: number;
  businessName: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  followerCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  estimatedMessageVolume: string | null;
  onlineOrderPresence: boolean;
  leadScore: number;
  leadTemperature: string;
  pipelineStatus: string;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const PIPELINE_STATUSES = [
  'NEW', 'RESEARCHED', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED',
  'DEMO_BOOKED', 'TRIAL_STARTED', 'TRIAL_ACTIVE', 'CONVERTED', 'PAID_CUSTOMER',
  'NOT_INTERESTED', 'OPTED_OUT', 'LOST', 'FOLLOW_UP_LATER',
];

const TEMPERATURE_COLORS: Record<string, string> = {
  HOT: '#ef4444', WARM: '#f59e0b', POTENTIAL: '#3b82f6', LOW_PRIORITY: '#94a3b8',
};

const CSV_COLUMNS = [
  'businessName', 'category', 'location', 'phone', 'email', 'website',
  'facebookUrl', 'instagramUrl', 'followerCount', 'reviewCount', 'rating',
  'estimatedMessageVolume', 'onlineOrderPresence', 'notes',
];

function parseCsv(text: string): Record<string, any>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, any> = {};
    header.forEach((h, i) => {
      const key = CSV_COLUMNS.find((c) => c.toLowerCase() === h.toLowerCase());
      if (!key) return;
      const raw = cells[i] ?? '';
      if (key === 'followerCount' || key === 'reviewCount') row[key] = raw ? Number(raw) : undefined;
      else if (key === 'rating') row[key] = raw ? Number(raw) : undefined;
      else if (key === 'onlineOrderPresence') row[key] = /^(true|yes|1)$/i.test(raw);
      else if (raw) row[key] = raw;
    });
    return row;
  }).filter((r) => r.businessName);
}

export function MarketingPanel({ th, role, onToast }: {
  th: Theme; role: string; onToast: (m: string, t?: any) => void;
}) {
  const [section, setSection] = useState<'leads' | 'settings'>('leads');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          { key: 'leads' as const, label: '🎯 Leads' },
          { key: 'settings' as const, label: '⚙️ Settings' },
        ]).map((t) => (
          <button key={t.key} onClick={() => setSection(t.key)} style={{
            padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${section === t.key ? th.accent : th.border}`,
            background: section === t.key ? th.accentSoft : 'transparent',
            color: section === t.key ? th.accentText : th.muted,
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {section === 'leads' ? <LeadsSection th={th} role={role} onToast={onToast} /> : <SettingsSection th={th} role={role} onToast={onToast} />}
    </div>
  );
}

// ── Leads Section ────────────────────────────────────────────────────────────
function LeadsSection({ th, role, onToast }: { th: Theme; role: string; onToast: (m: string, t?: any) => void }) {
  const { request } = useApi();
  const canEdit = role === 'admin' || role === 'marketing_manager' || role === 'sales';
  const canDelete = role === 'admin' || role === 'marketing_manager';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('pipelineStatus', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');
      const data = await request<{ rows: Lead[]; total: number; statusCounts: Record<string, number> }>(`${API_BASE}/marketing/leads?${params}`);
      setLeads(data.rows || []);
      setTotal(data.total || 0);
      setStatusCounts(data.statusCounts || {});
    } catch (e: any) { onToast(e.message || 'Failed to load leads', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const allCount = useMemo(() => Object.values(statusCounts).reduce((a, b) => a + b, 0), [statusCounts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="🔍 Search name/phone/website…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          style={{ ...th.input, flex: 1, minWidth: 200 }}
        />
        <button style={th.btnGhost} onClick={load}>🔍 Search</button>
        {canEdit && <button style={th.btnGhost} onClick={() => setShowImport(true)}>📥 Import CSV</button>}
        {canEdit && <button style={th.btnPrimary} onClick={() => setShowAdd(true)}>+ Add Lead</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setStatusFilter('')} style={{
          padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${!statusFilter ? th.accent : th.border}`,
          background: !statusFilter ? th.accentSoft : 'transparent',
          color: !statusFilter ? th.accentText : th.muted,
        }}>All ({allCount})</button>
        {PIPELINE_STATUSES.filter((s) => statusCounts[s]).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${statusFilter === s ? th.accent : th.border}`,
            background: statusFilter === s ? th.accentSoft : 'transparent',
            color: statusFilter === s ? th.accentText : th.muted,
          }}>{s} ({statusCounts[s]})</button>
        ))}
      </div>

      <div style={{ ...th.card, borderRadius: 14, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={20} /></div>
        ) : leads.length === 0 ? (
          <div style={{ padding: 20 }}>
            <EmptyState icon="🎯" title="No leads yet" sub="Add one manually or import a CSV to get started." />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${th.border}` }}>
                  {['Business', 'Category', 'Phone', 'Score', 'Status', 'Added'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: th.muted, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => setSelected(l)} style={{ borderBottom: `1px solid ${th.border}`, cursor: 'pointer' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{l.businessName}</td>
                    <td style={{ padding: '10px 12px', color: th.muted }}>{l.category || '—'}</td>
                    <td style={{ padding: '10px 12px', color: th.muted }}>{l.phone || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontWeight: 800, color: TEMPERATURE_COLORS[l.leadTemperature] || th.muted }}>
                        {l.leadScore} · {l.leadTemperature}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{l.pipelineStatus}</td>
                    <td style={{ padding: '10px 12px', color: th.muted, whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: th.muted }}>মোট {total} টা lead</div>

      {showAdd && (
        <AddLeadModal th={th} onClose={() => setShowAdd(false)} onToast={onToast} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {showImport && (
        <ImportCsvModal th={th} onClose={() => setShowImport(false)} onToast={onToast} onDone={() => { setShowImport(false); load(); }} />
      )}
      {selected && (
        <LeadDetailModal
          th={th} lead={selected} canEdit={canEdit} canDelete={canDelete}
          onClose={() => setSelected(null)}
          onToast={onToast}
          onSaved={(updated) => { setSelected(updated); load(); }}
          onDeleted={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Add Lead Modal ────────────────────────────────────────────────────────────
function AddLeadModal({ th, onClose, onToast, onSaved }: {
  th: Theme; onClose: () => void; onToast: (m: string, t?: any) => void; onSaved: () => void;
}) {
  const { request } = useApi();
  const [form, setForm] = useState<Record<string, any>>({ estimatedMessageVolume: 'medium', onlineOrderPresence: false });
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<Lead[] | null>(null);

  const submit = async (forceCreate = false) => {
    if (!form.businessName?.trim()) return onToast('Business name দিন', 'error');
    setSaving(true);
    try {
      const data = await request<{ lead: Lead | null; duplicates: Lead[] }>(`${API_BASE}/marketing/leads`, {
        method: 'POST',
        body: JSON.stringify({ ...form, forceCreate }),
      });
      if (!data.lead && data.duplicates?.length) {
        setDuplicates(data.duplicates);
        return;
      }
      onToast('✅ Lead added', 'success');
      onSaved();
    } catch (e: any) { onToast(e.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...th.card, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: `1.5px solid ${th.border}` }}>
        <CardHeader th={th} title="🎯 নতুন Lead যোগ করুন" sub="যেই business গুলো ChatCat-এর সম্ভাব্য customer হতে পারে।" />

        {duplicates && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12.5 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠️ সম্ভাব্য duplicate পাওয়া গেছে:</div>
            {duplicates.map((d) => (
              <div key={d.id}>{d.businessName} — {d.phone || d.website || d.facebookUrl}</div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={th.btnPrimary} onClick={() => submit(true)} disabled={saving}>তবুও Create করুন</button>
              <button style={th.btnGhost} onClick={() => setDuplicates(null)}>← ফিরে যান</button>
            </div>
          </div>
        )}

        {!duplicates && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input style={th.input} placeholder="Business Name *" value={form.businessName || ''} onChange={(e) => set('businessName', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={th.input} placeholder="Category (Fashion/Restaurant/...)" value={form.category || ''} onChange={(e) => set('category', e.target.value)} />
              <input style={th.input} placeholder="Location" value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={th.input} placeholder="Phone" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
              <input style={th.input} placeholder="Email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
            </div>
            <input style={th.input} placeholder="Website" value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={th.input} placeholder="Facebook URL" value={form.facebookUrl || ''} onChange={(e) => set('facebookUrl', e.target.value)} />
              <input style={th.input} placeholder="Instagram URL" value={form.instagramUrl || ''} onChange={(e) => set('instagramUrl', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <input style={th.input} type="number" placeholder="Followers" value={form.followerCount ?? ''} onChange={(e) => set('followerCount', e.target.value ? Number(e.target.value) : undefined)} />
              <input style={th.input} type="number" placeholder="Reviews" value={form.reviewCount ?? ''} onChange={(e) => set('reviewCount', e.target.value ? Number(e.target.value) : undefined)} />
              <input style={th.input} type="number" step="0.1" placeholder="Rating" value={form.rating ?? ''} onChange={(e) => set('rating', e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <select style={th.input} value={form.estimatedMessageVolume || 'medium'} onChange={(e) => set('estimatedMessageVolume', e.target.value)}>
                <option value="low">Low message volume</option>
                <option value="medium">Medium message volume</option>
                <option value="high">High message volume</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.onlineOrderPresence} onChange={(e) => set('onlineOrderPresence', e.target.checked)} />
                Online ordering present
              </label>
            </div>
            <textarea style={{ ...th.input, minHeight: 60 }} placeholder="Notes" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button style={th.btnPrimary} onClick={() => submit(false)} disabled={saving}>{saving ? 'Saving…' : '✓ Add Lead'}</button>
              <button style={th.btnGhost} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import CSV Modal ──────────────────────────────────────────────────────────
function ImportCsvModal({ th, onClose, onToast, onDone }: {
  th: Theme; onClose: () => void; onToast: (m: string, t?: any) => void; onDone: () => void;
}) {
  const { request } = useApi();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; skipped: any[]; failed: any[] } | null>(null);

  const doParse = () => {
    const parsed = parseCsv(text);
    setRows(parsed);
    if (!parsed.length) onToast('কোনো valid row পাওয়া যায়নি — header row ঠিক আছে কিনা দেখুন', 'error');
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const data = await request<{ createdCount: number; skipped: any[]; failed: any[] }>(`${API_BASE}/marketing/leads/bulk`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setResult(data);
    } catch (e: any) { onToast(e.message || 'Import failed', 'error'); }
    finally { setImporting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...th.card, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', border: `1.5px solid ${th.border}` }}>
        <CardHeader th={th} title="📥 CSV Import"
          sub={`প্রথম row header হতে হবে। Column গুলো: ${CSV_COLUMNS.join(', ')}`} />

        {result ? (
          <div>
            <div style={{ fontSize: 14, marginBottom: 10 }}>
              ✅ {result.createdCount} টা lead তৈরি হয়েছে
              {result.skipped.length > 0 && <> · ⏭️ {result.skipped.length} টা skip (duplicate)</>}
              {result.failed.length > 0 && <> · ❌ {result.failed.length} টা fail</>}
            </div>
            <button style={th.btnPrimary} onClick={onDone}>Done</button>
          </div>
        ) : (
          <>
            <textarea
              style={{ ...th.input, minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
              placeholder={`businessName,category,location,phone,website,facebookUrl\nABC Fashion,Fashion,Dhaka,01700000000,abc.com,fb.com/abc`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button style={th.btnGhost} onClick={doParse}>🔍 Preview</button>
              {rows.length > 0 && (
                <button style={th.btnPrimary} onClick={doImport} disabled={importing}>
                  {importing ? 'Importing…' : `✓ Import ${rows.length} leads`}
                </button>
              )}
              <button style={th.btnGhost} onClick={onClose}>Cancel</button>
            </div>
            {rows.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: th.muted }}>
                {rows.length} টা row পাওয়া গেছে: {rows.slice(0, 5).map((r) => r.businessName).join(', ')}{rows.length > 5 ? '…' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Lead Detail Modal ─────────────────────────────────────────────────────────
function LeadDetailModal({ th, lead, canEdit, canDelete, onClose, onToast, onSaved, onDeleted }: {
  th: Theme; lead: Lead; canEdit: boolean; canDelete: boolean;
  onClose: () => void; onToast: (m: string, t?: any) => void;
  onSaved: (l: Lead) => void; onDeleted: () => void;
}) {
  const { request } = useApi();
  const [notes, setNotes] = useState(lead.notes || '');
  const [status, setStatus] = useState(lead.pipelineStatus);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await request<Lead>(`${API_BASE}/marketing/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes, pipelineStatus: status }),
      });
      onToast('✅ Saved', 'success');
      onSaved(updated);
    } catch (e: any) { onToast(e.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(`"${lead.businessName}" delete করবেন?`)) return;
    try {
      await request(`${API_BASE}/marketing/leads/${lead.id}`, { method: 'DELETE' });
      onToast('✅ Deleted', 'success');
      onDeleted();
    } catch (e: any) { onToast(e.message || 'Error', 'error'); }
  };

  const row = (label: string, value: any) => value ? (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: th.muted, minWidth: 90 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{String(value)}</span>
    </div>
  ) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...th.card, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', border: `1.5px solid ${th.border}` }}>
        <CardHeader th={th} title={lead.businessName} sub={lead.category || undefined} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{
            fontSize: 20, fontWeight: 900, color: TEMPERATURE_COLORS[lead.leadTemperature] || th.muted,
            padding: '4px 14px', borderRadius: 999, background: th.accentSoft,
          }}>
            {lead.leadScore} · {lead.leadTemperature}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, padding: 12, borderRadius: 10, border: `1px solid ${th.border}` }}>
          {row('Phone', lead.phone)}
          {row('Email', lead.email)}
          {row('Location', lead.location)}
          {row('Website', lead.website)}
          {row('Facebook', lead.facebookUrl)}
          {row('Instagram', lead.instagramUrl)}
          {row('Followers', lead.followerCount)}
          {row('Reviews', lead.reviewCount)}
          {row('Rating', lead.rating)}
          {row('Message Volume', lead.estimatedMessageVolume)}
          {row('Online Ordering', lead.onlineOrderPresence ? 'Yes' : 'No')}
          {row('Source', lead.source)}
          {row('Added', new Date(lead.createdAt).toLocaleString())}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, marginBottom: 4 }}>PIPELINE STATUS</div>
          <select style={th.input} value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value)}>
            {PIPELINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, marginBottom: 4 }}>NOTES</div>
          <textarea style={{ ...th.input, minHeight: 70 }} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {canEdit && <button style={th.btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : '✓ Save'}</button>}
          <button style={th.btnGhost} onClick={onClose}>Close</button>
          {canDelete && <button style={{ ...th.btnGhost, color: '#dc2626', marginLeft: 'auto' }} onClick={remove}>🗑 Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ── Settings Section (Phase 0) ────────────────────────────────────────────────
function SettingsSection({ th, role, onToast }: { th: Theme; role: string; onToast: (m: string, t?: any) => void }) {
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

  useEffect(() => { load(); loadAuditLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
      <div style={{
        ...th.card, borderRadius: 14, padding: 20,
        border: `2px solid ${settings.killSwitchEnabled ? '#ef4444' : th.border}`,
      }}>
        <CardHeader th={th} title="🛑 Marketing Automation Kill Switch"
          sub="One toggle pauses every automated outreach/campaign action across the whole feature. Nothing else matters if this is on." />
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

      <div style={{ ...th.card, borderRadius: 14, padding: 20, background: th.accentSoft, border: `1px dashed ${th.accent}` }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>📣 Coming next (Phase 2+)</div>
        <div style={{ fontSize: 13, color: th.muted, lineHeight: 1.7 }}>
          AI Lead Research · Campaigns · Outreach · Follow-ups · Sales Pipeline · Demos · Trials · Content · Competitors · Referrals · Analytics
        </div>
      </div>

      <div style={{ ...th.card, borderRadius: 14, padding: 20 }}>
        <CardHeader th={th} title="🧾 Recent Activity" sub="Every marketing automation action gets logged here." />
        {auditLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spinner size={16} /></div>
        ) : auditRows.length === 0 ? (
          <EmptyState icon="🧾" title="No activity yet" sub="Actions will show up here as leads/campaigns start flowing." />
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
