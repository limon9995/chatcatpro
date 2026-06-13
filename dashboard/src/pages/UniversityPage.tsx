import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../components/ui';
import { Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface UniversityConfig {
  id: number;
  pageId: number;
  scrapeUrl: string;
  crawlBaseUrl: string;
  scrapeInterval: number;
  scrapeEnabled: boolean;
  autoPostEnabled: boolean;
  lastScrapedAt: string | null;
  lastFullCrawlAt: string | null;
  knowledgeText: string;
  scrapedKnowledgeText: string;
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

interface Faq {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
}

interface Props {
  th: Theme;
  pageId: number;
  onToast: (msg: string, type?: 'error' | 'success' | 'info') => void;
}

type Tab = 'notices' | 'knowledge' | 'groups' | 'settings';

const TAB_STYLE = (active: boolean, th: Theme) => ({
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: active ? 700 : 500, fontSize: 13,
  background: active ? th.accent : th.surface,
  color: active ? '#fff' : th.textSub, transition: 'all 0.15s',
});

export function UniversityPage({ th, pageId, onToast }: Props) {
  const { request } = useApi();
  const { copy } = useLanguage();
  const [tab, setTab] = useState<Tab>('knowledge');

  const [config, setConfig] = useState<UniversityConfig | null>(null);
  const [notices, setNotices] = useState<UniversityNotice[]>([]);
  const [links, setLinks] = useState<GroupLink[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(false);

  // Action states
  const [scraping, setScraping] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingFaq, setSavingFaq] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({ crawlBaseUrl: '', scrapeUrl: '', scrapeInterval: 30 });
  // Manual knowledge form
  const [manualText, setManualText] = useState('');
  // Group link form
  const [linkForm, setLinkForm] = useState({ label: '', semester: '', department: '', course: '', linkType: 'whatsapp', link: '' });
  const [editingLink, setEditingLink] = useState<number | null>(null);
  // FAQ form
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' });
  const [editingFaq, setEditingFaq] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, nots, lks, fqs] = await Promise.all([
        request<UniversityConfig | null>(`${API_BASE}/university/config/${pageId}`),
        request<UniversityNotice[]>(`${API_BASE}/university/notices/${pageId}?limit=30`),
        request<GroupLink[]>(`${API_BASE}/university/groups/${pageId}`),
        request<Faq[]>(`${API_BASE}/university/faqs/${pageId}`),
      ]);
      setConfig(cfg);
      setNotices(nots || []);
      setLinks(lks || []);
      setFaqs(fqs || []);
      if (cfg) {
        setSettingsForm({ crawlBaseUrl: cfg.crawlBaseUrl || '', scrapeUrl: cfg.scrapeUrl || '', scrapeInterval: cfg.scrapeInterval || 30 });
        setManualText(cfg.knowledgeText || '');
      }
    } catch (e: any) {
      onToast(e.message || 'লোড হয়নি', 'error');
    } finally {
      setLoading(false);
    }
  }, [pageId, request, onToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const inp = { padding: '8px 11px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surface, color: th.text, fontSize: 13, width: '100%', boxSizing: 'border-box' as const };
  const btn = (color = th.accent) => ({ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: color, color: '#fff', fontWeight: 600, fontSize: 12.5 });
  const card = { background: th.panel, border: `1px solid ${th.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
  const label12 = { fontSize: 12, color: th.textSub, display: 'block', marginBottom: 4 };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleScrapeNow = async () => {
    setScraping(true);
    try {
      const res = await request<{ newCount: number }>(`${API_BASE}/university/scrape/${pageId}`, { method: 'POST' });
      onToast(`${res.newCount}টি নতুন নোটিশ পাওয়া গেছে`, 'success');
      await loadAll();
    } catch (e: any) { onToast(e.message, 'error'); } finally { setScraping(false); }
  };

  const handleFullCrawl = async () => {
    if (!config?.crawlBaseUrl && !config?.scrapeUrl) {
      onToast('প্রথমে সেটিংসে Website URL দিন', 'error'); return;
    }
    setCrawling(true);
    try {
      const res = await request<{ pagesCrawled: number }>(`${API_BASE}/university/crawl/${pageId}`, { method: 'POST' });
      onToast(`${res.pagesCrawled}টি পেজ থেকে তথ্য সংগ্রহ হয়েছে`, 'success');
      await loadAll();
    } catch (e: any) { onToast(e.message, 'error'); } finally { setCrawling(false); }
  };

  const handleToggleAutoPost = async (enabled: boolean) => {
    try {
      await request(`${API_BASE}/university/config/${pageId}/autopost`, { method: 'PATCH', body: JSON.stringify({ enabled }), headers: { 'Content-Type': 'application/json' } });
      setConfig((c) => c ? { ...c, autoPostEnabled: enabled } : c);
      onToast(enabled ? 'Auto-post চালু' : 'Auto-post বন্ধ', 'success');
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const handleDeleteNotice = async (id: number) => {
    try {
      await request(`${API_BASE}/university/notices/${pageId}/${id}`, { method: 'DELETE' });
      setNotices((n) => n.filter((x) => x.id !== id));
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await request(`${API_BASE}/university/config/${pageId}`, { method: 'POST', body: JSON.stringify(settingsForm), headers: { 'Content-Type': 'application/json' } });
      onToast('সেটিংস সেভ হয়েছে', 'success');
      await loadAll();
    } catch (e: any) { onToast(e.message, 'error'); } finally { setSavingSettings(false); }
  };

  const handleSaveManual = async () => {
    setSavingManual(true);
    try {
      await request(`${API_BASE}/university/config/${pageId}`, { method: 'POST', body: JSON.stringify({ knowledgeText: manualText }), headers: { 'Content-Type': 'application/json' } });
      onToast('তথ্য সেভ হয়েছে', 'success');
    } catch (e: any) { onToast(e.message, 'error'); } finally { setSavingManual(false); }
  };

  const handleSaveLink = async () => {
    if (!linkForm.label.trim() || !linkForm.link.trim()) { onToast('Label এবং Link দিতে হবে', 'error'); return; }
    setSavingLink(true);
    try {
      if (editingLink) {
        await request(`${API_BASE}/university/groups/${pageId}/${editingLink}`, { method: 'PATCH', body: JSON.stringify(linkForm), headers: { 'Content-Type': 'application/json' } });
      } else {
        await request(`${API_BASE}/university/groups/${pageId}`, { method: 'POST', body: JSON.stringify(linkForm), headers: { 'Content-Type': 'application/json' } });
      }
      onToast('সেভ হয়েছে', 'success');
      setLinkForm({ label: '', semester: '', department: '', course: '', linkType: 'whatsapp', link: '' });
      setEditingLink(null);
      await loadAll();
    } catch (e: any) { onToast(e.message, 'error'); } finally { setSavingLink(false); }
  };

  const handleSaveFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) { onToast('প্রশ্ন এবং উত্তর দিতে হবে', 'error'); return; }
    setSavingFaq(true);
    try {
      if (editingFaq) {
        await request(`${API_BASE}/university/faqs/${pageId}/${editingFaq}`, { method: 'PATCH', body: JSON.stringify(faqForm), headers: { 'Content-Type': 'application/json' } });
      } else {
        await request(`${API_BASE}/university/faqs/${pageId}`, { method: 'POST', body: JSON.stringify(faqForm), headers: { 'Content-Type': 'application/json' } });
      }
      onToast('FAQ সেভ হয়েছে', 'success');
      setFaqForm({ question: '', answer: '' });
      setEditingFaq(null);
      await loadAll();
    } catch (e: any) { onToast(e.message, 'error'); } finally { setSavingFaq(false); }
  };

  const handleDeleteFaq = async (id: number) => {
    try {
      await request(`${API_BASE}/university/faqs/${pageId}/${id}`, { method: 'DELETE' });
      setFaqs((f) => f.filter((x) => x.id !== id));
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const handleDeleteLink = async (id: number) => {
    try {
      await request(`${API_BASE}/university/groups/${pageId}/${id}`, { method: 'DELETE' });
      setLinks((l) => l.filter((x) => x.id !== id));
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const handleToggleLinkActive = async (link: GroupLink) => {
    try {
      await request(`${API_BASE}/university/groups/${pageId}/${link.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !link.isActive }), headers: { 'Content-Type': 'application/json' } });
      setLinks((l) => l.map((x) => x.id === link.id ? { ...x, isActive: !x.isActive } : x));
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: th.text }}>🎓 {copy('ইউনিভার্সিটি অটোমেশন', 'University Automation')}</div>
        <div style={{ fontSize: 12.5, color: th.textSub, marginTop: 4 }}>
          {copy('ওয়েবসাইট auto-crawl, ২৪ঘন্টা আপডেট জ্ঞানভান্ডার ও Messenger bot', 'Auto-crawl website, 24hr updated knowledge base & Messenger bot')}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([['knowledge', '🧠 জ্ঞানভান্ডার', 'Knowledge Base'], ['notices', '📢 নোটিশ', 'Notices'], ['groups', '👥 গ্রুপ লিংক', 'Group Links'], ['settings', '⚙️ সেটিংস', 'Settings']] as [Tab, string, string][]).map(([t, bn, en]) => (
          <button key={t} style={TAB_STYLE(tab === t, th)} onClick={() => setTab(t)}>
            {copy(bn, en)}
          </button>
        ))}
      </div>

      {/* ── Tab: Knowledge Base ── */}
      {tab === 'knowledge' && (
        <div>
          {/* Auto-crawl section */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: th.text, marginBottom: 4 }}>
                  🌐 {copy('ওয়েবসাইট থেকে স্বয়ংক্রিয় তথ্য সংগ্রহ', 'Auto-collect from Website')}
                </div>
                <div style={{ fontSize: 12, color: th.textSub }}>
                  {copy('শিক্ষক, প্রোগ্রাম, ফি, ভর্তি — সব পেজ থেকে auto-collect হবে', 'Teachers, programs, fees, admission — collected from all pages')}
                </div>
                <div style={{ fontSize: 11.5, color: th.muted, marginTop: 6 }}>
                  {copy('সর্বশেষ crawl', 'Last crawl')}: <strong style={{ color: th.text }}>
                    {config?.lastFullCrawlAt ? new Date(config.lastFullCrawlAt).toLocaleString('bn-BD') : copy('কখনো না', 'Never')}
                  </strong>
                  {' · '}
                  {copy('পরবর্তী auto-crawl', 'Next auto-crawl')}: {copy('প্রতি ৬ ঘন্টায়', 'Every 6 hours')}
                </div>
              </div>
              <button style={{ ...btn(), padding: '9px 20px' }} onClick={handleFullCrawl} disabled={crawling}>
                {crawling ? <><Spinner /> {copy('Crawl চলছে...', 'Crawling...')}</> : copy('🔄 এখনই Crawl করুন', '🔄 Crawl Now')}
              </button>
            </div>
            {!config?.crawlBaseUrl && !config?.scrapeUrl && (
              <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '7px 12px' }}>
                ⚠️ {copy('প্রথমে "সেটিংস" ট্যাবে University Homepage URL দিন', 'Set the University Homepage URL in "Settings" tab first')}
              </div>
            )}
            {config?.scrapedKnowledgeText && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#22c55e' }}>
                ✅ {copy(`${config.scrapedKnowledgeText.length.toLocaleString()} character-এর তথ্য সংগৃহীত আছে — bot এই তথ্য ব্যবহার করছে`, `${config.scrapedKnowledgeText.length.toLocaleString()} chars of knowledge collected — bot is using this`)}
              </div>
            )}
          </div>

          {/* FAQ section */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: th.text, marginBottom: 14 }}>
              ❓ {copy('সরাসরি প্রশ্ন-উত্তর (FAQ)', 'Direct Q&A (FAQ)')}
            </div>
            <div style={{ fontSize: 12, color: th.textSub, marginBottom: 14 }}>
              {copy('এখানে যোগ করা প্রশ্নের exact উত্তর bot সরাসরি দেবে, AI ছাড়া', 'Bot answers these questions directly without AI')}
            </div>

            {/* FAQ form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, background: th.surface, borderRadius: 8, padding: '14px 16px', border: `1px solid ${th.border}` }}>
              <div>
                <label style={label12}>{copy('প্রশ্ন', 'Question')} *</label>
                <input style={inp} placeholder={copy('যেমন: ভর্তি ফি কত?', 'e.g. What is the admission fee?')} value={faqForm.question} onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))} />
              </div>
              <div>
                <label style={label12}>{copy('উত্তর', 'Answer')} *</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder={copy('সম্পূর্ণ উত্তর লিখুন...', 'Write the complete answer...')} value={faqForm.answer} onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn()} onClick={handleSaveFaq} disabled={savingFaq}>
                  {savingFaq ? <Spinner /> : editingFaq ? copy('আপডেট করুন', 'Update') : copy('FAQ যোগ করুন', 'Add FAQ')}
                </button>
                {editingFaq && <button style={btn(th.surface)} onClick={() => { setFaqForm({ question: '', answer: '' }); setEditingFaq(null); }}><span style={{ color: th.text }}>{copy('বাতিল', 'Cancel')}</span></button>}
              </div>
            </div>

            {/* FAQ list */}
            {faqs.length === 0 ? (
              <div style={{ color: th.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                {copy('কোনো FAQ নেই। উপরে যোগ করুন।', 'No FAQs yet. Add one above.')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {faqs.map((f) => (
                  <div key={f.id} style={{ background: th.surface, borderRadius: 8, padding: '12px 14px', border: `1px solid ${th.border}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: th.text, marginBottom: 4 }}>❓ {f.question}</div>
                    <div style={{ fontSize: 12.5, color: th.textSub, lineHeight: 1.6 }}>{f.answer}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button style={{ ...btn(th.surface), padding: '4px 12px', fontSize: 11 }} onClick={() => { setEditingFaq(f.id); setFaqForm({ question: f.question, answer: f.answer }); }}>
                        <span style={{ color: th.text }}>{copy('সম্পাদনা', 'Edit')}</span>
                      </button>
                      <button style={{ ...btn('#ef4444'), padding: '4px 12px', fontSize: 11 }} onClick={() => handleDeleteFaq(f.id)}>
                        {copy('মুছুন', 'Delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual extra info */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: th.text, marginBottom: 6 }}>
              ✏️ {copy('অতিরিক্ত তথ্য (Manual)', 'Extra Info (Manual)')}
            </div>
            <div style={{ fontSize: 12, color: th.textSub, marginBottom: 12 }}>
              {copy('যা website এ নেই বা আলাদা করে জানাতে চান — bot এটাও ব্যবহার করবে', 'Info not on website or extra details — bot will also use this')}
            </div>
            <textarea
              style={{ ...inp, minHeight: 160, resize: 'vertical', lineHeight: 1.7, marginBottom: 12 }}
              placeholder={copy(
                'যেমন:\n- ভর্তি পরীক্ষার হেল্পলাইন: 01XXXXXXXXX\n- বিশেষ বৃত্তির তথ্য\n- হোস্টেল ফি: ৳XXXX/মাস\n- যোগাযোগ: admission@university.edu',
                'e.g.:\n- Admission helpline: 01XXXXXXXXX\n- Special scholarship info\n- Hostel fee: ৳XXXX/month\n- Contact: admission@university.edu',
              )}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
            <button style={{ ...btn(), padding: '9px 22px' }} onClick={handleSaveManual} disabled={savingManual}>
              {savingManual ? <Spinner /> : copy('সেভ করুন', 'Save')}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Notices ── */}
      {tab === 'notices' && (
        <div>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: th.textSub }}>
                  {copy('সর্বশেষ scrape', 'Last scraped')}: <strong style={{ color: th.text }}>{config?.lastScrapedAt ? new Date(config.lastScrapedAt).toLocaleString('bn-BD') : copy('কখনো না', 'Never')}</strong>
                </div>
                <div style={{ fontSize: 13, color: th.textSub, marginTop: 4 }}>
                  {copy('মোট নোটিশ', 'Total notices')}: <strong style={{ color: th.text }}>{notices.length}</strong>
                  {' · '}{copy('Auto-post: প্রতি ৩০ মিনিটে', 'Auto-post: every 30 min')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: th.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config?.autoPostEnabled ?? false} onChange={(e) => handleToggleAutoPost(e.target.checked)} style={{ width: 16, height: 16 }} />
                  {copy('নতুন নোটিশ auto-post', 'Auto-post new notices')}
                </label>
                <button style={btn()} onClick={handleScrapeNow} disabled={scraping}>
                  {scraping ? <Spinner /> : copy('এখনই Scrape করুন', 'Scrape Now')}
                </button>
              </div>
            </div>
            {!config?.scrapeUrl && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '7px 12px' }}>
                ⚠️ {copy('"সেটিংস" ট্যাবে Notice Page URL দিন', 'Set the Notice Page URL in "Settings" tab')}
              </div>
            )}
          </div>

          {notices.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: '40px 0', fontSize: 14 }}>
              {copy('কোনো নোটিশ নেই।', 'No notices yet.')}
            </div>
          ) : (
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${th.border}` }}>
                      {[copy('শিরোনাম', 'Title'), copy('তারিখ', 'Date'), 'Auto-Post', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', textAlign: 'left', color: th.muted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notices.map((n) => (
                      <tr key={n.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '9px 10px', color: th.text, maxWidth: 360 }}>
                          {n.url ? <a href={n.url} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none' }}>{n.title}</a> : n.title}
                        </td>
                        <td style={{ padding: '9px 10px', color: th.textSub, whiteSpace: 'nowrap' }}>{n.publishedAt || '—'}</td>
                        <td style={{ padding: '9px 10px' }}>
                          {n.autoPosted ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓</span> : n.postError ? <span style={{ color: '#ef4444' }}>✗</span> : <span style={{ color: th.muted }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <button style={{ ...btn('#ef4444'), padding: '4px 10px', fontSize: 11 }} onClick={() => handleDeleteNotice(n.id)}>{copy('মুছুন', 'Del')}</button>
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
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: th.text, marginBottom: 14 }}>
              {editingLink ? copy('লিংক সম্পাদনা', 'Edit Link') : copy('নতুন গ্রুপ লিংক যোগ করুন', 'Add Group Link')}
            </div>
            {/* Datalist definitions */}
            <datalist id="dept-list">
              {['CSE', 'EEE', 'BBA', 'MBA', 'Civil Engineering', 'Architecture', 'Law', 'English', 'Pharmacy', 'Economics', 'Mathematics', 'Physics', 'Chemistry', 'Accounting', 'Finance', 'Marketing', 'Management', 'Public Health', 'Environmental Science'].map((d) => <option key={d} value={d} />)}
            </datalist>
            <datalist id="sem-list">
              {['১ম', '২য়', '৩য়', '৪র্থ', '৫ম', '৬ষ্ঠ', '৭ম', '৮ম', '৯ম', '১০ম', '১১তম', '১২তম', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', 'Spring 2025', 'Fall 2025', 'Spring 2026', 'Fall 2026', '১ম বর্ষ', '২য় বর্ষ', '৩য় বর্ষ', '৪র্থ বর্ষ'].map((s) => <option key={s} value={s} />)}
            </datalist>
            <datalist id="course-list">
              {['Data Structures', 'Algorithms', 'Database', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'Artificial Intelligence', 'Machine Learning', 'Web Development', 'Mobile Apps', 'Calculus', 'Linear Algebra', 'Statistics', 'Physics', 'Chemistry', 'Business Communication', 'Accounting', 'Marketing', 'Human Resource', 'Financial Management'].map((c) => <option key={c} value={c} />)}
            </datalist>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={label12}>{copy('লেবেল *', 'Label *')}</label>
                <input style={inp} placeholder={copy('CSE ৫ম সেমিস্টার গ্রুপ', 'CSE 5th Semester Group')} value={linkForm.label} onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
              <div>
                <label style={label12}>{copy('ডিপার্টমেন্ট', 'Department')}</label>
                <input style={inp} list="dept-list" placeholder={copy('নির্বাচন করুন বা লিখুন...', 'Select or type...')} value={linkForm.department} onChange={(e) => setLinkForm((f) => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label style={label12}>{copy('সেমিস্টার / বর্ষ', 'Semester / Year')}</label>
                <input style={inp} list="sem-list" placeholder={copy('নির্বাচন করুন বা লিখুন...', 'Select or type...')} value={linkForm.semester} onChange={(e) => setLinkForm((f) => ({ ...f, semester: e.target.value }))} />
              </div>
              <div>
                <label style={label12}>{copy('কোর্স (ঐচ্ছিক)', 'Course (optional)')}</label>
                <input style={inp} list="course-list" placeholder={copy('নির্বাচন করুন বা লিখুন...', 'Select or type...')} value={linkForm.course} onChange={(e) => setLinkForm((f) => ({ ...f, course: e.target.value }))} />
              </div>
              <div>
                <label style={label12}>{copy('ধরন', 'Type')}</label>
                <select style={inp} value={linkForm.linkType} onChange={(e) => setLinkForm((f) => ({ ...f, linkType: e.target.value }))}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="messenger">Messenger</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={label12}>{copy('গ্রুপ লিংক *', 'Group Link *')}</label>
                <input style={inp} placeholder="https://chat.whatsapp.com/..." value={linkForm.link} onChange={(e) => setLinkForm((f) => ({ ...f, link: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={handleSaveLink} disabled={savingLink}>{savingLink ? <Spinner /> : copy('সেভ', 'Save')}</button>
              {editingLink && <button style={btn(th.surface)} onClick={() => { setLinkForm({ label: '', semester: '', department: '', course: '', linkType: 'whatsapp', link: '' }); setEditingLink(null); }}><span style={{ color: th.text }}>{copy('বাতিল', 'Cancel')}</span></button>}
            </div>
          </div>

          {links.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: '30px 0', fontSize: 14 }}>{copy('কোনো গ্রুপ লিংক নেই।', 'No group links yet.')}</div>
          ) : (
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${th.border}` }}>
                      {[copy('লেবেল', 'Label'), 'Dept', 'Sem', 'Type', copy('সক্রিয়', 'Active'), ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', textAlign: 'left', color: th.muted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                        <td style={{ padding: '9px 10px', color: th.text }}><a href={l.link} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none' }}>{l.label}</a></td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.department || '—'}</td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.semester || '—'}</td>
                        <td style={{ padding: '9px 10px', color: th.textSub }}>{l.linkType}</td>
                        <td style={{ padding: '9px 10px' }}><input type="checkbox" checked={l.isActive} onChange={() => handleToggleLinkActive(l)} style={{ cursor: 'pointer', width: 16, height: 16 }} /></td>
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...btn(th.surface), padding: '4px 10px', fontSize: 11 }} onClick={() => { setEditingLink(l.id); setLinkForm({ label: l.label, semester: l.semester || '', department: l.department || '', course: l.course || '', linkType: l.linkType, link: l.link }); }}>
                              <span style={{ color: th.text }}>{copy('Edit', 'Edit')}</span>
                            </button>
                            <button style={{ ...btn('#ef4444'), padding: '4px 10px', fontSize: 11 }} onClick={() => handleDeleteLink(l.id)}>{copy('মুছুন', 'Del')}</button>
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

      {/* ── Tab: Settings ── */}
      {tab === 'settings' && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ ...label12, fontSize: 13, fontWeight: 600, color: th.text }}>{copy('University Homepage URL (Knowledge Crawl)', 'University Homepage URL (Knowledge Crawl)')}</label>
              <input style={inp} placeholder="https://uap-bd.edu/" value={settingsForm.crawlBaseUrl} onChange={(e) => setSettingsForm((f) => ({ ...f, crawlBaseUrl: e.target.value }))} />
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 4 }}>
                {copy('Bot এই URL থেকে শুরু করে পুরো ওয়েবসাইট crawl করবে — প্রতি ৬ ঘন্টায় auto-update হবে', 'Bot crawls entire website from this URL — auto-updates every 6 hours')}
              </div>
            </div>
            <div>
              <label style={{ ...label12, fontSize: 13, fontWeight: 600, color: th.text }}>{copy('Notice Page URL (Facebook Auto-Post)', 'Notice Page URL (Facebook Auto-Post)')}</label>
              <input style={inp} placeholder="https://uap-bd.edu/news-events/news-events.php" value={settingsForm.scrapeUrl} onChange={(e) => setSettingsForm((f) => ({ ...f, scrapeUrl: e.target.value }))} />
              <div style={{ fontSize: 11.5, color: th.muted, marginTop: 4 }}>
                {copy('এই পেজ monitor করে নতুন notice এলে Facebook এ auto-post হবে', 'Monitors this page and auto-posts new notices to Facebook')}
              </div>
            </div>
            <div>
              <label style={{ ...label12, fontSize: 13, fontWeight: 600, color: th.text }}>{copy('Notice Scrape Interval', 'Notice Scrape Interval')}</label>
              <select style={{ ...inp, width: 'auto' }} value={settingsForm.scrapeInterval} onChange={(e) => setSettingsForm((f) => ({ ...f, scrapeInterval: parseInt(e.target.value, 10) }))}>
                <option value={15}>{copy('১৫ মিনিট', '15 minutes')}</option>
                <option value={30}>{copy('৩০ মিনিট', '30 minutes')}</option>
                <option value={60}>{copy('১ ঘন্টা', '1 hour')}</option>
                <option value={180}>{copy('৩ ঘন্টা', '3 hours')}</option>
              </select>
            </div>
            <button style={{ ...btn(), padding: '10px 24px', fontSize: 13 }} onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Spinner /> : copy('সেটিংস সেভ করুন', 'Save Settings')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
