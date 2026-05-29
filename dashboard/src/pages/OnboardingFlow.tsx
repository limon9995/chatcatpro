import { useCallback, useRef, useState } from 'react';
import { API_BASE, useApi } from '../hooks/useApi';

interface Props {
  dark: boolean;
  user: { id: string; name: string; role: string };
  activePage: { id: number; pageId: string; pageName?: string };
  onComplete: () => void;
  onSkip: () => void;
}

type OBStep = 1 | 2 | 3 | 4;

const CONFETTI_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899'];
const CONFETTI = Array.from({ length: 20 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: `${5 + i * 4.5}%`,
  size: 8 + (i % 4) * 3,
  delay: `${i * 0.15}s`,
  duration: `${2.5 + (i % 3) * 0.8}s`,
  isCircle: i % 3 === 0,
}));
const MASCOT = [
  'আপনার Facebook পেজ connect করুন!',
  'পণ্যের তথ্য দিন, বট সেগুলো চিনবে!',
  'বটকে আপনার ব্যবসা সম্পর্কে জানান!',
  'দারুণ! সব কিছু সেট হয়ে গেছে!',
];
const STEP_LABELS = ['পেজ', 'পণ্য', 'বট', 'সম্পন্ন'];

export function OnboardingFlow({ dark, user, activePage, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<OBStep>(1);
  const [animating, setAnimating] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [wizardExiting, setWizardExiting] = useState(false);
  const [pageConnected, setPageConnected] = useState(false);
  const [productAdded, setProductAdded] = useState(false);
  const [productSkipped, setProductSkipped] = useState(false);
  const [botSaved, setBotSaved] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [justCompleted, setJustCompleted] = useState<OBStep | null>(null);
  const { request } = useApi();

  const bg = dark ? '#0f0f1a' : '#f8fafc';
  const panel = dark ? '#1a1b2e' : '#ffffff';
  const border = dark ? '#2e3050' : '#e5e7eb';
  const text = dark ? '#e2e3f0' : '#111827';
  const muted = dark ? '#6b7280' : '#9ca3af';
  const accent = '#6366f1';
  const accentSoft = dark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)';

  const advanceStep = useCallback((nextStep: OBStep) => {
    if (animating) return;
    setAnimating(true);
    setExiting(true);
    setTimeout(() => {
      setStep(nextStep);
      setExiting(false);
      setJustCompleted(nextStep > 1 ? (nextStep - 1) as OBStep : null);
      setTimeout(() => { setAnimating(false); setJustCompleted(null); }, 400);
    }, 250);
  }, [animating]);

  const handleFinish = () => {
    if (wizardExiting) return;
    setWizardExiting(true);
    setTimeout(onComplete, 500);
  };

  const handleSkipConfirm = () => {
    if (wizardExiting) return;
    setWizardExiting(true);
    setTimeout(onSkip, 500);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10100,
      background: bg, overflow: 'auto',
      animation: wizardExiting
        ? 'ob-slide-down 500ms ease-in forwards'
        : 'ob-slide-up 500ms ease-out both',
    }}>
      <style>{`
        @keyframes ob-slide-up   { from { transform:translateY(100%);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes ob-slide-down { from { transform:translateY(0);opacity:1 } to { transform:translateY(100%);opacity:0 } }
        @keyframes ob-step-out   { from { transform:translateX(0);opacity:1 } to { transform:translateX(-60px);opacity:0 } }
        @keyframes ob-step-in    { from { transform:translateX(60px);opacity:0 } to { transform:translateX(0);opacity:1 } }
        @keyframes ob-dot-pop    { 0%{transform:scale(1)} 50%{transform:scale(1.35)} 100%{transform:scale(1)} }
        @keyframes ob-pulse-ring { 0%{box-shadow:0 0 0 0 rgba(99,102,241,.55)} 70%{box-shadow:0 0 0 10px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        @keyframes ob-shake      { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
        @keyframes ob-fade-in    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ob-orb-float  { 0%,100%{transform:translate(0,0)} 33%{transform:translate(18px,-22px)} 66%{transform:translate(-14px,16px)} }
        @keyframes ob-confetti   { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:0} }
        @keyframes ob-bubble-in  { from{transform:translateX(-20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes ob-check-circle { from{stroke-dashoffset:289} to{stroke-dashoffset:0} }
        @keyframes ob-check-mark   { from{stroke-dashoffset:60}  to{stroke-dashoffset:0}  }
        @keyframes ob-check-bounce { 0%{transform:scale(0.85)} 50%{transform:scale(1.12)} 100%{transform:scale(1)} }
        @keyframes ob-btn-glow   { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.6)} 50%{box-shadow:0 0 18px 4px rgba(99,102,241,.3)} }
        @keyframes ob-badge-in   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Background orbs (dark only) */}
      {dark && [
        { size: 480, color: '#6366f1', top: '-10%', left: '-5%', dur: '14s', delay: '0s' },
        { size: 380, color: '#8b5cf6', top: '55%', left: '70%', dur: '18s', delay: '-6s' },
        { size: 320, color: '#3b82f6', top: '30%', left: '40%', dur: '22s', delay: '-10s' },
      ].map((o, i) => (
        <div key={i} style={{
          position: 'fixed', borderRadius: '50%', pointerEvents: 'none',
          width: o.size, height: o.size, background: o.color,
          opacity: 0.12, filter: 'blur(80px)',
          top: o.top, left: o.left,
          animation: `ob-orb-float ${o.dur} ease-in-out infinite`,
          animationDelay: o.delay,
        }} />
      ))}

      {/* Confetti (step 4 only) */}
      {step === 4 && CONFETTI.map((c, i) => (
        <div key={i} style={{
          position: 'fixed', top: 0, left: c.left, zIndex: 10101,
          width: c.size, height: c.size, pointerEvents: 'none',
          borderRadius: c.isCircle ? '50%' : 2,
          background: c.color,
          animation: `ob-confetti ${c.duration} ease-in ${c.delay} both`,
        }} />
      ))}

      {/* Main wizard container */}
      <div style={{
        maxWidth: 580, margin: '0 auto', minHeight: '100vh',
        display: 'flex', flexDirection: 'column', padding: '0 16px',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          height: 64, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: accent, letterSpacing: -0.5 }}>
            🐱 Chatcat
          </div>
          {step < 4 && (
            <button onClick={() => setShowSkipConfirm(true)} style={{
              background: 'none', border: 'none', color: muted,
              cursor: 'pointer', fontSize: 13, padding: '6px 10px',
            }}>
              এখন না →
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ paddingBottom: 28, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEP_LABELS.map((label, i) => {
              const s = (i + 1) as OBStep;
              const completed = step > s || (step === 4);
              const active = step === s;
              const popped = justCompleted === s;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: completed ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                      border: `2px solid ${active ? accent : completed ? accent : border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      color: completed ? '#fff' : active ? accent : muted,
                      animation: popped ? 'ob-dot-pop 350ms ease'
                        : active ? 'ob-pulse-ring 1.8s ease-in-out infinite' : 'none',
                      transition: 'background 300ms, border-color 300ms',
                    }}>
                      {completed ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: 11, color: active ? accent : completed ? accent : muted, whiteSpace: 'nowrap', fontWeight: active || completed ? 600 : 400 }}>
                      {label}
                    </div>
                  </div>
                  {i < 3 && (
                    <div style={{ flex: 1, height: 2, background: border, position: 'relative', margin: '0 6px', marginBottom: 18 }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                        width: completed ? '100%' : '0%',
                        transition: 'width 400ms ease',
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', paddingBottom: 80 }}>
          <div style={{
            width: '100%',
            animation: exiting ? 'ob-step-out 250ms ease forwards' : 'ob-step-in 300ms ease forwards',
          }}>
            {step === 1 && (
              <Step1PageConnect
                dark={dark} panel={panel} border={border} text={text} muted={muted}
                accent={accent} accentSoft={accentSoft}
                activePage={activePage}
                onConnected={() => { setPageConnected(true); advanceStep(2); }}
                onSkip={() => advanceStep(2)}
                request={request}
              />
            )}
            {step === 2 && (
              <Step2AddProduct
                dark={dark} panel={panel} border={border} text={text} muted={muted}
                accent={accent} accentSoft={accentSoft}
                activePage={activePage}
                onAdded={() => { setProductAdded(true); advanceStep(3); }}
                onSkip={() => { setProductSkipped(true); advanceStep(3); }}
              />
            )}
            {step === 3 && (
              <Step3BotSetup
                dark={dark} panel={panel} border={border} text={text} muted={muted}
                accent={accent}
                activePage={activePage}
                userName={user.name}
                onSaved={() => { setBotSaved(true); advanceStep(4); }}
                onSkip={() => advanceStep(4)}
                request={request}
              />
            )}
            {step === 4 && (
              <Step4Complete
                dark={dark} text={text} muted={muted} accent={accent} accentSoft={accentSoft}
                pageConnected={pageConnected}
                productAdded={productAdded}
                productSkipped={productSkipped}
                botSaved={botSaved}
                onFinish={handleFinish}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mascot */}
      {step < 4 && (
        <div style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 10102,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
          maxWidth: 210,
        }}>
          <div key={step} style={{
            background: panel, border: `1px solid ${border}`,
            borderRadius: '12px 12px 12px 2px', padding: '10px 14px',
            fontSize: 12.5, color: text, lineHeight: 1.5,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            animation: 'ob-bubble-in 400ms ease-out both',
          }}>
            {MASCOT[step - 1]}
          </div>
          <div style={{ fontSize: 28, paddingLeft: 8 }}>🤖</div>
        </div>
      )}

      {/* Skip confirm dialog */}
      {showSkipConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10103, animation: 'ob-fade-in 200ms ease both',
        }}>
          <div style={{
            background: panel, borderRadius: 16, padding: 28,
            maxWidth: 360, width: '90%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 24, textAlign: 'center', marginBottom: 12 }}>⏭️</div>
            <p style={{ color: text, lineHeight: 1.6, marginBottom: 8, fontWeight: 600 }}>
              Onboarding এড়িয়ে যাবেন?
            </p>
            <p style={{ color: muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 24 }}>
              আপনি পরে Settings থেকে এটি সম্পন্ন করতে পারবেন।
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSkipConfirm(false)} style={{
                padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5,
                background: 'none', border: `1px solid ${border}`, color: text,
              }}>
                বাতিল করুন
              </button>
              <button onClick={handleSkipConfirm} style={{
                padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5,
                background: 'none', border: '1px solid #ef4444', color: '#ef4444',
              }}>
                এড়িয়ে যান
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Facebook Page Connect ────────────────────────────────────────────

function Step1PageConnect({ dark, panel, border, text, muted, accent, accentSoft, activePage, onConnected, onSkip, request }: any) {
  const [tab, setTab] = useState<'request' | 'manual'>('request');
  const [reqPageUrl, setReqPageUrl] = useState('');
  const [reqFbProfile, setReqFbProfile] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const inputStyle = (focused: boolean) => ({
    width: '100%', boxSizing: 'border-box' as const,
    padding: '10px 13px', borderRadius: 10, fontSize: 14,
    background: dark ? '#252640' : '#f3f4f6',
    border: `1.5px solid ${focused ? accent : border}`,
    color: text, outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.18)' : 'none',
    transition: 'border-color 200ms, box-shadow 200ms',
  });
  const [f1, setF1] = useState(false);
  const [f2, setF2] = useState(false);
  const [f3, setF3] = useState(false);

  const handleRequest = async () => {
    if (!reqPageUrl.trim() || !reqFbProfile.trim()) { setError('সব ঘর পূরণ করুন'); return; }
    setLoading(true); setError('');
    try {
      await request(`${API_BASE}/facebook/page-request`, {
        method: 'POST',
        body: JSON.stringify({ pageUrl: reqPageUrl.trim(), fbProfile: reqFbProfile.trim() }),
      });
      setSuccess(true);
      setTimeout(onConnected, 1500);
    } catch (e: any) {
      setError(e?.message || 'কিছু একটা ভুল হয়েছে।');
    } finally { setLoading(false); }
  };

  const handleManual = async () => {
    if (!manualToken.trim()) { setError('Token দিন'); return; }
    setLoading(true); setError('');
    try {
      await request(`${API_BASE}/facebook/connect`, {
        method: 'POST',
        body: JSON.stringify({ token: manualToken.trim() }),
      });
      setSuccess(true);
      setTimeout(onConnected, 1500);
    } catch (e: any) {
      setError(e?.message || 'Token সঠিক নয়।');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: text, margin: '0 0 6px' }}>
        Facebook পেজ যুক্ত করুন
      </h2>
      <p style={{ color: muted, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        আপনার Facebook পেজের সাথে Chatcat সংযুক্ত করুন — bot এই পেজে কাজ করবে।
      </p>

      {success ? (
        <div style={{ textAlign: 'center', padding: '32px 0', animation: 'ob-fade-in 400ms ease both' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: '#22c55e',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, animation: 'ob-dot-pop 350ms ease',
          }}>✓</div>
          <p style={{ color: '#22c55e', fontWeight: 600, marginTop: 14, fontSize: 16 }}>
            পেজ সংযুক্ত হয়েছে! ✓
          </p>
        </div>
      ) : (
        <div style={{ background: panel, borderRadius: 16, border: `1px solid ${border}`, overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', position: 'relative', borderBottom: `1px solid ${border}` }}>
            {(['request', 'manual'] as const).map((t, i) => (
              <button key={t} onClick={() => { setTab(t); setError(''); }} style={{
                flex: 1, padding: '13px 8px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13.5, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? accent : muted,
              }}>
                {i === 0 ? 'অ্যাক্সেস রিকোয়েস্ট' : 'ম্যানুয়াল টোকেন'}
              </button>
            ))}
            <div style={{
              position: 'absolute', bottom: 0, height: 2,
              background: accent, width: '50%',
              left: tab === 'request' ? '0%' : '50%',
              transition: 'left 200ms ease',
            }} />
          </div>

          <div style={{ padding: 20 }}>
            {tab === 'request' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Facebook পেজের URL</label>
                  <input value={reqPageUrl} onChange={e => setReqPageUrl(e.target.value)}
                    onFocus={() => setF1(true)} onBlur={() => setF1(false)}
                    placeholder="https://facebook.com/yourpage"
                    style={inputStyle(f1)} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>আপনার Facebook Profile URL</label>
                  <input value={reqFbProfile} onChange={e => setReqFbProfile(e.target.value)}
                    onFocus={() => setF2(true)} onBlur={() => setF2(false)}
                    placeholder="https://facebook.com/yourprofile"
                    style={inputStyle(f2)} />
                </div>
                <p style={{ fontSize: 12, color: muted, lineHeight: 1.6, margin: 0 }}>
                  আমরা আপনাকে Facebook App-এ Tester হিসেবে invite করব। Invite accept করার পর manual token দিয়ে connect করুন।
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>Page Access Token</label>
                  <textarea value={manualToken} onChange={e => setManualToken(e.target.value)}
                    onFocus={() => setF3(true)} onBlur={() => setF3(false)}
                    placeholder="EAAxxxxx..."
                    rows={3}
                    style={{ ...inputStyle(f3), resize: 'none', fontFamily: 'monospace', fontSize: 12 } as any} />
                </div>
                <p style={{ fontSize: 12, color: muted, lineHeight: 1.6, margin: 0 }}>
                  Graph API Explorer থেকে Page Access Token নিন এবং এখানে paste করুন।
                </p>
              </div>
            )}

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginTop: 10, animation: 'ob-fade-in 200ms ease' }}>
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={tab === 'request' ? handleRequest : handleManual}
              disabled={loading}
              style={{
                marginTop: 16, width: '100%', padding: '12px',
                background: loading ? (dark ? '#2e3050' : '#e5e7eb') : `linear-gradient(135deg,${accent},#8b5cf6)`,
                border: 'none', borderRadius: 10, color: '#fff',
                fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 200ms',
              }}
            >
              {loading ? '...' : tab === 'request' ? 'রিকোয়েস্ট পাঠান' : 'Connect করুন'}
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 14 }}>
        <button onClick={onSkip} style={{
          background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 13,
        }}>
          এখন না, পরে করব →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Add First Product ────────────────────────────────────────────────

function Step2AddProduct({ dark, panel, border, text, muted, accent, accentSoft, activePage, onAdded, onSkip }: any) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [code, setCode] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [f1, setF1] = useState(false);
  const [f2, setF2] = useState(false);
  const [f3, setF3] = useState(false);

  const inputStyle = (focused: boolean) => ({
    width: '100%', boxSizing: 'border-box' as const,
    padding: '10px 13px', borderRadius: 10, fontSize: 14,
    background: dark ? '#252640' : '#f3f4f6',
    border: `1.5px solid ${focused ? accent : border}`,
    color: text, outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.18)' : 'none',
    transition: 'border-color 200ms, box-shadow 200ms',
  });

  const handleFile = (file?: File | null) => {
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setLoading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('price', price.trim());
      if (code.trim()) fd.append('code', code.trim());
      if (imageFile) fd.append('image', imageFile);
      const token = localStorage.getItem('dfbot_token') || '';
      const res = await fetch(`${API_BASE}/products/${activePage.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error('সংযোগ সমস্যা');
      setSuccess(true);
      setTimeout(onAdded, 1500);
    } catch (e: any) {
      setError(e?.message || 'কিছু একটা ভুল হয়েছে।');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🛍️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: text, margin: '0 0 6px' }}>
        প্রথম পণ্য যোগ করুন
      </h2>
      <p style={{ color: muted, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        আপনার একটি পণ্যের তথ্য দিন — পরে আরো যোগ করতে পারবেন।
      </p>

      {success ? (
        <div style={{ animation: 'ob-badge-in 400ms ease both', background: accentSoft, borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'center' }}>
          {previewUrl && <img src={previewUrl} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} alt="" />}
          <div>
            <div style={{ fontWeight: 700, color: text }}>{name}</div>
            <div style={{ color: '#22c55e', fontWeight: 600, marginTop: 3 }}>৳{price}</div>
          </div>
          <div style={{ marginLeft: 'auto', color: '#22c55e', fontWeight: 700 }}>✓ যোগ হয়েছে</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: shake ? 'ob-shake 400ms ease' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>পণ্যের নাম *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                onFocus={() => setF1(true)} onBlur={() => setF1(false)}
                placeholder="যেমন: কটন শার্ট"
                style={inputStyle(f1)} />
            </div>
            <div>
              <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>মূল্য ৳ *</label>
              <input value={price} onChange={e => setPrice(e.target.value)}
                onFocus={() => setF2(true)} onBlur={() => setF2(false)}
                placeholder="৫৫০"
                type="number" style={inputStyle(f2)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>পণ্য কোড (ঐচ্ছিক)</label>
            <input value={code} onChange={e => setCode(e.target.value)}
              onFocus={() => setF3(true)} onBlur={() => setF3(false)}
              placeholder="যেমন: SHIRT-01"
              style={inputStyle(f3)} />
          </div>

          {/* Image drop zone */}
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>ছবি (ঐচ্ছিক)</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? accent : border}`, borderRadius: 12,
                padding: previewUrl ? '12px' : '28px 16px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'rgba(99,102,241,0.08)' : 'transparent',
                transition: 'all 200ms',
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} style={{ maxHeight: 80, maxWidth: '100%', borderRadius: 8, animation: 'ob-fade-in 300ms ease' }} alt="preview" />
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                  <div style={{ color: muted, fontSize: 13 }}>ছবি টেনে আনুন বা ক্লিক করুন</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 13, animation: 'ob-fade-in 200ms ease' }}>⚠️ {error}</div>}

          <button onClick={handleSubmit} disabled={loading} style={{
            padding: '12px', background: loading ? (dark ? '#2e3050' : '#e5e7eb') : `linear-gradient(135deg,${accent},#8b5cf6)`,
            border: 'none', borderRadius: 10, color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 200ms',
          }}>
            {loading ? '...' : 'পণ্য যোগ করুন →'}
          </button>
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 14 }}>
        <button onClick={onSkip} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 13 }}>
          এখন না, পরে করব →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Bot Setup ────────────────────────────────────────────────────────

function Step3BotSetup({ dark, panel, border, text, muted, accent, activePage, userName, onSaved, onSkip, request }: any) {
  const [businessName, setBusinessName] = useState(userName || '');
  const [phone, setPhone] = useState('');
  const [dhakaCharge, setDhakaCharge] = useState('');
  const [outsideCharge, setOutsideCharge] = useState('');
  const [botOn, setBotOn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [f1, setF1] = useState(false);
  const [f2, setF2] = useState(false);
  const [f3, setF3] = useState(false);
  const [f4, setF4] = useState(false);

  const inputStyle = (focused: boolean) => ({
    width: '100%', boxSizing: 'border-box' as const,
    padding: '10px 13px', borderRadius: 10, fontSize: 14,
    background: dark ? '#252640' : '#f3f4f6',
    border: `1.5px solid ${focused ? accent : border}`,
    color: text, outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.18)' : 'none',
    transition: 'border-color 200ms, box-shadow 200ms',
  });

  const handleSave = async () => {
    setLoading(true); setError('');
    try {
      await request(`${API_BASE}/page/${activePage.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          businessInfo: {
            name: businessName.trim(),
            phone: phone.trim(),
            dhaka: dhakaCharge.trim(),
            outside: outsideCharge.trim(),
          },
          automationOn: botOn,
        }),
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'সেভ করা যায়নি।');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: text, margin: '0 0 6px' }}>
        বটের তথ্য সেট করুন
      </h2>
      <p style={{ color: muted, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        আপনার ব্যবসার তথ্য দিন — বট এটি ব্যবহার করে কাস্টমারকে জানাবে।
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>ব্যবসার নাম</label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)}
              onFocus={() => setF1(true)} onBlur={() => setF1(false)}
              style={inputStyle(f1)} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>ফোন নম্বর</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              onFocus={() => setF2(true)} onBlur={() => setF2(false)}
              placeholder="01XXXXXXXXX" style={inputStyle(f2)} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>ডেলিভারি — ঢাকা ৳</label>
            <input value={dhakaCharge} onChange={e => setDhakaCharge(e.target.value)}
              onFocus={() => setF3(true)} onBlur={() => setF3(false)}
              placeholder="60" type="number" style={inputStyle(f3)} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: muted, fontWeight: 600, display: 'block', marginBottom: 5 }}>ডেলিভারি — ঢাকার বাইরে ৳</label>
            <input value={outsideCharge} onChange={e => setOutsideCharge(e.target.value)}
              onFocus={() => setF4(true)} onBlur={() => setF4(false)}
              placeholder="120" type="number" style={inputStyle(f4)} />
          </div>
        </div>

        {/* Bot toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: dark ? '#252640' : '#f3f4f6', borderRadius: 12, padding: '14px 16px',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: text, fontSize: 14 }}>Bot Automation</div>
            <div style={{ color: botOn ? '#22c55e' : '#ef4444', fontSize: 12.5, marginTop: 2 }}>
              {botOn ? '● বট চালু আছে' : '● বট বন্ধ'}
            </div>
          </div>
          <div
            onClick={() => setBotOn(v => !v)}
            style={{
              width: 60, height: 32, borderRadius: 16, cursor: 'pointer', flexShrink: 0, position: 'relative',
              background: botOn ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : (dark ? '#333' : '#ccc'),
              transition: 'background 300ms',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: botOn ? 31 : 3,
              width: 26, height: 26, borderRadius: '50%',
              background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              transition: 'left 250ms cubic-bezier(0.34,1.56,0.64,1)',
            }} />
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 13, animation: 'ob-fade-in 200ms ease' }}>⚠️ {error}</div>}

        <button onClick={handleSave} disabled={loading} style={{
          padding: '12px', background: loading ? (dark ? '#2e3050' : '#e5e7eb') : `linear-gradient(135deg,${accent},#8b5cf6)`,
          border: 'none', borderRadius: 10, color: '#fff',
          fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background 200ms',
        }}>
          {loading ? '...' : 'সম্পন্ন করুন →'}
        </button>
      </div>

      <div style={{ textAlign: 'right', marginTop: 14 }}>
        <button onClick={onSkip} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 13 }}>
          এখন না, পরে করব →
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Celebration ──────────────────────────────────────────────────────

function Step4Complete({ dark, text, muted, accent, accentSoft, pageConnected, productAdded, productSkipped, botSaved, onFinish }: any) {
  const badges = [
    { label: '✅ পেজ সংযুক্ত', done: pageConnected, delay: '1600ms' },
    { label: productSkipped ? '⚠️ পণ্য এখনো যোগ হয়নি' : '✅ পণ্য যোগ করা হয়েছে', done: !productSkipped, delay: '1800ms' },
    { label: '✅ বট সক্রিয়', done: botSaved, delay: '2000ms' },
  ];

  return (
    <div style={{ textAlign: 'center', paddingTop: 16 }}>
      {/* SVG Checkmark */}
      <div style={{ animation: 'ob-check-bounce 400ms ease 1.2s both', display: 'inline-block', marginBottom: 24 }}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="ob-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="46"
            fill="none" stroke="url(#ob-grad)" strokeWidth="4"
            strokeDasharray="289" strokeDashoffset="289" strokeLinecap="round"
            style={{ animation: 'ob-check-circle 600ms ease-out 200ms forwards' }}
          />
          <path d="M28 52 L43 67 L72 35"
            fill="none" stroke="url(#ob-grad)" strokeWidth="5"
            strokeDasharray="60" strokeDashoffset="60" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: 'ob-check-mark 400ms ease-out 800ms forwards' }}
          />
        </svg>
      </div>

      <h2 style={{ fontSize: 26, fontWeight: 800, color: text, margin: '0 0 8px', animation: 'ob-fade-in 400ms ease 1.1s both', opacity: 0 }}>
        আপনার বট এখন চালু! 🎉
      </h2>
      <p style={{ color: muted, fontSize: 14, marginBottom: 28, animation: 'ob-fade-in 400ms ease 1.3s both', opacity: 0 }}>
        Messenger-এ অর্ডার নেওয়া এখন থেকে শুরু হয়ে যাবে।
      </p>

      {/* Badges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
        {badges.map((b, i) => (
          <div key={i} style={{
            padding: '12px 18px', borderRadius: 12,
            background: b.done ? accentSoft : (dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9'),
            fontWeight: 600, color: b.done ? text : muted, fontSize: 14,
            opacity: 0,
            animation: `ob-badge-in 400ms ease ${b.delay} forwards`,
          }}>
            {b.label}
          </div>
        ))}
      </div>

      <button onClick={onFinish} style={{
        padding: '14px 36px', fontSize: 16, fontWeight: 700,
        background: `linear-gradient(135deg,${accent},#8b5cf6)`,
        border: 'none', borderRadius: 14, color: '#fff', cursor: 'pointer',
        animation: 'ob-btn-glow 2s ease-in-out infinite, ob-fade-in 400ms ease 2.2s both',
        opacity: 0,
      }}>
        Dashboard-এ যান →
      </button>
    </div>
  );
}
