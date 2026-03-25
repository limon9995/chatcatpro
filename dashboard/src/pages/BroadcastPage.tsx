import { useCallback, useEffect, useState } from 'react';
import { CardHeader, FieldWithInfo, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

const STATUS_COLORS: Record<string,string> = {
  draft:'#6b7280', running:'#3b82f6', completed:'#16a34a', failed:'#ef4444',
};

const TARGET_OPTS = [
  { value: 'all',            label: 'সবাই',              desc: 'সব active customer' },
  { value: 'tag',            label: 'Tag অনুযায়ী',       desc: 'নির্দিষ্ট tag এর customer' },
  { value: 'ordered_before', label: 'আগে Order করেছে',   desc: 'নির্দিষ্ট তারিখের আগে order করেছে' },
  { value: 'never_ordered',  label: 'কখনো Order করেনি',  desc: 'কোনো order করেনি' },
];

// ── Built-in Template Library ─────────────────────────────────────────────────
// Admin চাইলে এগুলো bot-knowledge এ রাখতে পারবে ভবিষ্যতে।
// এখন client-side templates — edit করে use করা যাবে।
const BROADCAST_TEMPLATES: {
  id: string; category: string; title: string; message: string; emoji: string;
}[] = [
  // নতুন collection
  {
    id: 'new_collection',
    category: '🆕 নতুন Collection',
    title: 'New Collection Launch',
    emoji: '🎉',
    message: `🎉 নতুন কালেকশন এসেছে!

আমাদের latest collection দেখতে এখনই message করুন 💖
সীমিত stock — তাড়াতাড়ি order করুন!`,
  },
  {
    id: 'eid_collection',
    category: '🆕 নতুন Collection',
    title: 'Eid Special Collection',
    emoji: '🌙',
    message: `🌙 ঈদ স্পেশাল কালেকশন এসেছে!

এই ঈদে নিজেকে সাজিয়ে তুলুন আমাদের exclusive collection দিয়ে ✨
Product দেখতে product code পাঠান 💖`,
  },

  // Discount / Offer
  {
    id: 'flash_sale',
    category: '💸 Offer & Discount',
    title: 'Flash Sale',
    emoji: '🔥',
    message: `🔥 FLASH SALE চলছে!

আজকেই order করুন — বিশেষ ছাড় পাচ্ছেন 🎁
এই offer সীমিত সময়ের জন্য!

আজই message করুন 💖`,
  },
  {
    id: 'discount_offer',
    category: '💸 Offer & Discount',
    title: 'Special Discount',
    emoji: '🎁',
    message: `🎁 বিশেষ ছাড়ের অফার!

আমাদের selected products এ এখন special discount চলছে।
Code পাঠিয়ে price জেনে নিন 💖`,
  },

  // Restock
  {
    id: 'restock',
    category: '📦 Stock Update',
    title: 'Back in Stock',
    emoji: '📦',
    message: `📦 Stock এ ফিরে এসেছে!

আপনাদের পছন্দের product আবার available।
এবার দেরি না করে order করুন 💖`,
  },
  {
    id: 'last_stock',
    category: '📦 Stock Update',
    title: 'Last Few Pieces',
    emoji: '⚡',
    message: `⚡ মাত্র কিছু pieces বাকি!

আপনার পছন্দের product এর stock শেষ হয়ে যাচ্ছে।
এখনই order করুন, না হলে পরে নাও পেতে পারেন! 💖`,
  },

  // Follow-up / Re-engagement
  {
    id: 'miss_you',
    category: '💌 Re-engagement',
    title: 'Miss You',
    emoji: '💌',
    message: `💌 আপনাকে অনেকদিন দেখছি না!

আমাদের নতুন collection দেখেছেন? 
এখনই message করুন, আপনার জন্য special offer আছে 🎁`,
  },
  {
    id: 'feedback',
    category: '💌 Re-engagement',
    title: 'Feedback Request',
    emoji: '⭐',
    message: `⭐ আপনার মতামত জানান!

আমাদের service কেমন লাগলো? 
আপনার feedback আমাদের আরো ভালো করতে সাহায্য করে 💖`,
  },

  // Seasonal
  {
    id: 'winter_collection',
    category: '🌸 Seasonal',
    title: 'Winter Collection',
    emoji: '❄️',
    message: `❄️ শীতের কালেকশন এসেছে!

এই শীতে warm ও stylish থাকুন আমাদের collection দিয়ে 🧣
Product দেখতে এখনই message করুন 💖`,
  },
  {
    id: 'puja_offer',
    category: '🌸 Seasonal',
    title: 'Puja Special',
    emoji: '🪔',
    message: `🪔 পূজা স্পেশাল অফার!

এই পূজায় আপনার প্রিয়জনদের জন্য special gift বেছে নিন।
আমাদের collection দেখতে message করুন 💖`,
  },

  // Delivery Update
  {
    id: 'delivery_update',
    category: '🚚 Delivery',
    title: 'Delivery Update',
    emoji: '🚚',
    message: `🚚 Delivery Update

আপনার order রাস্তায় আছে! শীঘ্রই পৌঁছে যাবে 💖
কোনো সমস্যা হলে আমাদের জানান।`,
  },
];

// Categories বের করা
const CATEGORIES = [...new Set(BROADCAST_TEMPLATES.map(t => t.category))];

export function BroadcastPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [tags, setTags]             = useState<string[]>([]);
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState<number | null>(null);
  const [showNew, setShowNew]       = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [form, setForm] = useState({ title: '', message: '', targetType: 'all', targetValue: '' });

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bc, tg] = await Promise.all([
        request<any[]>(`${BASE}/broadcast`),
        request<string[]>(`${BASE}/crm/customers/tags`),
      ]);
      setBroadcasts(bc); setTags(tg);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  // Template select করলে form এ বসে যাবে
  const applyTemplate = (t: typeof BROADCAST_TEMPLATES[0]) => {
    setForm(f => ({ ...f, title: t.title, message: t.message }));
    setShowTemplates(false);
    setShowNew(true);
    onToast(copy(`✅ "${t.title}" template applied — edit করুন`, `✅ "${t.title}" template applied - you can edit it now`));
  };

  const create = async () => {
    if (!form.title.trim() || !form.message.trim()) return onToast(copy('Title এবং Message দিন', 'Enter both title and message'), 'error');
    try {
      await request(`${BASE}/broadcast`, { method: 'POST', body: JSON.stringify(form) });
      onToast(copy('✅ Broadcast created', '✅ Broadcast created'));
      setShowNew(false);
      setForm({ title: '', message: '', targetType: 'all', targetValue: '' });
      await load();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const send = async (id: number) => {
    setSending(id);
    try {
      const r = await request<any>(`${BASE}/broadcast/${id}/send`, { method: 'POST' });
      onToast(copy(`✅ Started — ${r.totalTarget} জন পাবে`, `✅ Started - ${r.totalTarget} recipients`)); await load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSending(null); }
  };

  const del = async (id: number) => {
    try {
      await request(`${BASE}/broadcast/${id}`, { method: 'DELETE' });
      onToast(copy('✅ Deleted', '✅ Deleted')); await load();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>📢 Broadcast</div>
          <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>{copy('সব বা নির্দিষ্ট customer দের একসাথে message পাঠান', 'Send messages to all customers or to a targeted segment')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={th.btnGhost} onClick={load}>{loading ? <Spinner size={13}/> : '🔄'}</button>
          <button style={{ ...th.btnGhost, color: '#8b5cf6', borderColor: '#8b5cf644' }}
            onClick={() => { setShowTemplates(v => !v); setShowNew(false); }}>
            {showTemplates ? copy('✕', '✕') : copy('📋 Templates', '📋 Templates')}
          </button>
          <button style={th.btnPrimary}
            onClick={() => { setShowNew(v => !v); setShowTemplates(false); }}>
            {showNew ? copy('✕ Cancel', '✕ Cancel') : copy('➕ New Broadcast', '➕ New Broadcast')}
          </button>
        </div>
      </div>

      {/* Facebook policy warning */}
      <div style={{ ...th.card2, padding: '10px 14px', background: '#fef3c7', border: '1px solid #f59e0b44', color: '#92400e', fontSize: 12.5, borderRadius: 10 }}>
        ⚠️ <b>Facebook Policy:</b> {copy('শুধুমাত্র সেই customer দের message পাঠান যারা গত ২৪ ঘণ্টায় আপনার page এ message করেছে। অন্যদের message গেলে page block হতে পারে।', 'Only message customers who contacted your page within the last 24 hours. Messaging others may put your page at risk.')}
      </div>

      {/* ── TEMPLATE LIBRARY ─────────────────────────────────────────────── */}
      {showTemplates && (
        <div style={{ ...th.card, border: `2px solid #8b5cf644` }}>
          <CardHeader th={th} title={copy('📋 Template Library', '📋 Template Library')}
            sub={copy('একটা template বেছে নিন — তারপর নিজের মতো edit করুন', 'Pick a template, then customize it to match your campaign')}
          />

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', transition: 'all .12s',
                background: activeCategory === cat ? '#8b5cf6' : th.surface,
                color: activeCategory === cat ? '#fff' : th.muted,
              }}>{cat}</button>
            ))}
          </div>

          {/* Templates grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
            {BROADCAST_TEMPLATES.filter(t => t.category === activeCategory).map(t => (
              <button key={t.id}
                onClick={() => applyTemplate(t)}
                style={{
                  textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `1.5px solid ${th.border}`, background: th.panel, fontFamily: 'inherit',
                  transition: 'all .12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#8b5cf6'; (e.currentTarget as HTMLElement).style.background = '#8b5cf608'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = th.border; (e.currentTarget as HTMLElement).style.background = th.panel; }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{t.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: th.muted, lineHeight: 1.6,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.message}
                </div>
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#8b5cf6', fontWeight: 700 }}>
                  {copy('✏️ Use this template →', 'Use this template ->')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── NEW BROADCAST FORM ───────────────────────────────────────────── */}
      {showNew && (
        <div style={{ ...th.card, border: `2px solid ${th.accent}` }}>
          <CardHeader th={th} title={copy('➕ New Broadcast', '➕ New Broadcast')}
            action={
              !showTemplates && (
                <button style={{ ...th.btnSmGhost, color: '#8b5cf6', fontSize: 12 }}
                  onClick={() => setShowTemplates(true)}>
                  {copy('📋 Pick Template', '📋 Pick Template')}
                </button>
              )
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FieldWithInfo th={th} label="Title (internal)" helpText={copy('Dashboard এ দেখার জন্য। Customer দেখবে না।', 'For internal dashboard use only. Customers will not see this.')}>
              <input style={th.input} placeholder="Summer Collection Launch"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </FieldWithInfo>

            <FieldWithInfo th={th} label="Target" helpText={copy('কাদের কাছে message পাঠাবেন।', 'Choose who should receive this message.')}>
              <select style={th.input} value={form.targetType}
                onChange={e => setForm(f => ({ ...f, targetType: e.target.value, targetValue: '' }))}>
                {TARGET_OPTS.map(t => (
                  <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                ))}
              </select>
            </FieldWithInfo>

            {form.targetType === 'tag' && (
              <FieldWithInfo th={th} label="Tag" helpText={copy('কোন tag এর customer দের পাঠাবেন।', 'Send this to customers with the selected tag.')}>
                <select style={th.input} value={form.targetValue}
                  onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))}>
                  <option value="">{copy('Tag select করুন...', 'Select a tag...')}</option>
                  {tags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldWithInfo>
            )}

            {form.targetType === 'ordered_before' && (
              <FieldWithInfo th={th} label={copy('তারিখের আগে', 'Before date')} helpText={copy('এই তারিখের আগে order করা customer দের পাঠাবে।', 'It will target customers who ordered before this date.')}>
                <input style={th.input} type="date" value={form.targetValue}
                  onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))} />
              </FieldWithInfo>
            )}

            <FieldWithInfo th={th} label="Message" helpText={copy('Customer যা দেখবে। Emoji ব্যবহার করুন — message আকর্ষণীয় হয়।', 'This is what customers will see. Emojis can help make the message more engaging.')}>
              <textarea style={{ ...th.input, height: 120, resize: 'vertical', lineHeight: 1.7 }}
                placeholder={copy('নতুন কালেকশন এসেছে! 🎉\nদেখতে এখনই message করুন 💖', 'Our new collection is here! 🎉\nMessage us now to explore it 💖')}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              />
            </FieldWithInfo>

            {/* Character count */}
            <div style={{ fontSize: 11.5, color: form.message.length > 640 ? '#ef4444' : th.muted, textAlign: 'right', marginTop: -8 }}>
              {form.message.length} characters
              {form.message.length > 640 && copy(' — Facebook limit এর কাছাকাছি, ছোট করুন', ' - close to Facebook limits, consider shortening it')}
            </div>

            {/* Message preview */}
            {form.message.trim() && (
              <div>
                <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Preview</div>
                <div style={{
                  background: th.accentSoft, border: `1px solid ${th.accent}33`,
                  borderRadius: 14, padding: '12px 16px', fontSize: 13.5, lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', color: th.text, maxWidth: 380,
                }}>
                  {form.message}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={th.btnPrimary} onClick={create}>{copy('💾 Create Broadcast', 'Create Broadcast')}</button>
              <button style={th.btnGhost} onClick={() => setShowNew(false)}>{copy('Cancel', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BROADCAST LIST ────────────────────────────────────────────────── */}
      {loading && !broadcasts.length
        ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22}/></div>
        : broadcasts.length === 0 && !showNew && !showTemplates
        ? (
          <div style={{ ...th.card, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📢</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{copy('কোনো broadcast নেই', 'No broadcasts yet')}</div>
            <div style={{ fontSize: 13, color: th.muted, marginBottom: 20 }}>{copy('Template থেকে শুরু করুন বা নিজে লিখুন', 'Start from a template or write one from scratch')}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button style={{ ...th.btnGhost, color: '#8b5cf6' }} onClick={() => setShowTemplates(true)}>
                {copy('📋 Template দেখুন', 'Browse Templates')}
              </button>
              <button style={th.btnPrimary} onClick={() => setShowNew(true)}>
                {copy('➕ নিজে লিখুন', 'Write Your Own')}
              </button>
            </div>
          </div>
        )
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {broadcasts.map(b => {
              const pct = b.totalTarget > 0 ? Math.round((b.totalSent / b.totalTarget) * 100) : 0;
              return (
                <div key={b.id} style={{ ...th.card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{b.title}</span>
                        <span style={{ ...th.pill, background: `${STATUS_COLORS[b.status]}22`, color: STATUS_COLORS[b.status], border: `1px solid ${STATUS_COLORS[b.status]}44`, fontSize: 10.5 }}>
                          {b.status}
                        </span>
                        <span style={{ ...th.pill, ...th.pillGray, fontSize: 10.5 }}>
                          {TARGET_OPTS.find(t => t.value === b.targetType)?.label || b.targetType}
                        </span>
                      </div>

                      {/* Message preview */}
                      <div style={{ fontSize: 12.5, color: th.muted, marginBottom: 8, lineHeight: 1.6,
                        background: th.surface, borderRadius: 8, padding: '8px 12px',
                        borderLeft: `3px solid ${th.accent}`,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {b.message.length > 120 ? b.message.slice(0, 120) + '…' : b.message}
                      </div>

                      {/* Progress */}
                      {b.status !== 'draft' && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: th.muted }}>Target: <b>{b.totalTarget}</b> · </span>
                          <span style={{ color: '#16a34a' }}>Sent: <b>{b.totalSent}</b> · </span>
                          <span style={{ color: '#ef4444' }}>Failed: <b>{b.totalFailed}</b></span>
                          {b.status === 'completed' && <span style={{ color: th.muted }}> · {pct}% success</span>}
                          {b.totalTarget > 0 && (
                            <div style={{ height: 5, background: th.border, borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#16a34a', borderRadius: 999, transition: 'width .5s' }}/>
                            </div>
                          )}
                        </div>
                      )}

                      {b.createdAt && (
                        <div style={{ fontSize: 11, color: th.muted, marginTop: 6 }}>
                          Created: {new Date(b.createdAt).toLocaleString()}
                          {b.completedAt && ` · Completed: ${new Date(b.completedAt).toLocaleString()}`}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      {b.status === 'draft' && (
                        <>
                          <button style={{ ...th.btnSmAccent, padding: '7px 14px' }}
                            onClick={() => send(b.id)} disabled={sending === b.id}>
                            {sending === b.id ? <Spinner size={11}/> : copy('📤 Send', 'Send')}
                          </button>
                          <button style={th.btnSmDanger} onClick={() => del(b.id)}>{copy('✕ Delete', 'Delete')}</button>
                        </>
                      )}
                      {b.status === 'running' && (
                        <button style={th.btnGhost} onClick={load}><Spinner size={13}/></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
