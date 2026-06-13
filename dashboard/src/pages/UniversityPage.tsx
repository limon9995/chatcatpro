import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../components/ui';
import { Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface UniversityConfig {
  id: number;
  pageId: number;
  scrapeUrl: string;
  scrapeInterval: number;
  scrapeEnabled: boolean;
  autoPostEnabled: boolean;
  lastScrapedAt: string | null;
  knowledgeText: string;
}

interface UniversityNotice {
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  autoPosted: boolean;
  fbPostId: string | null;
  postError: string | null;
  createdAt: string;
}

interface GroupLink {
  id: number;
  label: string;
  semester: string | null;
  department: string | null;
  course: string | null;
  linkType: string;
  link: string;
  isActive: boolean;
}

interface Props {
  th: Theme;
  pageId: number;
  onToast: (msg: string, type?: 'error' | 'success' | 'info') => void;
}

const TAB_STYLE = (active: boolean, th: Theme) => ({
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontWeight: active ? 700 : 500,
  fontSize: 13,
  background: active ? th.accent : th.surface,
  color: active ? '#fff' : th.textSub,
  transition: 'all 0.15s',
});

export function UniversityPage({ th, pageId, onToast }: Props) {
  const { request } = useApi();
  const { copy } = useLanguage();
  const [tab, setTab] = useState<'notices' | 'groups' | 'settings'>('notices');

  // ── Config & Notices ──────────────────────────────────────────────────────
  const [config, setConfig] = useState<UniversityConfig | null>(null);
  const [notices, setNotices] = useState<UniversityNotice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(false);
  const [scraping, setScraping] = useState(false);

  // ── Group Links ───────────────────────────────────────────────────────────
  const [links, setLinks] = useState<GroupLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linkForm, setLinkForm] = useState({ label: '', semester: '', department: '', course: '', linkType: 'whatsapp', link: '' });
  const [editingLink, setEditingLink] = useState<number | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState({ scrapeUrl: '', scrapeInterval: 30, knowledgeText: '' });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadNotices = useCallback(async () => {
    setLoadingNotices(true);
    try {
      const [cfg, nots] = await Promise.all([
        request<UniversityConfig | null>(`${API_BASE}/university/config/${pageId}`),
        request<UniversityNotice[]>(`${API_BASE}/university/notices/${pageId}?limit=30`),
      ]);
      setConfig(cfg);
      if (cfg) setSettingsForm({ scrapeUrl: cfg.scrapeUrl || '', scrapeInterval: cfg.scrapeInterval || 30, knowledgeText: cfg.knowledgeText || '' });
      setNotices(nots || []);
    } catch (e: any) {
      onToast(e.message || copy('লোড হয়নি', 'Load failed'), 'error');
    } finally {
      setLoadingNotices(false);
    }
  }, [pageId, request, onToast, copy]);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const data = await request<GroupLink[]>(`${API_BASE}/university/groups/${pageId}`);
      setLinks(data || []);
    } catch (e: any) {
      onToast(e.message || copy('লোড হয়নি', 'Load failed'), 'error');
    } finally {
      setLoadingLinks(false);
    }
  }, [pageId, request, onToast, copy]);

  useEffect(() => {
    loadNotices();
    loadLinks();
  }, [loadNotices, loadLinks]);

  // ── Notices handlers ──────────────────────────────────────────────────────

  const handleScrapeNow = async () => {
    setScraping(true);
    try {
      const res = await request<{ newCount: number }>(`${API_BASE}/university/scrape/${pageId}`, { method: 'POST' });
      onToast(copy(`${res.newCount}টি নতুন নোটিশ পাওয়া গেছে`, `${res.newCount} new notice(s) found`), 'success');
      await loadNotices();
    } catch (e: any) {
      onToast(e.message || copy('স্ক্র্যাপ হয়নি', 'Scrape failed'), 'error');
    } finally {
      setScraping(false);
    }
  };

  const handleToggleAutoPost = async (enabled: boolean) => {
    try {
      await request(`${API_BASE}/university/config/${pageId}/autopost`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
        headers: { 'Content-Type': 'application/json' },
      });
      setConfig((c) => c ? { ...c, autoPostEnabled: enabled } : c);
      onToast(copy(enabled ? 'Auto-post চালু হয়েছে' : 'Auto-post বন্ধ হয়েছে', enabled ? 'Auto-post enabled' : 'Auto-post disabled'), 'success');
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  const handleDeleteNotice = async (id: number) => {
    try {
      await request(`${API_BASE}/university/notices/${pageId}/${id}`, { method: 'DELETE' });
      setNotices((n) => n.filter((x) => x.id !== id));
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  // ── Group link handlers ───────────────────────────────────────────────────

  const resetLinkForm = () => {
    setLinkForm({ label: '', semester: '', department: '', course: '', linkType: 'whatsapp', link: '' });
    setEditingLink(null);
  };

  const handleSaveLink = async () => {
    if (!linkForm.label.trim() || !linkForm.link.trim()) {
      onToast(copy('Label এবং Link দিতে হবে', 'Label and Link are required'), 'error');
      return;
    }
    setSavingLink(true);
    try {
      if (editingLink) {
        await request(`${API_BASE}/university/groups/${pageId}/${editingLink}`, {
          method: 'PATCH',
          body: JSON.stringify(linkForm),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await request(`${API_BASE}/university/groups/${pageId}`, {
          method: 'POST',
          body: JSON.stringify(linkForm),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      onToast(copy('সেভ হয়েছে', 'Saved'), 'success');
      resetLinkForm();
      await loadLinks();
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setSavingLink(false);
    }
  };

  const handleToggleLinkActive = async (link: GroupLink) => {
    try {
      await request(`${API_BASE}/university/groups/${pageId}/${link.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !link.isActive }),
        headers: { 'Content-Type': 'application/json' },
      });
      setLinks((l) => l.map((x) => x.id === link.id ? { ...x, isActive: !x.isActive } : x));
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      await request(`${API_BASE}/university/groups/${pageId}/${id}`, { method: 'DELETE' });
      setLinks((l) => l.filter((x) => x.id !== id));
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  // ── Settings handler ──────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await request(`${API_BASE}/university/config/${pageId}`, {
        method: 'POST',
        body: JSON.stringify(settingsForm),
        headers: { 'Content-Type': 'application/json' },
      });
      onToast(copy('সেটিংস সেভ হয়েছে', 'Settings saved'), 'success');
      await loadNotices();
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const inp = {
    padding: '8px 11px', borderRadius: 8, border: `1px solid ${th.border}`,
    background: th.surface, color: th.text, fontSize: 13, width: '100%', boxSizing: 'border-box' as const,
  };
  const btn = (color = th.accent) => ({
    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: color, color: '#fff', fontWeight: 600, fontSize: 12.5,
  });
  const card = { background: th.panel, border: `1px solid ${th.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: th.text }}>🎓 {copy('ইউনিভার্সিটি অটোমেশন', 'University Automation')}</div>
        <div style={{ fontSize: 12.5, color: th.textSub, marginTop: 4 }}>
          {copy('ওয়েবসাইট থেকে নোটিশ scrape, Facebook auto-post এবং student Q&A bot', 'Scrape notices from website, auto-post to Facebook, and answer student questions')}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['notices', 'groups', 'settings'] as const).map((t) => (
          <button key={t} style={TAB_STYLE(tab === t, th)} onClick={() => setTab(t)}>
            {t === 'notices' ? copy('নোটিশ মনিটর', 'Notice Monitor')
              : t === 'groups' ? copy('গ্রুপ লিংক', 'Group Links')
              : copy('বট সেটিংস', 'Bot Settings')}
          </button>
        ))}
      </div>

      {/* ── Tab: Notices ── */}
      {tab === 'notices' && (
        <div>
          {/* Stats card */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: th.textSub }}>
                  {copy('সর্বশেষ স্ক্র্যাপ', 'Last scraped')}: <strong style={{ color: th.text }}>
                    {config?.lastScrapedAt ? new Date(config.lastScrapedAt).toLocaleString('bn-BD') : copy('কখনো না', 'Never')}
                  </strong>
                </div>
                <div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>
                  {copy('মোট নোটিশ', 'Total notices')}: <strong style={{ color: th.text }}>{notices.length}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.text, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config?.autoPostEnabled ?? false}
                    onChange={(e) => handleToggleAutoPost(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  {copy('নতুন নোটিশ auto-post করো', 'Auto-post new notices')}
                </label>
                <button style={btn()} onClick={handleScrapeNow} disabled={scraping}>
                  {scraping ? <Spinner /> : copy('এখনই স্ক্র্যাপ করুন', 'Scrape Now')}
                </button>
              </div>
            </div>
            {!config?.scrapeUrl && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '7px 12px' }}>
                ⚠️ {copy('প্রথমে "বট সেটিংস" ট্যাবে Website URL সেট করুন', 'Set the website URL in "Bot Settings" tab first')}
              </div>
            )}
          </div>

          {/* Notices table */}
          {loadingNotices ? <Spinner /> : notices.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: '40px 0', fontSize: 14 }}>
              {copy('কোনো নোটিশ নেই। প্রথমে সেটিংসে URL দিয়ে "এখনই স্ক্র্যাপ করুন" চাপুন।', 'No notices yet. Set the URL in settings and click "Scrape Now".')}
            </div>
          ) : (
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${th.border}` }}>
                      {[copy('শিরোনাম', 'Title'), copy('তারিখ', 'Date'), copy('Auto-Post', 'Auto-Post'), copy('', '')].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', textAlign: 'left', color: th.muted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((n) => (
                      <tr key={n.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '9px 10px', color: th.text, maxWidth: 380 }}>
                          {n.url ? <a href={n.url} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none' }}>{n.title}</a> : n.title}
                        </td>
                        <td style={{ padding: '9px 10px', color: th.textSub, whiteSpace: 'nowrap' }}>{n.publishedAt || '—'}</td>
                        <td style={{ padding: '9px 10px' }}>
                          {n.autoPosted
                            ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ {copy('পোস্ট হয়েছে', 'Posted')}</span>
                            : n.postError
                            ? <span style={{ color: '#ef4444', fontSize: 11 }} title={n.postError}>✗ {copy('ব্যর্থ', 'Failed')}</span>
                            : <span style={{ color: th.muted }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <button style={{ ...btn('#ef4444'), padding: '4px 10px', fontSize: 11 }} onClick={() => handleDeleteNotice(n.id)}>
                            {copy('মুছুন', 'Delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Group Links ── */}
      {tab === 'groups' && (
        <div>
          {/* Add/Edit form */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: th.text, marginBottom: 14 }}>
              {editingLink ? copy('লিংক সম্পাদনা', 'Edit Link') : copy('নতুন গ্রুপ লিংক যোগ করুন', 'Add New Group Link')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('লেবেল *', 'Label *')}</label>
                <input style={inp} placeholder={copy('যেমন: CSE ৫ম সেমিস্টার গ্রুপ', 'e.g. CSE 5th Semester Group')} value={linkForm.label} onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('ডিপার্টমেন্ট', 'Department')}</label>
                <input style={inp} placeholder="CSE, EEE, BBA..." value={linkForm.department} onChange={(e) => setLinkForm((f) => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('সেমিস্টার', 'Semester')}</label>
                <input style={inp} placeholder="1, 2, 3..." value={linkForm.semester} onChange={(e) => setLinkForm((f) => ({ ...f, semester: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('কোর্স (ঐচ্ছিক)', 'Course (optional)')}</label>
                <input style={inp} placeholder="Data Structures, MATH 301..." value={linkForm.course} onChange={(e) => setLinkForm((f) => ({ ...f, course: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('লিংকের ধরন', 'Link Type')}</label>
                <select style={inp} value={linkForm.linkType} onChange={(e) => setLinkForm((f) => ({ ...f, linkType: e.target.value }))}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="messenger">Messenger</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 }}>{copy('গ্রুপ লিংক *', 'Group Link *')}</label>
                <input style={inp} placeholder="https://chat.whatsapp.com/..." value={linkForm.link} onChange={(e) => setLinkForm((f) => ({ ...f, link: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={handleSaveLink} disabled={savingLink}>
                {savingLink ? <Spinner /> : copy('সেভ করুন', 'Save')}
              </button>
              {editingLink && (
                <button style={btn(th.surface)} onClick={resetLinkForm}>
                  <span style={{ color: th.text }}>{copy('বাতিল', 'Cancel')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Links table */}
          {loadingLinks ? <Spinner /> : links.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: '30px 0', fontSize: 14 }}>
              {copy('কোনো গ্রুপ লিংক নেই। উপরের ফর্মে যোগ করুন।', 'No group links yet. Add one above.')}
            </div>
          ) : (
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${th.border}` }}>
                      {[copy('লেবেল', 'Label'), copy('ডিপার্টমেন্ট', 'Dept'), copy('সেমিস্টার', 'Sem'), copy('ধরন', 'Type'), copy('সক্রিয়', 'Active'), ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', textAlign: 'left', color: th.muted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '9px 10px', color: th.text }}>
                          <a href={l.link} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none' }}>{l.label}</a>
                        </td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.department || '—'}</td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.semester || '—'}</td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.linkType}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <input type="checkbox" checked={l.isActive} onChange={() => handleToggleLinkActive(l)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...btn(th.surface), padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditingLink(l.id); setLinkForm({ label: l.label, semester: l.semester || '', department: l.department || '', course: l.course || '', linkType: l.linkType, link: l.link }); setTab('groups'); }}>
                              <span style={{ color: th.text }}>{copy('সম্পাদনা', 'Edit')}</span>
                            </button>
                            <button style={{ ...btn('#ef4444'), padding: '4px 10px', fontSize: 11 }} onClick={() => handleDeleteLink(l.id)}>
                              {copy('মুছুন', 'Delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Bot Settings ── */}
      {tab === 'settings' && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: th.text, display: 'block', marginBottom: 6 }}>
                {copy('ওয়েবসাইট URL (নোটিশ পেজ)', 'Website URL (Notice Page)')}
              </label>
              <input
                style={inp}
                placeholder="https://uap-bd.edu/news-events/news-events.php"
                value={settingsForm.scrapeUrl}
                onChange={(e) => setSettingsForm((f) => ({ ...f, scrapeUrl: e.target.value }))}
              />
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 4 }}>
                {copy('যে পেজ থেকে নোটিশ collect করা হবে', 'The page from which notices will be collected')}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: th.text, display: 'block', marginBottom: 6 }}>
                {copy('স্ক্র্যাপ interval', 'Scrape Interval')}
              </label>
              <select style={{ ...inp, width: 'auto' }} value={settingsForm.scrapeInterval} onChange={(e) => setSettingsForm((f) => ({ ...f, scrapeInterval: parseInt(e.target.value, 10) }))}>
                <option value={15}>{copy('১৫ মিনিট', '15 minutes')}</option>
                <option value={30}>{copy('৩০ মিনিট', '30 minutes')}</option>
                <option value={60}>{copy('১ ঘন্টা', '1 hour')}</option>
                <option value={180}>{copy('৩ ঘন্টা', '3 hours')}</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: th.text, display: 'block', marginBottom: 6 }}>
                {copy('ইউনিভার্সিটি তথ্য (AI Knowledge Base)', 'University Info (AI Knowledge Base)')}
              </label>
              <textarea
                style={{ ...inp, minHeight: 200, resize: 'vertical', lineHeight: 1.6 }}
                placeholder={copy(
                  'এখানে ইউনিভার্সিটির সব তথ্য লিখুন:\n- ভর্তি তথ্য (সময়, ফি, যোগাযোগ)\n- পরীক্ষার সময়সূচি\n- ডিপার্টমেন্টের তথ্য\n- হেল্পলাইন নম্বর\n\nBot এই তথ্য দিয়ে student-দের প্রশ্নের উত্তর দেবে।',
                  'Enter all university info here:\n- Admission details (dates, fees, contacts)\n- Exam schedules\n- Department info\n- Helpline numbers\n\nThe bot will use this to answer student questions.',
                )}
                value={settingsForm.knowledgeText}
                onChange={(e) => setSettingsForm((f) => ({ ...f, knowledgeText: e.target.value }))}
              />
            </div>

            <div>
              <button style={{ ...btn(), padding: '10px 22px', fontSize: 13 }} onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Spinner /> : copy('সেটিংস সেভ করুন', 'Save Settings')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
