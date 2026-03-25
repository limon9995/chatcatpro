import { useState } from 'react';
import { LanguageSwitch } from '../components/ui';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  onSubmit: (current: string, next: string) => Promise<void>;
}

export function ChangePasswordPage({ dark, onSubmit }: Props) {
  const { copy } = useLanguage();
  const [cur, setCur] = useState('');
  const [nxt, setNxt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const panel  = dark ? '#0d1526' : '#fff';
  const border = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#e2e8ff' : '#1a1f36';
  const muted  = dark ? 'rgba(226,232,255,0.5)' : 'rgba(26,31,54,0.5)';
  const inp: React.CSSProperties = { padding: '11px 14px', borderRadius: 11, border: `1.5px solid ${border}`, outline: 'none', background: dark ? 'rgba(255,255,255,0.04)' : '#fafafa', color: text, width: '100%', boxSizing: 'border-box', fontSize: 14 };

  const submit = async () => {
    if (!cur || !nxt) return setError(copy('উভয় field পূরণ করুন', 'Fill in both fields'));
    if (nxt.length < 4) return setError(copy('কমপক্ষে ৪ অক্ষর দিন', 'Minimum 4 characters'));
    setLoading(true); setError('');
    try { await onSubmit(cur, nxt); }
    catch (e: any) { setError(e?.message || copy('সেভ করা যায়নি', 'Failed')); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0a0f1e' : '#f0f2f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 380, background: panel, border: `1px solid ${border}`, borderRadius: 20, padding: 36, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: text, marginBottom: 6 }}>🔑 {copy('পাসওয়ার্ড পরিবর্তন', 'Password Change')}</div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.7 }}>
              {copy('প্রথম login - নিরাপত্তার জন্য password পরিবর্তন করুন।', 'For security, please update your password on first login.')}
            </div>
          </div>
          <LanguageSwitch dark={dark} compact />
        </div>
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input style={inp} type="password" placeholder={copy('বর্তমান password', 'Current password')} value={cur} onChange={e => setCur(e.target.value)} />
          <input style={inp} type="password" placeholder={copy('নতুন password (কমপক্ষে ৪ অক্ষর)', 'New password (min 4 chars)')} value={nxt} onChange={e => setNxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <button onClick={submit} disabled={loading}
            style={{ padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
            {loading ? copy('⏳ সেভ হচ্ছে...', 'Saving...') : copy('নতুন password সেভ করুন', 'Save New Password')}
          </button>
        </div>
      </div>
    </div>
  );
}
