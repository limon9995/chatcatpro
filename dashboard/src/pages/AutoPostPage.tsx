import { useState, useEffect } from 'react';
import type { Theme } from '../components/ui';
import { Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface AutoPost {
  id: number;
  caption: string;
  imageUrl: string | null;
  postType: string;
  language: string;
  status: string;
  fbPostId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMsg: string | null;
  createdAt: string;
}

const POST_TYPES = [
  { value: 'product', bn: 'প্রোডাক্ট পোস্ট', en: 'Product Post' },
  { value: 'sale',    bn: 'অফার / সেল',       en: 'Sale / Offer' },
  { value: 'announcement', bn: 'ঘোষণা',        en: 'Announcement' },
  { value: 'custom',  bn: 'কাস্টম',            en: 'Custom' },
];

const STATUS_COLOR: Record<string, string> = {
  draft:      '#6b7280',
  scheduled:  '#3b82f6',
  publishing: '#f59e0b',
  published:  '#10b981',
  failed:     '#ef4444',
};

const STATUS_BN: Record<string, string> = {
  draft:      'ড্রাফট',
  scheduled:  'শিডিউলড',
  publishing: 'পোস্ট হচ্ছে...',
  published:  'প্রকাশিত',
  failed:     'ব্যর্থ',
};

export function AutoPostPage({
  th,
  pageId,
  onToast,
}: {
  th: Theme;
  pageId: number;
  onToast: (msg: string, type?: 'error' | 'success' | 'info') => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();

  // Form state
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [offer, setOffer] = useState('');
  const [description, setDescription] = useState('');
  const [postType, setPostType] = useState('product');
  const [language, setLanguage] = useState('bn');
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // Loading states
  const [captionLoading, setCaptionLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [postLoading, setPostLoading] = useState(false);

  // Post history
  const [posts, setPosts] = useState<AutoPost[]>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, [pageId]);

  const loadPosts = async () => {
    setListLoading(true);
    try {
      const data = await request<AutoPost[]>(`${API_BASE}/auto-post/${pageId}`);
      setPosts(data || []);
    } catch {
      setPosts([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleGenerateCaption = async () => {
    if (!productName.trim()) {
      onToast(copy('প্রোডাক্টের নাম দিন', 'Enter product name'), 'error');
      return;
    }
    setCaptionLoading(true);
    try {
      const res = await request<{ caption: string }>(
        `${API_BASE}/auto-post/generate-caption`,
        {
          method: 'POST',
          body: JSON.stringify({ pageId, productName, price, offer, description, postType, language }),
        },
      );
      setCaption(res.caption);
      onToast(copy('ক্যাপশন তৈরি হয়েছে!', 'Caption generated!'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('ক্যাপশন তৈরি করা যায়নি', 'Caption generation failed'), 'error');
    } finally {
      setCaptionLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    const prompt = imagePrompt.trim() || `${productName} ${postType} poster`;
    setImageLoading(true);
    try {
      const res = await request<{ imageUrl: string }>(
        `${API_BASE}/auto-post/generate-image`,
        {
          method: 'POST',
          body: JSON.stringify({ pageId, prompt }),
        },
      );
      setImageUrl(res.imageUrl);
      onToast(copy('পোস্টার তৈরি হয়েছে!', 'Poster generated!'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('পোস্টার তৈরি করা যায়নি', 'Image generation failed'), 'error');
    } finally {
      setImageLoading(false);
    }
  };

  const handlePost = async () => {
    if (!caption.trim()) {
      onToast(copy('ক্যাপশন লিখুন', 'Write a caption'), 'error');
      return;
    }
    if (scheduleMode === 'later' && !scheduledAt) {
      onToast(copy('তারিখ ও সময় বেছে নিন', 'Select schedule date & time'), 'error');
      return;
    }
    setPostLoading(true);
    try {
      await request(`${API_BASE}/auto-post`, {
        method: 'POST',
        body: JSON.stringify({
          pageId,
          caption,
          imageUrl: imageUrl || undefined,
          imagePrompt: imagePrompt || undefined,
          postType,
          language,
          scheduledAt: scheduleMode === 'later' ? scheduledAt : undefined,
        }),
      });
      onToast(
        scheduleMode === 'now'
          ? copy('Facebook এ পোস্ট হয়েছে!', 'Posted to Facebook!')
          : copy('পোস্ট শিডিউল হয়েছে!', 'Post scheduled!'),
        'success',
      );
      // Reset form
      setCaption('');
      setImageUrl('');
      setImagePrompt('');
      setScheduledAt('');
      setScheduleMode('now');
      await loadPosts();
    } catch (e: any) {
      onToast(e.message || copy('পোস্ট করা যায়নি', 'Post failed'), 'error');
    } finally {
      setPostLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(copy('এই পোস্ট মুছে ফেলবেন?', 'Delete this post?'))) return;
    try {
      await request(`${API_BASE}/auto-post/${pageId}/${id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
      onToast(copy('পোস্ট মুছে গেছে', 'Post deleted'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('মুছতে পারিনি', 'Delete failed'), 'error');
    }
  };

  const inp = {
    background: th.inputBg,
    border: `1px solid ${th.border}`,
    borderRadius: 8,
    color: th.text,
    padding: '10px 12px',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const btn = (color: string, disabled?: boolean) => ({
    background: disabled ? th.border : color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  });

  const currentPostTypeLabel = POST_TYPES.find((t) => t.value === postType);

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: th.text, fontSize: 20, fontWeight: 700, margin: 0 }}>
          📲 {copy('Facebook Auto Post', 'Facebook Auto Post')}
        </h2>
        <p style={{ color: th.textMuted, fontSize: 13, marginTop: 4 }}>
          {copy(
            'AI দিয়ে ক্যাপশন ও পোস্টার তৈরি করুন, Facebook পেজে সরাসরি পোস্ট করুন',
            'Generate AI captions & posters, post directly to your Facebook page',
          )}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 20, alignItems: 'start' }}>
        {/* Left: Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Step 1: Content */}
          <div style={{ background: th.card, borderRadius: 12, padding: 18, border: `1px solid ${th.border}` }}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              ① {copy('পোস্টের তথ্য দিন', 'Enter Post Details')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ color: th.textMuted, fontSize: 12, display: 'block', marginBottom: 4 }}>
                  {copy('পোস্টের ধরন', 'Post Type')}
                </label>
                <select value={postType} onChange={(e) => setPostType(e.target.value)} style={{ ...inp }}>
                  {POST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {copy(t.bn, t.en)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ color: th.textMuted, fontSize: 12, display: 'block', marginBottom: 4 }}>
                  {copy('ভাষা', 'Language')}
                </label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inp }}>
                  <option value="bn">বাংলা</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <input
              style={{ ...inp, marginBottom: 10 }}
              placeholder={copy('প্রোডাক্টের নাম *', 'Product name *')}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                style={inp}
                placeholder={copy('মূল্য (যেমন: ৳৮৫০)', 'Price (e.g. ৳850)')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <input
                style={inp}
                placeholder={copy('অফার (যেমন: ৩০% ছাড়)', 'Offer (e.g. 30% off)')}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </div>
            <textarea
              style={{ ...inp, minHeight: 70, resize: 'vertical' }}
              placeholder={copy('বিবরণ (ঐচ্ছিক)', 'Description (optional)')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Step 2: Caption */}
          <div style={{ background: th.card, borderRadius: 12, padding: 18, border: `1px solid ${th.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: th.text, fontWeight: 700, fontSize: 14 }}>
                ② {copy('AI ক্যাপশন', 'AI Caption')}
              </div>
              <button
                style={btn('#6366f1', captionLoading)}
                onClick={handleGenerateCaption}
                disabled={captionLoading}
              >
                {captionLoading ? <Spinner size={14} color="#fff" /> : '🤖'}
                {copy('AI দিয়ে লেখো', 'Generate with AI')}
              </button>
            </div>
            <textarea
              style={{ ...inp, minHeight: 120, resize: 'vertical' }}
              placeholder={copy(
                'এখানে AI ক্যাপশন আসবে, অথবা নিজে লিখুন...',
                'AI caption will appear here, or write your own...',
              )}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div style={{ color: th.textMuted, fontSize: 11, marginTop: 6 }}>
              {copy(
                'Gemini Flash (বিনামূল্যে) বা GPT-4o Mini ব্যবহার করে',
                'Uses Gemini Flash (free) or GPT-4o Mini',
              )}
            </div>
          </div>

          {/* Step 3: Image */}
          <div style={{ background: th.card, borderRadius: 12, padding: 18, border: `1px solid ${th.border}` }}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              ③ {copy('পোস্টার / ছবি', 'Poster / Image')}
            </div>
            <input
              style={{ ...inp, marginBottom: 10 }}
              placeholder={copy(
                'AI পোস্টার prompt (যেমন: red floral dress on white background)',
                'AI image prompt (e.g. red floral dress on white background)',
              )}
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                style={btn('#0ea5e9', imageLoading)}
                onClick={handleGenerateImage}
                disabled={imageLoading}
              >
                {imageLoading ? <Spinner size={14} color="#fff" /> : '🎨'}
                {copy('AI পোস্টার তৈরি', 'Generate AI Poster')}
              </button>
              <div style={{ color: th.textMuted, fontSize: 11, alignSelf: 'center' }}>
                {copy('fal.ai FLUX (~$0.001) বা Ideogram (Bengali text)', 'fal.ai FLUX (~$0.001) or Ideogram')}
              </div>
            </div>
            {imageUrl && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={imageUrl.startsWith('/storage') ? `${API_BASE}${imageUrl}` : imageUrl}
                  alt="Generated poster"
                  style={{ width: '100%', maxWidth: 300, borderRadius: 8, border: `1px solid ${th.border}` }}
                />
                <button
                  onClick={() => setImageUrl('')}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    background: '#ef4444', color: '#fff', border: 'none',
                    borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
                    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            )}
            {!imageUrl && (
              <div style={{
                border: `2px dashed ${th.border}`, borderRadius: 8, padding: 30,
                textAlign: 'center', color: th.textMuted, fontSize: 13,
              }}>
                {copy('ছবি ছাড়াও পোস্ট করা যাবে (শুধু টেক্সট)', 'Can post without image (text only)')}
              </div>
            )}
          </div>

          {/* Step 4: Publish */}
          <div style={{ background: th.card, borderRadius: 12, padding: 18, border: `1px solid ${th.border}` }}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              ④ {copy('পোস্ট করুন', 'Publish')}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              {(['now', 'later'] as const).map((mode) => (
                <label
                  key={mode}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    color: th.text, fontSize: 14,
                  }}
                >
                  <input
                    type="radio"
                    name="scheduleMode"
                    value={mode}
                    checked={scheduleMode === mode}
                    onChange={() => setScheduleMode(mode)}
                  />
                  {mode === 'now'
                    ? copy('এখনই পোস্ট করো', 'Post Now')
                    : copy('পরে শিডিউল করো', 'Schedule for Later')}
                </label>
              ))}
            </div>
            {scheduleMode === 'later' && (
              <input
                type="datetime-local"
                style={{ ...inp, marginBottom: 14 }}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            )}
            <button
              style={{ ...btn('#10b981', postLoading || !caption.trim()), width: '100%', justifyContent: 'center', fontSize: 15 }}
              onClick={handlePost}
              disabled={postLoading || !caption.trim()}
            >
              {postLoading ? <Spinner size={16} color="#fff" /> : '📲'}
              {scheduleMode === 'now'
                ? copy('Facebook এ পোস্ট করো', 'Post to Facebook')
                : copy('শিডিউল করো', 'Schedule Post')}
            </button>
          </div>
        </div>

        {/* Right: Preview + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Preview card */}
          <div style={{ background: th.card, borderRadius: 12, padding: 16, border: `1px solid ${th.border}` }}>
            <div style={{ color: th.textMuted, fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {copy('প্রিভিউ', 'Preview')}
            </div>
            {imageUrl && (
              <img
                src={imageUrl.startsWith('/storage') ? `${API_BASE}${imageUrl}` : imageUrl}
                alt="preview"
                style={{ width: '100%', borderRadius: 8, marginBottom: 10, objectFit: 'cover', maxHeight: 220 }}
              />
            )}
            <div style={{ color: th.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 60 }}>
              {caption || <span style={{ color: th.textMuted }}>{copy('ক্যাপশন এখানে দেখাবে...', 'Caption will appear here...')}</span>}
            </div>
            {postType && (
              <div style={{ marginTop: 10 }}>
                <span style={{
                  background: '#6366f120', color: '#6366f1', borderRadius: 20,
                  padding: '2px 10px', fontSize: 11, fontWeight: 600,
                }}>
                  {copy(currentPostTypeLabel?.bn || '', currentPostTypeLabel?.en || '')}
                </span>
              </div>
            )}
          </div>

          {/* Post History */}
          <div style={{ background: th.card, borderRadius: 12, padding: 16, border: `1px solid ${th.border}` }}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              {copy('পোস্ট হিস্টোরি', 'Post History')}
            </div>
            {listLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
            ) : posts.length === 0 ? (
              <div style={{ color: th.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
                {copy('কোনো পোস্ট নেই', 'No posts yet')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {posts.map((post) => (
                  <div
                    key={post.id}
                    style={{
                      background: th.inputBg, borderRadius: 8, padding: 12,
                      border: `1px solid ${th.border}`, fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        background: `${STATUS_COLOR[post.status]}22`,
                        color: STATUS_COLOR[post.status],
                        borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                      }}>
                        {STATUS_BN[post.status] || post.status}
                      </span>
                      {post.status !== 'publishing' && (
                        <button
                          onClick={() => handleDelete(post.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 0 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div style={{ color: th.text, lineHeight: 1.5, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {post.caption}
                    </div>
                    {post.scheduledAt && post.status === 'scheduled' && (
                      <div style={{ color: th.textMuted, fontSize: 11 }}>
                        ⏰ {new Date(post.scheduledAt).toLocaleString('bn-BD')}
                      </div>
                    )}
                    {post.publishedAt && (
                      <div style={{ color: th.textMuted, fontSize: 11 }}>
                        ✅ {new Date(post.publishedAt).toLocaleString('bn-BD')}
                      </div>
                    )}
                    {post.errorMsg && (
                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                        ⚠️ {post.errorMsg}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
