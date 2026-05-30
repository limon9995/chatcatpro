import { useState, useEffect, useRef } from 'react';
import type { Theme } from '../components/ui';
import { Spinner } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type Product = {
  id: number; code: string; name: string | null;
  price: number; imageUrl: string | null;
  description: string | null; category: string | null;
};

type PerProductState = {
  caption: string; captionLoading: boolean;
  imageMode: 'product' | 'poster';
  posterUrl: string; posterLoading: boolean;
  scheduleMode: 'now' | 'later'; scheduledAt: string;
  postLoading: boolean;
};

const PP_DEFAULT: PerProductState = {
  caption: '', captionLoading: false,
  imageMode: 'product', posterUrl: '', posterLoading: false,
  scheduleMode: 'now', scheduledAt: '', postLoading: false,
};

interface AutoPost {
  id: number;
  caption: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  postType: string;
  language: string;
  status: string;
  fbPostId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMsg: string | null;
  createdAt: string;
}

interface Analytics {
  totalPosts: number;
  publishedCount: number;
  failedCount: number;
  scheduledCount: number;
  successRate: number;
  topPostType: string;
  topPostingHour: number;
  topPostingDay: string;
  aiInsight: string;
}

interface BestTime {
  bestHour: number;
  basedOn: string;
  message: string;
}

const POST_TYPES = [
  { value: 'product',      bn: 'প্রোডাক্ট পোস্ট', en: 'Product Post' },
  { value: 'sale',         bn: 'অফার / সেল',       en: 'Sale / Offer' },
  { value: 'announcement', bn: 'ঘোষণা',             en: 'Announcement' },
  { value: 'custom',       bn: 'কাস্টম',            en: 'Custom' },
];

const STATUS_COLOR: Record<string, string> = {
  draft: '#6b7280', scheduled: '#3b82f6', publishing: '#f59e0b', published: '#10b981', failed: '#ef4444',
};
const STATUS_BN: Record<string, string> = {
  draft: 'ড্রাফট', scheduled: 'শিডিউলড', publishing: 'পোস্ট হচ্ছে...', published: 'প্রকাশিত', failed: 'ব্যর্থ',
};

const POSTER_STYLES = [
  { value: 'minimal',   icon: '🌿', bn: 'মিনিমালিস্ট',  en: 'Minimal',   color: '#10b981' },
  { value: 'vibrant',   icon: '🌈', bn: 'ভাইব্র্যান্ট', en: 'Vibrant',   color: '#8b5cf6' },
  { value: 'dark',      icon: '🖤', bn: 'ডার্ক লাক্সারি', en: 'Dark Luxury', color: '#1f2937' },
  { value: 'festival',  icon: '🎉', bn: 'ফেস্টিভাল',    en: 'Festival',  color: '#f59e0b' },
  { value: 'sale',      icon: '🔥', bn: 'সেল ব্যানার',  en: 'Sale Banner', color: '#ef4444' },
  { value: 'realistic', icon: '📸', bn: 'রিয়েলিস্টিক', en: 'Realistic', color: '#0ea5e9' },
];

const CAPTION_TONES = [
  { value: 'casual',       icon: '😊', bn: 'কেজুয়াল',        en: 'Casual' },
  { value: 'professional', icon: '💼', bn: 'প্রফেশনাল',       en: 'Professional' },
  { value: 'urgent',       icon: '🔥', bn: 'আর্জেন্ট/সেল',   en: 'Urgent' },
  { value: 'story',        icon: '💬', bn: 'গল্পের ছলে',     en: 'Storytelling' },
];

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1', desc: 'Feed' },
  { value: '4:5', label: '4:5', desc: 'Portrait' },
  { value: '9:16', label: '9:16', desc: 'Story' },
];

const TEMPLATES = [
  { icon: '🆕', bn: 'নতুন কালেকশন', en: 'New Collection', postType: 'product', productName: 'নতুন কালেকশন', offer: '', description: 'সম্পূর্ণ নতুন ডিজাইন, লিমিটেড স্টক' },
  { icon: '🎉', bn: 'ঈদ স্পেশাল',   en: 'Eid Special',    postType: 'sale',    productName: 'ঈদ কালেকশন',    offer: '৩০% ছাড়', description: 'ঈদ উপলক্ষে বিশেষ ছাড়' },
  { icon: '⚡', bn: 'ফ্ল্যাশ সেল',  en: 'Flash Sale',     postType: 'sale',    productName: 'সিলেক্টেড আইটেম', offer: '৫০% পর্যন্ত ছাড়', description: 'মাত্র ২৪ ঘণ্টার জন্য' },
  { icon: '📦', bn: 'রিস্টক',        en: 'Back in Stock',  postType: 'announcement', productName: 'পপুলার আইটেম', offer: '', description: 'অনেকদিন পর আবার স্টকে এসেছে' },
  { icon: '🌟', bn: 'বেস্টসেলার',   en: 'Best Seller',    postType: 'product', productName: 'বেস্টসেলার',    offer: '', description: 'আমাদের সবচেয়ে জনপ্রিয় প্রোডাক্ট' },
  { icon: '🚨', bn: 'শেষ কয়টি',    en: 'Last Few Left',  postType: 'announcement', productName: 'লিমিটেড স্টক', offer: '', description: 'মাত্র কয়েকটি বাকি, দ্রুত অর্ডার করুন' },
];

const STYLE_MODIFIERS: Record<string, string> = {
  minimal: 'clean minimal white background, flat lay, soft shadows',
  vibrant: 'vibrant colorful background, bold colors, eye-catching',
  dark: 'dark luxury background, gold accents, premium feel',
  festival: 'festive colorful bokeh background, celebration mood',
  sale: 'bold red and yellow sale banner, discount urgency',
  realistic: 'photorealistic product photography, studio lighting, white background',
};

export function AutoPostPage({
  th, pageId, onToast,
}: {
  th: Theme; pageId: number; onToast: (msg: string, type?: 'error' | 'success' | 'info') => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [productName, setProductName]   = useState('');
  const [price, setPrice]               = useState('');
  const [offer, setOffer]               = useState('');
  const [description, setDescription]   = useState('');
  const [postType, setPostType]         = useState('product');
  const [language, setLanguage]         = useState('bn');

  // Caption state
  const [caption, setCaption]           = useState('');
  const [captionTone, setCaptionTone]   = useState('casual');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [hashtagLoading, setHashtagLoading] = useState(false);

  // Poster state
  const [imageTab, setImageTab]         = useState<'ai' | 'photo' | 'upload'>('ai');
  const [posterStyle, setPosterStyle]   = useState('vibrant');
  const [aspectRatio, setAspectRatio]   = useState('1:1');
  const [imagePrompt, setImagePrompt]   = useState('');
  const [imageUrls, setImageUrls]       = useState<string[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [imageLoading, setImageLoading] = useState(false);

  // Photo-to-poster state
  const [productPhotoUrl, setProductPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading]   = useState(false);
  const [posterLoading, setPosterLoading]     = useState(false);

  // Publish state
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt]   = useState('');
  const [postLoading, setPostLoading]   = useState(false);

  // History state
  const [posts, setPosts]               = useState<AutoPost[]>([]);
  const [listLoading, setListLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [retryingId, setRetryingId]     = useState<number | null>(null);
  const [copiedId, setCopiedId]         = useState<number | null>(null);

  // Analytics state
  const [analytics, setAnalytics]       = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Best time state
  const [bestTime, setBestTime]         = useState<BestTime | null>(null);

  // Products section state
  const [products, setProducts]         = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [perProduct, setPerProduct]     = useState<Record<string, PerProductState>>({});

  const getPP = (code: string): PerProductState => perProduct[code] ?? PP_DEFAULT;
  const setPP = (code: string, patch: Partial<PerProductState>) =>
    setPerProduct(prev => ({ ...prev, [code]: { ...(prev[code] ?? PP_DEFAULT), ...patch } }));

  useEffect(() => { loadPosts(); loadBestTime(); loadProducts(); }, [pageId]);

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const rows = await request<Product[]>(`${API_BASE}/client-dashboard/${pageId}/products`);
      setProducts(rows ?? []);
    } catch { /* silent */ } finally { setProductsLoading(false); }
  };

  const handleExpandProduct = (product: Product) => {
    if (expandedCode === product.code) { setExpandedCode(null); return; }
    if (!getPP(product.code).caption) {
      setPP(product.code, { caption: product.name ? `${product.name} — মাত্র ৳${product.price}` : '' });
    }
    setExpandedCode(product.code);
  };

  const generateCaptionFor = async (product: Product) => {
    setPP(product.code, { captionLoading: true });
    try {
      const res = await request<{ caption: string }>(`${API_BASE}/auto-post/generate-caption`, {
        method: 'POST',
        body: JSON.stringify({ pageId, postType: 'product', language: 'bn', tone: 'casual', productName: product.name, price: String(product.price) }),
      });
      setPP(product.code, { caption: res.caption, captionLoading: false });
      onToast('ক্যাপশন তৈরি হয়েছে!', 'success');
    } catch (e: any) {
      onToast(e.message || 'ক্যাপশন তৈরি হয়নি', 'error');
      setPP(product.code, { captionLoading: false });
    }
  };

  const generatePosterFor = async (product: Product) => {
    if (!product.imageUrl) { onToast('এই product-এ image নেই', 'error'); return; }
    setPP(product.code, { posterLoading: true });
    try {
      const res = await request<{ imageUrls: string[] }>(`${API_BASE}/auto-post/poster-from-photo`, {
        method: 'POST',
        body: JSON.stringify({ pageId, productPhotoUrl: product.imageUrl, productName: product.name, price: String(product.price), offer: '', style: 'vibrant', aspectRatio: '1:1' }),
      });
      const url = res.imageUrls?.[0] ?? '';
      setPP(product.code, { posterUrl: url, posterLoading: false, imageMode: 'poster' });
      onToast('AI Poster তৈরি হয়েছে!', 'success');
    } catch (e: any) {
      onToast(e.message || 'Poster তৈরি হয়নি', 'error');
      setPP(product.code, { posterLoading: false });
    }
  };

  const postFor = async (product: Product) => {
    const pp = getPP(product.code);
    if (!pp.caption.trim()) { onToast('ক্যাপশন লিখুন', 'error'); return; }
    if (pp.scheduleMode === 'later' && !pp.scheduledAt) { onToast('তারিখ ও সময় দিন', 'error'); return; }
    setPP(product.code, { postLoading: true });
    try {
      const imageUrl = pp.imageMode === 'poster' ? pp.posterUrl : (product.imageUrl || undefined);
      await request(`${API_BASE}/auto-post`, {
        method: 'POST',
        body: JSON.stringify({ pageId, caption: pp.caption, imageUrl, postType: 'product', language: 'bn', scheduledAt: pp.scheduleMode === 'later' ? pp.scheduledAt : undefined }),
      });
      setPP(product.code, { ...PP_DEFAULT });
      setExpandedCode(null);
      await loadPosts();
      onToast(pp.scheduleMode === 'now' ? '🚀 Facebook এ post হয়েছে!' : '📅 Post scheduled!', 'success');
    } catch (e: any) {
      onToast(e.message || 'Post ব্যর্থ হয়েছে', 'error');
      setPP(product.code, { postLoading: false });
    }
  };

  const loadPosts = async () => {
    setListLoading(true);
    try {
      const data = await request<AutoPost[]>(`${API_BASE}/auto-post/${pageId}`);
      setPosts(data || []);
    } catch { setPosts([]); }
    finally { setListLoading(false); }
  };

  const loadBestTime = async () => {
    try {
      const data = await request<BestTime>(`${API_BASE}/auto-post/${pageId}/best-time`);
      setBestTime(data);
    } catch { /* silent */ }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await request<Analytics>(`${API_BASE}/auto-post/${pageId}/analytics`);
      setAnalytics(data);
      setShowAnalytics(true);
    } catch (e: any) {
      onToast(e.message || 'Analytics load হয়নি', 'error');
    } finally { setAnalyticsLoading(false); }
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setPostType(t.postType);
    setProductName(t.productName);
    setOffer(t.offer);
    setDescription(t.description);
    onToast(copy('টেমপ্লেট প্রয়োগ হয়েছে', 'Template applied'), 'info');
  };

  const buildAutoPrompt = () => {
    if (!productName.trim()) { onToast(copy('আগে প্রোডাক্টের নাম দিন', 'Enter product name first'), 'error'); return; }
    const styleHint = STYLE_MODIFIERS[posterStyle] || '';
    const typeHint = postType === 'sale' ? 'sale offer banner' : postType === 'announcement' ? 'announcement poster' : 'product promotional poster';
    const prompt = `${productName}${price ? `, price ${price}` : ''}${offer ? `, ${offer}` : ''}, ${typeHint}, ${styleHint}, Bangladesh e-commerce`;
    setImagePrompt(prompt);
    onToast(copy('Prompt তৈরি হয়েছে', 'Prompt built'), 'info');
  };

  const handleGenerateCaption = async () => {
    if (!productName.trim()) { onToast(copy('প্রোডাক্টের নাম দিন', 'Enter product name'), 'error'); return; }
    setCaptionLoading(true);
    try {
      const res = await request<{ caption: string }>(`${API_BASE}/auto-post/generate-caption`, {
        method: 'POST',
        body: JSON.stringify({ pageId, productName, price, offer, description, postType, language, tone: captionTone }),
      });
      setCaption(res.caption);
      onToast(copy('ক্যাপশন তৈরি হয়েছে!', 'Caption generated!'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('ক্যাপশন তৈরি হয়নি', 'Caption generation failed'), 'error');
    } finally { setCaptionLoading(false); }
  };

  const handleGenerateHashtags = async () => {
    if (!productName.trim()) { onToast(copy('প্রোডাক্টের নাম দিন', 'Enter product name'), 'error'); return; }
    setHashtagLoading(true);
    try {
      const res = await request<{ hashtags: string }>(`${API_BASE}/auto-post/generate-hashtags`, {
        method: 'POST',
        body: JSON.stringify({ pageId, productName, postType, language }),
      });
      setCaption((prev) => prev ? `${prev}\n\n${res.hashtags}` : res.hashtags);
      onToast(copy('হ্যাশট্যাগ যোগ হয়েছে!', 'Hashtags added!'), 'success');
    } catch (e: any) {
      onToast(e.message || 'Hashtag তৈরি হয়নি', 'error');
    } finally { setHashtagLoading(false); }
  };

  const handleGenerateImage = async () => {
    const prompt = imagePrompt.trim() || `${productName} ${postType} poster`;
    setImageLoading(true);
    setImageUrls([]);
    setSelectedImageUrl('');
    try {
      const res = await request<{ imageUrls: string[] }>(`${API_BASE}/auto-post/generate-image`, {
        method: 'POST',
        body: JSON.stringify({ pageId, prompt, style: posterStyle, aspectRatio, count: 2 }),
      });
      const urls = res.imageUrls || [];
      setImageUrls(urls);
      setSelectedImageUrl(urls[0] || '');
      onToast(copy('পোস্টার তৈরি হয়েছে!', 'Poster generated!'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('পোস্টার তৈরি হয়নি', 'Image generation failed'), 'error');
    } finally { setImageLoading(false); }
  };

  const handleProductPhotoUpload = async (file: File) => {
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pageId', String(pageId));
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch(`${API_BASE}/auto-post/upload-product-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: { imageUrl: string } = await res.json();
      setProductPhotoUrl(data.imageUrl);
      onToast(copy('ছবি আপলোড হয়েছে', 'Photo uploaded'), 'success');
    } catch (e: any) {
      onToast(e.message || 'Upload ব্যর্থ', 'error');
    } finally { setPhotoUploading(false); }
  };

  const handlePosterFromPhoto = async () => {
    if (!productPhotoUrl) { onToast(copy('আগে ছবি আপলোড করুন', 'Upload photo first'), 'error'); return; }
    if (!productName.trim()) { onToast(copy('প্রোডাক্টের নাম দিন', 'Enter product name'), 'error'); return; }
    setPosterLoading(true);
    setImageUrls([]);
    setSelectedImageUrl('');
    try {
      const res = await request<{ imageUrls: string[] }>(`${API_BASE}/auto-post/poster-from-photo`, {
        method: 'POST',
        body: JSON.stringify({ pageId, productPhotoUrl, productName, price, offer, style: posterStyle, aspectRatio }),
      });
      const urls = res.imageUrls || [];
      setImageUrls(urls);
      setSelectedImageUrl(urls[0] || '');
      onToast(copy('পোস্টার তৈরি হয়েছে!', 'Poster created!'), 'success');
    } catch (e: any) {
      onToast(e.message || copy('পোস্টার তৈরি হয়নি', 'Poster creation failed'), 'error');
    } finally { setPosterLoading(false); }
  };

  const handleDirectUpload = async (file: File) => {
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pageId', String(pageId));
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch(`${API_BASE}/auto-post/upload-product-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: { imageUrl: string } = await res.json();
      setSelectedImageUrl(data.imageUrl);
      setImageUrls([data.imageUrl]);
      onToast(copy('ছবি আপলোড হয়েছে', 'Image uploaded'), 'success');
    } catch (e: any) {
      onToast(e.message || 'Upload ব্যর্থ', 'error');
    } finally { setPhotoUploading(false); }
  };

  const applyBestTime = () => {
    if (!bestTime) return;
    const now = new Date();
    now.setHours(bestTime.bestHour, 0, 0, 0);
    if (now <= new Date()) now.setDate(now.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
    setScheduledAt(formatted);
    setScheduleMode('later');
    onToast(copy('সেরা সময় সেট হয়েছে', 'Best time applied'), 'success');
  };

  const handlePost = async () => {
    if (!caption.trim()) { onToast(copy('ক্যাপশন লিখুন', 'Write a caption'), 'error'); return; }
    if (scheduleMode === 'later' && !scheduledAt) { onToast(copy('তারিখ ও সময় দিন', 'Select date & time'), 'error'); return; }
    setPostLoading(true);
    try {
      await request(`${API_BASE}/auto-post`, {
        method: 'POST',
        body: JSON.stringify({
          pageId, caption,
          imageUrl: selectedImageUrl || undefined,
          imagePrompt: imagePrompt || undefined,
          postType, language,
          scheduledAt: scheduleMode === 'later' ? scheduledAt : undefined,
        }),
      });
      onToast(scheduleMode === 'now' ? copy('Facebook এ পোস্ট হয়েছে!', 'Posted to Facebook!') : copy('পোস্ট শিডিউল হয়েছে!', 'Post scheduled!'), 'success');
      setCaption(''); setSelectedImageUrl(''); setImageUrls([]); setImagePrompt('');
      setScheduledAt(''); setScheduleMode('now'); setProductName(''); setPrice(''); setOffer(''); setDescription('');
      setProductPhotoUrl('');
      await loadPosts();
    } catch (e: any) {
      onToast(e.message || copy('পোস্ট করা যায়নি', 'Post failed'), 'error');
    } finally { setPostLoading(false); }
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

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      const updated = await request<AutoPost>(`${API_BASE}/auto-post/${pageId}/${id}/retry`, { method: 'POST' });
      setPosts((prev) => prev.map((p) => p.id === id ? updated : p));
      onToast(copy('পোস্ট হয়েছে!', 'Posted!'), 'success');
    } catch (e: any) {
      onToast(e.message || 'Retry ব্যর্থ', 'error');
      await loadPosts();
    } finally { setRetryingId(null); }
  };

  const handleClone = (post: AutoPost) => {
    setCaption(post.caption);
    setSelectedImageUrl(post.imageUrl || '');
    setImageUrls(post.imageUrl ? [post.imageUrl] : []);
    setImagePrompt(post.imagePrompt || '');
    setPostType(post.postType);
    setLanguage(post.language);
    setScheduleMode('now'); setScheduledAt('');
    onToast(copy('পোস্ট ক্লোন হয়েছে', 'Post cloned'), 'info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopyCaption = (post: AutoPost) => {
    navigator.clipboard.writeText(post.caption).then(() => {
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const fbPostUrl = (fbPostId: string) => `https://www.facebook.com/${fbPostId.replace('_', '/posts/')}`;
  const resolveUrl = (url: string) => url.startsWith('/storage') ? `${API_BASE}${url}` : url;

  const inp: React.CSSProperties = { ...th.input, width: '100%', fontSize: 14 };
  const card: React.CSSProperties = { background: th.panel, borderRadius: 12, padding: 18, border: `1px solid ${th.border}` };

  const btn = (color: string, disabled?: boolean): React.CSSProperties => ({
    background: disabled ? th.border : color, color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  const smBtn = (color: string, disabled?: boolean): React.CSSProperties => ({
    background: disabled ? th.border : color, color: '#fff', border: 'none', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4,
  });

  const filteredPosts = statusFilter === 'all' ? posts : posts.filter((p) => p.status === statusFilter);
  const statusCounts = {
    all: posts.length,
    published: posts.filter((p) => p.status === 'published').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    failed: posts.filter((p) => p.status === 'failed').length,
  };
  const captionLen = caption.length;

  return (
    <div style={{ padding: '20px 16px', maxWidth: 980, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ color: th.text, fontSize: 20, fontWeight: 700, margin: 0 }}>
          📲 {copy('Facebook Auto Post', 'Facebook Auto Post')}
        </h2>
        <p style={{ color: th.muted, fontSize: 13, marginTop: 4 }}>
          {copy('AI দিয়ে ক্যাপশন ও পোস্টার তৈরি করুন, Facebook পেজে সরাসরি পোস্ট করুন',
                'Generate AI captions & posters, post directly to your Facebook page')}
        </p>
      </div>

      {/* ── Products Section ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ color: th.muted, fontSize: 11, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          🛍️ তোমার Products — এখানে থেকে সরাসরি post করো
        </div>

        {productsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: th.muted, fontSize: 13 }}>
            <Spinner size={14} /> লোড হচ্ছে...
          </div>
        ) : products.length === 0 ? (
          <p style={{ color: th.muted, fontSize: 13, margin: 0 }}>কোনো product নেই। আগে Products page থেকে product add করো।</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.map((product) => {
              const pp = getPP(product.code);
              const isExpanded = expandedCode === product.code;
              const imgSrc = product.imageUrl?.startsWith('/storage') ? `${API_BASE}${product.imageUrl}` : product.imageUrl;
              return (
                <div key={product.code} style={{
                  border: `1.5px solid ${isExpanded ? th.accent : th.border}`,
                  borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
                }}>
                  {/* Collapsed row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: isExpanded ? (th.surface) : 'transparent', cursor: 'pointer',
                  }} onClick={() => handleExpandProduct(product)}>
                    {imgSrc ? (
                      <img src={imgSrc} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: th.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: th.text, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {product.name || product.code}
                      </div>
                      <div style={{ color: th.muted, fontSize: 12 }}>৳{product.price}</div>
                    </div>
                    <button style={{
                      background: isExpanded ? th.border : th.accent, color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    }}>
                      {isExpanded ? '✕ বন্ধ করো' : '✍️ Post করো'}
                    </button>
                  </div>

                  {/* Expanded post builder */}
                  {isExpanded && (
                    <div style={{ padding: '14px 14px 16px', borderTop: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Caption */}
                      <div>
                        <label style={{ color: th.muted, fontSize: 12, display: 'block', marginBottom: 6, fontWeight: 600 }}>✏️ Caption</label>
                        <textarea
                          value={pp.caption}
                          onChange={e => setPP(product.code, { caption: e.target.value })}
                          rows={3}
                          style={{ ...inp, resize: 'vertical', minHeight: 80 }}
                          placeholder="Caption লিখো অথবা AI দিয়ে তৈরি করো..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <span style={{ color: th.muted, fontSize: 11 }}>{pp.caption.length} অক্ষর</span>
                          <button
                            onClick={() => generateCaptionFor(product)}
                            disabled={pp.captionLoading}
                            style={smBtn('#8b5cf6', pp.captionLoading)}
                          >
                            {pp.captionLoading ? <><Spinner size={10} /> তৈরি হচ্ছে...</> : '🤖 AI Caption'}
                          </button>
                        </div>
                      </div>

                      {/* Image mode */}
                      <div>
                        <label style={{ color: th.muted, fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600 }}>🖼️ ছবি</label>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <button
                            onClick={() => setPP(product.code, { imageMode: 'product' })}
                            style={{
                              border: `1.5px solid ${pp.imageMode === 'product' ? th.accent : th.border}`,
                              background: pp.imageMode === 'product' ? th.surface : 'transparent',
                              borderRadius: 7, padding: '6px 12px', fontSize: 12, color: th.text, cursor: 'pointer', fontWeight: pp.imageMode === 'product' ? 600 : 400,
                            }}>
                            📷 Product-এর ছবি ব্যবহার করো
                          </button>
                          <button
                            onClick={() => setPP(product.code, { imageMode: 'poster' })}
                            style={{
                              border: `1.5px solid ${pp.imageMode === 'poster' ? th.accent : th.border}`,
                              background: pp.imageMode === 'poster' ? th.surface : 'transparent',
                              borderRadius: 7, padding: '6px 12px', fontSize: 12, color: th.text, cursor: 'pointer', fontWeight: pp.imageMode === 'poster' ? 600 : 400,
                            }}>
                            ✨ AI Poster
                          </button>
                        </div>

                        {pp.imageMode === 'product' && imgSrc && (
                          <img src={imgSrc} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `2px solid ${th.accent}` }} />
                        )}
                        {pp.imageMode === 'product' && !imgSrc && (
                          <p style={{ color: th.muted, fontSize: 12, margin: 0 }}>এই product-এ ছবি নেই।</p>
                        )}

                        {pp.imageMode === 'poster' && (
                          <div>
                            <button
                              onClick={() => generatePosterFor(product)}
                              disabled={pp.posterLoading || !product.imageUrl}
                              style={smBtn('#f59e0b', pp.posterLoading || !product.imageUrl)}
                            >
                              {pp.posterLoading ? <><Spinner size={10} /> Poster তৈরি হচ্ছে...</> : '✨ AI Poster বানাও'}
                            </button>
                            {!product.imageUrl && <span style={{ color: th.muted, fontSize: 11, marginLeft: 8 }}>product-এ ছবি নেই</span>}
                            {pp.posterUrl && (
                              <img src={pp.posterUrl.startsWith('/storage') ? `${API_BASE}${pp.posterUrl}` : pp.posterUrl}
                                alt="poster" style={{ display: 'block', marginTop: 10, maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: `2px solid ${th.accent}` }} />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Publish */}
                      <div>
                        <label style={{ color: th.muted, fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600 }}>📤 Post করো</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            onClick={() => { setPP(product.code, { scheduleMode: 'now' }); postFor(product); }}
                            disabled={pp.postLoading || !pp.caption.trim()}
                            style={btn('#10b981', pp.postLoading || !pp.caption.trim())}
                          >
                            {pp.postLoading && pp.scheduleMode === 'now' ? <><Spinner size={12} /> পোস্ট হচ্ছে...</> : '🚀 এখনই Post করো'}
                          </button>
                          <button
                            onClick={() => setPP(product.code, { scheduleMode: pp.scheduleMode === 'later' ? 'now' : 'later' })}
                            style={{ border: `1.5px solid ${th.border}`, background: 'transparent', borderRadius: 8, padding: '9px 14px', fontSize: 13, color: th.text, cursor: 'pointer' }}
                          >
                            🕐 Schedule
                          </button>
                        </div>
                        {pp.scheduleMode === 'later' && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                            <input
                              type="datetime-local"
                              value={pp.scheduledAt}
                              onChange={e => setPP(product.code, { scheduledAt: e.target.value })}
                              style={{ ...inp, width: 'auto', flex: 1 }}
                            />
                            <button
                              onClick={() => postFor(product)}
                              disabled={pp.postLoading || !pp.caption.trim() || !pp.scheduledAt}
                              style={btn('#3b82f6', pp.postLoading || !pp.caption.trim() || !pp.scheduledAt)}
                            >
                              {pp.postLoading ? <><Spinner size={12} /> শিডিউল হচ্ছে...</> : '📅 শিডিউল করো'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Templates */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ color: th.muted, fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          ⚡ {copy('দ্রুত শুরু করুন', 'Quick Start')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TEMPLATES.map((t) => (
            <button key={t.bn} onClick={() => applyTemplate(t)} style={{
              background: th.surface, border: `1px solid ${th.border}`, borderRadius: 20,
              padding: '5px 14px', fontSize: 12, color: th.text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500,
            }}>
              {t.icon} {copy(t.bn, t.en)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 20, alignItems: 'start' }}>

        {/* ── Left ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ① Post Details */}
          <div style={card}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              ① {copy('পোস্টের তথ্য দিন', 'Post Details')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ color: th.muted, fontSize: 12, display: 'block', marginBottom: 4 }}>{copy('পোস্টের ধরন', 'Post Type')}</label>
                <select value={postType} onChange={(e) => setPostType(e.target.value)} style={inp}>
                  {POST_TYPES.map((t) => <option key={t.value} value={t.value}>{copy(t.bn, t.en)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: th.muted, fontSize: 12, display: 'block', marginBottom: 4 }}>{copy('ভাষা', 'Language')}</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inp}>
                  <option value="bn">বাংলা</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <input style={{ ...inp, marginBottom: 10 }} placeholder={copy('প্রোডাক্টের নাম *', 'Product name *')} value={productName} onChange={(e) => setProductName(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input style={inp} placeholder={copy('মূল্য (৳৮৫০)', 'Price (৳850)')} value={price} onChange={(e) => setPrice(e.target.value)} />
              <input style={inp} placeholder={copy('অফার (৩০% ছাড়)', 'Offer (30% off)')} value={offer} onChange={(e) => setOffer(e.target.value)} />
            </div>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} placeholder={copy('বিবরণ (ঐচ্ছিক)', 'Description (optional)')} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* ② AI Caption */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ color: th.text, fontWeight: 700, fontSize: 14 }}>
                ② {copy('AI ক্যাপশন', 'AI Caption')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={smBtn('#8b5cf6', hashtagLoading)} onClick={handleGenerateHashtags} disabled={hashtagLoading}>
                  {hashtagLoading ? <Spinner size={10} color="#fff" /> : '🏷️'}
                  {copy('Hashtag', 'Hashtag')}
                </button>
                <button style={btn('#6366f1', captionLoading)} onClick={handleGenerateCaption} disabled={captionLoading}>
                  {captionLoading ? <Spinner size={14} color="#fff" /> : '🤖'}
                  {copy('AI লেখো', 'Generate')}
                </button>
              </div>
            </div>

            {/* Tone selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {CAPTION_TONES.map((t) => (
                <button key={t.value} onClick={() => setCaptionTone(t.value)} style={{
                  background: captionTone === t.value ? '#6366f122' : 'transparent',
                  color: captionTone === t.value ? '#6366f1' : th.muted,
                  border: `1px solid ${captionTone === t.value ? '#6366f1' : th.border}`,
                  borderRadius: 16, padding: '3px 10px', fontSize: 11,
                  fontWeight: captionTone === t.value ? 700 : 400, cursor: 'pointer',
                }}>
                  {t.icon} {copy(t.bn, t.en)}
                </button>
              ))}
            </div>

            <textarea
              style={{ ...inp, minHeight: 120, resize: 'vertical', borderColor: captionLen > 500 ? '#f59e0b' : undefined }}
              placeholder={copy('এখানে AI ক্যাপশন আসবে, অথবা নিজে লিখুন...', 'AI caption will appear here, or type your own...')}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ color: th.muted, fontSize: 11 }}>{copy('Gemini Flash বা GPT-4o Mini', 'Gemini Flash or GPT-4o Mini')}</div>
              <div style={{ fontSize: 11, color: captionLen > 500 ? '#f59e0b' : th.muted, fontWeight: captionLen > 500 ? 600 : 400 }}>
                {captionLen} {copy('অক্ষর', 'chars')}{captionLen > 500 ? ` ⚠️` : ''}
              </div>
            </div>
          </div>

          {/* ③ Poster / Image */}
          <div style={card}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              ③ {copy('পোস্টার / ছবি', 'Poster / Image')}
            </div>

            {/* Image source tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: `1px solid ${th.border}` }}>
              {([['ai', '🤖 AI তৈরি', 'AI Generate'], ['photo', '📷 ছবি থেকে Poster', 'Photo→Poster'], ['upload', '🖼️ শুধু Upload', 'Just Upload']] as const).map(([tab, bn, en]) => (
                <button key={tab} onClick={() => setImageTab(tab)} style={{
                  flex: 1, background: imageTab === tab ? '#0ea5e9' : th.surface,
                  color: imageTab === tab ? '#fff' : th.muted, border: 'none',
                  padding: '8px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  {copy(bn, en)}
                </button>
              ))}
            </div>

            {/* Style picker (shared across tabs) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: th.muted, fontSize: 11, marginBottom: 6 }}>{copy('পোস্টার স্টাইল', 'Poster Style')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {POSTER_STYLES.map((s) => (
                  <button key={s.value} onClick={() => setPosterStyle(s.value)} style={{
                    background: posterStyle === s.value ? `${s.color}22` : th.surface,
                    color: posterStyle === s.value ? s.color : th.muted,
                    border: `1.5px solid ${posterStyle === s.value ? s.color : th.border}`,
                    borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: posterStyle === s.value ? 700 : 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {s.icon} {copy(s.bn, s.en)}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect ratio */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: th.muted, fontSize: 11, marginBottom: 6 }}>{copy('সাইজ / অ্যাসপেক্ট রেশিও', 'Size / Aspect Ratio')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {ASPECT_RATIOS.map((ar) => (
                  <button key={ar.value} onClick={() => setAspectRatio(ar.value)} style={{
                    background: aspectRatio === ar.value ? '#6366f122' : th.surface,
                    color: aspectRatio === ar.value ? '#6366f1' : th.muted,
                    border: `1.5px solid ${aspectRatio === ar.value ? '#6366f1' : th.border}`,
                    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                  }}>
                    <span>{ar.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 400 }}>{ar.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {imageTab === 'ai' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    style={{ ...inp, flex: 1 }}
                    placeholder={copy('AI image prompt (যেমন: red floral dress on white)', 'AI image prompt (e.g. red floral dress on white)')}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                  />
                  <button onClick={buildAutoPrompt} style={smBtn('#f59e0b')} title={copy('Auto prompt তৈরি করো', 'Build prompt automatically')}>
                    ✨ Auto
                  </button>
                </div>
                <button style={btn('#0ea5e9', imageLoading)} onClick={handleGenerateImage} disabled={imageLoading}>
                  {imageLoading ? <Spinner size={14} color="#fff" /> : '🎨'}
                  {copy('AI পোস্টার তৈরি (২টি variation)', 'Generate AI Poster (2 variants)')}
                </button>
                <div style={{ color: th.muted, fontSize: 11, marginTop: 6 }}>
                  {copy('fal.ai FLUX — ২টি variation থেকে বেছে নিন', 'fal.ai FLUX — pick from 2 variations')}
                </div>
              </div>
            )}

            {imageTab === 'photo' && (
              <div>
                <div style={{ color: th.muted, fontSize: 12, marginBottom: 8 }}>
                  {copy('নিজের product photo দিন → AI দিয়ে professional poster বানাবে', 'Upload your product photo → AI creates a professional poster')}
                </div>
                {productPhotoUrl ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <img src={resolveUrl(productPhotoUrl)} alt="product" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: `1px solid ${th.border}` }} />
                      <div>
                        <div style={{ color: '#10b981', fontSize: 12, marginBottom: 4 }}>✓ {copy('ছবি আপলোড হয়েছে', 'Photo uploaded')}</div>
                        <button onClick={() => setProductPhotoUrl('')} style={smBtn('#ef4444')}>{copy('পরিবর্তন করুন', 'Change')}</button>
                      </div>
                    </div>
                    <button style={btn('#8b5cf6', posterLoading)} onClick={handlePosterFromPhoto} disabled={posterLoading}>
                      {posterLoading ? <Spinner size={14} color="#fff" /> : '✨'}
                      {copy('Poster তৈরি করো', 'Create Poster')}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleProductPhotoUpload(f); }; i.click(); }}
                    style={{ border: `2px dashed ${th.border}`, borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', color: th.muted, fontSize: 13 }}
                  >
                    {photoUploading ? <Spinner size={20} /> : (
                      <>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                        {copy('Product photo ক্লিক করে আপলোড করুন', 'Click to upload product photo')}
                        <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG — max 5MB</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {imageTab === 'upload' && (
              <div
                onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDirectUpload(f); }; i.click(); }}
                style={{ border: `2px dashed ${th.border}`, borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', color: th.muted, fontSize: 13 }}
              >
                {photoUploading ? <Spinner size={20} /> : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                    {copy('নিজের ছবি আপলোড করুন (AI ছাড়া)', 'Upload your own image (no AI)')}
                    <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG — directly use in post</div>
                  </>
                )}
              </div>
            )}

            {/* Variation picker */}
            {imageUrls.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: th.muted, fontSize: 11, marginBottom: 8 }}>
                  {imageUrls.length > 1 ? copy('একটি পোস্টার বেছে নিন:', 'Pick a poster:') : copy('তৈরি পোস্টার:', 'Generated poster:')}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {imageUrls.map((url) => (
                    <div key={url} onClick={() => setSelectedImageUrl(url)} style={{
                      position: 'relative', cursor: 'pointer', borderRadius: 8,
                      border: `3px solid ${selectedImageUrl === url ? '#10b981' : th.border}`,
                      overflow: 'hidden', flex: 1,
                    }}>
                      <img src={resolveUrl(url)} alt="" style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover' }} />
                      {selectedImageUrl === url && (
                        <div style={{ position: 'absolute', top: 6, right: 6, background: '#10b981', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13 }}>✓</div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setImageUrls([]); setSelectedImageUrl(''); }} style={{ ...smBtn('#6b7280'), marginTop: 8 }}>
                  {copy('ছবি সরাও', 'Remove image')}
                </button>
              </div>
            )}

            {imageUrls.length === 0 && !selectedImageUrl && imageTab !== 'photo' && (
              <div style={{ border: `2px dashed ${th.border}`, borderRadius: 8, padding: 16, textAlign: 'center', color: th.muted, fontSize: 12, marginTop: 10 }}>
                {copy('ছবি ছাড়াও পোস্ট করা যাবে (শুধু টেক্সট)', 'Can post without image (text only)')}
              </div>
            )}
          </div>

          {/* ④ Publish */}
          <div style={card}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              ④ {copy('পোস্ট করুন', 'Publish')}
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
              {(['now', 'later'] as const).map((mode) => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: th.text, fontSize: 14 }}>
                  <input type="radio" name="scheduleMode" value={mode} checked={scheduleMode === mode} onChange={() => setScheduleMode(mode)} />
                  {mode === 'now' ? copy('এখনই পোস্ট করো', 'Post Now') : copy('পরে শিডিউল করো', 'Schedule for Later')}
                </label>
              ))}
            </div>
            {scheduleMode === 'later' && (
              <div style={{ marginBottom: 14 }}>
                <input type="datetime-local" style={{ ...inp, marginBottom: 8 }} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                {bestTime && (
                  <div style={{ background: `${th.surface}`, borderRadius: 8, padding: '8px 12px', border: `1px solid ${th.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: th.text, fontSize: 12, fontWeight: 600 }}>
                        💡 {bestTime.message}
                      </div>
                      <div style={{ color: th.muted, fontSize: 11 }}>
                        {bestTime.basedOn === 'history' ? copy('আপনার পোস্ট ইতিহাস অনুযায়ী', 'Based on your post history') : copy('বাংলাদেশের সেরা সময়', 'Bangladesh best practice')}
                      </div>
                    </div>
                    <button onClick={applyBestTime} style={smBtn('#10b981')}>
                      {copy('ব্যবহার করুন', 'Use this')}
                    </button>
                  </div>
                )}
                <div style={{ color: th.muted, fontSize: 11, marginTop: 6 }}>
                  ⏰ {copy('প্রতি ৫ মিনিটে স্বয়ংক্রিয়ভাবে পোস্ট হবে', 'Auto-publishes every 5 minutes via scheduler')}
                </div>
              </div>
            )}
            <button
              style={{ ...btn('#10b981', postLoading || !caption.trim()), width: '100%', justifyContent: 'center', fontSize: 15 }}
              onClick={handlePost}
              disabled={postLoading || !caption.trim()}
            >
              {postLoading ? <Spinner size={16} color="#fff" /> : '📲'}
              {scheduleMode === 'now' ? copy('Facebook এ পোস্ট করো', 'Post to Facebook') : copy('শিডিউল করো', 'Schedule Post')}
            </button>
          </div>
        </div>

        {/* ── Right: Preview + Analytics + History ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Preview */}
          <div style={card}>
            <div style={{ color: th.muted, fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {copy('প্রিভিউ', 'Preview')}
            </div>
            {selectedImageUrl && (
              <img src={resolveUrl(selectedImageUrl)} alt="preview" style={{ width: '100%', borderRadius: 8, marginBottom: 10, objectFit: 'cover', maxHeight: 200 }} />
            )}
            <div style={{ color: th.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 60 }}>
              {caption || <span style={{ color: th.muted }}>{copy('ক্যাপশন এখানে দেখাবে...', 'Caption will appear here...')}</span>}
            </div>
            {postType && (
              <div style={{ marginTop: 10 }}>
                <span style={{ background: '#6366f120', color: '#6366f1', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                  {copy(POST_TYPES.find((t) => t.value === postType)?.bn || postType, POST_TYPES.find((t) => t.value === postType)?.en || postType)}
                </span>
              </div>
            )}
          </div>

          {/* AI Analytics */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAnalytics && analytics ? 12 : 0 }}>
              <div style={{ color: th.text, fontWeight: 700, fontSize: 14 }}>
                📊 {copy('AI বিশ্লেষণ', 'AI Analytics')}
              </div>
              <button onClick={showAnalytics ? () => setShowAnalytics(false) : loadAnalytics} style={smBtn('#8b5cf6', analyticsLoading)}>
                {analyticsLoading ? <Spinner size={10} color="#fff" /> : showAnalytics ? copy('বন্ধ করুন', 'Hide') : copy('দেখুন', 'View')}
              </button>
            </div>

            {showAnalytics && analytics && (
              <div>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: copy('মোট পোস্ট', 'Total'), value: analytics.totalPosts, color: '#6366f1' },
                    { label: copy('সফলতার হার', 'Success Rate'), value: `${analytics.successRate}%`, color: '#10b981' },
                    { label: copy('প্রকাশিত', 'Published'), value: analytics.publishedCount, color: '#10b981' },
                    { label: copy('ব্যর্থ', 'Failed'), value: analytics.failedCount, color: '#ef4444' },
                  ].map((s) => (
                    <div key={s.label} style={{ background: th.surface, borderRadius: 8, padding: '8px 12px', border: `1px solid ${th.border}`, textAlign: 'center' }}>
                      <div style={{ color: s.color, fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                      <div style={{ color: th.muted, fontSize: 11 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: th.surface, borderRadius: 8, padding: '8px 12px', border: `1px solid ${th.border}`, marginBottom: 10, fontSize: 12 }}>
                  <div style={{ color: th.muted, marginBottom: 2 }}>
                    🏆 {copy('সেরা পোস্ট টাইপ:', 'Top post type:')} <strong style={{ color: th.text }}>{analytics.topPostType}</strong>
                  </div>
                  <div style={{ color: th.muted }}>
                    ⏰ {copy('সবচেয়ে বেশি পোস্ট:', 'Most active:')} <strong style={{ color: th.text }}>{analytics.topPostingDay}, {analytics.topPostingHour}:00</strong>
                  </div>
                </div>
                {analytics.aiInsight && (
                  <div style={{ background: '#6366f108', borderRadius: 8, padding: '10px 12px', border: `1px solid #6366f122`, color: th.text, fontSize: 12, lineHeight: 1.7 }}>
                    🤖 {analytics.aiInsight}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* History */}
          <div style={card}>
            <div style={{ color: th.text, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              {copy('পোস্ট হিস্টোরি', 'Post History')}
            </div>

            {/* Status filter tabs */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
              {(['all', 'published', 'scheduled', 'failed'] as const).map((s) => {
                const active = statusFilter === s;
                const color = s === 'all' ? '#6b7280' : STATUS_COLOR[s];
                const labels: Record<string, string> = {
                  all: copy('সব', 'All'),
                  published: copy('প্রকাশিত', 'Published'),
                  scheduled: copy('শিডিউলড', 'Scheduled'),
                  failed: copy('ব্যর্থ', 'Failed'),
                };
                return (
                  <button key={s} onClick={() => setStatusFilter(s)} style={{
                    background: active ? `${color}22` : 'transparent',
                    color: active ? color : th.muted,
                    border: `1px solid ${active ? color : th.border}`,
                    borderRadius: 16, padding: '3px 10px', fontSize: 11,
                    fontWeight: active ? 700 : 400, cursor: 'pointer',
                  }}>
                    {labels[s]} ({statusCounts[s]})
                  </button>
                );
              })}
            </div>

            {listLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
            ) : filteredPosts.length === 0 ? (
              <div style={{ color: th.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>
                {copy('কোনো পোস্ট নেই', 'No posts yet')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560, overflowY: 'auto' }}>
                {filteredPosts.map((post) => (
                  <div key={post.id} style={{ background: th.surface, borderRadius: 8, padding: 12, border: `1px solid ${th.border}`, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                      <span style={{ background: `${STATUS_COLOR[post.status] ?? '#6b7280'}22`, color: STATUS_COLOR[post.status] ?? '#6b7280', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {STATUS_BN[post.status] ?? post.status}
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => handleCopyCaption(post)} title={copy('ক্যাপশন কপি', 'Copy caption')}
                          style={{ background: 'none', border: 'none', color: copiedId === post.id ? '#10b981' : th.muted, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>
                          {copiedId === post.id ? '✓' : '⎘'}
                        </button>
                        <button onClick={() => handleClone(post)} title={copy('ক্লোন করো', 'Clone')}
                          style={{ background: 'none', border: 'none', color: th.muted, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>
                          🔁
                        </button>
                        {post.status !== 'publishing' && (
                          <button onClick={() => handleDelete(post.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ color: th.text, lineHeight: 1.5, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {post.caption}
                    </div>

                    {post.imageUrl && (
                      <img src={resolveUrl(post.imageUrl)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} />
                    )}

                    {post.scheduledAt && post.status === 'scheduled' && (
                      <div style={{ color: th.muted, fontSize: 11 }}>⏰ {new Date(post.scheduledAt).toLocaleString('bn-BD')}</div>
                    )}
                    {post.publishedAt && (
                      <div style={{ color: th.muted, fontSize: 11 }}>✅ {new Date(post.publishedAt).toLocaleString('bn-BD')}</div>
                    )}
                    {post.errorMsg && (
                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>⚠️ {post.errorMsg}</div>
                    )}

                    {(post.status === 'published' || post.status === 'failed') && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {post.status === 'published' && post.fbPostId && (
                          <a href={fbPostUrl(post.fbPostId)} target="_blank" rel="noopener noreferrer"
                            style={{ ...smBtn('#1877f2'), textDecoration: 'none' }}>
                            👁 {copy('FB তে দেখো', 'View on FB')}
                          </a>
                        )}
                        {post.status === 'failed' && (
                          <button style={smBtn('#f59e0b', retryingId === post.id)} onClick={() => handleRetry(post.id)} disabled={retryingId === post.id}>
                            {retryingId === post.id ? <Spinner size={10} color="#fff" /> : '↻'}
                            {copy('আবার চেষ্টা', 'Retry')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* hidden ref for file input (unused but kept for future) */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} />
    </div>
  );
}
