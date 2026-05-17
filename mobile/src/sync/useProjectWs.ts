// mobile/src/sync/useProjectWs.ts
// WebSocket hook that subscribes to real-time staff events for a project.
// Connects to /ws/staff?token=<jwt>&projectId=<id> on the backend.
//
// Usage in a screen:
//   const { statusOverride, lastEvent } = useProjectWs(projectId, token);
//
// Install: npm install react-native-url-polyfill  (if URL constructor not available)

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE = __DEV__
  ? 'ws://10.0.2.2:4000'
  : 'wss://risohub-api.onrender.com';

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export interface ProjectWsEvent {
  type:           string;
  projectId:      number;
  newStatus?:     string;
  previousStatus?: string;
  documentId?:    string;
  docType?:       string;
  itemKey?:       string;
  status?:        string;
}

interface UseProjectWsResult {
  statusOverride: string | null;  // set when server pushes project.status_changed
  lastEvent:      ProjectWsEvent | null;
  connected:      boolean;
}

export function useProjectWs(
  projectId: number | null,
  token: string | null,
): UseProjectWsResult {
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [lastEvent, setLastEvent]           = useState<ProjectWsEvent | null>(null);
  const [connected, setConnected]           = useState(false);

  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef  = useRef(0);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (!projectId || !token || unmountedRef.current) return;
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    const url = `${WS_BASE}/ws/staff?token=${encodeURIComponent(token)}&projectId=${projectId}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setConnected(true);
    };

    ws.onmessage = (evt) => {
      try {
        const event: ProjectWsEvent = JSON.parse(evt.data);
        setLastEvent(event);

        if (event.type === 'project.status_changed' && event.newStatus) {
          setStatusOverride(event.newStatus);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!unmountedRef.current) {
        attemptsRef.current++;
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId, token]);

  useEffect(() => {
    unmountedRef.current = false;
    attemptsRef.current = 0;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { statusOverride, lastEvent, connected };
}
