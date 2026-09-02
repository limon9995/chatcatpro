import { useEffect, useRef, useState } from 'react';
import { LanguageSwitch } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  onBack: () => void;
  onSignupComplete: () => void;
}

export function ResellerSignupPage({ dark, setDark, onBack, onSignupComplete }: Props) {
  const { copy } = useLanguage();
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = dark ? '#06060a' : '#f7f7f8';
  const panel = dark ? '#111118' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const text = dark ? '#ededf0' : '#0d0d10';
  const muted = dark ? 'rgba(237,237,240,0.4)' : 'rgba(13,13,16,0.38)';
  const accent = '#4f46e5';

  const inp = (n: string): React.CSSProperties => ({
    padding: '11px 14px', borderRadius: 9,
    border: `1.5px solid ${focused === n ? accent : border}`,
    outline: 'none',
    background: dark ? 'rgba(255,255,255,0.04)' : '#fafafa',
    color: text, width: '100%', boxSizing: 'border-box',
    fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color .15s, box-shadow .15s',
    boxShadow: focused === n ? `0 0 0 3px ${accent}18` : 'none',
  });

  const normalizeSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  useEffect(() => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (slug.length < 3) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/reseller/slug-available?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
  }, [slug]);

  const sendOtp = async () => {
    if (!companyName.trim()) return setError(copy('কোম্পানির নাম দিন', 'Enter your company name'));
    if (slugStatus !== 'available') return setError(copy('একটি available subdomain বেছে নিন', 'Choose an available subdomain'));
    if (!isValidEmail(email)) return setError(copy('একটি valid email address দিন', 'Enter a valid email address'));
    if (password.length < 6) return setError(copy('Password কমপক্ষে ৬ character হতে হবে', 'Password must be at least 6 characters'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/reseller/signup/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('OTP পাঠানো যায়নি', 'Failed to send OTP'));
      setStep('otp');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!code.trim()) return setError(copy('OTP code দিন', 'Enter the OTP code'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/reseller/signup/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          companyName: companyName.trim(),
          slug,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('Verify করা যায়নি', 'Verification failed'));
      try { localStorage.setItem('dfbot_token', data.token); } catch {}
      onSignupComplete();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const slugHint =
    slugStatus === 'checking' ? copy('চেক করা হচ্ছে...', 'Checking...') :
    slugStatus === 'available' ? copy('✓ Available', '✓ Available') :
    slugStatus === 'taken' ? copy('✗ ইতিমধ্যে ব্যবহৃত', '✗ Already taken') : '';

  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans','Noto Sans Bengali',system-ui,sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: ${muted}; }
      `}</style>

      <div style={{
        width: 440, padding: '40px 36px',
        background: panel, border: `1px solid ${border}`, borderRadius: 18,
        boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: text, letterSpacing: '-0.04em' }}>
            {copy('আপনার নিজের ব্র্যান্ডে রিসেলার হোন', 'Become a Reseller')}
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 6 }}>
            {copy('নিজের নাম, লোগো ও দামে পুরো সিস্টেম চালান', 'Run the whole system under your own name, logo, and pricing')}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', borderRadius: 9, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        {step === 'details' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                {copy('কোম্পানির নাম *', 'Company Name *')}
              </label>
              <input style={inp('company')} placeholder={copy('যেমন: হিজব্র্যান্ড', 'e.g. HisBrand')}
                value={companyName} onChange={e => { setCompanyName(e.target.value); setError(''); }}
                onFocus={() => setFocused('company')} onBlur={() => setFocused(null)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                {copy('সাবডোমেইন *', 'Subdomain *')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input style={inp('slug')} placeholder="hisbrand"
                  value={slug} onChange={e => { setSlug(normalizeSlug(e.target.value)); setError(''); }}
                  onFocus={() => setFocused('slug')} onBlur={() => setFocused(null)} />
                <span style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>.chatcat.pro</span>
              </div>
              {slugHint && (
                <div style={{ fontSize: 11.5, marginTop: 4, color: slugStatus === 'available' ? '#16a34a' : slugStatus === 'taken' ? '#ef4444' : muted }}>
                  {slugHint}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                {copy('Email Address *', 'Email Address *')}
              </label>
              <input style={inp('email')} type="email" placeholder="yourname@gmail.com"
                value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} autoComplete="email" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                Password *
              </label>
              <input style={inp('pass')} type="password" placeholder={copy('কমপক্ষে ৬ character', 'At least 6 characters')}
                value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)} autoComplete="new-password" />
            </div>

            <button onClick={sendOtp} disabled={loading}
              style={{
                padding: '12px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                background: loading ? `${accent}55` : `linear-gradient(135deg, ${accent}, #6d28d9)`,
                color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: loading ? 'wait' : 'pointer',
              }}>
              {loading ? copy('পাঠানো হচ্ছে...', 'Sending...') : copy('OTP পাঠান', 'Send OTP')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: muted, textAlign: 'center' }}>
              {copy(`${email} ঠিকানায় কোড পাঠানো হয়েছে`, `A code was sent to ${email}`)}
            </div>
            <input style={inp('code')} placeholder={copy('৬-সংখ্যার কোড', '6-digit code')}
              value={code} onChange={e => { setCode(e.target.value); setError(''); }}
              onFocus={() => setFocused('code')} onBlur={() => setFocused(null)}
              onKeyDown={e => e.key === 'Enter' && verifyOtp()} />
            <button onClick={verifyOtp} disabled={loading}
              style={{
                padding: '12px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                background: loading ? `${accent}55` : `linear-gradient(135deg, ${accent}, #6d28d9)`,
                color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: loading ? 'wait' : 'pointer',
              }}>
              {loading ? copy('তৈরি হচ্ছে...', 'Creating...') : copy('🎉 রিসেলার একাউন্ট তৈরি করুন', 'Create Reseller Account')}
            </button>
            <button onClick={() => setStep('details')} style={{ background: 'none', border: 'none', color: muted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              {copy('← পিছনে যান', '← Back')}
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: muted }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontWeight: 700, fontSize: 13, fontFamily: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {copy('সাইন ইন-এ ফিরে যান', 'Back to Sign In')}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
          <LanguageSwitch dark={dark} compact />
          <button onClick={() => setDark(!dark)} style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 8, padding: '5px 12px', color: muted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            {dark ? copy('☀ লাইট', '☀ Light') : copy('☾ ডার্ক', '☾ Dark')}
          </button>
        </div>
      </div>
    </div>
  );
}
