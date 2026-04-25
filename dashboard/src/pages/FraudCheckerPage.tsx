import { useState, useEffect } from 'react';
import { CardHeader, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

interface SpamResult {
  risk: 'safe' | 'low' | 'medium' | 'high' | 'new' | 'unknown';
  score: number;
  totalOrders: number;
  delivered: number;
  cancelled: number;
  successRate: number;
  source: string;
  courierBreakdown?: { name: string; total: number; delivered: number; successRate: number }[];
}

interface SpamLog {
  id: number;
  phone: string;
  risk: string;
  score: number;
  totalOrders: number;
  delivered: number;
  successRate: number;
  source: string;
  checkedAt: string;
}

const RISK_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  high:    { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🔴', label: 'HIGH RISK' },
  medium:  { color: '#b45309', bg: '#fffbeb', border: '#fcd34d', icon: '🟡', label: 'MEDIUM RISK' },
  low:     { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '🟢', label: 'LOW RISK' },
  safe:    { color: '#15803d', bg: '#f0fdf4', border: '#4ade80', icon: '✅', label: 'SAFE' },
  new:     { color: '#6366f1', bg: '#f5f3ff', border: '#c4b5fd', icon: '🆕', label: 'NEW CUSTOMER' },
  unknown: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', icon: '❓', label: 'UNKNOWN' },
};

function RiskCard({ result, th }: { result: SpamResult; th: Theme }) {
  const cfg = RISK_CONFIG[result.risk] ?? RISK_CONFIG.unknown;
  const darkBg = th.bg === '#111827' || th.bg?.includes('1f2937');
  const cardBg = darkBg ? th.surface : cfg.bg;
  const borderColor = darkBg ? cfg.color + '60' : cfg.border;
  const subText = darkBg ? '#94a3b8' : '#4b5563';
  const strongText = darkBg ? '#e2e8f0' : '#111827';

  return (
    <div style={{
      borderRadius: 14, border: `2px solid ${borderColor}`,
      background: cardBg, padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 28 }}>{cfg.icon}</span>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, color: cfg.color, letterSpacing: 0.5 }}>{cfg.label}</div>
          <div style={{ fontSize: 12.5, color: subText, marginTop: 3, fontWeight: 500 }}>
            Risk Score: <strong style={{ color: strongText }}>{result.score}/100</strong> · Source: <strong style={{ color: strongText }}>{result.source}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Orders', value: result.totalOrders },
          { label: 'Delivered', value: result.delivered },
          { label: 'Cancelled', value: result.cancelled },
        ].map(item => (
          <div key={item.label} style={{
            background: th.bg, borderRadius: 8, padding: '12px 12px',
            border: `1px solid ${th.border}`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: th.text }}>{item.value}</div>
            <div style={{ fontSize: 11.5, color: subText, marginTop: 3, fontWeight: 600 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: result.courierBreakdown?.length ? 16 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: subText }}>
          <span style={{ fontWeight: 700 }}>Success Rate</span>
          <span style={{ fontWeight: 800, color: cfg.color, fontSize: 14 }}>{result.successRate.toFixed(1)}%</span>
        </div>
        <div style={{ background: th.border, borderRadius: 99, height: 12, overflow: 'hidden' }}>
          <div style={{
            width: `${result.successRate}%`, height: '100%',
            background: result.successRate >= 76 ? '#16a34a' : result.successRate >= 51 ? '#f59e0b' : '#dc2626',
            borderRadius: 99, transition: 'width .4s',
          }} />
        </div>
      </div>

      {result.courierBreakdown && result.courierBreakdown.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: subText, marginBottom: 8, marginTop: 4 }}>Per-Courier Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.courierBreakdown.map(c => (
              <div key={c.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: th.bg, borderRadius: 7, padding: '9px 12px',
                border: `1px solid ${th.border}`,
              }}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: th.text }}>{c.name}</div>
                <div style={{ fontSize: 12, color: subText, fontWeight: 600 }}>{c.total} orders</div>
                <div style={{
                  fontSize: 11.5, fontWeight: 700,
                  color: c.successRate >= 76 ? '#16a34a' : c.successRate >= 51 ? '#f59e0b' : '#dc2626',
                }}>
                  {c.successRate.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ log, th }: { log: SpamLog; th: Theme }) {
  const cfg = RISK_CONFIG[log.risk] ?? RISK_CONFIG.unknown;
  const darkBg = th.bg === '#111827' || th.bg?.includes('1f2937');
  const subText = darkBg ? th.textSub ?? '#cbd5e1' : '#374151';
  const ago = (() => {
    const diff = Date.now() - new Date(log.checkedAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderBottom: `1px solid ${th.border}`,
    }}>
      <span style={{ fontSize: 16 }}>{cfg.icon}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: th.text, fontFamily: 'monospace' }}>{log.phone}</span>
        <span style={{ marginLeft: 8, fontSize: 11.5, color: subText, fontWeight: 500 }}>{log.source}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>
        {log.totalOrders > 0 ? `${log.successRate.toFixed(0)}%` : 'New'}
      </div>
      <div style={{ fontSize: 11.5, color: subText, fontWeight: 500 }}>{ago}</div>
    </div>
  );
}

export default function FraudCheckerPage({ pageId, th }: { pageId: number; th: Theme }) {
  const { request } = useApi();
  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const [phone, setPhone]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<SpamResult | null>(null);
  const [error, setError]       = useState('');
  const [logs, setLogs]         = useState<SpamLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const data = await request<SpamLog[]>(`${BASE}/fraud-check/logs?limit=20`);
      setLogs(data);
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [pageId]);

  const handleCheck = async () => {
    const cleaned = phone.trim().replace(/\s+/g, '');
    if (!cleaned) { setError('Phone number দিন'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await request<SpamResult>(`${BASE}/fraud-check`, {
        method: 'POST',
        body: JSON.stringify({ phone: cleaned }),
      });
      setResult(data);
      fetchLogs();
    } catch (e: any) {
      setError(e?.message || 'কিছু একটা সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 0 40px' }}>
      <CardHeader
        th={th}
        title="🛡️ Fraud Checker"
        sub="Customer এর phone number দিয়ে delivery history চেক করুন"
      />

      {/* Search box */}
      <div style={{ ...th.card, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...th.input, flex: 1, fontSize: 15, fontFamily: 'monospace' }}
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleCheck()}
            disabled={loading}
          />
          <button
            style={{ ...th.btnSmAccent, minWidth: 90, fontSize: 14, padding: '10px 18px' }}
            onClick={handleCheck}
            disabled={loading}
          >
            {loading ? <Spinner size={16} /> : 'Check'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div style={{ marginBottom: 24 }}>
          <RiskCard result={result} th={th} />
        </div>
      )}

      {/* Recent checks */}
      <div style={th.card}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${th.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: th.text }}>Recent Checks</span>
        </div>
        {logsLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><Spinner size={20} /></div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '20px 16px', color: th.muted, fontSize: 13, textAlign: 'center' }}>
            এখনো কোনো check করা হয়নি
          </div>
        ) : (
          <div>
            {logs.map(log => <LogRow key={log.id} log={log} th={th} />)}
          </div>
        )}
      </div>
    </div>
  );
}
