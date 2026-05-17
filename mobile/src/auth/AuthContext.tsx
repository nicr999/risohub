// ============================================================
// RISO HUB Mobile — src/auth/AuthContext.tsx
// Auth state management — login, 2FA verify, logout, me
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, saveTokens, getTokens, clearTokens, authEventEmitter } from '../api/client';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Surveyor' | 'Installer' | 'Auditor';
  twoFactorEnabled: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (preAuthToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

type LoginResult =
  | { type: 'success' }
  | { type: '2fa_required'; preAuthToken: string }
  | { type: 'error'; message: string };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      const tokens = await getTokens();
      if (!tokens?.accessToken) { setLoading(false); return; }
      try {
        const res = await api.get('/api/auth/me');
        setUser(res.data);
      } catch {
        await clearTokens();
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  // Listen for auth expiry events from the API client
  useEffect(() => {
    const handleLogout = () => { setUser(null); };
    authEventEmitter.on('logout', handleLogout);
    return () => authEventEmitter.off('logout', handleLogout);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await api.post('/api/auth/login', { email, password });
      if (res.data.requires2FA) {
        return { type: '2fa_required', preAuthToken: res.data.preAuthToken };
      }
      await saveTokens(res.data.accessToken, res.data.refreshToken);
      const me = await api.get('/api/auth/me');
      setUser(me.data);
      return { type: 'success' };
    } catch (e: any) {
      return { type: 'error', message: e.response?.data?.error || 'Login failed' };
    }
  }, []);

  const verify2FA = useCallback(async (preAuthToken: string, code: string) => {
    const res = await api.post('/api/auth/verify-2fa', { preAuthToken, code });
    await saveTokens(res.data.accessToken, res.data.refreshToken);
    const me = await api.get('/api/auth/me');
    setUser(me.data);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch {}
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2FA, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
