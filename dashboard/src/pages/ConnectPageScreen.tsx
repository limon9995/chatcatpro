import React, { useEffect, useState } from 'react';
import { LanguageSwitch, Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type ConnectedPage = { id: number; pageId: string; pageName: string; isActive: boolean };
type OAuthPage = { pageId: string; pageName: string; pageToken: string };

interface Props {
  dark: boolean; userId: string;
  onConnected: () => void; onLogout: () => void;
}

export function ConnectPageScreen({ dark, userId: _userId, onConnected, onLogout }: Props) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [alreadyConnected, setAlreadyConnected] = useState<ConnectedPage[]>([]);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [error, setError]         = useState('');

  // Manual form state
  const [manualPageName, setManualPageName] = useState('');
  const [manualToken, setManualToken]       = useState('');
  const [manualBusy, setManualBusy]         = useState(false);
  const [manualSuccess, setManualSuccess]   = useState(false);
  const [tab, setTab] = useState<'oauth' | 'manual'>('oauth');
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthPages, setOauthPages] = useState<OAuthPage[]>([]);
  const [oauthConnectingPageId, setOauthConnectingPageId] = useState<string | null>(null);

  const bg     = dark ? '#080e1c' : '#f1f3fa';
  const panel  = dark ? '#0d1526' : '#fff';
  const border = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#e2e8ff' : '#1a1f36';
  const muted  = dark ? 'rgba(226,232,255,0.45)' : 'rgba(26,31,54,0.45)';
  const activePages = alreadyConnected.filter((page) => page.isActive);
  const savedPages = alreadyConnected.filter((page) => !page.isActive);

  useEffect(() => {
    request<ConnectedPage[]>(`${API_BASE}/facebook/my-pages`)
      .then(pages => setAlreadyConnected(pages || []))
      .catch(() => {});
  }, [request]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResultId = params.get('oauthResult');
    if (!oauthResultId) return;

    setOauthBusy(true);
    setError('');
    request<{ pages: OAuthPage[] }>(`${API_BASE}/facebook/oauth-result/${encodeURIComponent(oauthResultId)}`)
      .then((result) => {
        setOauthPages(result?.pages || []);
        setTab('oauth');
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.delete('oauthResult');
        const next = nextParams.toString() ? `/?${nextParams.toString()}` : '/?mode=connect-page';
        window.history.replaceState({}, '', next);
      })
      .catch((e: any) => setError(e?.message || copy('Facebook page list load করা যায়নি', 'Could not load Facebook pages')))
      .finally(() => setOauthBusy(false));
  }, [copy, request]);

  const connectManual = async () => {
    const pname = manualPageName.trim();
    const tok   = manualToken.trim();
    if (!pname || !tok) { setError(copy('Page Name এবং Access Token দিন।', 'Enter the Page Name and Access Token.')); return; }
    setManualBusy(true); setError('');
    try {
      await request(`${API_BASE}/facebook/connect`, {
        method: 'POST',
        body: JSON.stringify({ pageId: '', pageName: pname, pageToken: tok }),
      });
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

  const startOAuthConnect = async () => {
    setOauthBusy(true);
    setError('');
    try {
      const result = await request<{ url: string }>(`${API_BASE}/facebook/oauth-url`);
      if (!result?.url) throw new Error('Facebook OAuth URL missing');
      window.location.href = result.url;
    } catch (e: any) {
      setError(e?.message || copy('Facebook login শুরু করা যায়নি', 'Could not start Facebook login'));
      setOauthBusy(false);
    }
  };

  const connectOAuthPage = async (page: OAuthPage) => {
    setOauthConnectingPageId(page.pageId);
    setError('');
    try {
      await request(`${API_BASE}/facebook/connect`, {
        method: 'POST',
        body: JSON.stringify({
          pageId: page.pageId,
          pageName: page.pageName,
          pageToken: page.pageToken,
        }),
      });
      onConnected();
    } catch (e: any) {
      setError(e?.message || copy('Page connect করা যায়নি', 'Page connect failed'));
    } finally {
      setOauthConnectingPageId(null);
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
      setManualSuccess(false);
      if (!nextPages.some((p) => p.isActive)) {
        onConnected();
      }
    } catch (e: any) {
      setError(e?.message || copy('Disconnect করা যায়নি', 'Disconnect failed'));
    } finally {
      setDisconnecting(null);
    }
  };

  const goToDashboardForPage = (page: ConnectedPage) => {
    localStorage.setItem('dfbot_active_page', String(page.id));
    onConnected();
  };

  const inp: React.CSSProperties = {
    padding: '11px 14px', borderRadius: 10, border: `1px solid ${border}`,
    background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
    color: text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

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

        {/* Error alert */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', borderRadius: 11, padding: '11px 15px', fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Active pages */}
        {activePages.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {copy('Active Pages', 'Active Pages')}
            </div>
            {activePages.map(p => (
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

        {/* Saved / disconnected pages */}
        {savedPages.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {copy('Saved Pages', 'Saved Pages')}
            </div>
            {savedPages.map(p => (
              <div key={p.pageId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderRadius: 10, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⏸️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: text }}>{p.pageName}</div>
                    <div style={{ fontSize: 11, color: muted }}>
                      {p.pageId} {copy('• Saved কিন্তু active না', '• Saved but not active')}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: muted, fontWeight: 700 }}>
                  {copy('Reconnect লাগবে', 'Reconnect needed')}
                </div>
              </div>
            ))}
            <div style={{ height: 1, background: border, margin: '14px 0' }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => setTab('oauth')}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${tab === 'oauth' ? '#6366f1' : border}`,
                background: tab === 'oauth' ? (dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)') : 'transparent',
                color: tab === 'oauth' ? '#6366f1' : text,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copy('Facebook Login', 'Facebook Login')}
            </button>
            <button
              onClick={() => setTab('manual')}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${tab === 'manual' ? '#6366f1' : border}`,
                background: tab === 'manual' ? (dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)') : 'transparent',
                color: tab === 'manual' ? '#6366f1' : text,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copy('Manual Token', 'Manual Token')}
            </button>
          </div>

          {tab === 'oauth' ? (
            <>
              <div style={{ background: dark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, padding: '12px 15px', fontSize: 12.5, color: text, lineHeight: 1.85 }}>
                📘 <strong>{copy('সবচেয়ে সহজ উপায়', 'The easiest way')}</strong><br />
                <span style={{ color: muted }}>
                  {copy('1. Facebook login করুন', '1. Log in with Facebook')}<br />
                  {copy('2. Permission allow করুন', '2. Approve the requested permissions')}<br />
                  {copy('3. ফিরে এসে আপনার page select করুন', '3. Come back and select your page')}<br />
                  {copy('4. Done — token manually দিতে হবে না', '4. Done — no need to paste tokens manually')}
                </span>
              </div>

              {oauthPages.length === 0 ? (
                <button onClick={startOAuthConnect} disabled={oauthBusy}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 13, border: 'none',
                    background: oauthBusy ? 'rgba(99,102,241,0.5)' : '#6366f1',
                    color: '#fff', fontWeight: 800, fontSize: 15,
                    cursor: oauthBusy ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    fontFamily: 'inherit',
                  }}>
                  {oauthBusy ? <><Spinner size={15} /> {copy('Opening Facebook...', 'Opening Facebook...')}</> : copy('f Facebook Login করুন', 'f Continue with Facebook')}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: muted, fontWeight: 700 }}>
                    {copy('একটা page select করুন', 'Select a page')}
                  </div>
                  {oauthPages.map((page) => (
                    <div key={page.pageId} style={{ border: `1px solid ${border}`, borderRadius: 12, padding: '11px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: text, fontSize: 13.5 }}>{page.pageName}</div>
                        <div style={{ fontSize: 11.5, color: muted }}>{page.pageId}</div>
                      </div>
                      <button
                        onClick={() => connectOAuthPage(page)}
                        disabled={oauthConnectingPageId === page.pageId}
                        style={{
                          border: 'none',
                          borderRadius: 10,
                          padding: '9px 14px',
                          background: '#6366f1',
                          color: '#fff',
                          fontWeight: 800,
                          cursor: oauthConnectingPageId === page.pageId ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          minWidth: 110,
                        }}
                      >
                        {oauthConnectingPageId === page.pageId ? copy('Connecting...', 'Connecting...') : copy('এইটা Use করুন', 'Use This')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
          <div style={{ background: dark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, padding: '12px 15px', fontSize: 12.5, color: text, lineHeight: 1.85 }}>
            📌 <strong>{copy('কিভাবে Access Token পাবেন?', 'How to get the Access Token?')}</strong><br />
            <span style={{ color: muted }}>
              {copy('1. ', '1. ')}<a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>Graph API Explorer</a>{copy(' খুলুন', ' and open it')}<br />
              {copy('2. আপনার App ও Page select করুন', '2. Select your App and Page')}<br />
              {copy('3. ', '3. ')}<code style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 4 }}>pages_messaging</code>{copy(' permission add করুন', ' permission')}<br />
              {copy('4. "Generate Access Token" click করুন → copy করুন', '4. Click "Generate Access Token" and copy it')}<br />
              {copy('5. Page Name দিন, Access Token দিন — Page ID bot নিজে বের করবে', '5. Enter the Page Name and Access Token — the bot will detect the Page ID automatically')}
            </span>
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
              <button onClick={onConnected}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {copy('→ Dashboard-এ যান', 'Go to Dashboard')}
              </button>
            </div>
          )}
            </>
          )}
        </div>

        {/* Goto dashboard only for active pages */}
        {activePages.length > 0 && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {copy('Dashboard Access', 'Dashboard Access')}
            </div>
            {activePages.map((page) => (
              <button key={page.id} onClick={() => goToDashboardForPage(page)}
                style={{ width: '100%', padding: '11px', borderRadius: 12, border: `1px solid rgba(99,102,241,0.3)`, background: 'transparent', color: '#6366f1', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {copy(`→ ${page.pageName} dashboard`, `Go to ${page.pageName} dashboard`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
