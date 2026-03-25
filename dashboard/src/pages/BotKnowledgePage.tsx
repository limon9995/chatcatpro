import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, InfoButton, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

// ── Types ─────────────────────────────────────────────────────────────────────
interface KwQuestion {
  key: string; label: string; realMeaning: string; helpText: string;
  keywords: string[]; replyTemplate: string; enabled: boolean;
  replyType: string; priority: number; source?: string;
}
interface SystemReply { template: string; fallback: string; enabled: boolean; }
interface AreaRule { areaName: string; aliases: string[]; zoneType: 'inside_dhaka' | 'outside_dhaka'; active: boolean; }
interface BotConfig {
  questions: KwQuestion[];
  systemReplies: Record<string, SystemReply>;
  globalSuggestions: { key: string; label: string; realMeaning: string; keywords: string[]; helpText: string }[];
  areaRules?: { globalInsideDhaka: AreaRule[]; clientCustomAreas: AreaRule[]; };
}
interface LearningLog {
  id: string; pageId: number; message: string; normalized: string;
  bestGuess: any; suggestedKeywords: string[]; createdAt: string;
  customer?: { psid: string; name?: string; phone?: string } | null;
}

type BkTab = 'questions' | 'system-replies' | 'area-rules' | 'learning';

const SYSTEM_REPLY_KEYS = [
  'ocr_processing','ocr_fail','order_received','order_confirmed',
  'order_cancelled','product_not_found','stock_out','product_info',
  'order_prompt','generic_fallback',
];

const REPLY_KEY_HELP: Record<string, string> = {
  ocr_processing:    'Customer ছবি পাঠালে প্রথমে এই message যাবে। "Processing হচ্ছে" জানান।',
  ocr_fail:          'ছবি থেকে product code বোঝা না গেলে এই message যাবে।',
  order_received:    'Order সফলভাবে নেওয়া হলে এই message যাবে।',
  order_confirmed:   'Order confirm হলে customer কে এই message যাবে।',
  order_cancelled:   'Order cancel হলে customer কে এই message যাবে।',
  product_not_found: 'Product code ভুল বা না থাকলে এই message। {{productCode}} ব্যবহার করুন।',
  stock_out:         'Product stock নেই হলে এই message। {{productCode}} ব্যবহার করুন।',
  product_info:      'Product info দেখানোর template। {{productCode}}, {{productPrice}}, {{productStock}} ব্যবহার করুন।',
  order_prompt:      'Customer order করতে চাইলে এই guide message যাবে।',
  generic_fallback:  'Bot কিছু না বুঝলে এই default message যাবে।',
};

const VARIABLES_HELP = '{{productCode}} {{productPrice}} {{productStock}} {{insideFee}} {{outsideFee}} {{businessName}} {{deliveryTime}}';

// ── InfoTooltip for system reply keys ─────────────────────────────────────────
function ReplyKeyBadge({ replyKey, th }: { replyKey: string; th: Theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <code style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 700 }}>
        {replyKey}
      </code>
      <InfoButton text={REPLY_KEY_HELP[replyKey] || ''} th={th} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BotKnowledgePage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { request } = useApi();
  const [tab, setTab]         = useState<BkTab>('questions');
  const [cfg, setCfg]         = useState<BotConfig | null>(null);
  const [log, setLog]         = useState<LearningLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [editQ, setEditQ]     = useState<KwQuestion | null>(null);
  const [editReplies, setEditReplies] = useState<Record<string, string>>({});
  const [kwInput, setKwInput] = useState('');
  const [expandedKw, setExpandedKw] = useState<Set<string>>(new Set());
  const [customAreas, setCustomAreas] = useState<AreaRule[]>([]);
  const [areaForm, setAreaForm] = useState({ areaName: '', aliases: '', zoneType: 'inside_dhaka' as 'inside_dhaka' | 'outside_dhaka' });
  const [savingArea, setSavingArea] = useState(false);

  // ── Learning Log action state ────────────────────────────────────────────────
  const [activeLogId, setActiveLogId]       = useState<string | null>(null);
  const [selectedKws, setSelectedKws]       = useState<string[]>([]);
  const [logAction, setLogAction]           = useState<'add_to_existing' | 'create_new'>('add_to_existing');
  const [logTargetQ, setLogTargetQ]         = useState('');
  const [logNewLabel, setLogNewLabel]       = useState('');
  const [logNewReply, setLogNewReply]       = useState('');
  const [logNewTarget, setLogNewTarget]     = useState<'global' | 'client'>('client');
  const [logSaving, setLogSaving]           = useState(false);

  const BASE = `${API_BASE}/client-dashboard/${pageId}/bot-knowledge`;

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const c = await request<BotConfig>(BASE);
      setCfg(c);
      setCustomAreas(c.areaRules?.clientCustomAreas || []);
      const r: Record<string, string> = {};
      for (const k of SYSTEM_REPLY_KEYS) r[k] = c.systemReplies?.[k]?.template || '';
      setEditReplies(r);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  const loadLog = useCallback(async () => {
    try { setLog(await request<LearningLog[]>(`${BASE}/learning-log`)); } catch {}
  }, [pageId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (tab === 'learning') loadLog(); }, [tab, loadLog]);

  const saveQuestions = async (questions: KwQuestion[]) => {
    setSaving(true);
    try {
      await request(`${BASE}/questions`, { method: 'PATCH', body: JSON.stringify({ questions }) });
      onToast('✅ Questions saved'); await loadConfig();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveReplies = async () => {
    setSaving(true);
    const sr: Record<string, any> = {};
    for (const k of SYSTEM_REPLY_KEYS) {
      sr[k] = { template: editReplies[k] || '', fallback: editReplies[k] || '', enabled: true };
    }
    try {
      await request(`${BASE}/system-replies`, { method: 'PATCH', body: JSON.stringify({ systemReplies: sr }) });
      onToast('✅ System replies saved'); await loadConfig();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const importGlobal = async (key: string) => {
    try {
      await request(`${BASE}/import-global/${key}`, { method: 'POST' });
      onToast(`✅ "${key}" imported`); await loadConfig();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const toggleQ    = async (q: KwQuestion) => saveQuestions(cfg!.questions.map(x => x.key === q.key ? { ...x, enabled: !x.enabled } : x));
  const deleteQ    = async (key: string)    => saveQuestions(cfg!.questions.filter(q => q.key !== key));
  const saveEditQ  = async () => {
    if (!editQ) return;
    const q = { ...editQ };
    if (!q.key) q.key = q.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '') || `custom_${Date.now()}`;
    const updated = cfg!.questions.find(x => x.key === q.key)
      ? cfg!.questions.map(x => x.key === q.key ? q : x)
      : [...cfg!.questions, q];
    await saveQuestions(updated);
    setEditQ(null);
  };

  const newQuestion = () => {
    setKwInput('');
    setEditQ({
      key: '', label: '', realMeaning: '', helpText: '',
      keywords: [], replyTemplate: '', enabled: true, replyType: 'text', priority: 99,
    });
  };

  const TabBar = () => (
    <div style={{ display: 'flex', gap: 3, background: th.surface, borderRadius: 10, padding: 3, border: `1px solid ${th.border}`, flexWrap: 'wrap' }}>
      {([
        ['questions',       '💬 Questions'],
        ['system-replies',  '🔔 System Replies'],
        ['area-rules',      '🗺️ Area Rules'],
        ['learning',        '🧠 Learning Log'],
      ] as const).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} style={{
          padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          background: tab === k ? th.accent : 'transparent',
          color: tab === k ? '#fff' : th.muted, transition: 'all .15s',
        }}>{l}</button>
      ))}
    </div>
  );

  if (loading) return (
    <div style={{ ...th.card, display: 'flex', gap: 10, alignItems: 'center', color: th.muted }}>
      <Spinner size={18}/> Loading bot knowledge…
    </div>
  );
  if (!cfg) return null;

  // ── QUESTIONS TAB ─────────────────────────────────────────────────────────
  const QuestionsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Edit / New panel */}
      {editQ && (
        <div style={{ ...th.card, border: `2px solid ${th.accent}`, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {!editQ.key ? '➕ নতুন Question তৈরি করুন' : `✏️ Edit: ${editQ.label || editQ.key}`}
              </div>
              <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>Bot এই question টা কীভাবে চিনবে এবং কী reply করবে সেটা সেট করুন</div>
            </div>
            <button style={th.btnGhost} onClick={() => setEditQ(null)}>✕</button>
          </div>

          {/* Step 1 */}
          <div style={{ background: th.surface, borderRadius: 12, padding: '16px 18px', marginBottom: 12, border: `1px solid ${th.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14 }}>
              Step 1 · Question পরিচয়
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>
                  প্রশ্নের নাম <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <input style={th.input} placeholder="যেমন: ডেলিভারি কতদিনে পাব"
                  value={editQ.label}
                  onChange={e => setEditQ(q => ({ ...q!, label: e.target.value }))} />
                <div style={{ fontSize: 10.5, color: th.muted, marginTop: 4 }}>Dashboard এ এই নামে দেখাবে</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>Reply Type</div>
                <select style={th.input} value={editQ.replyType}
                  onChange={e => setEditQ(q => ({ ...q!, replyType: e.target.value }))}>
                  <option value="text">text — সাধারণ reply</option>
                  <option value="product">product — product info দেখাবে</option>
                  <option value="settings">settings — delivery fee/time দেখাবে</option>
                  <option value="payment">payment — payment info দেখাবে</option>
                </select>
                <div style={{ fontSize: 10.5, color: th.muted, marginTop: 4 }}>কোন ধরনের reply</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: th.text, marginBottom: 5 }}>
                  Real Meaning <span style={{ fontSize: 10.5, color: th.muted, fontWeight: 400 }}>(bot এর জন্য বাংলা/English এ লিখুন)</span>
                </div>
                <input style={th.input} placeholder="customer asks about how many days delivery takes"
                  value={editQ.realMeaning}
                  onChange={e => setEditQ(q => ({ ...q!, realMeaning: e.target.value }))} />
                <div style={{ fontSize: 10.5, color: th.muted, marginTop: 4 }}>Bot এই meaning দেখে question টা বোঝার চেষ্টা করে — ইংরেজিতে লিখলে ভালো কাজ করে</div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ background: th.surface, borderRadius: 12, padding: '16px 18px', marginBottom: 12, border: `1px solid ${th.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>
              Step 2 · Keywords
            </div>
            <div style={{ fontSize: 12, color: th.muted, marginBottom: 12 }}>Customer এই শব্দগুলো লিখলে bot এই question match করবে — Bangla + English দুটোই রাখুন</div>

            {/* Keyword chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10, minHeight: 32 }}>
              {editQ.keywords.map((k, i) => (
                <span key={i} style={{ background: th.accentSoft, color: th.accent, fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${th.accent}40` }}>
                  {k}
                  <button onClick={() => setEditQ(q => ({ ...q!, keywords: q!.keywords.filter((_, j) => j !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.accent, fontSize: 13, lineHeight: '1', padding: 0, opacity: 0.7 }}>×</button>
                </span>
              ))}
              {editQ.keywords.length === 0 && <span style={{ fontSize: 12, color: th.muted, fontStyle: 'italic' }}>কোনো keyword নেই — নিচে add করুন</span>}
            </div>

            {/* Add keyword input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...th.input, flex: 1 }}
                placeholder="keyword লিখুন, তারপর Enter বা Add চাপুন — যেমন: delivery time, কবে পাব, koto din"
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const val = kwInput.trim();
                    if (val && !editQ.keywords.includes(val)) {
                      setEditQ(q => ({ ...q!, keywords: [...q!.keywords, val] }));
                      setKwInput('');
                    }
                  }
                }} />
              <button style={th.btnGhost} onClick={() => {
                const val = kwInput.trim();
                if (val && !editQ.keywords.includes(val)) {
                  setEditQ(q => ({ ...q!, keywords: [...q!.keywords, val] }));
                  setKwInput('');
                }
              }}>+ Add</button>
            </div>
            <div style={{ fontSize: 10.5, color: th.muted, marginTop: 6 }}>Enter চেপে বা "+" বাটন দিয়ে keyword add করুন · Chip-এ × চাপলে সরে যাবে</div>
          </div>

          {/* Step 3 */}
          <div style={{ background: th.surface, borderRadius: 12, padding: '16px 18px', marginBottom: 16, border: `1px solid ${th.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>
              Step 3 · Bot Reply
            </div>
            <div style={{ fontSize: 12, color: th.muted, marginBottom: 10 }}>Customer এই question করলে bot কী reply করবে</div>

            <textarea style={{ ...th.input, height: 90, resize: 'vertical' as const, fontFamily: 'inherit', fontSize: 13 }}
              placeholder="আমাদের ডেলিভারি সময় ঢাকায় {{deliveryTime}} দিন এবং ঢাকার বাইরে {{deliveryTime}} দিন 🚚"
              value={editQ.replyTemplate}
              onChange={e => setEditQ(q => ({ ...q!, replyTemplate: e.target.value }))} />

            {/* Variable chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginTop: 8 }}>
              <span style={{ fontSize: 10.5, color: th.muted, alignSelf: 'center', fontWeight: 700 }}>Variables:</span>
              {VARIABLES_HELP.split(' ').map(v => (
                <code key={v}
                  onClick={() => setEditQ(q => ({ ...q!, replyTemplate: (q?.replyTemplate || '') + v }))}
                  style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 6, fontSize: 10.5, cursor: 'pointer', border: `1px solid ${th.accent}30` }}>
                  {v}
                </code>
              ))}
              <span style={{ fontSize: 10, color: th.muted, alignSelf: 'center' }}>← click করলে insert হবে</span>
            </div>
          </div>

          {/* Save/Cancel */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...th.btnPrimary, padding: '10px 24px', fontSize: 14 }} onClick={saveEditQ} disabled={saving || !editQ.label.trim()}>
              {saving ? <><Spinner size={13}/> Saving…</> : '💾 Save Question'}
            </button>
            <button style={th.btnGhost} onClick={() => setEditQ(null)}>✕ Cancel</button>
          </div>
        </div>
      )}

      {/* Question list */}
      <div style={th.card}>
        <CardHeader th={th} title="💬 Question Bank"
          sub={`${cfg.questions.length} টি question — bot এগুলো দিয়ে customer এর প্রশ্ন বোঝে`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={th.btnGhost} onClick={loadConfig}>🔄</button>
              <button style={th.btnPrimary} onClick={newQuestion}>➕ New Question</button>
            </div>
          }
        />

        {cfg.questions.length === 0
          ? <EmptyState icon="💬" title="কোনো question নেই" sub="নিচে global bank থেকে import করুন বা নতুন তৈরি করুন" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cfg.questions.map(q => (
                <div key={q.key} style={{
                  border: `1.5px solid ${!q.enabled ? th.border : editQ?.key === q.key ? th.accent : th.border}`,
                  borderRadius: 12, padding: '12px 14px',
                  background: !q.enabled ? (th.panel) : th.panel,
                  opacity: q.enabled ? 1 : 0.5, transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Label + badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: 13.5 }}>{q.label || q.key}</span>
                        <InfoButton text={q.helpText || q.realMeaning} th={th} />
                        <span style={{ ...th.pill, ...th.pillBlue, fontSize: 10 }}>{q.replyType}</span>
                        {q.source === 'global'           && <span style={{ ...th.pill, ...th.pillGray,  fontSize: 10 }}>🌐 global</span>}
                        {q.source === 'client_override'  && <span style={{ ...th.pill, ...th.pillGreen, fontSize: 10 }}>✏️ custom</span>}
                        {q.source === 'client_import'    && <span style={{ ...th.pill, ...th.pillYellow,fontSize: 10 }}>⬇️ imported</span>}
                      </div>

                      {/* Real meaning */}
                      <div style={{ fontSize: 11.5, color: th.muted, marginBottom: 6 }}>{q.realMeaning}</div>

                      {/* Keywords */}
                      {(() => {
                        const exp = expandedKw.has(q.key);
                        const shown = exp ? q.keywords : q.keywords.slice(0, 5);
                        const hasMore = q.keywords.length > 5;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {shown.map(k => (
                              <span key={k} style={{ background: th.accentSoft, color: th.accent, fontSize: 10.5, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{k}</span>
                            ))}
                            {hasMore && (
                              <button
                                onClick={() => setExpandedKw(prev => { const next = new Set(prev); exp ? next.delete(q.key) : next.add(q.key); return next; })}
                                style={{ background: 'none', border: 'none', color: th.accent, fontSize: 10.5, cursor: 'pointer', padding: '1px 4px', textDecoration: 'underline' }}
                              >
                                {exp ? '▲ কম দেখাও' : `+${q.keywords.length - 5} আরো দেখাও`}
                              </button>
                            )}
                            {q.keywords.length === 0 && <span style={{ fontSize: 11, color: th.muted }}>⚠️ কোনো keyword নেই</span>}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        style={{ ...th.btnSm, ...(q.enabled ? th.btnSmSuccess : th.btnSmDanger), fontSize: 11, minWidth: 44 }}
                        onClick={() => toggleQ(q)}>
                        {q.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button style={{ ...th.btnSmGhost, fontSize: 12 }} onClick={() => { setKwInput(''); setEditQ({ ...q }); }}>✏️</button>
                      <button style={{ ...th.btnSmDanger, fontSize: 12 }} onClick={() => deleteQ(q.key)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Global suggestions */}
      {cfg.globalSuggestions.length > 0 && (
        <div style={th.card}>
          <CardHeader th={th} title="🌐 Global Bank থেকে Import করুন"
            sub="এগুলো এখনো আপনার page এ যোগ করা হয়নি" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.globalSuggestions.map(s => {
              const expanded = expandedKw.has(s.key);
              const shown = expanded ? s.keywords : s.keywords.slice(0, 5);
              const hasMore = s.keywords.length > 5;
              return (
                <div key={s.key} style={{ ...th.card2, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</span>
                      <InfoButton text={s.helpText || s.realMeaning} th={th} />
                    </div>
                    <div style={{ fontSize: 11.5, color: th.muted, marginBottom: 4 }}>{s.realMeaning}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {shown.map(k => (
                        <span key={k} style={{ background: th.accentSoft, color: th.accent, fontSize: 10.5, padding: '1px 7px', borderRadius: 5 }}>{k}</span>
                      ))}
                      {hasMore && (
                        <button
                          onClick={() => setExpandedKw(prev => {
                            const next = new Set(prev);
                            expanded ? next.delete(s.key) : next.add(s.key);
                            return next;
                          })}
                          style={{ background: 'none', border: 'none', color: th.accent, fontSize: 10.5, cursor: 'pointer', padding: '1px 4px', textDecoration: 'underline' }}
                        >
                          {expanded ? '▲ কম দেখাও' : `+${s.keywords.length - 5} আরো দেখাও`}
                        </button>
                      )}
                    </div>
                  </div>
                  <button style={{ ...th.btnSmAccent, whiteSpace: 'nowrap' }} onClick={() => importGlobal(s.key)}>
                    ⬇️ Import
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── SYSTEM REPLIES TAB ────────────────────────────────────────────────────
  const SystemRepliesTab = () => (
    <div style={th.card}>
      <CardHeader th={th} title="🔔 System Replies"
        sub="Bot এর সব automatic message এখানে customize করুন" />

      {/* Variables reference */}
      <div style={{ ...th.card2, marginBottom: 18, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: th.muted, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          ব্যবহারযোগ্য Variables <InfoButton text="Reply template এ এই variables লিখলে bot automatically সেখানে সঠিক তথ্য বসিয়ে দেবে।" th={th} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            ['{{productCode}}',    'Product এর code'],
            ['{{productPrice}}',   'Product এর দাম'],
            ['{{productStock}}',   'Stock পরিমাণ'],
            ['{{insideFee}}',      'ঢাকার ভেতরে delivery fee'],
            ['{{outsideFee}}',     'ঢাকার বাইরে delivery fee'],
            ['{{businessName}}',   'আপনার business এর নাম'],
            ['{{deliveryTime}}',   'Delivery সময়কাল'],
          ].map(([v, desc]) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <code style={{ background: th.accentSoft, color: th.accent, padding: '2px 8px', borderRadius: 5, fontSize: 11 }}>{v}</code>
              <span style={{ fontSize: 10.5, color: th.muted }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SYSTEM_REPLY_KEYS.map(k => (
          <div key={k}>
            <ReplyKeyBadge replyKey={k} th={th} />
            <textarea
              style={{ ...th.input, height: 68, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              value={editReplies[k] || ''}
              onChange={e => setEditReplies(r => ({ ...r, [k]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <button style={{ ...th.btnPrimary, marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={saveReplies} disabled={saving}>
        {saving ? <><Spinner size={13}/> Saving…</> : '💾 Save All Replies'}
      </button>
    </div>
  );

  // ── LEARNING LOG TAB ──────────────────────────────────────────────────────
  const openLogEntry = (l: LearningLog) => {
    setActiveLogId(l.id);
    setSelectedKws(l.suggestedKeywords.slice());
    setLogAction('add_to_existing');
    setLogTargetQ(cfg?.questions?.[0]?.key || '');
    setLogNewLabel('');
    setLogNewReply('');
    setLogNewTarget('client');
  };

  const dismissLog = async (id: string) => {
    await request(`${BASE}/learning-log/${id}`, { method: 'DELETE' });
    setLog(prev => prev.filter(l => l.id !== id));
    if (activeLogId === id) setActiveLogId(null);
  };

  const submitLogAction = async (l: LearningLog) => {
    if (logAction === 'create_new' && !logNewLabel.trim()) {
      onToast('Category name দিন', 'error'); return;
    }
    setLogSaving(true);
    try {
      await request(`${BASE}/learning-log/${l.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          action: logAction,
          keywords: selectedKws,
          questionKey: logTargetQ,
          label: logNewLabel,
          replyTemplate: logNewReply,
          target: logNewTarget,
        }),
      });
      onToast('✅ সফলভাবে add করা হয়েছে');
      setLog(prev => prev.filter(e => e.id !== l.id));
      setActiveLogId(null);
      await loadConfig();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLogSaving(false); }
  };

  const LearningTab = () => {
    const activeEntry = log.find(l => l.id === activeLogId);
    return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Left: list */}
      <div style={{ flex: '1 1 340px', minWidth: 0 }}>
        <div style={th.card}>
          <CardHeader th={th} title="🧠 Learning Log"
            sub={`${log.length} টি unmatched message`}
            action={<button style={th.btnGhost} onClick={loadLog}>🔄</button>}
          />
          {log.length === 0
            ? <EmptyState icon="🎉" title="কোনো unmatched message নেই" sub="Bot সব question বুঝতে পারছে!" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {log.slice(0, 80).map(l => (
                  <div key={l.id}
                    onClick={() => openLogEntry(l)}
                    style={{
                      ...th.card2, borderRadius: 10, cursor: 'pointer',
                      border: activeLogId === l.id ? `2px solid ${th.accent}` : `2px solid transparent`,
                      transition: 'border-color 0.15s',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, wordBreak: 'break-word' }}>
                          "{l.message}"
                        </div>
                        <div style={{ fontSize: 11, color: th.muted, marginBottom: 4 }}>
                          {new Date(l.createdAt).toLocaleString('bn-BD')} &nbsp;·&nbsp;
                          <b>{l.bestGuess?.label || 'কিছু মেলেনি'}</b>
                        </div>
                        {l.customer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 10.5, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 5, padding: '1px 7px', color: th.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                              👤 {l.customer.name || 'Unknown'}
                              {l.customer.phone && <span style={{ color: th.muted }}>· {l.customer.phone}</span>}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(l.customer!.psid); onToast('PSID copied!'); }}
                              style={{ ...th.btnGhost, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}
                              title="Messenger PSID copy করুন"
                            >📋 PSID</button>
                            {l.customer.phone && (
                              <button
                                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(l.customer!.phone!); onToast('Phone copied!'); }}
                                style={{ ...th.btnGhost, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}
                                title="Phone copy করুন"
                              >📋 Phone</button>
                            )}
                          </div>
                        )}
                        {l.suggestedKeywords.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {l.suggestedKeywords.map(k => (
                              <span key={k} style={{ background: th.accentSoft, color: th.accent, fontSize: 10, padding: '1px 7px', borderRadius: 5 }}>{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); openLogEntry(l); }}
                        style={{ ...th.btnGhost, padding: '2px 7px', fontSize: 13, flexShrink: 0, color: th.accent, borderColor: th.accent }}
                        title="Question Bank এ add করুন"
                      >＋</button>
                      <button
                        onClick={e => { e.stopPropagation(); dismissLog(l.id); }}
                        style={{ ...th.btnGhost, padding: '2px 7px', fontSize: 11, flexShrink: 0, opacity: 0.6 }}
                        title="Order Info — dismiss করুন"
                      >📦</button>
                      <button
                        onClick={e => { e.stopPropagation(); dismissLog(l.id); }}
                        style={{ ...th.btnGhost, padding: '2px 7px', fontSize: 11, flexShrink: 0 }}
                        title="Dismiss"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Right: action panel */}
      {activeEntry && (
        <div style={{ flex: '1 1 360px', minWidth: 0, ...th.card }}>
          <CardHeader th={th} title="⚡ Action" sub={`"${activeEntry.message}"`} />

          {/* Keyword selector */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 6 }}>Keywords select করুন:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {activeEntry.suggestedKeywords.map(k => {
                const on = selectedKws.includes(k);
                return (
                  <button key={k}
                    onClick={() => setSelectedKws(prev => on ? prev.filter(x => x !== k) : [...prev, k])}
                    style={{
                      background: on ? th.accent : th.accentSoft,
                      color: on ? '#fff' : th.accent,
                      border: 'none', borderRadius: 6, fontSize: 11.5,
                      padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
                    }}>{k}</button>
                );
              })}
            </div>
            {/* custom keyword input */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                placeholder="নিজে keyword লিখুন..."
                style={{ ...th.input, flex: 1, fontSize: 12 }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                    if (v && !selectedKws.includes(v)) setSelectedKws(prev => [...prev, v]);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            {selectedKws.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                {selectedKws.map(k => (
                  <span key={k} style={{ background: th.accent, color: '#fff', fontSize: 10.5, padding: '2px 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {k}
                    <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setSelectedKws(prev => prev.filter(x => x !== k))}>✕</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action choice */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['add_to_existing', 'create_new'] as const).map(a => (
              <button key={a}
                onClick={() => setLogAction(a)}
                style={{
                  ...th.btnGhost, flex: 1, fontSize: 12,
                  background: logAction === a ? th.accent : undefined,
                  color: logAction === a ? '#fff' : undefined,
                  borderColor: logAction === a ? th.accent : undefined,
                }}>
                {a === 'add_to_existing' ? '➕ Existing Question এ add' : '🆕 New Category তৈরি'}
              </button>
            ))}
          </div>

          {/* Add to existing */}
          {logAction === 'add_to_existing' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 6 }}>কোন question এ add করবেন?</div>
              <select
                value={logTargetQ}
                onChange={e => setLogTargetQ(e.target.value)}
                style={{ ...th.input, width: '100%', fontSize: 13 }}
              >
                {(cfg?.questions || []).map(q => (
                  <option key={q.key} value={q.key}>{q.label}</option>
                ))}
              </select>
              {logTargetQ && cfg && (
                <div style={{ marginTop: 6, fontSize: 11, color: th.muted }}>
                  Current keywords: {cfg.questions.find(q => q.key === logTargetQ)?.keywords.join(', ') || 'none'}
                </div>
              )}
            </div>
          )}

          {/* Create new */}
          {logAction === 'create_new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 4 }}>Category নাম *</div>
                <input value={logNewLabel} onChange={e => setLogNewLabel(e.target.value)}
                  placeholder="যেমন: Price জিজ্ঞেস করছে"
                  style={{ ...th.input, width: '100%', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 4 }}>Bot reply (optional)</div>
                <textarea value={logNewReply} onChange={e => setLogNewReply(e.target.value)}
                  placeholder="Bot কী reply করবে..."
                  rows={2}
                  style={{ ...th.input, width: '100%', fontSize: 13, resize: 'vertical' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 4 }}>কোথায় add হবে?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['client', 'global'] as const).map(t => (
                    <button key={t}
                      onClick={() => setLogNewTarget(t)}
                      style={{
                        ...th.btnGhost, flex: 1, fontSize: 12,
                        background: logNewTarget === t ? th.accent : undefined,
                        color: logNewTarget === t ? '#fff' : undefined,
                      }}>
                      {t === 'client' ? '👤 শুধু আমার Page' : '🌐 Global (সব page)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Submit buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...th.btnPrimary, flex: 1, fontSize: 13 }}
              disabled={logSaving}
              onClick={() => submitLogAction(activeEntry)}
            >
              {logSaving ? '...' : '✅ Save করুন'}
            </button>
            <button
              style={{ ...th.btnGhost, fontSize: 13 }}
              onClick={() => dismissLog(activeEntry.id)}
            >
              🗑️ Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
    );
  };

  const saveAreaRules = async (areas: AreaRule[]) => {
    setSavingArea(true);
    try {
      await request(`${BASE}/area-rules`, { method: 'PATCH', body: JSON.stringify({ clientCustomAreas: areas }) });
      setCustomAreas(areas);
      onToast('✅ Area rules saved');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSavingArea(false); }
  };

  const addArea = () => {
    if (!areaForm.areaName.trim()) return;
    const newArea: AreaRule = {
      areaName: areaForm.areaName.trim(),
      aliases: areaForm.aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean),
      zoneType: areaForm.zoneType,
      active: true,
    };
    const updated = [...customAreas, newArea];
    setAreaForm({ areaName: '', aliases: '', zoneType: 'inside_dhaka' });
    saveAreaRules(updated);
  };

  const removeArea = (i: number) => saveAreaRules(customAreas.filter((_, idx) => idx !== i));

  const AreaRulesTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info banner */}
      <div style={{ ...th.card2, background: th.accentSoft, border: `1px solid ${th.accent}40`, borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: th.accent, marginBottom: 4 }}>🗺️ Area Detection কীভাবে কাজ করে?</div>
        <div style={{ fontSize: 12, color: th.text, lineHeight: 1.6 }}>
          Customer delivery address দিলে bot স্বয়ংক্রিয়ভাবে বুঝবে এটা <b>ঢাকার ভেতরে</b> নাকি <b>বাইরে</b> —
          এবং সেই অনুযায়ী সঠিক delivery fee reply করবে।
          নিচের list-এ আপনার এলাকাগুলো যোগ করুন।
        </div>
      </div>

      {/* Global areas (read-only) */}
      <div style={th.card}>
        <CardHeader th={th} title="🌐 Global Inside Dhaka Areas" sub="এগুলো সব client-এর জন্য default — edit করা যাবে না" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(cfg?.areaRules?.globalInsideDhaka || []).map((a, i) => (
            <div key={i} style={{ background: '#10b98120', border: '1px solid #10b98140', borderRadius: 8, padding: '5px 12px', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#10b981' }}>{a.areaName}</span>
              {a.aliases?.length > 0 && <span style={{ color: th.muted, fontSize: 10.5 }}> · {a.aliases.join(', ')}</span>}
            </div>
          ))}
          {(!cfg?.areaRules?.globalInsideDhaka?.length) && <span style={{ fontSize: 12, color: th.muted }}>Loading…</span>}
        </div>
      </div>

      {/* Client custom areas */}
      <div style={th.card}>
        <CardHeader th={th} title="📍 আপনার Custom Areas" sub={`আপনার নিজস্ব এলাকা — ${customAreas.length} টি`} />

        {/* Add form */}
        <div style={{ background: th.surface, borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: `1px solid ${th.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: th.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
            ➕ নতুন এলাকা যোগ করুন
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>এলাকার নাম <span style={{ color: '#ef4444' }}>*</span></div>
              <input style={th.input} placeholder="যেমন: Gazipur" value={areaForm.areaName}
                onChange={e => setAreaForm(p => ({ ...p, areaName: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
                Alternative নাম <span style={{ fontSize: 10.5, color: th.muted }}>(comma দিয়ে আলাদা করুন)</span>
              </div>
              <input style={th.input} placeholder="gazipur, gazipor, gzpur, গাজীপুর" value={areaForm.aliases}
                onChange={e => setAreaForm(p => ({ ...p, aliases: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Zone Type</div>
              <select style={{ ...th.input, cursor: 'pointer' }} value={areaForm.zoneType}
                onChange={e => setAreaForm(p => ({ ...p, zoneType: e.target.value as any }))}>
                <option value="inside_dhaka">🟢 Inside Dhaka</option>
                <option value="outside_dhaka">🔵 Outside Dhaka</option>
              </select>
            </div>
          </div>
          <button style={{ ...th.btnPrimary, padding: '9px 20px' }} onClick={addArea}
            disabled={!areaForm.areaName.trim() || savingArea}>
            {savingArea ? <><Spinner size={12}/> Saving…</> : '➕ Add Area'}
          </button>
        </div>

        {/* List */}
        {customAreas.length === 0 ? (
          <EmptyState icon="📍" title="কোনো custom area নেই" sub="উপরে form দিয়ে আপনার এলাকা যোগ করুন" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customAreas.map((a, i) => (
              <div key={i} style={{ ...th.card2, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{a.areaName}</span>
                    <span style={{
                      fontSize: 10.5, padding: '1px 8px', borderRadius: 20, fontWeight: 700,
                      background: a.zoneType === 'inside_dhaka' ? '#10b98120' : '#3b82f620',
                      color: a.zoneType === 'inside_dhaka' ? '#10b981' : '#3b82f6',
                    }}>
                      {a.zoneType === 'inside_dhaka' ? '🟢 Inside Dhaka' : '🔵 Outside Dhaka'}
                    </span>
                  </div>
                  {a.aliases?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {a.aliases.map(al => (
                        <span key={al} style={{ background: th.accentSoft, color: th.accent, fontSize: 10.5, padding: '1px 7px', borderRadius: 5 }}>{al}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => removeArea(i)}
                  style={{ background: 'none', border: '1px solid #ef444460', color: '#ef4444', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>Bot Knowledge</h1>
        <p style={{ fontSize: 12.5, color: th.muted, margin: '3px 0 0' }}>
          Bot কে শেখান — কোন প্রশ্নের কী উত্তর দিতে হবে
        </p>
      </div>
      <TabBar />
      {tab === 'questions'      && <QuestionsTab />}
      {tab === 'system-replies' && <SystemRepliesTab />}
      {tab === 'area-rules'     && <AreaRulesTab />}
      {tab === 'learning'       && <LearningTab />}
    </div>
  );
}
