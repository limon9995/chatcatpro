import React, { useCallback, useEffect, useState, lazy } from 'react';
import { useLanguage } from '../i18n';

// ── Design Tokens ─────────────────────────────────────────────────────────────
// Modern SaaS — Notion/Linear inspired
// Light: crisp white + soft gray surface + deep indigo accent
// Dark:  near-black + elevated surface + same indigo accent

export function getTheme(dark: boolean) {
  // Surfaces
  const bg        = dark ? '#070811' : '#f5f7fb';
  const panel     = dark ? '#121624' : '#ffffff';
  const surface   = dark ? '#181d2d' : '#eef2ff';
  const elevated  = dark ? '#1f2538' : '#ffffff';

  // Borders
  const border    = dark ? 'rgba(148,163,184,0.14)' : 'rgba(99,102,241,0.10)';
  const borderMd  = dark ? 'rgba(148,163,184,0.24)' : 'rgba(99,102,241,0.18)';

  // Text
  const text      = dark ? '#eef2ff' : '#111827';
  const textSub   = dark ? 'rgba(226,232,255,0.76)' : 'rgba(17,24,39,0.68)';
  const muted     = dark ? 'rgba(191,203,255,0.48)' : 'rgba(55,65,81,0.44)';

  // Accent — indigo
  const accent     = '#4f46e5';
  const accentHov  = '#4338ca';
  const accentSoft = dark ? 'rgba(99,102,241,0.20)' : 'rgba(79,70,229,0.10)';
  const accentText = dark ? '#a5b4fc' : '#4f46e5';

  // Shadows
  const shadow   = dark
    ? '0 10px 30px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.03) inset'
    : '0 10px 28px rgba(15,23,42,0.08), 0 1px 0 rgba(255,255,255,0.9) inset';
  const shadowMd = dark
    ? '0 18px 50px rgba(0,0,0,0.38)'
    : '0 14px 36px rgba(15,23,42,0.10)';
  const shadowLg = dark
    ? '0 22px 70px rgba(0,0,0,0.46)'
    : '0 18px 54px rgba(15,23,42,0.12)';

  // Base input style
  const inp: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: 8,
    fontFamily: 'inherit',
    border: `1px solid ${borderMd}`,
    outline: 'none',
    background: dark ? 'rgba(255,255,255,0.04)' : panel,
    color: text,
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 13.5,
    transition: 'border-color .15s, box-shadow .15s',
  };

  // Base button style
  const btn: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${borderMd}`,
    background: dark ? 'rgba(255,255,255,0.06)' : surface,
    color: text,
    cursor: 'pointer',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontSize: 13,
    transition: 'all .15s',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    letterSpacing: '-0.01em',
  };

  const sm: React.CSSProperties = { ...btn, padding: '5px 10px', fontSize: 12, borderRadius: 7 };

  return {
    // Tokens
    bg, panel, surface, elevated, border, borderMd,
    text, textSub, muted, accent, accentHov, accentSoft, accentText,
    shadow, shadowMd, shadowLg,

    // Layout
    app: {
      minHeight: '100vh',
      background: dark
        ? 'radial-gradient(circle at top left, rgba(79,70,229,0.16), transparent 24%), radial-gradient(circle at top right, rgba(14,165,233,0.10), transparent 18%), #070811'
        : 'linear-gradient(180deg, #f8fbff 0%, #eef2ff 100%)',
      color: text,
      fontFamily: "'Geist','DM Sans','Noto Sans Bengali',system-ui,sans-serif",
      fontSize: 14, lineHeight: 1.5,
    } as React.CSSProperties,

    topbar: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0 24px', height: 64,
      borderBottom: `1px solid ${border}`,
      background: dark ? 'rgba(10,12,21,0.72)' : 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      position: 'sticky' as const, top: 0, zIndex: 40,
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.22)' : '0 8px 24px rgba(148,163,184,0.12)',
    } as React.CSSProperties,

    layout: {
      display: 'grid',
      gridTemplateColumns: '272px 1fr',
      minHeight: 'calc(100vh - 64px)',
    } as React.CSSProperties,

    sidebar: {
      background: dark ? 'rgba(9,11,20,0.92)' : 'rgba(255,255,255,0.82)',
      borderRight: `1px solid ${border}`,
      padding: '12px 10px',
      display: 'flex', flexDirection: 'column' as const, gap: 1,
      position: 'sticky' as const, top: 64,
      height: 'calc(100vh - 64px)', overflowY: 'auto' as const,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    } as React.CSSProperties,

    main: {
      padding: '28px 32px',
      display: 'flex', flexDirection: 'column' as const, gap: 20,
      overflowY: 'auto' as const, minWidth: 0,
      maxWidth: '100%',
    } as React.CSSProperties,

    // Cards
    card: {
      background: panel,
      border: `1px solid ${border}`,
      borderRadius: 24,
      padding: '24px 26px',
      boxShadow: shadow,
    } as React.CSSProperties,

    card2: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: 16,
      padding: '12px 14px',
    } as React.CSSProperties,

    // Form
    input: inp,

    // Buttons
    btn,
    btnPrimary: {
      ...btn,
      background: dark ? 'linear-gradient(135deg, #4f46e5, #7e22ce)' : 'linear-gradient(135deg, #4f46e5, #6366f1)',
      color: '#fff', border: 'none',
      boxShadow: dark ? '0 4px 15px rgba(0,0,0,0.4)' : `0 4px 12px ${accent}44`,
      fontWeight: 700,
      transition: 'all .25s cubic-bezier(0.4, 0, 0.2, 1)',
    } as React.CSSProperties,
    btnGhost: {
      ...btn,
      background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.66)',
      border: `1px solid ${border}`,
    } as React.CSSProperties,
    btnDanger: {
      ...btn,
      background: dark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
      border: `1px solid rgba(239,68,68,0.20)`, color: '#ef4444',
    } as React.CSSProperties,
    btnSuccess: {
      ...btn,
      background: dark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.07)',
      border: `1px solid rgba(34,197,94,0.22)`, color: '#16a34a',
    } as React.CSSProperties,

    // Small buttons
    btnSm:        { ...sm } as React.CSSProperties,
    btnSmDanger:  { ...sm, background: dark ? 'rgba(239,68,68,0.12)':'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.20)', color:'#ef4444' } as React.CSSProperties,
    btnSmGhost:   { ...sm, background: 'transparent', border: `1px solid ${border}` } as React.CSSProperties,
    btnSmSuccess: { ...sm, background: dark ? 'rgba(34,197,94,0.12)':'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.22)', color:'#16a34a' } as React.CSSProperties,
    btnSmAccent:  { ...sm, background: accentSoft, border:`1px solid ${accent}33`, color: accentText } as React.CSSProperties,

    // Navigation
    navBtn: {
      width: '100%', textAlign: 'left' as const,
      padding: '7px 10px', borderRadius: 9, border: 'none',
      background: 'transparent', color: textSub,
      cursor: 'pointer', fontWeight: 500, fontSize: 13,
      transition: 'background .12s, color .12s', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', gap: 9,
      letterSpacing: '-0.015em',
    } as React.CSSProperties,
    navBtnActive: {
      background: dark
        ? 'rgba(99,102,241,0.16)'
        : 'rgba(99,102,241,0.10)',
      color: dark ? '#a5b4fc' : '#4338ca',
      fontWeight: 600,
    } as React.CSSProperties,

    // Toggle
    toggleRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 14px', borderRadius: 10, border: `1px solid ${border}`,
      background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
    } as React.CSSProperties,
    toggle: {
      padding: '5px 18px', borderRadius: 999, border: `1px solid ${borderMd}`,
      cursor: 'pointer', fontWeight: 700, minWidth: 58,
      fontSize: 11.5, transition: 'all .15s', fontFamily: 'inherit',
      letterSpacing: '0.02em',
    } as React.CSSProperties,
    toggleOn:  { background: dark ? 'rgba(34,197,94,0.20)':'rgba(34,197,94,0.12)', color:'#16a34a', borderColor:'rgba(34,197,94,0.32)' } as React.CSSProperties,
    toggleOff: { background: dark ? 'rgba(239,68,68,0.14)':'rgba(239,68,68,0.07)', color:'#ef4444', borderColor:'rgba(239,68,68,0.24)' } as React.CSSProperties,

    // Table
    table:  { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th:     { textAlign:'left' as const, padding:'10px 14px', fontSize:11, color:muted, borderBottom:`1px solid ${border}`, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' } as React.CSSProperties,
    td:     { textAlign:'left' as const, padding:'12px 14px', fontSize:13.5, borderBottom:`1px solid ${border}`, verticalAlign:'middle' as const } as React.CSSProperties,

    // Pills / badges
    pill:       { display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:999, fontSize:11.5, fontWeight:600, gap:4, letterSpacing:'-0.01em' } as React.CSSProperties,
    pillGreen:  { background: dark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.09)', color:'#16a34a', border:'1px solid rgba(34,197,94,0.24)' } as React.CSSProperties,
    pillYellow: { background: dark ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.09)', color:'#b45309', border:'1px solid rgba(234,179,8,0.24)' } as React.CSSProperties,
    pillRed:    { background: dark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.07)', color:'#dc2626', border:'1px solid rgba(239,68,68,0.22)' } as React.CSSProperties,
    pillBlue:   { background: dark ? 'rgba(79,70,229,0.18)' : 'rgba(79,70,229,0.08)', color:accentText, border:`1px solid ${accent}33` } as React.CSSProperties,
    pillGray:   { background: dark ? 'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)', color:muted, border:`1px solid ${border}` } as React.CSSProperties,

    // Alerts
    alert:     { padding:'11px 14px', borderRadius:10, fontSize:13 } as React.CSSProperties,
    alertErr:  { background: dark ? 'rgba(239,68,68,0.09)':'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.22)', color:'#ef4444' } as React.CSSProperties,
    alertOk:   { background: dark ? 'rgba(34,197,94,0.09)':'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.22)', color:'#16a34a' } as React.CSSProperties,
    alertInfo: { background: dark ? 'rgba(79,70,229,0.10)':'rgba(79,70,229,0.05)', border:`1px solid ${accent}28`, color:accentText } as React.CSSProperties,
  };
}

export type Theme = ReturnType<typeof getTheme>;

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin .65s linear infinite', flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" stroke={color || 'currentColor'} strokeWidth="2.5" strokeOpacity=".2"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke={color || 'currentColor'} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function LanguageSwitch({
  dark,
  compact = false,
}: {
  dark: boolean;
  compact?: boolean;
}) {
  const { language, setLanguage } = useLanguage();
  const border = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  const bg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)';
  const activeBg = dark ? 'rgba(79,70,229,0.25)' : 'rgba(79,70,229,0.12)';
  const text = dark ? '#e5e7eb' : '#111827';
  const muted = dark ? 'rgba(229,231,235,0.6)' : 'rgba(17,24,39,0.52)';

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: 4,
      borderRadius: compact ? 10 : 12,
      border: `1px solid ${border}`,
      background: bg,
    }}>
      {(['bn', 'en'] as const).map((code) => {
        const active = language === code;
        return (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            style={{
              border: 'none',
              background: active ? activeBg : 'transparent',
              color: active ? text : muted,
              cursor: active ? 'default' : 'pointer',
              borderRadius: compact ? 8 : 10,
              padding: compact ? '6px 8px' : '7px 10px',
              fontSize: compact ? 11.5 : 12.5,
              fontWeight: 800,
              fontFamily: 'inherit',
              minWidth: compact ? 44 : 56,
              transition: 'all .15s',
            }}
          >
            {code === 'bn' ? 'বাংলা' : 'English'}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ th, label, sub, checked, onChange, disabled }: {
  th: Theme; label: string; sub?: string;
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div style={{ ...th.toggleRow, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        style={{ ...th.toggle, ...(checked ? th.toggleOn : th.toggleOff) }}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        {checked ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ th, label, children }: { th: Theme; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, color: th.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ── InfoButton (ⓘ tooltip) ────────────────────────────────────────────────────
export function InfoButton({ text, th }: { text: string; th: Theme }) {
  const [show, setShow] = useState(false);
  if (!text?.trim()) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <button
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}     onBlur={() => setShow(false)}
        style={{
          background: th.accentSoft, border: 'none', cursor: 'pointer',
          padding: 0, color: th.accentText, fontSize: 12, lineHeight: 1,
          width: 16, height: 16, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={text} aria-label="More info"
      >ⓘ</button>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: th.elevated, border: `1px solid ${th.borderMd}`,
          boxShadow: th.shadowLg, borderRadius: 10, padding: '10px 13px',
          width: 220, zIndex: 999, fontSize: 12, color: th.text, lineHeight: 1.6,
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ── FieldWithInfo ─────────────────────────────────────────────────────────────
export function FieldWithInfo({ th, label, helpText, children }: {
  th: Theme; label: string; helpText?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11.5, color: th.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {helpText && <InfoButton text={helpText} th={th} />}
      </div>
      {children}
    </div>
  );
}

// ── CardHeader ────────────────────────────────────────────────────────────────
export function CardHeader({ th, title, sub, action }: {
  th: Theme; title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>{action}</div>}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ th, status }: { th: Theme; status: string }) {
  const s = status?.toUpperCase();
  const map: Record<string, [string, any]> = {
    CONFIRMED: ['Confirmed', th.pillGreen],
    CANCELLED: ['Cancelled', th.pillRed],
    RECEIVED:  ['Received',  th.pillYellow],
    PENDING:   ['Pending',   th.pillYellow],
    ISSUE:     ['Issue',     th.pillRed],
    PENDING_CALL: ['Queued', th.pillYellow],
    CALLING: ['Calling', th.pillBlue],
    CONFIRMED_BY_CALL: ['Confirmed', th.pillGreen],
    CANCELLED_BY_CALL: ['Cancelled', th.pillRed],
    CALL_FAILED: ['Failed', th.pillRed],
    NEEDS_AGENT: ['Agent', th.pillYellow],
    NOT_ANSWERED: ['No answer', th.pillGray],
  };
  const [label, style] = map[s] || [s, th.pillGray];
  return <span style={{ ...th.pill, ...style }}>{label}</span>;
}

// ── CallBadge ─────────────────────────────────────────────────────────────────
export function CallBadge({ th, status }: { th: Theme; status: string }) {
  const s = status?.toUpperCase();
  if (s === 'NONE') return <span style={{ color: th.muted, fontSize: 12 }}>—</span>;
  const map: Record<string, [string, any]> = {
    PENDING_CALL:      ['Queued',    th.pillYellow],
    CALLING:           ['Calling',   th.pillBlue],
    CONFIRMED_BY_CALL: ['Confirmed', th.pillGreen],
    CANCELLED_BY_CALL: ['Cancelled', th.pillRed],
    CALL_FAILED:       ['Failed',    th.pillRed],
    NEEDS_AGENT:       ['Agent',     th.pillYellow],
    NOT_ANSWERED:      ['No answer', th.pillGray],
  };
  const [label, style] = map[s] || [s, th.pillGray];
  return <span style={{ ...th.pill, ...style }}>{label}</span>;
}

// ── Grid2 ─────────────────────────────────────────────────────────────────────
export function Grid2({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, alignItems: 'start' }}>
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ th }: { th: Theme }) {
  return <div style={{ height: 1, background: th.border, margin: '14px 0' }} />;
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
export function SectionLabel({ th, children }: { th: Theme; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: th.muted, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5, letterSpacing: '-0.02em' }}>{title}</div>
      {sub && <div style={{ fontSize: 13, opacity: 0.4, lineHeight: 1.6 }}>{sub}</div>}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ message, type, onClose }: {
  message: string; type?: 'error' | 'success' | 'info'; onClose: () => void;
}) {
  const colors = {
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', icon: '✕' },
    success: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a', icon: '✓' },
    info:    { bg: '#eef2ff', border: '#a5b4fc', color: '#4f46e5', icon: 'ℹ' },
  };
  const c = colors[type || 'success'];
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      borderRadius: 12, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      fontSize: 13.5, fontWeight: 600, maxWidth: 360,
      animation: 'toastIn .2s ease',
    }}>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, opacity: 0.6, fontSize: 14, padding: '0 2px' }}>✕</button>
    </div>
  );
}

// ── useToast hook ─────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type?: 'error' | 'success' | 'info' } | null>(null);

  const show = useCallback((message: string, type?: 'error' | 'success' | 'info') => {
    setToast({ message, type: type === 'error' ? 'error' : type === 'info' ? 'info' : 'success' });
  }, []);

  const ToastNode = toast ? (
    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
  ) : null;

  return { show, ToastNode };
}

// ── SaveBtn ───────────────────────────────────────────────────────────────────
export function SaveBtn({ onClick, loading, label = 'Save Changes' }: {
  onClick: () => void; loading?: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick} disabled={loading}
      style={{
        padding: '10px 22px', borderRadius: 10, border: 'none',
        background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4f46e5, #7e22ce)',
        color: '#fff', fontWeight: 800,
        fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        boxShadow: loading ? 'none' : '0 4px 12px rgba(79,70,229,0.3)',
        transition: 'all .2s cubic-bezier(0.4, 0, 0.2, 1)',
        letterSpacing: '-0.01em',
      }}
      onMouseOver={e => !loading && (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseOut={e => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {loading ? <Spinner size={14} color="#fff"/> : null}
      {label}
    </button>
  );
}
// ── safeLazy ──────────────────────────────────────────────────────────────────
/**
 * A wrapper for React.lazy that catches ChunkLoadErrors (which happen after a new deploy)
 * and reloads the page to get the latest assets.
 */
export function safeLazy<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (err: any) {
      const isChunkError =
        err.name === 'ChunkLoadError' ||
        /error loading dynamically imported module/i.test(err.message) ||
        /loading dynamically imported module/i.test(err.message);

      if (isChunkError) {
        console.warn('Dynamic import failed, reloading page...', err);
        window.location.reload();
        return { default: (() => null) as unknown as T }; // Prevent error boundary trigger before reload
      }
      throw err;
    }
  });
}
