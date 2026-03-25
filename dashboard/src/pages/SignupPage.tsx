import { useState, useRef, useEffect } from 'react';
import { LanguageSwitch } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  onSignup: (data: { identifier: string; password: string; name: string }) => Promise<void>;
  onBack: () => void;
}

// Exported for dynamic import from App.tsx
export function SignupPageComponent({ dark, setDark, onBack }: Props) {
  const { copy } = useLanguage();
  // Steps: 1=email, 2=otp, 3=name+password
  const [step, setStep]             = useState<1 | 2 | 3>(1);
  const [email, setEmail]           = useState('');
  const [otp, setOtp]               = useState('');
  const [name, setName]             = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [focused, setFocused]       = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // Design tokens
  const bg     = dark ? '#06060a' : '#f7f7f8';
  const panel  = dark ? '#111118' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#ededf0' : '#0d0d10';
  const muted  = dark ? 'rgba(237,237,240,0.4)' : 'rgba(13,13,16,0.38)';
  const accent = '#4f46e5';

  const inp = (name: string): React.CSSProperties => ({
    padding: '11px 14px', borderRadius: 9,
    border: `1.5px solid ${focused === name ? accent : border}`,
    outline: 'none',
    background: dark ? 'rgba(255,255,255,0.04)' : '#fafafa',
    color: text, width: '100%', boxSizing: 'border-box',
    fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color .15s, box-shadow .15s',
    boxShadow: focused === name ? `0 0 0 3px ${accent}18` : 'none',
  });

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  // Step 1 → send OTP
  const sendOtp = async () => {
    if (!isValidEmail(email)) return setError(copy('একটি valid Gmail address দিন', 'Enter a valid email address'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('OTP পাঠাতে সমস্যা হয়েছে', 'Failed to send OTP'));
      setSuccess(copy(`${email} এ OTP পাঠানো হয়েছে`, `OTP sent to ${email}`));
      setStep(2);
      setResendTimer(60);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Resend OTP
  const resendOtp = async () => {
    if (resendTimer > 0) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('OTP পাঠাতে সমস্যা হয়েছে', 'Failed to send OTP'));
      setSuccess(copy('নতুন OTP পাঠানো হয়েছে', 'A new OTP has been sent'));
      setResendTimer(60);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Step 2 → verify OTP format (just check 6 digits, real check on submit)
  const goStep3 = () => {
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) return setError(copy('৬ সংখ্যার OTP দিন', 'Enter the 6-digit OTP'));
    setError(''); setSuccess(''); setStep(3);
  };

  // Step 3 → create account
  const submit = async () => {
    if (!name.trim())             return setError(copy('Username দিন', 'Enter a username'));
    if (password.length < 6)      return setError(copy('Password কমপক্ষে ৬ character হতে হবে', 'Password must be at least 6 characters'));
    if (password !== confirmPass)  return setError(copy('Password match করছে না', 'Passwords do not match'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/verify-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    email.trim().toLowerCase(),
          code:     otp,
          username: name.trim(),
          name:     name.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('Account তৈরি হয়নি', 'Failed to create account'));
      setSuccess(copy('অ্যাকাউন্ট তৈরি হয়েছে! এখন লগইন করুন।', 'Account created successfully. Please sign in.'));
      setTimeout(() => onBack(), 1500);
    } catch (e: any) {
      setError(e.message);
      // If OTP error, go back to OTP step
      if (e.message?.includes('OTP')) setStep(2);
    }
    finally { setLoading(false); }
  };

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;
  const stepLabel   = step === 1
    ? copy('ইমেইল দিন', 'Enter email')
    : step === 2
      ? copy('OTP ভেরিফাই', 'Verify OTP')
      : copy('পাসওয়ার্ড সেট করুন', 'Set password');

  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans','Noto Sans Bengali',system-ui,sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes float  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        .scard { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) forwards; }
        * { box-sizing: border-box; }
        input::placeholder { color: ${muted}; }
      `}</style>

      <div style={{ position:'fixed', top:'-10%', left:'-5%', width:600, height:600, borderRadius:'50%', background:`radial-gradient(circle, ${accent}14, transparent 65%)`, pointerEvents:'none' }}/>
      <div style={{ position:'fixed', bottom:'-10%', right:'-5%', width:500, height:500, borderRadius:'50%', background:`radial-gradient(circle, #7c3aed14, transparent 65%)`, pointerEvents:'none' }}/>

      <div className="scard" style={{
        width: 420, padding: '40px 36px',
        background: panel, border: `1px solid ${border}`, borderRadius: 18,
        boxShadow: dark
          ? '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 8px 40px rgba(0,0,0,0.08)',
        position: 'relative',
      }}>

        {/* Progress bar */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:border, borderRadius:'18px 18px 0 0', overflow:'hidden' }}>
          <div style={{
            height:'100%', background:`linear-gradient(90deg, ${accent}, #7c3aed)`,
            width: `${progressPct}%`, transition:'width .4s cubic-bezier(.4,0,.2,1)',
          }}/>
        </div>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <img src="/logo.png" alt="ChatCat Pro" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '50%', margin: '0 auto 14px', display: 'block' }} />
          <div style={{ fontSize:22, fontWeight:800, color:text, letterSpacing:'-0.04em' }}>{copy('অ্যাকাউন্ট তৈরি করুন', 'Create Account')}</div>
          <div style={{ fontSize:12.5, color:muted, marginTop:5 }}>
            {copy(`ধাপ ${step} / 3 — ${stepLabel}`, `Step ${step} of 3 - ${stepLabel}`)}
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', color:'#ef4444', borderRadius:9, padding:'10px 14px', fontSize:13, marginBottom:14, display:'flex', gap:7 }}>
            <span>⚠</span> {error}
          </div>
        )}
        {success && (
          <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.22)', color:'#10b981', borderRadius:9, padding:'10px 14px', fontSize:13, marginBottom:14 }}>
            ✅ {success}
          </div>
        )}

        {/* ── STEP 1: Email ─────────────────────────────── */}
        {step === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                {copy('Gmail Address *', 'Email Address *')}
              </label>
              <input
                ref={inputRef}
                style={inp('email')}
                type="email"
                placeholder="yourname@gmail.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
                autoComplete="email"
              />
              <div style={{ fontSize:11.5, color:muted, marginTop:5 }}>{copy('এই Gmail-এ OTP পাঠানো হবে', 'We will send the OTP to this email address')}</div>
            </div>

            <button onClick={sendOtp} disabled={loading}
              style={{ padding:'12px', borderRadius:9, border:'none', cursor: loading ? 'wait' : 'pointer',
                background: loading ? `${accent}66` : `linear-gradient(135deg, ${accent}, #6d28d9)`,
                color:'#fff', fontWeight:700, fontSize:14.5, fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : `0 2px 12px ${accent}44`, transition:'all .15s',
              }}>
              {loading ? (
                <><Spin/> {copy('OTP পাঠানো হচ্ছে...', 'Sending OTP...')}</>
              ) : copy('📧 OTP পাঠান', 'Send OTP')}
            </button>
          </div>
        )}

        {/* ── STEP 2: OTP ───────────────────────────────── */}
        {step === 2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Email chip */}
            <div style={{ display:'flex', alignItems:'center', gap:8, background:dark?'rgba(79,70,229,0.12)':'rgba(79,70,229,0.06)', border:`1px solid ${accent}30`, borderRadius:9, padding:'9px 14px' }}>
              <span>📧</span>
              <span style={{ fontSize:13.5, fontWeight:600, color:text }}>{email}</span>
              <button onClick={() => { setStep(1); setOtp(''); setError(''); setSuccess(''); }}
                style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:muted, fontSize:12, padding:0 }}>{copy('✕ বদলান', '✕ change')}</button>
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                {copy('OTP Code (৬ সংখ্যা)', 'OTP Code (6 digits)')}
              </label>
              <input
                ref={inputRef}
                style={{ ...inp('otp'), fontSize:22, fontWeight:800, letterSpacing:10, textAlign:'center', fontFamily:'monospace' }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setError(''); }}
                onFocus={() => setFocused('otp')}
                onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && goStep3()}
              />
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                <span style={{ fontSize:11.5, color:muted }}>{copy('আপনার Gmail inbox চেক করুন', 'Check your email inbox')}</span>
                <button onClick={resendOtp} disabled={resendTimer > 0 || loading}
                  style={{ background:'none', border:'none', cursor: resendTimer > 0 ? 'default' : 'pointer',
                    color: resendTimer > 0 ? muted : accent, fontSize:12, fontWeight:700, padding:0, fontFamily:'inherit' }}>
                  {resendTimer > 0 ? `Resend (${resendTimer}s)` : copy('🔄 আবার OTP পাঠান', 'Resend OTP')}
                </button>
              </div>
            </div>

            <button onClick={goStep3} disabled={otp.length !== 6}
              style={{ padding:'12px', borderRadius:9, border:'none', cursor: otp.length !== 6 ? 'default' : 'pointer',
                background: otp.length !== 6 ? `${accent}55` : `linear-gradient(135deg, ${accent}, #6d28d9)`,
                color:'#fff', fontWeight:700, fontSize:14.5, fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: otp.length !== 6 ? 'none' : `0 2px 12px ${accent}44`, transition:'all .15s',
              }}>
              {copy('ভেরিফাই করুন →', 'Verify ->')}
            </button>
          </div>
        )}

        {/* ── STEP 3: Name + Password ───────────────────── */}
        {step === 3 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Email + OTP verified chip */}
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:9, padding:'9px 14px' }}>
              <span>✅</span>
              <span style={{ fontSize:13, fontWeight:600, color:'#10b981' }}>{email} — verified</span>
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                {copy('ইউজারনেম', 'Username')}
              </label>
              <input
                ref={inputRef}
                style={inp('name')}
                placeholder={copy('username দিন (login-এ ব্যবহার হবে)', 'Choose a username')}
                value={name}
                autoComplete="off"
                onChange={e => { setName(e.target.value); setError(''); }}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <input
                  style={inp('pass')}
                  type={showPass ? 'text' : 'password'}
                  placeholder={copy('কমপক্ষে ৬ character', 'At least 6 characters')}
                  value={password}
                  autoComplete="new-password"
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
                <button onClick={() => setShowPass(v => !v)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:muted, fontSize:13, padding:0 }}
                  tabIndex={-1}>{showPass ? '○' : '●'}</button>
              </div>
              {password && (
                <div style={{ marginTop:6 }}>
                  <div style={{ height:3, background:border, borderRadius:999, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:999, transition:'width .3s, background .3s',
                      width: password.length < 6 ? '25%' : password.length < 8 ? '50%' : password.length < 12 ? '75%' : '100%',
                      background: password.length < 6 ? '#ef4444' : password.length < 8 ? '#f59e0b' : password.length < 12 ? '#3b82f6' : '#16a34a',
                    }}/>
                  </div>
                  <div style={{ fontSize:11, color:muted, marginTop:3 }}>
                    {password.length < 6 ? copy('খুব ছোট', 'Too short') : password.length < 8 ? copy('দুর্বল', 'Weak') : password.length < 12 ? copy('ভালো', 'Good') : copy('Strong ✓', 'Strong ✓')}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                Confirm Password
              </label>
              <input
                style={{ ...inp('confirm'), borderColor: confirmPass && confirmPass !== password ? '#ef4444' : focused === 'confirm' ? accent : border }}
                type="password"
                placeholder={copy('Password আবার লিখুন', 'Re-enter your password')}
                value={confirmPass}
                autoComplete="new-password"
                onChange={e => { setConfirmPass(e.target.value); setError(''); }}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
              {confirmPass && confirmPass !== password && <div style={{ fontSize:11.5, color:'#ef4444', marginTop:4 }}>{copy('Password match হচ্ছে না', 'Passwords do not match')}</div>}
              {confirmPass && confirmPass === password && <div style={{ fontSize:11.5, color:'#16a34a', marginTop:4 }}>{copy('✓ মিলেছে', '✓ Match')}</div>}
            </div>

            <button onClick={submit}
              disabled={loading || !name || password.length < 6 || password !== confirmPass}
              style={{
                padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
                background: loading || !name || password.length < 6 || password !== confirmPass
                  ? `${accent}55` : `linear-gradient(135deg, ${accent}, #6d28d9)`,
                color:'#fff', fontWeight:700, fontSize:14.5, cursor: loading ? 'wait' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : `0 2px 12px ${accent}44`, transition:'all .15s',
              }}>
              {loading ? <><Spin/> {copy('Account তৈরি হচ্ছে...', 'Creating account...')}</> : copy('🎉 Account তৈরি করুন', 'Create Account')}
            </button>
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:muted }}>
          {copy('আগে থেকেই অ্যাকাউন্ট আছে?', 'Already have an account?')}{' '}
          <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:accent, fontWeight:700, fontSize:13, fontFamily:'inherit', padding:0, textDecoration:'underline', textUnderlineOffset:3 }}>
            {copy('সাইন ইন', 'Sign in')}
          </button>
        </div>
        <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:10, flexWrap:'wrap' }}>
          <LanguageSwitch dark={dark} compact />
          <button onClick={() => setDark(!dark)} style={{ background:'transparent', border:`1px solid ${border}`, borderRadius:8, padding:'5px 12px', color:muted, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
            {dark ? copy('☀ লাইট', '☀ Light') : copy('☾ ডার্ক', '☾ Dark')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation:'spin .65s linear infinite' }}>
      <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2.5" strokeOpacity=".25"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
