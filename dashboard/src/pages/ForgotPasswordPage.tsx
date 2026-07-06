import { useState } from 'react';
import { LanguageSwitch } from '../components/ui';
import { useLanguage } from '../i18n';
import { useApi } from '../hooks/useApi';

interface Props {
  dark: boolean;
  onBack: () => void;
}

export function ForgotPasswordPage({ dark, onBack }: Props) {
  const { copy } = useLanguage();
  const { request, API_BASE } = useApi();

  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const bg     = dark ? '#06060a' : '#f7f7f8';
  const panel  = dark ? '#111118' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#ededf0' : '#0d0d10';
  const muted  = dark ? 'rgba(237,237,240,0.4)' : 'rgba(13,13,16,0.38)';
  const accent = '#4f46e5';

  const inp = (name: string): React.CSSProperties => ({
    padding: '11px 14px',
    borderRadius: 9,
    border: `1.5px solid ${focused === name ? accent : border}`,
    outline: 'none',
    background: dark ? 'rgba(255,255,255,0.04)' : '#fafafa',
    color: text,
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 14,
    fontFamily: 'inherit',
    transition: 'border-color .15s, box-shadow .15s',
    boxShadow: focused === name ? `0 0 0 3px ${accent}18` : 'none',
  });

  const sendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError(copy('সঠিক email দিন', 'Enter a valid email'));
      return;
    }
    setLoading(true); setError('');
    try {
      await request(`${API_BASE}/auth/otp/send-reset`, {
        method: 'POST', body: JSON.stringify({ email: email.trim() }), skipAuth: true,
      });
      setStep('reset');
    } catch (e: any) {
      setError(e?.message || copy('OTP পাঠানো যায়নি', 'Could not send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      setError(copy('৬ সংখ্যার OTP দিন', 'Enter the 6-digit OTP')); return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError(copy('Password কমপক্ষে ৬ character হতে হবে', 'Password must be at least 6 characters')); return;
    }
    if (newPassword !== confirmPassword) {
      setError(copy('Password মিলছে না', 'Passwords do not match')); return;
    }
    setLoading(true); setError('');
    try {
      await request(`${API_BASE}/auth/otp/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword }),
        skipAuth: true,
      });
      setStep('done');
    } catch (e: any) {
      setError(e?.message || copy('Password reset করা যায়নি', 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

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
        .fcard { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) forwards; }
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
        textAlign: 'center',
      }}>
        <div style={{
          width:60, height:60, borderRadius:16, margin:'0 auto 20px',
          background:`linear-gradient(135deg, #f97316, #ef4444)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:28, boxShadow:'0 6px 20px rgba(249,115,22,0.4)',
        }}>{step === 'done' ? '✅' : '🔑'}</div>

        <div style={{ fontSize:22, fontWeight:800, color:text, letterSpacing:'-0.04em', marginBottom:12 }}>
          {step === 'done'
            ? copy('Password পরিবর্তন হয়েছে', 'Password Changed')
            : copy('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot Password?')}
        </div>

        {step !== 'done' && (
          <div style={{ fontSize:14, color:muted, lineHeight:1.7, marginBottom:24 }}>
            {step === 'email'
              ? copy('আপনার account-এর email দিন — আমরা একটি OTP পাঠাবো।', 'Enter your account email — we\'ll send you an OTP.')
              : copy(`${email}-এ পাঠানো OTP এবং নতুন password দিন।`, `Enter the OTP sent to ${email} and your new password.`)}
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
            color: '#ef4444', borderRadius: 9, padding: '10px 14px',
            fontSize: 13, marginBottom: 16, textAlign: 'left',
          }}>
            {error}
          </div>
        )}

        {step === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, textAlign: 'left' }}>
            <input
              type="email" value={email} placeholder={copy('আপনার email', 'Your email')}
              onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendOtp()}
              style={inp('email')} autoFocus
            />
            <button onClick={sendOtp} disabled={loading} style={{
              width: '100%', padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
              background: `linear-gradient(135deg, ${accent}, #6d28d9)`,
              color:'#fff', fontWeight:700, fontSize:14.5, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: `0 2px 12px ${accent}44`,
            }}>
              {loading ? copy('পাঠানো হচ্ছে...', 'Sending...') : copy('OTP পাঠান', 'Send OTP')}
            </button>
          </div>
        )}

        {step === 'reset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, textAlign: 'left' }}>
            <input
              type="text" inputMode="numeric" maxLength={6} value={code}
              placeholder={copy('৬ সংখ্যার OTP', '6-digit OTP')}
              onFocus={() => setFocused('code')} onBlur={() => setFocused(null)}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp('code'), letterSpacing: 6, fontWeight: 800, textAlign: 'center' }} autoFocus
            />
            <input
              type="password" value={newPassword} placeholder={copy('নতুন password', 'New password')}
              onFocus={() => setFocused('newPassword')} onBlur={() => setFocused(null)}
              onChange={e => setNewPassword(e.target.value)}
              style={inp('newPassword')}
            />
            <input
              type="password" value={confirmPassword} placeholder={copy('Password আবার লিখুন', 'Confirm password')}
              onFocus={() => setFocused('confirmPassword')} onBlur={() => setFocused(null)}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && resetPassword()}
              style={inp('confirmPassword')}
            />
            <button onClick={resetPassword} disabled={loading} style={{
              width: '100%', padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
              background: `linear-gradient(135deg, ${accent}, #6d28d9)`,
              color:'#fff', fontWeight:700, fontSize:14.5, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: `0 2px 12px ${accent}44`,
            }}>
              {loading ? copy('হচ্ছে...', 'Working...') : copy('Password পরিবর্তন করুন', 'Reset Password')}
            </button>
            <button onClick={sendOtp} disabled={loading} style={{
              background: 'none', border: 'none', color: muted, fontSize: 12.5,
              cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', padding: 4,
            }}>
              {copy('OTP আবার পাঠান', 'Resend OTP')}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{
            background: dark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 10, padding: '14px 18px',
            fontSize: 13.5, color: text, marginBottom: 24, lineHeight: 1.6,
          }}>
            {copy('✅ আপনার password সফলভাবে পরিবর্তন হয়েছে। এখন নতুন password দিয়ে login করুন।', '✅ Your password has been changed successfully. Please log in with your new password.')}
          </div>
        )}

        <button onClick={onBack} style={{
          width: '100%', padding:'10px', borderRadius:9, border: `1px solid ${border}`, fontFamily:'inherit',
          background: 'transparent', color: text, fontWeight:600, fontSize:13.5, cursor:'pointer',
        }}>
          {copy('← Login এ ফিরে যান', '← Back to login')}
        </button>

        <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
          <LanguageSwitch dark={dark} compact />
        </div>
      </div>
    </div>
  );
}
