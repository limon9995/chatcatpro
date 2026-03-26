import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { API_BASE, useApi } from './hooks/useApi';
import { getTheme, useToast } from './components/ui';
import { useLanguage } from './i18n';
import { LoginPage } from './pages/LoginPage';
import { SignupPageComponent } from './pages/SignupPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ConnectPageScreen } from './pages/ConnectPageScreen';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LandingPage } from './pages/LandingPage';
const DashboardLayout = lazy(async () => {
  const mod = await import('./pages/DashboardLayout');
  return { default: mod.DashboardLayout };
});
const AdminPanel = lazy(async () => {
  const mod = await import('./pages/AdminPanel');
  return { default: mod.AdminPanel };
});

type MyPage = { id: number; pageId: string; pageName: string; isActive: boolean; automationOn: boolean };
type Screen = 'landing' | 'login' | 'signup' | 'forgot-password' | 'change-password' | 'connect-page' | 'dashboard' | 'admin';

function ScreenFallback({ dark }: { dark: boolean }) {
  const { copy } = useLanguage();
  return (
    <div
      style={{
        minHeight: '100vh',
        background: dark ? '#06060a' : '#f7f7f8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui',
        color: dark ? '#ededf0' : '#0d0d10',
      }}
    >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>⬡</div>
        <div style={{ fontSize: 12, opacity: 0.35 }}>{copy('লোড হচ্ছে...', 'Loading...')}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { copy } = useLanguage();
  const [dark, setDark] = useState(() => localStorage.getItem('dfbot_dark') !== '0');
  const th = getTheme(dark);
  const { user, ready, login, logout, changePassword } = useAuth();
  const { request } = useApi();
  const { show: showToast, ToastNode } = useToast();

  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'login') return 'login';
    return params.get('mode') === 'signup' ? 'signup' : 'landing';
  });
  const [activePage, setActivePage] = useState<MyPage | null>(null);
  const [myPages, setMyPages] = useState<MyPage[]>([]);

  useEffect(() => {
    localStorage.setItem('dfbot_dark', dark ? '1' : '0');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.body.style.background = dark ? '#0a0a0f' : '#f7f7f8';
    document.body.style.color = dark ? '#ededf0' : '#0d0d10';
  }, [dark]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setScreen((s) => {
        if (s === 'signup') return 'signup';
        if (s === 'login' || s === 'forgot-password') return s;
        return 'landing';
      });
      return;
    }
    if (screen === 'landing') {
      return;
    }
    if (user.forcePasswordChange) {
      setScreen('change-password');
      return;
    }
    if (user.role === 'admin') {
      setScreen('admin');
      return;
    }
    void loadMyPages();
  }, [ready, user]);

  const loadMyPages = async () => {
    try {
      const pages: MyPage[] = await request(`${API_BASE}/facebook/my-pages`);
      setMyPages(pages);
      const activePages = pages.filter((page) => page.isActive);
      if (activePages.length === 0) {
        localStorage.removeItem('dfbot_active_page');
        setActivePage(null);
        setScreen('connect-page');
        return;
      }
      const savedId = localStorage.getItem('dfbot_active_page');
      const found = savedId ? activePages.find((page) => page.id === Number(savedId)) : null;
      const nextPage = found || activePages[0];
      setActivePage(nextPage);
      localStorage.setItem('dfbot_active_page', String(nextPage.id));
      setScreen('dashboard');
    } catch {
      setMyPages([]);
      setActivePage(null);
      setScreen('connect-page');
    }
  };

  useEffect(() => {
    if (!activePage?.id) return;
    localStorage.setItem('dfbot_active_page', String(activePage.id));
  }, [activePage?.id]);

  const handleLogin = async (username: string, password: string) => {
    const result = await login(username, password);
    if (result.mustChangePassword) {
      setScreen('change-password');
      return;
    }
    if (result.user?.role === 'admin') {
      setScreen('admin');
      return;
    }
    await loadMyPages();
  };

  const handleSignup = async (data: { identifier: string; password: string; name: string }) => {
    const raw = data.identifier.trim();
    const cleaned = raw.replace(/[\s-]/g, '');
    const isPhone = /^(\+88)?01[3-9]\d{8}$/.test(cleaned);
    const isEmail = raw.includes('@');
    const body: Record<string, string> = {
      password: data.password,
      name: data.name,
    };

    if (isPhone) {
      body.phone = cleaned;
      body.username = cleaned;
    } else if (isEmail) {
      body.email = raw.toLowerCase();
      body.username = raw.toLowerCase();
    } else {
      body.username = raw;
    }

    await request(`${API_BASE}/auth/signup`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    showToast(copy('অ্যাকাউন্ট তৈরি হয়েছে। এখন সাইন ইন করুন।', 'Account created successfully. Please sign in.'), 'success');
    setScreen('login');
  };

  const handleLogout = async () => {
    await logout();
    setMyPages([]);
    setActivePage(null);
    setScreen('landing');
  };

  const handleLandingLogin = async () => {
    if (!user) {
      setScreen('login');
      return;
    }
    if (user.forcePasswordChange) {
      setScreen('change-password');
      return;
    }
    if (user.role === 'admin') {
      setScreen('admin');
      return;
    }
    await loadMyPages();
  };

  if (!ready) {
    return <ScreenFallback dark={dark} />;
  }

  if (screen === 'landing') {
    return (
      <LandingPage
        dark={dark}
        setDark={setDark}
        onLogin={handleLandingLogin}
        onSignup={() => setScreen('signup')}
      />
    );
  }

  if (screen === 'login') {
    return <LoginPage dark={dark} setDark={setDark} onLogin={handleLogin} onSignup={() => setScreen('signup')} onForgotPassword={() => setScreen('forgot-password')} />;
  }

  if (screen === 'forgot-password') {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <ForgotPasswordPage dark={dark} onBack={() => setScreen('login')} />
      </Suspense>
    );
  }

  if (screen === 'signup') {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <SignupPageComponent dark={dark} setDark={setDark} onSignup={handleSignup} onBack={() => setScreen('login')} />
      </Suspense>
    );
  }

  if (screen === 'change-password') {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <ChangePasswordPage dark={dark} onSubmit={async (current, next) => {
          await changePassword(current, next);
          await loadMyPages();
        }} />
      </Suspense>
    );
  }

  if (screen === 'connect-page') {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <ConnectPageScreen dark={dark} userId={user?.id || ''} onConnected={loadMyPages} onLogout={handleLogout} />
      </Suspense>
    );
  }

  if (screen === 'admin' && user?.role === 'admin') {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <>
          <AdminPanel th={th} onToast={showToast} onLogout={handleLogout} />
          {ToastNode}
        </>
      </Suspense>
    );
  }

  if (screen === 'dashboard' && activePage && user) {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} />}>
        <DashboardLayout
          dark={dark}
          setDark={setDark}
          user={user}
          myPages={myPages}
          activePage={activePage}
          onSelectPage={(page) => setActivePage(page as MyPage)}
          onManagePages={() => setScreen('connect-page')}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  return null;
}
