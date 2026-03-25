import { useCallback, useEffect, useState } from 'react';
import { API_BASE, useApi } from './useApi';

export type AuthUser = {
  id: string; name: string; username: string;
  role: string; pageIds: number[]; forcePasswordChange: boolean;
};

export function useAuth() {
  const { request } = useApi();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    const data: any = await request(`${API_BASE}/auth/login`, {
      method: 'POST', body: JSON.stringify({ username, password }), skipAuth: true,
    });
    localStorage.setItem('dfbot_token', data.token);
    setUser(data.user);
    return data as { token: string; user: AuthUser; mustChangePassword: boolean };
  }, [request]);

  const logout = useCallback(async () => {
    try { await request(`${API_BASE}/auth/logout`, { method: 'POST' }); } catch {}
    localStorage.removeItem('dfbot_token');
    setUser(null);
  }, [request]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await request(`${API_BASE}/auth/change-password`, {
      method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }),
    });
  }, [request]);

  // Auto-restore session
  useEffect(() => {
    const token = localStorage.getItem('dfbot_token');
    if (!token) { setLoading(false); setReady(true); return; }
    request<AuthUser>(`${API_BASE}/auth/me`)
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('dfbot_token'))
      .finally(() => { setLoading(false); setReady(true); });
  }, []);

  return { user, loading, ready, login, logout, changePassword };
}
