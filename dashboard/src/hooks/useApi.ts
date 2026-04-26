
import { useCallback } from 'react';

declare const __API_BASE__: string | undefined;

function normalizeApiBase(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '/api';

  if (/^https?:\/\//i.test(value)) {
    const normalized = value.replace(/\/+$/, '');
    const hostname = (() => {
      try {
        return new URL(normalized).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();

    if (
      !hostname ||
      hostname === 'yourdomain.com' ||
      hostname.endsWith('.yourdomain.com')
    ) {
      return '/api';
    }

    return normalized;
  }

  const cleaned = value.replace(/\/+$/, '');
  if (cleaned === '/api' || cleaned === 'api') return '/api';
  if (cleaned.startsWith('/api/')) return cleaned.replace(/\/+$/, '');

  // Invalid relative values like "", "/", "admin", or "/admin" break routing in dev.
  return '/api';
}

export const API_BASE = normalizeApiBase(
  import.meta.env.VITE_API_BASE || __API_BASE__,
);

export function useApi() {
  const request = useCallback(async <T = any>(
    url: string,
    opts?: RequestInit & { skipAuth?: boolean },
  ): Promise<T> => {
    const token = localStorage.getItem('dfbot_token') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token && !opts?.skipAuth) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(url, { headers, ...opts });
    } catch {
      throw new Error('সার্ভারে সংযোগ করা যাচ্ছে না। ইন্টারনেট চেক করুন বা একটু পরে আবার চেষ্টা করুন।');
    }
    if (!res.ok) {
      // 401 → token missing or expired → clear and force re-login
      if (res.status === 401 && !opts?.skipAuth) {
        localStorage.removeItem('dfbot_token');
        window.location.href = '/';
        throw new Error('Session expired. Please log in again.');
      }
      const text = await res.text();
      let message = text;
      try { message = JSON.parse(text)?.message || text; } catch {}
      throw new Error(message || `HTTP ${res.status}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text() as any;
  }, []);

  return { request, API_BASE };
}
