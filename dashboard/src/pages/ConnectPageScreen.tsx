import React, { useEffect, useState } from 'react';
import { LanguageSwitch, Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type ConnectedPage = { id: number; pageId: string; pageName: string; isActive: boolean; masterPageId?: number | null; hasCustomApp?: boolean; fbAppId?: string | null };
type PageRequest = { id: number; pageUrl: string; fbProfile: string; note?: string; status: string; adminNote?: string; createdAt: string };

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
  const [alreadyConnected, setAlreadyConnected] = useState<ConnectedPage[]>([]);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [error, setError]         = useState('');

  // Manual form state
  const [manualPageName, setManualPageName] = useState('');
  const [manualToken, setManualToken]       = useState('');
  const [manualBusy, setManualBusy]         = useState(false);
  const [manualSuccess, setManualSuccess]   = useState(false);
  const [connectResult, setConnectResult]   = useState<{ verifyToken?: string; webhookUrl?: string; hasCustomApp?: boolean } | null>(null);
  const [tab, setTab] = useState<'request' | 'manual'>('request');
  // Linked page: optional master page to share settings from
  const [selectedMasterId, setSelectedMasterId] = useState<number | ''>('');

  // Custom Facebook App (BYOA)
  const [showCustomApp, setShowCustomApp] = useState(false);
  const [customFbAppId, setCustomFbAppId] = useState('');
  const [customFbAppSecret, setCustomFbAppSecret] = useState('');

  // Request Access tab state
  const [reqPageUrl, setReqPageUrl] = useState('');
  const [reqFbProfile, setReqFbProfile] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [reqSubmitted, setReqSubmitted] = useState(false);
  const [myRequests, setMyRequests] = useState<PageRequest[]>([]);

  // Tutorial sidebar
  const [pageConnectTutorialUrl, setPageConnectTutorialUrl] = useState('');

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
    request<any>(`${API_BASE}/client-dashboard/tutorials`)
      .then(t => { if (t?.pageConnect) setPageConnectTutorialUrl(t.pageConnect); })
      .catch(() => {});
  }, [request]);

  useEffect(() => {
    if (tab === 'request') {
      request<PageRequest[]>(`${API_BASE}/facebook/page-request/my`)
        .then(r => setMyRequests(r || []))
        .catch(() => {});
    }
  }, [tab, request]);

  const submitPageRequest = async () => {
    if (!reqPageUrl.trim()) { setError(copy('Facebook Page link দিন', 'Enter your Facebook Page link')); return; }
    if (!reqFbProfile.trim()) { setError(copy('আপনার Facebook profile link দিন', 'Enter your Facebook profile link')); return; }
    setReqBusy(true); setError('');
    try {
      await request(`${API_BASE}/facebook/page-request`, {
        method: 'POST',
        body: JSON.stringify({ pageUrl: reqPageUrl.trim(), fbProfile: reqFbProfile.trim(), note: reqNote.trim() || undefined }),
      });
      setReqSubmitted(true);
      const updated = await request<PageRequest[]>(`${API_BASE}/facebook/page-request/my`);
      setMyRequests(updated || []);
    } catch (e: any) {
      setError(e?.message || copy('Submit করা যায়নি', 'Submit failed'));
    } finally {
      setReqBusy(false);
    }
  };

  const connectManual = async () => {
    const pname = manualPageName.trim();
    const tok   = manualToken.trim();
    if (!pname || !tok) { setError(copy('Page Name এবং Access Token দিন।', 'Enter the Page Name and Access Token.')); return; }
    setManualBusy(true); setError('');
    try {
      const res: any = await request(`${API_BASE}/facebook/connect`, {
        method: 'POST',
        body: JSON.stringify({
          pageId: '', pageName: pname, pageToken: tok,
          ...(selectedMasterId ? { masterPageId: selectedMasterId } : {}),
          ...(customFbAppId.trim() ? { fbAppId: customFbAppId.trim() } : {}),
          ...(customFbAppSecret.trim() ? { fbAppSecret: customFbAppSecret.trim() } : {}),
        }),
      });
      setConnectResult({
        verifyToken: res?.page?.verifyToken,
        webhookUrl: res?.webhookUrl,
        hasCustomApp: !!(customFbAppId.trim() || res?.page?.hasCustomApp),
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
      await request(`${API_BASE}/facebook/disconnect/${page.id}`, { method: 'DELETE' });
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

  const tutorialYtId = extractYouTubeId(pageConnectTutorialUrl);

  return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 24, padding: '40px 20px', fontFamily: "'Inter', system-ui, sans-serif", flexWrap: 'wrap' }}>
      <div style={{ width: 500, flexShrink: 0, background: panel, border: `1px solid ${border}`, borderRadius: 22, padding: 38, boxShadow: dark ? '0 8px 48px rgba(0,0,0,0.5)' : '0 8px 40px rgba(99,102,241,0.1)' }}>

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: text }}>{p.pageName}</span>
                      {p.hasCustomApp && (
                        <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.15)', color: '#6366f1', borderRadius: 5, padding: '1px 6px', fontWeight: 800 }}>Custom App</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: muted }}>
                      {p.pageId} {p.isActive ? copy('• Active', '• Active') : copy('• Inactive', '• Inactive')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => disconnectPage(p)}
                  disabled={disconnecting === p.id || !p.isActive}
                  style={{
                    border: 'none', borderRadius: 8, padding: '7px 12px',
                    background: !p.isActive ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'rgba(239,68,68,0.14)',
                    color: !p.isActive ? muted : '#ef4444',
                    cursor: disconnecting === p.id || !p.isActive ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', minWidth: 104,
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
          {/* Tab bar — 2 tabs only */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['request', 'manual'] as const).map((t) => {
              const labels: Record<string, string> = {
                request: copy('📋 Request Access', '📋 Request Access'),
                manual: copy('🔑 Access Token', '🔑 Access Token'),
              };
              return (
                <div key={t} style={{ position: 'relative' }}>
                  <button onClick={() => { setTab(t); setError(''); }}
                    style={{
                      width: '100%', padding: '9px 8px', borderRadius: 12, fontSize: 12,
                      border: `1px solid ${tab === t ? '#6366f1' : border}`,
                      background: tab === t ? (dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)') : 'transparent',
                      color: tab === t ? '#6366f1' : text, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{labels[t]}</button>
                  {t === 'request' && (
                    <span style={{ position: 'absolute', top: -7, right: 6, background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, letterSpacing: '0.04em' }}>
                      {copy('প্রস্তাবিত', 'Recommended')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Request Access tab ── */}
          {tab === 'request' ? (
            <>
              <div style={{ background: dark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.28)', borderRadius: 12, padding: '12px 15px', fontSize: 12.5, color: text, lineHeight: 1.9 }}>
                📋 <strong>{copy('কীভাবে কাজ করে?', 'How does this work?')}</strong><br />
                <span style={{ color: muted }}>
                  {copy('০. ', '0. ')}
                  <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={{ color: '#6366f1', fontWeight: 700 }}>
                    {copy('Meta Developer Account', 'Meta Developer Account')}
                  </a>
                  {copy(' খুলুন (যদি না থাকে) — developers.facebook.com', ' — create one at developers.facebook.com (if you don\'t have one)')}<br />
                  {copy('১. নিচের form পূরণ করুন — আপনার Facebook page link ও profile link দিন', '1. Fill the form below with your Facebook page & profile links')}<br />
                  {copy('২. Admin আপনাকে Facebook App-এ Tester হিসেবে add করবে', '2. Admin will add you as a Tester in the Facebook App')}<br />
                  {copy('৩. Facebook থেকে invite notification আসবে — Accept করুন', '3. You will get an invite notification on Facebook — Accept it')}<br />
                  {copy('৪. Accepted হলে "Access Token" tab থেকে page connect করুন', '4. After accepting, use the "Access Token" tab to connect your page')}
                </span>
              </div>

              {myRequests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {copy('আপনার Requests', 'Your Requests')}
                  </div>
                  {myRequests.map(r => {
                    const statusColor = r.status === 'approved' ? '#16a34a' : r.status === 'rejected' ? '#ef4444' : '#f59e0b';
                    const statusLabel = r.status === 'approved' ? copy('✅ Approved', '✅ Approved') : r.status === 'rejected' ? copy('❌ Rejected', '❌ Rejected') : copy('⏳ Pending', '⏳ Pending');
                    return (
                      <div key={r.id} style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '10px 13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: text }}>{r.pageUrl}</div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: statusColor }}>{statusLabel}</span>
                        </div>
                        {r.adminNote && (
                          <div style={{ fontSize: 11.5, color: muted, marginTop: 3 }}>💬 {r.adminNote}</div>
                        )}
                        {r.status === 'approved' && (
                          <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                            🎉 {copy('Approved! এখন "Access Token" tab-এ গিয়ে page connect করুন।', 'Approved! Now go to the "Access Token" tab to connect your page.')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ height: 1, background: border }} />
                </div>
              )}

              {!reqSubmitted ? (
                <>
                  <div>
                    <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                      {copy('Facebook Page Link *', 'Facebook Page Link *')}
                    </label>
                    <input style={inp} value={reqPageUrl} onChange={e => setReqPageUrl(e.target.value)}
                      placeholder="https://facebook.com/yourpage বা yourpage" />
                    <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                      {copy('আপনার Facebook Page এর link বা username', 'Your Facebook Page link or username')}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                      {copy('আপনার Facebook Profile Link *', 'Your Facebook Profile Link *')}
                    </label>
                    <input style={inp} value={reqFbProfile} onChange={e => setReqFbProfile(e.target.value)}
                      placeholder="https://facebook.com/yourprofile" />
                    <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                      {copy('Admin এই link দিয়ে আপনাকে Tester হিসেবে add করবে', 'Admin will use this to add you as Tester')}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                      {copy('Note (optional)', 'Note (optional)')}
                    </label>
                    <textarea style={{ ...inp, resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
                      value={reqNote} onChange={e => setReqNote(e.target.value)}
                      placeholder={copy('অতিরিক্ত কিছু জানাতে চাইলে লিখুন...', 'Any additional info for the admin...')} />
                  </div>
                  <button onClick={submitPageRequest} disabled={reqBusy}
                    style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: reqBusy ? 'rgba(99,102,241,0.5)' : '#6366f1', color: '#fff', fontWeight: 800, fontSize: 15, cursor: reqBusy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit' }}>
                    {reqBusy ? <><Spinner size={15} /> {copy('Submitting...', 'Submitting...')}</> : copy('📤 Request Submit করুন', 'Submit Request')}
                  </button>
                </>
              ) : (
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#16a34a', fontWeight: 700, textAlign: 'center' }}>
                  ✅ {copy('Request submit হয়েছে! Admin review করে approve করবে।', 'Request submitted! Admin will review and approve.')}
                </div>
              )}
            </>
          ) : (
            /* ── Access Token (manual) tab ── */
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

              {activePages.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: 12, color: muted, fontWeight: 600, marginBottom: 6 }}>
                    🔗 {copy('এই page কি কোনো existing profile share করবে? (optional)', 'Link to an existing page profile? (optional)')}
                  </div>
                  <select
                    value={selectedMasterId}
                    onChange={e => setSelectedMasterId(e.target.value ? Number(e.target.value) : '')}
                    style={{ ...inp, fontSize: 13, height: 36, padding: '0 10px' }}
                  >
                    <option value="">{copy('না — নতুন standalone page হবে', 'No — create as standalone page')}</option>
                    {activePages.map(p => (
                      <option key={p.id} value={p.id}>{p.pageName} — {copy('এর settings/products share করবে', 'share settings & products')}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Advanced: Custom Facebook App (collapsible) ── */}
              <div style={{ borderRadius: 11, border: `1px solid ${border}`, overflow: 'hidden' }}>
                <button
                  onClick={() => setShowCustomApp(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: text, fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5 }}
                >
                  <span>⚙️ {copy('Advanced: নিজের Facebook App', 'Advanced: Custom Facebook App')}</span>
                  <span style={{ color: muted, fontSize: 11 }}>{showCustomApp ? '▲' : '▼'}</span>
                </button>
                {showCustomApp && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${border}` }}>
                    <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.8, paddingTop: 10 }}>
                      {copy(
                        'নিজের Facebook Developer App থাকলে credentials দিন। না দিলে platform এর default app ব্যবহার হবে।',
                        'If you have your own Facebook Developer App, enter its credentials. Otherwise the platform\'s default app is used.',
                      )}<br />
                      <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>developers.facebook.com</a>
                      {copy(' → আপনার App → Settings → Basic', ' → Your App → Settings → Basic')}<br />
                      <strong>{copy('App Secret একবার save হলে আর দেখানো হবে না।', 'App Secret is stored encrypted and never shown again.')}</strong>
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>App ID</label>
                      <input style={inp} value={customFbAppId} onChange={e => setCustomFbAppId(e.target.value)} placeholder="1234567890123456" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>App Secret</label>
                      <input style={inp} type="password" value={customFbAppSecret} onChange={e => setCustomFbAppSecret(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" autoComplete="new-password" />
                    </div>
                  </div>
                )}
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

                  {/* Webhook setup instructions — shown only for custom app users */}
                  {connectResult?.hasCustomApp && connectResult.verifyToken && (
                    <div style={{ background: dark ? 'rgba(251,191,36,0.07)' : 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#f59e0b' }}>
                        ⚠️ {copy('এখন আপনার Facebook App-এ Webhook Setup করুন', 'Now set up Webhook in your Facebook App')}
                      </div>
                      <div style={{ fontSize: 12, color: text, lineHeight: 1.85 }}>
                        {copy(
                          'developers.facebook.com → আপনার App → Messenger → Webhooks → "Add Callback URL" এ নিচের তথ্য দিন:',
                          'Go to developers.facebook.com → Your App → Messenger → Webhooks → "Add Callback URL" and enter:'
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11.5, color: muted, fontWeight: 600 }}>
                          {copy('Callback URL', 'Callback URL')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{ flex: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, color: text, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {connectResult.webhookUrl || 'https://chatcat.pro/webhook'}
                          </code>
                          <button onClick={() => navigator.clipboard.writeText(connectResult.webhookUrl || 'https://chatcat.pro/webhook')}
                            style={{ border: `1px solid ${border}`, borderRadius: 7, padding: '6px 10px', background: 'transparent', color: muted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {copy('Copy', 'Copy')}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11.5, color: muted, fontWeight: 600 }}>
                          {copy('Verify Token', 'Verify Token')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{ flex: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, color: text, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {connectResult.verifyToken}
                          </code>
                          <button onClick={() => navigator.clipboard.writeText(connectResult.verifyToken!)}
                            style={{ border: `1px solid ${border}`, borderRadius: 7, padding: '6px 10px', background: 'transparent', color: muted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {copy('Copy', 'Copy')}
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: muted, lineHeight: 1.8, borderTop: `1px solid rgba(251,191,36,0.25)`, paddingTop: 8 }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>{copy('Webhook Subscriptions:', 'Webhook Subscriptions:')}</strong>
                        {['messages', 'messaging_postbacks', 'feed'].map(s => (
                          <code key={s} style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 4, fontSize: 11, marginRight: 4 }}>{s}</code>
                        ))}
                        <br /><br />
                        <strong style={{ display: 'block', marginBottom: 4 }}>{copy('Page Token Permissions:', 'Page Token Permissions:')}</strong>
                        {['pages_messaging', 'pages_read_engagement', 'pages_manage_engagement'].map(p => (
                          <code key={p} style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 4, fontSize: 11, marginRight: 4 }}>{p}</code>
                        ))}
                        <br />
                        <span style={{ marginTop: 4, display: 'block' }}>{copy('তারপর আপনার page-টি app-এ subscribe করুন।', 'Then subscribe your page to the app.')}</span>
                      </div>
                    </div>
                  )}

                  <button onClick={onConnected}
                    style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {copy('→ Dashboard-এ যান', 'Go to Dashboard')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Goto dashboard for active pages */}
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

      {/* ── Tutorial Sidebar ── */}
      <div style={{ width: 300, flexShrink: 0, background: panel, border: `1px solid ${border}`, borderRadius: 22, padding: 24, boxShadow: dark ? '0 8px 48px rgba(0,0,0,0.5)' : '0 8px 40px rgba(99,102,241,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎬</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: text }}>{copy('Tutorial', 'Tutorial')}</div>
            <div style={{ fontSize: 11, color: muted }}>{copy('ধাপে ধাপে গাইড', 'Step-by-step guide')}</div>
          </div>
        </div>

        {tutorialYtId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${tutorialYtId}`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="Page connect tutorial"
              />
            </div>
            <div style={{ fontSize: 12, color: muted, lineHeight: 1.7 }}>
              {copy('এই video দেখে সহজেই page connect করতে পারবেন।', 'Watch this video to easily connect your page.')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: dark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)', border: `1px solid rgba(99,102,241,0.18)`, borderRadius: 12, padding: '14px', fontSize: 12.5, color: muted, lineHeight: 1.8, textAlign: 'center' }}>
              🎬<br />
              {copy('Tutorial video শীঘ্রই আসছে', 'Tutorial video coming soon')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: text, marginBottom: 2 }}>
                {copy('দ্রুত শুরুর ধাপ:', 'Quick start steps:')}
              </div>
              {[
                copy('১. Meta Developer Account খুলুন', '1. Create Meta Developer Account'),
                copy('২. Request Access form পূরণ করুন', '2. Fill the Request Access form'),
                copy('৩. Admin Approve করলে Tester invite Accept করুন', '3. Accept Tester invite after admin approval'),
                copy('৪. Access Token দিয়ে page connect করুন', '4. Connect page with Access Token'),
              ].map((step, i) => (
                <div key={i} style={{ fontSize: 12, color: muted, padding: '7px 10px', borderRadius: 8, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}` }}>
                  {step}
                </div>
              ))}
            </div>
            <a
              href="https://developers.facebook.com/"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 10, border: `1px solid rgba(99,102,241,0.35)`, color: '#6366f1', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', background: dark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)' }}
            >
              🔗 {copy('Meta Developer Portal', 'Meta Developer Portal')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
