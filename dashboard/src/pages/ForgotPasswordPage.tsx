import { useState, useRef, useEffect } from 'react';
import { LanguageSwitch } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  onBack: () => void; // back to login
}

export function ForgotPasswordPage({ dark, onBack }: Props) {
  const { copy } = useLanguage();
  // Steps: 1=email, 2=otp, 3=new password
  const [step, setStep]           = useState<1 | 2 | 3>(1);
  const [email, setEmail]         = useState('');
  const [otp, setOtp]             = useState('');
  const [newPass, setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [focused, setFocused]     = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [step]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

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

  const sendOtp = async () => {
    if (!isValidEmail(email)) return setError(copy('একটি valid Gmail address দিন', 'Enter a valid email address'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send-reset`, {
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

  const resendOtp = async () => {
    if (resendTimer > 0) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send-reset`, {
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

  const goStep3 = () => {
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) return setError(copy('৬ সংখ্যার OTP দিন', 'Enter the 6-digit OTP'));
    setError(''); setSuccess(''); setStep(3);
  };

  const resetPassword = async () => {
    if (newPass.length < 6)       return setError(copy('Password কমপক্ষে ৬ character হতে হবে', 'Password must be at least 6 characters'));
    if (newPass !== confirmPass)   return setError(copy('Password match করছে না', 'Passwords do not match'));
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/otp/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || copy('Password reset হয়নি', 'Password reset failed'));
      setSuccess(copy('✅ Password reset সফল! এখন login করুন।', '✅ Password reset successful. Please sign in now.'));
      setTimeout(() => onBack(), 2000);
    } catch (e: any) {
      setError(e.message);
      if (e.message?.includes('OTP')) setStep(2);
    }
    finally { setLoading(false); }
  };

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;
  const stepLabel   = step === 1 ? copy('ইমেইল দিন', 'Enter email') : step === 2 ? copy('OTP ভেরিফাই', 'Verify OTP') : copy('নতুন পাসওয়ার্ড', 'New password');

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
        .fcard { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) forwards; }
        * { box-sizing: border-box; }
        input::placeholder { color: ${muted}; }
      `}</style>

      <div style={{ position:'fixed', top:'-10%', right:'-5%', width:550, height:550, borderRadius:'50%', background:`radial-gradient(circle, #7c3aed14, transparent 65%)`, pointerEvents:'none' }}/>
      <div style={{ position:'fixed', bottom:'-10%', left:'-5%', width:450, height:450, borderRadius:'50%', background:`radial-gradient(circle, ${accent}14, transparent 65%)`, pointerEvents:'none' }}/>

      <div className="fcard" style={{
        width: 410, padding: '40px 36px',
        background: panel, border: `1px solid ${border}`, borderRadius: 18,
        boxShadow: dark
          ? '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 8px 40px rgba(0,0,0,0.08)',
        position: 'relative',
      }}>

        {/* Progress */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:border, borderRadius:'18px 18px 0 0', overflow:'hidden' }}>
          <div style={{ height:'100%', background:`linear-gradient(90deg, #f97316, #ef4444)`, width:`${progressPct}%`, transition:'width .4s cubic-bezier(.4,0,.2,1)' }}/>
        </div>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{
            width:52, height:52, borderRadius:14, margin:'0 auto 14px',
            background:`linear-gradient(135deg, #f97316, #ef4444)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:24, boxShadow:'0 6px 20px rgba(249,115,22,0.4)',
          }}>🔑</div>
          <div style={{ fontSize:22, fontWeight:800, color:text, letterSpacing:'-0.04em' }}>{copy('পাসওয়ার্ড রিসেট', 'Forgot Password')}</div>
          <div style={{ fontSize:12.5, color:muted, marginTop:5 }}>{copy(`ধাপ ${step} / 3 — ${stepLabel}`, `Step ${step} of 3 - ${stepLabel}`)}</div>
        </div>

        {error && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', color:'#ef4444', borderRadius:9, padding:'10px 14px', fontSize:13, marginBottom:14, display:'flex', gap:7 }}>
            <span>⚠</span> {error}
          </div>
        )}
        {success && (
          <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.22)', color:'#10b981', borderRadius:9, padding:'10px 14px', fontSize:13, marginBottom:14 }}>
            {success}
          </div>
        )}

        {/* ── STEP 1: Email ─── */}
        {step === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                {copy('Gmail Address', 'Email Address')}
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
              />
              <div style={{ fontSize:11.5, color:muted, marginTop:5 }}>{copy('আপনার account-এর Gmail address দিন', 'Enter the email address used for your account')}</div>
            </div>
            <button onClick={sendOtp} disabled={loading}
              style={{ padding:'12px', borderRadius:9, border:'none', cursor: loading ? 'wait' : 'pointer',
                background: loading ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg,#f97316,#ef4444)',
                color:'#fff', fontWeight:700, fontSize:14.5, fontFamily:'inherit',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : '0 2px 12px rgba(249,115,22,0.4)', transition:'all .15s',
              }}>
              {loading ? <><Spin/> {copy('OTP পাঠানো হচ্ছে...', 'Sending OTP...')}</> : copy('📧 OTP পাঠান', 'Send OTP')}
            </button>
          </div>
        )}

        {/* ── STEP 2: OTP ─── */}
        {step === 2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:dark?'rgba(249,115,22,0.1)':'rgba(249,115,22,0.06)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:9, padding:'9px 14px' }}>
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
                <span style={{ fontSize:11.5, color:muted }}>{copy('Gmail inbox চেক করুন', 'Check your email inbox')}</span>
                <button onClick={resendOtp} disabled={resendTimer > 0 || loading}
                  style={{ background:'none', border:'none', cursor: resendTimer > 0 ? 'default' : 'pointer',
                    color: resendTimer > 0 ? muted : '#f97316', fontSize:12, fontWeight:700, padding:0, fontFamily:'inherit' }}>
                  {resendTimer > 0 ? `Resend (${resendTimer}s)` : copy('🔄 আবার OTP পাঠান', 'Resend OTP')}
                </button>
              </div>
            </div>

            <button onClick={goStep3} disabled={otp.length !== 6}
              style={{ padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
                cursor: otp.length !== 6 ? 'default' : 'pointer',
                background: otp.length !== 6 ? 'rgba(249,115,22,0.35)' : 'linear-gradient(135deg,#f97316,#ef4444)',
                color:'#fff', fontWeight:700, fontSize:14.5,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: otp.length !== 6 ? 'none' : '0 2px 12px rgba(249,115,22,0.4)', transition:'all .15s',
              }}>
              {copy('ভেরিফাই করুন →', 'Verify ->')}
            </button>
          </div>
        )}

        {/* ── STEP 3: New Password ─── */}
        {step === 3 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:9, padding:'9px 14px' }}>
              <span>✅</span>
              <span style={{ fontSize:13, fontWeight:600, color:'#10b981' }}>{email} - {copy('ভেরিফাইড', 'verified')}</span>
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                {copy('নতুন Password', 'New Password')}
              </label>
              <div style={{ position:'relative' }}>
                <input
                  ref={inputRef}
                  style={inp('pass')}
                  type={showPass ? 'text' : 'password'}
                  placeholder={copy('কমপক্ষে ৬ character', 'At least 6 characters')}
                  value={newPass}
                  onChange={e => { setNewPass(e.target.value); setError(''); }}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  onKeyDown={e => e.key === 'Enter' && resetPassword()}
                />
                <button onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:muted, fontSize:13, padding:0 }}>
                  {showPass ? '○' : '●'}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:muted, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 }}>
                Confirm Password
              </label>
              <input
                style={{ ...inp('confirm'), borderColor: confirmPass && confirmPass !== newPass ? '#ef4444' : focused === 'confirm' ? accent : border }}
                type="password"
                placeholder={copy('Password আবার লিখুন', 'Re-enter your password')}
                value={confirmPass}
                onChange={e => { setConfirmPass(e.target.value); setError(''); }}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && resetPassword()}
              />
              {confirmPass && confirmPass !== newPass && <div style={{ fontSize:11.5, color:'#ef4444', marginTop:4 }}>{copy('Password match হচ্ছে না', 'Passwords do not match')}</div>}
              {confirmPass && confirmPass === newPass   && <div style={{ fontSize:11.5, color:'#16a34a', marginTop:4 }}>{copy('✓ মিলেছে', '✓ Match')}</div>}
            </div>

            <button onClick={resetPassword}
              disabled={loading || newPass.length < 6 || newPass !== confirmPass}
              style={{ padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
                background: loading || newPass.length < 6 || newPass !== confirmPass
                  ? 'rgba(249,115,22,0.35)' : 'linear-gradient(135deg,#f97316,#ef4444)',
                color:'#fff', fontWeight:700, fontSize:14.5, cursor: loading ? 'wait' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: loading ? 'none' : '0 2px 12px rgba(249,115,22,0.4)', transition:'all .15s',
              }}>
              {loading ? <><Spin/> {copy('Reset হচ্ছে...', 'Resetting...')}</> : copy('🔑 Password Reset করুন', 'Reset Password')}
            </button>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:20, flexWrap:'wrap', alignItems:'center' }}>
          <LanguageSwitch dark={dark} compact />
          <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:accent, fontWeight:700, fontSize:13, fontFamily:'inherit', padding:0, textDecoration:'underline', textUnderlineOffset:3 }}>
            {copy('← Login এ ফিরে যান', '<- Back to login')}
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
