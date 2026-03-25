import { LanguageSwitch } from '../components/ui';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  onBack: () => void;
}

export function ForgotPasswordPage({ dark, onBack }: Props) {
  const { copy } = useLanguage();

  const bg     = dark ? '#06060a' : '#f7f7f8';
  const panel  = dark ? '#111118' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const text   = dark ? '#ededf0' : '#0d0d10';
  const muted  = dark ? 'rgba(237,237,240,0.4)' : 'rgba(13,13,16,0.38)';
  const accent = '#4f46e5';

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
        }}>🔑</div>

        <div style={{ fontSize:22, fontWeight:800, color:text, letterSpacing:'-0.04em', marginBottom:12 }}>
          {copy('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot Password?')}
        </div>

        <div style={{ fontSize:14, color:muted, lineHeight:1.7, marginBottom:28 }}>
          {copy(
            'Password reset করতে Admin এর সাথে যোগাযোগ করুন।',
            'Please contact the Admin to reset your password.'
          )}
        </div>

        <div style={{
          background: dark ? 'rgba(79,70,229,0.1)' : 'rgba(79,70,229,0.06)',
          border: `1px solid ${accent}30`,
          borderRadius: 10, padding: '14px 18px',
          fontSize: 13.5, color: text, marginBottom: 28, lineHeight: 1.6,
        }}>
          📞 {copy('Admin এর সাথে Telegram বা Phone এ যোগাযোগ করুন।', 'Contact Admin via Telegram or Phone.')}
        </div>

        <button onClick={onBack} style={{
          width: '100%', padding:'12px', borderRadius:9, border:'none', fontFamily:'inherit',
          background: `linear-gradient(135deg, ${accent}, #6d28d9)`,
          color:'#fff', fontWeight:700, fontSize:14.5, cursor:'pointer',
          boxShadow: `0 2px 12px ${accent}44`,
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
