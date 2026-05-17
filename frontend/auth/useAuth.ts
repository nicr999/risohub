/**
 * useAuth.ts
 * React hook — manages auth state, token storage, and silent refresh.
 * Refresh tokens are stored in httpOnly cookies (set by server).
 * Access tokens are stored in localStorage (short-lived, 15 min).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AuthUser } from "./LoginPage";

const ACCESS_TOKEN_KEY = "riso_access_token";
const EXPIRY_KEY       = "riso_token_expiry";

const REFRESH_BUFFER_MS = 60_000;

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  twoFactorSetupRequired: boolean;
}

function getCsrfToken(): string {
  return document.cookie.split(";").reduce<string>((acc, part) => {
    const [k, v] = part.trim().split("=");
    return k === "riso_csrf" ? decodeURIComponent(v ?? "") : acc;
  }, "");
}

async function apiRefreshToken(): Promise<{ accessToken: string; refreshToken?: string }> {
  const csrf = getCsrfToken();
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    credentials: "include",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Session expired");
  return res.json();
}

async function apiGetMe(accessToken: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Session invalid");
  return res.json();
}

async function apiLogout(accessToken: string): Promise<void> {
  const csrf = getCsrfToken();
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    credentials: "include",
    body: JSON.stringify({}),
  });
}

function getStoredTokens(): { accessToken: string | null; expiry: number } {
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    expiry: Number(localStorage.getItem(EXPIRY_KEY) ?? 0),
  };
}

function storeTokens(accessToken: string, expiresInMs: number): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInMs));
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  // Also clear the old refresh token key if present from a previous version
  localStorage.removeItem("riso_refresh_token");
}

const BLANK: AuthState = { user: null, accessToken: null, isAuthenticated: false, isLoading: false, twoFactorSetupRequired: false };

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    ...BLANK,
    isLoading: true,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiryMs: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(0, expiryMs - Date.now() - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const result = await apiRefreshToken();
        const user = await apiGetMe(result.accessToken);
        storeTokens(result.accessToken, 15 * 60 * 1000);
        scheduleRefresh(Number(localStorage.getItem(EXPIRY_KEY)));
        setState(s => ({ ...s, user, accessToken: result.accessToken, isAuthenticated: true, isLoading: false }));
      } catch {
        clearTokens();
        setState({ ...BLANK });
      }
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const { accessToken, expiry } = getStoredTokens();

    if (!accessToken) {
      apiRefreshToken()
        .then(async result => {
          const user = await apiGetMe(result.accessToken);
          storeTokens(result.accessToken, 15 * 60 * 1000);
          scheduleRefresh(Number(localStorage.getItem(EXPIRY_KEY)));
          const twoFactorSetupRequired = user.role === "Admin" && !user.twoFactorEnabled;
          setState({ user, accessToken: result.accessToken, isAuthenticated: true, isLoading: false, twoFactorSetupRequired });
        })
        .catch(() => setState({ ...BLANK }));
      return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }

    if (expiry < Date.now()) {
      apiRefreshToken()
        .then(async result => {
          const user = await apiGetMe(result.accessToken);
          storeTokens(result.accessToken, 15 * 60 * 1000);
          scheduleRefresh(Number(localStorage.getItem(EXPIRY_KEY)));
          const twoFactorSetupRequired = user.role === "Admin" && !user.twoFactorEnabled;
          setState({ user, accessToken: result.accessToken, isAuthenticated: true, isLoading: false, twoFactorSetupRequired });
        })
        .catch(() => {
          clearTokens();
          setState({ ...BLANK });
        });
    } else {
      apiGetMe(accessToken)
        .then(user => {
          const twoFactorSetupRequired = user.role === "Admin" && !user.twoFactorEnabled;
          scheduleRefresh(expiry);
          setState({ user, accessToken, isAuthenticated: true, isLoading: false, twoFactorSetupRequired });
        })
        .catch(() => {
          clearTokens();
          setState({ ...BLANK });
        });
    }

    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, [scheduleRefresh]);

  const signIn = useCallback((
    user: AuthUser,
    accessToken: string,
    _refreshToken?: string,
    setupRequired?: boolean,
  ) => {
    storeTokens(accessToken, 15 * 60 * 1000);
    scheduleRefresh(Number(localStorage.getItem(EXPIRY_KEY)));
    setState({ user, accessToken, isAuthenticated: true, isLoading: false, twoFactorSetupRequired: setupRequired ?? false });
  }, [scheduleRefresh]);

  const signOut = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (accessToken) await apiLogout(accessToken).catch(() => {});
    clearTokens();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setState({ ...BLANK });
  }, []);

  const dismissSetupPrompt = useCallback(() => {
    setState(s => ({ ...s, twoFactorSetupRequired: false }));
  }, []);

  return {
    user: state.user,
    token: state.accessToken,
    accessToken: state.accessToken,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    twoFactorSetupRequired: state.twoFactorSetupRequired,
    signIn,
    logout: signOut,
    signOut,
    dismissSetupPrompt,
  };
}

// ─── AuthGuard component ──────────────────────────────────────────────────────

import LoginPage from "./LoginPage";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, signIn } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F2" }}>
        <div style={{ fontSize: 14, color: "#555", fontFamily: "'Satoshi', sans-serif" }}>Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onAuthenticated={signIn} />;
  }

  return <>{children}</>;
}
