import React, { useEffect, useState } from 'react';
import { LanguageSwitch, Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type FbPage = { pageId: string; pageName: string; pageToken: string };
type ConnectedPage = { id: number; pageId: string; pageName: string; isActive: boolean };
type ConnectMode = 'oauth' | 'manual';

function extractYouTubeId(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

interface Props {
  dark: boolean; userId: string;
  onConnected: () => void; onLogout: () => void;
}

export function ConnectPageScreen({ dark, userId: _userId, onConnected, onLogout }: Props) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [mode, setMode]           = useState<ConnectMode>('manual');
  const [step, setStep]           = useState<'start' | 'select'>('start');
  const [fbPages, setFbPages]     = useState<FbPage[]>([]);
  const [alreadyConnected, setAlreadyConnected] = useState<ConnectedPage[]>([]);
  const [loading, setLoading]     = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [error, setError]         = useState('');
  const [fbTutorialUrl, setFbTutorialUrl] = useState<string>('');

  // Manual form state
  const [manualPageId, setManualPageId]     = useState('');
  const [manualPageName, setManualPageName] = useState('');
  const [manualToken, setManualToken]       = useState('');
  const [manualBusy, setManualBusy]         = useState(false);
  const [manualSuccess, setManualSuccess]   = useState(false);
  const [webhookInfo, setWebhookInfo]       = useState<{ webhookUrl: string; verifyToken: string } | null>(null);

  const bg     = dark ? '#080e1c' : '#f1f3fa';
  const panel  = dark ? '#0d1526' : '#fff';
  const border = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#e2e8ff' : '#1a1f36';
  const muted  = dark ? 'rgba(226,232,255,0.45)' : 'rgba(26,31,54,0.45)';

  useEffect(() => {
    request<ConnectedPage[]>(`${API_BASE}/facebook/my-pages`)
      .then(pages => setAlreadyConnected(pages || []))
      .catch(() => {});
    request<any>(`${API_BASE}/client-dashboard/tutorials`)
      .then(cfg => setFbTutorialUrl(cfg?.facebookAccessToken || ''))
      .catch(() => {});
  }, []);

  // Handle FB OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    if (!code || !state) return;
    window.history.replaceState({}, '', window.location.pathname);
    setMode('oauth');
    setLoading(true); setError('');
    request<{ pages: FbPage[] }>(
      `${API_BASE}/facebook/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    )
      .then(r => { setFbPages(r.pages || []); setStep('select'); })
      .catch(e => setError(e?.message || copy('OAuth ব্যর্থ হয়েছে', 'OAuth failed')))
      .finally(() => setLoading(false));
  }, []);

  const startOAuth = async () => {
    setLoading(true); setError('');
    try {
      const data: any = await request(`${API_BASE}/facebook/oauth-url`);
      window.location.href = data.url;
    } catch (e: any) { setError(e?.message || copy('প্রসেস শুরু করা যায়নি', 'Failed')); setLoading(false); }
  };

  const connectPage = async (p: FbPage) => {
    const existingPage = alreadyConnected.find(c => c.pageId === p.pageId);
    const isDuplicate = existingPage?.isActive === true;
    if (isDuplicate) {
      setError(copy(`"${p.pageName}" ইতিমধ্যে connected আছে।`, `"${p.pageName}" is already connected.`));
      return;
    }
    setConnecting(p.pageId); setError('');
    try {
      await request(`${API_BASE}/facebook/connect`, {
        method: 'POST', body: JSON.stringify(p),
      });
      setConnected(p.pageId);
      setTimeout(() => onConnected(), 900);
    } catch (e: any) {
      if (String(e?.message).toLowerCase().includes('already')) {
        setConnected(p.pageId);
        setTimeout(() => onConnected(), 900);
      } else {
        setError(e?.message || copy('Connect করা যায়নি', 'Connect failed'));
        setConnecting(null);
      }
    }
  };

  const connectManual = async () => {
    const pid   = manualPageId.trim();
    const pname = manualPageName.trim();
    const tok   = manualToken.trim();
    if (!pid || !pname || !tok) { setError(copy('Page ID, Page Name এবং Access Token সবগুলো দিন।', 'Enter the Page ID, Page Name, and Access Token.')); return; }
    setManualBusy(true); setError('');
    try {
      const res: any = await request(`${API_BASE}/facebook/connect`, {
        method: 'POST',
        body: JSON.stringify({ pageId: pid, pageName: pname, pageToken: tok }),
      });
      if (res?.webhookUrl || res?.page?.verifyToken) {
        setWebhookInfo({ webhookUrl: res.webhookUrl || '', verifyToken: res.page?.verifyToken || '' });
      }
      setManualSuccess(true);
    } catch (e: any) {
      if (String(e?.message).toLowerCase().includes('already')) {
        setManualSuccess(true);
      } else {
        setError(e?.message || copy('Connect করা যায়নি', 'Connect failed'));
        setManualBusy(false);
      }
    }
  };

  const disconnectPage = async (page: ConnectedPage) => {
    const confirmed = window.confirm(
      copy(
        `"${page.pageName}" page টি disconnect করতে চান?`,
        `Do you want to disconnect "${page.pageName}"?`,
      ),
    );
    if (!confirmed) return;

    setDisconnecting(page.id);
    setError('');
    try {
      await request(`${API_BASE}/facebook/disconnect/${page.id}`, {
        method: 'DELETE',
      });
      const nextPages = alreadyConnected.map((p) =>
        p.id === page.id ? { ...p, isActive: false } : p,
      );
      setAlreadyConnected(nextPages);
      setConnected((current) => (current === page.pageId ? null : current));
      setManualSuccess(false);
      setWebhookInfo(null);
      if (!nextPages.some((p) => p.isActive)) {
        onConnected();
      }
    } catch (e: any) {
      setError(e?.message || copy('Disconnect করা যায়নি', 'Disconnect failed'));
    } finally {
      setDisconnecting(null);
    }
  };

  const inp: React.CSSProperties = {
    padding: '11px 14px', borderRadius: 10, border: `1px solid ${border}`,
    background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
    color: text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
    background: active ? (dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)') : 'transparent',
    color: active ? '#6366f1' : muted,
    fontWeight: active ? 800 : 500, fontSize: 13.5,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
  });

  return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 500, background: panel, border: `1px solid ${border}`, borderRadius: 22, padding: 38, boxShadow: dark ? '0 8px 48px rgba(0,0,0,0.5)' : '0 8px 40px rgba(99,102,241,0.1)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
              <span style={{ fontSize: 18, fontWeight: 900, color: text }}>{copy('পেজ কানেক্ট', 'Connect Page')}</span>
            </div>
            <div style={{ fontSize: 13, color: muted }}>{copy('আপনার Facebook Page bot-এর সাথে যুক্ত করুন', 'Connect your Facebook Page to the bot')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LanguageSwitch dark={dark} compact />
            <button onClick={onLogout} style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 8, padding: '6px 14px', color: muted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {copy('লগআউট', 'Logout')}
            </button>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 22, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: 12, padding: 4 }}>
          <button style={tabBtn(mode === 'manual')} onClick={() => { setMode('manual'); setError(''); }}>
            {copy('🔑 Manual Token', 'Manual Token')}
          </button>
          <button style={tabBtn(mode === 'oauth')} onClick={() => { setMode('oauth'); setStep('start'); setError(''); }}>
            <span style={{ fontSize: 13 }}>f</span> {copy('Facebook OAuth', 'Facebook OAuth')}
          </button>
        </div>

        {/* Error alert */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', borderRadius: 11, padding: '11px 15px', fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Already connected pages */}
        {alreadyConnected.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {copy('Connected Pages', 'Connected Pages')}
            </div>
            {alreadyConnected.map(p => (
              <div key={p.pageId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderRadius: 10, border: `1px solid rgba(34,197,94,0.25)`, background: dark ? 'rgba(34,197,94,0.05)' : 'rgba(34,197,94,0.04)', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{p.isActive ? '✅' : '⏸️'}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{p.pageName}</div>
                    <div style={{ fontSize: 11, color: muted }}>
                      {p.pageId} {p.isActive ? copy('• Active', '• Active') : copy('• Inactive', '• Inactive')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => disconnectPage(p)}
                  disabled={disconnecting === p.id || !p.isActive}
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 12px',
                    background: !p.isActive ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'rgba(239,68,68,0.14)',
                    color: !p.isActive ? muted : '#ef4444',
                    cursor: disconnecting === p.id || !p.isActive ? 'default' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    minWidth: 104,
                  }}
                >
                  {disconnecting === p.id
                    ? copy('Disconnecting...', 'Disconnecting...')
                    : p.isActive
                      ? copy('Disconnect', 'Disconnect')
                      : copy('Disconnected', 'Disconnected')}
                </button>
              </div>
            ))}
            <div style={{ height: 1, background: border, margin: '14px 0' }} />
          </div>
        )}

        {/* ── MANUAL MODE ─────────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: dark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, padding: '12px 15px', fontSize: 12.5, color: text, lineHeight: 1.85 }}>
              📌 <strong>{copy('কিভাবে Access Token পাবেন?', 'How to get the Access Token?')}</strong><br />
              <span style={{ color: muted }}>
                {copy('1. ', '1. ')}<a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>Graph API Explorer</a>{copy(' খুলুন', ' and open it')}<br />
                {copy('2. আপনার App ও Page select করুন', '2. Select your App and Page')}<br />
                {copy('3. ', '3. ')}<code style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 4 }}>pages_messaging</code>{copy(' permission add করুন', ' permission')}<br />
                {copy('4. "Generate Access Token" click করুন → copy করুন', '4. Click "Generate Access Token" and copy it')}
              </span>
            </div>

            <div>
              <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>{copy('Facebook Page ID *', 'Facebook Page ID *')}</label>
              <input style={inp} placeholder={copy('যেমন: 123456789012345', 'Example: 123456789012345')}
                value={manualPageId} onChange={e => setManualPageId(e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>{copy('Page Name *', 'Page Name *')}</label>
              <input style={inp} placeholder={copy('আপনার Page এর নাম', 'Your page name')}
                value={manualPageName} onChange={e => setManualPageName(e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>{copy('Page Access Token *', 'Page Access Token *')}</label>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 80, lineHeight: 1.5 }}
                placeholder={copy('EAAxxxxxx... (Graph API Explorer থেকে copy করুন)', 'EAAxxxxxx... (copy from Graph API Explorer)')}
                value={manualToken} onChange={e => setManualToken(e.target.value)} />
            </div>

            {!manualSuccess ? (
              <button onClick={connectManual} disabled={manualBusy}
                style={{
                  width: '100%', padding: '13px', borderRadius: 13, border: 'none',
                  background: manualBusy ? 'rgba(99,102,241,0.5)' : '#6366f1',
                  color: '#fff', fontWeight: 800, fontSize: 15,
                  cursor: manualBusy ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  fontFamily: 'inherit', transition: 'background .15s',
                }}>
                {manualBusy ? <><Spinner size={15} /> {copy('Connecting...', 'Connecting...')}</> : copy('🔗 Page Connect করুন', 'Connect Page')}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 15px', fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
                  {copy('✅ Page সফলভাবে Connected হয়েছে!', '✅ Page connected successfully!')}
                </div>
                {webhookInfo && (
                  <div style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}`, borderRadius: 12, padding: '14px 15px', fontSize: 12.5 }}>
                    <div style={{ fontWeight: 800, color: text, marginBottom: 10 }}>{copy('📡 Facebook Webhook Setup করুন:', '📡 Set up the Facebook Webhook:')}</div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: muted }}>{copy('Webhook URL:', 'Webhook URL:')}</span><br />
                      <code style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#f0f0f0', padding: '4px 8px', borderRadius: 6, fontSize: 12, display: 'block', marginTop: 4, wordBreak: 'break-all', color: text }}>
                        {webhookInfo.webhookUrl || `${window.location.origin.replace(':5173', ':3000')}/webhook`}
                      </code>
                    </div>
                    <div>
                      <span style={{ color: muted }}>{copy('Verify Token:', 'Verify Token:')}</span><br />
                      <code style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#f0f0f0', padding: '4px 8px', borderRadius: 6, fontSize: 12, display: 'block', marginTop: 4, color: text }}>
                        {webhookInfo.verifyToken}
                      </code>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: muted, lineHeight: 1.7 }}>
                      {copy('⬆️ এই URL এবং Verify Token দিয়ে আপনার Facebook App-এর Webhook settings configure করুন।', '⬆️ Configure your Facebook App webhook using this URL and verify token.')}<br />
                      {copy('Subscribe করুন:', 'Subscribe to:')} <strong>messages, messaging_postbacks</strong>
                    </div>
                  </div>
                )}
                <button onClick={onConnected}
                  style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {copy('→ Dashboard-এ যান', 'Go to Dashboard')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── OAUTH MODE ───────────────────────────────────────────────────── */}
        {mode === 'oauth' && (
          <>
            {/* Tutorial video */}
            {(() => {
              const ytId = extractYouTubeId(fbTutorialUrl);
              if (!ytId) return null;
              return (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {copy('📺 Facebook Access Token কিভাবে পাবেন', '📺 How to get your Facebook Access Token')}
                  </div>
                  <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#000', marginBottom: 8 }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}`}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen title="Facebook Access Token tutorial"
                    />
                  </div>
                  <div style={{ height: 1, background: border, margin: '14px 0' }} />
                </div>
              );
            })()}

            {/* Step: start */}
            {step === 'start' && (
              <div>
                <div style={{ background: dark ? 'rgba(24,119,242,0.08)' : 'rgba(24,119,242,0.05)', border: '1px solid rgba(24,119,242,0.18)', borderRadius: 13, padding: '14px 16px', fontSize: 13, color: text, lineHeight: 1.9, marginBottom: 22 }}>
                  {copy('📋 নিচের বাটনে click করলে Facebook Login খুলবে।', '📋 Clicking the button below will open Facebook Login.')}<br />
                  {copy('Login করার পরে আপনার Page-গুলো দেখা যাবে।', 'After login, your pages will appear here.')}<br />
                  <span style={{ color: muted, fontSize: 12 }}>{copy('নতুন Page যোগ করতে পারবেন বা existing reconnect করতে পারবেন।', 'You can connect new pages or reconnect existing ones.')}</span>
                </div>
                <button onClick={startOAuth} disabled={loading}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    background: loading ? 'rgba(24,119,242,0.45)' : '#1877f2',
                    color: '#fff', fontWeight: 800, fontSize: 15,
                    cursor: loading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    fontFamily: 'inherit', transition: 'opacity .15s',
                  }}>
                  {loading
                    ? <><Spinner size={16} /> {copy('Redirecting...', 'Redirecting...')}</>
                    : <><span style={{ fontSize: 22, lineHeight: 1 }}>f</span> {copy('Facebook দিয়ে Login করুন', 'Continue with Facebook')}</>
                  }
                </button>
              </div>
            )}

            {/* Step: select */}
            {step === 'select' && (
              <div>
                <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
                  {copy(`${fbPages.length} টি Page পাওয়া গেছে — connect করতে click করুন:`, `${fbPages.length} pages found - click to connect:`)}
                </div>

                {fbPages.length === 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 11, padding: '13px 16px', fontSize: 13, color: '#ef4444' }}>
                    {copy('কোনো Page পাওয়া যায়নি। আপনার Facebook account-এ কি কোনো Page আছে?', 'No pages were found. Does your Facebook account have any pages?')}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {fbPages.map(p => {
                    const existingPage = alreadyConnected.find(c => c.pageId === p.pageId);
                    const isAlready   = Boolean(existingPage);
                    const isActiveExisting = existingPage?.isActive === true;
                    const isConnected = connected === p.pageId;
                    const isBusy      = connecting === p.pageId;
                    return (
                      <div key={p.pageId} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '13px 16px', borderRadius: 13,
                        border: `1px solid ${isConnected ? 'rgba(34,197,94,0.35)' : isAlready ? 'rgba(234,179,8,0.3)' : border}`,
                        background: isConnected
                          ? (dark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.05)')
                          : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                        transition: 'all .2s',
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{p.pageName}</div>
                          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>ID: {p.pageId}</div>
                          {isAlready && !isConnected && (
                            <div style={{ fontSize: 11, color: '#ca8a04', marginTop: 2 }}>
                              {isActiveExisting
                                ? copy('⚠️ ইতিমধ্যে connected আছে।', '⚠️ Already connected.')
                                : copy('⚠️ Page আছে, কিন্তু inactive. Reconnect করুন।', '⚠️ Page exists, but is inactive. Reconnect it.')}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => connectPage(p)}
                          disabled={isBusy || isConnected}
                          style={{
                            padding: '9px 18px', borderRadius: 11, border: 'none',
                            background: isConnected ? '#16a34a' : isBusy ? 'rgba(99,102,241,0.4)' : '#6366f1',
                            color: '#fff', fontWeight: 700, cursor: isBusy || isConnected ? 'default' : 'pointer',
                            fontSize: 13, fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            transition: 'background .15s',
                          }}
                        >
                          {isConnected ? copy('✅ Connected!', '✅ Connected!') : isBusy ? <><Spinner size={13} /> {copy('Connecting...', 'Connecting...')}</> : (isAlready && !isActiveExisting ? copy('🔄 Reconnect', 'Reconnect') : copy('✅ Connect', 'Connect'))}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => { setStep('start'); setError(''); }}
                  style={{ marginTop: 16, background: 'transparent', border: `1px solid ${border}`, borderRadius: 8, padding: '8px 16px', color: muted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  {copy('← Back', '← Back')}
                </button>
              </div>
            )}
          </>
        )}

        {/* Goto dashboard if already connected */}
        {alreadyConnected.length > 0 && (
          <button onClick={onConnected}
            style={{ marginTop: 18, width: '100%', padding: '11px', borderRadius: 12, border: `1px solid rgba(99,102,241,0.3)`, background: 'transparent', color: '#6366f1', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {copy(`→ Dashboard-এ যান (${alreadyConnected[0].pageName})`, `Go to Dashboard (${alreadyConnected[0].pageName})`)}
          </button>
        )}
      </div>
    </div>
  );
}
