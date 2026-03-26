import { LanguageSwitch } from '../components/ui';
import { useLanguage } from '../i18n';

interface Props {
  dark: boolean;
  setDark: (next: boolean) => void;
  onLogin: () => void;
  onSignup: () => void;
}

export function LandingPage({ dark, setDark, onLogin, onSignup }: Props) {
  const { copy } = useLanguage();

  const bg = dark
    ? 'radial-gradient(circle at top left, rgba(99,102,241,0.18), transparent 32%), linear-gradient(180deg, #060916 0%, #0a1020 48%, #0c1324 100%)'
    : 'radial-gradient(circle at top left, rgba(99,102,241,0.16), transparent 30%), linear-gradient(180deg, #f8fbff 0%, #eef3ff 55%, #e7eefc 100%)';
  const panel = dark ? 'rgba(14,21,38,0.84)' : 'rgba(255,255,255,0.84)';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const text = dark ? '#eef2ff' : '#111827';
  const muted = dark ? 'rgba(226,232,255,0.68)' : 'rgba(17,24,39,0.62)';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: bg,
        color: text,
        fontFamily: '"DM Sans", "Noto Sans Bengali", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 20px 48px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="ChatCat Pro" style={{ width: 42, height: 42, borderRadius: 14, objectFit: 'cover', boxShadow: dark ? '0 10px 28px rgba(0,0,0,0.32)' : '0 10px 28px rgba(99,102,241,0.18)' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.04em' }}>ChatCat Pro</div>
              <div style={{ color: muted, fontSize: 13 }}>{copy('Messenger automation SaaS', 'Messenger automation SaaS')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LanguageSwitch dark={dark} compact />
            <button
              onClick={() => setDark(!dark)}
              style={{
                border: `1px solid ${border}`,
                background: panel,
                color: text,
                borderRadius: 999,
                padding: '10px 14px',
                fontSize: 13,
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                fontFamily: 'inherit',
              }}
            >
              {dark ? copy('☀ লাইট', '☀ Light') : copy('☾ ডার্ক', '☾ Dark')}
            </button>
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 28,
              padding: 32,
              backdropFilter: 'blur(18px)',
              boxShadow: dark ? '0 24px 80px rgba(0,0,0,0.28)' : '0 24px 80px rgba(99,102,241,0.12)',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '8px 14px', background: dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.10)', color: '#6366f1', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 18 }}>
              {copy('Live SaaS Platform', 'Live SaaS Platform')}
            </div>
            <h1 style={{ fontSize: 52, lineHeight: 1.02, letterSpacing: '-0.06em', margin: 0, maxWidth: 760 }}>
              {copy('Facebook Messenger automation এখন client-ready dashboard সহ', 'Facebook Messenger automation with a client-ready dashboard')}
            </h1>
            <p style={{ margin: '18px 0 0', maxWidth: 680, fontSize: 17, lineHeight: 1.75, color: muted }}>
              {copy(
                'এক জায়গা থেকে page connect, order manage, product catalog share, customer handle আর automation চালান। Root URL সবসময় landing page থাকবে, তারপর login/signup থেকে system-এ ঢুকবেন।',
                'Connect pages, manage orders, share product catalogs, handle customers, and run automation from one place. The root URL stays on the landing page, then users enter the system from login or signup.',
              )}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <button
                onClick={onLogin}
                style={{
                  border: 'none',
                  borderRadius: 16,
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 18px 40px rgba(79,70,229,0.28)',
                  fontFamily: 'inherit',
                }}
              >
                {copy('Login করুন', 'Login')}
              </button>
              <button
                onClick={onSignup}
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: 16,
                  padding: '14px 24px',
                  background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
                  color: text,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  backdropFilter: 'blur(12px)',
                  fontFamily: 'inherit',
                }}
              >
                {copy('নতুন Account খুলুন', 'Create Account')}
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
              {[
                copy('🤖 Messenger automation', '🤖 Messenger automation'),
                copy('🛍️ Product catalog', '🛍️ Product catalog'),
                copy('📦 Order management', '📦 Order management'),
                copy('📊 Client dashboard', '📊 Client dashboard'),
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: `1px solid ${border}`,
                    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
                    color: muted,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 28,
              padding: 26,
              backdropFilter: 'blur(18px)',
              boxShadow: dark ? '0 24px 80px rgba(0,0,0,0.28)' : '0 24px 80px rgba(99,102,241,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ color: '#6366f1', fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {copy('What You Get', 'What You Get')}
            </div>
            {[
              {
                title: copy('Client-ready login flow', 'Client-ready login flow'),
                text: copy('Landing page থেকে Login / Signup, তারপর dashboard বা page connect screen।', 'Users start from the landing page, then continue to login, signup, dashboard, or page connect.'),
              },
              {
                title: copy('Safe page connection', 'Safe page connection'),
                text: copy('Wrong page ID আর silently save হবে না. Verified token only.', 'Wrong page IDs no longer save silently. Only verified token/page combinations are accepted.'),
              },
              {
                title: copy('Easy page management', 'Easy page management'),
                text: copy('Dashboard topbar থেকে page manage, disconnect, reconnect.', 'Manage, disconnect, and reconnect pages directly from the dashboard topbar.'),
              },
            ].map((item) => (
              <div key={item.title} style={{ padding: '16px 18px', borderRadius: 20, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', border: `1px solid ${border}` }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: muted }}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
