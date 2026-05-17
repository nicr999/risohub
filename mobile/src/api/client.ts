// ============================================================
// RISO HUB Mobile — src/api/client.ts
// Axios instance with JWT auth, silent refresh, and
// offline queuing via react-native-netinfo
// ============================================================

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import * as Keychain from 'react-native-keychain';

// ── Config ────────────────────────────────────────────────────
// Set this to your Render API URL in production,
// or http://10.0.2.2:3001 for Android emulator local dev
const BASE_URL = __DEV__
  ? 'http://10.0.2.2:3001'          // Android emulator → localhost
  : 'https://risohub-api.onrender.com';

// ── Token storage (secure keychain) ──────────────────────────

const TOKEN_SERVICE = 'risohub-tokens';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Keychain.setGenericPassword(
    'tokens',
    JSON.stringify({ accessToken, refreshToken }),
    { service: TOKEN_SERVICE }
  );
}

export async function getTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const creds = await Keychain.getGenericPassword({ service: TOKEN_SERVICE });
  if (!creds) return null;
  try {
    return JSON.parse(creds.password);
  } catch {
    return null;
  }
}

export async function clearTokens() {
  await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
}

// ── Axios instance ────────────────────────────────────────────

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach access token ─────────────────

api.interceptors.request.use(async (config) => {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// ── Response interceptor — silent token refresh ───────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];

function processQueue(error: AxiosError | null, token: string | null) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const tokens = await getTokens();
        if (!tokens?.refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refreshToken: tokens.refreshToken,
        });

        const { accessToken, refreshToken } = res.data;
        await saveTokens(accessToken, refreshToken);
        processQueue(null, accessToken);

        original.headers = { ...original.headers, Authorization: `Bearer ${accessToken}` };
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        await clearTokens();
        // Signal app to navigate to login
        authEventEmitter.emit('logout');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Simple event emitter for auth events
class AuthEventEmitter {
  private listeners: Record<string, (() => void)[]> = {};
  on(event: string, fn: () => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  off(event: string, fn: () => void) {
    this.listeners[event] = (this.listeners[event] || []).filter(f => f !== fn);
  }
  emit(event: string) {
    (this.listeners[event] || []).forEach(fn => fn());
  }
}

export const authEventEmitter = new AuthEventEmitter();
