// services/portalWsService.ts
// WebSocket manager for the customer portal.
// Clients connect via:  wss://api.risohome.co.uk/ws/portal?token=<portal_token>
//
// On project status change or document upload, call:
//   portalWs.broadcast(projectId, { type: 'project.updated', payload: {...} })
//
// Install: npm install ws @types/ws

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import crypto from 'crypto';

export type PortalWsEvent =
  | { type: 'project.status_changed'; projectId: number; newStatus: string }
  | { type: 'document.added'; projectId: number; documentId: string; docType: string; version: number }
  | { type: 'mcs.registered'; projectId: number; mcsNumber: string }
  | { type: 'ping' };

interface PortalClient {
  ws:        WebSocket;
  projectId: number;
  connectedAt: Date;
}

// ─── In-memory connection registry ───────────────────────────────────────────

const clients = new Map<string, PortalClient>(); // key = random client id

function registerClient(projectId: number, ws: WebSocket): string {
  const id = crypto.randomUUID();
  clients.set(id, { ws, projectId, connectedAt: new Date() });
  console.log(`[PortalWS] Client ${id} connected (projectId=${projectId}). Total: ${clients.size}`);
  return id;
}

function removeClient(id: string): void {
  clients.delete(id);
  console.log(`[PortalWS] Client ${id} disconnected. Total: ${clients.size}`);
}

// ─── Broadcast to all portal clients watching a project ──────────────────────

export function broadcastToPortal(projectId: number, event: PortalWsEvent): void {
  const msg = JSON.stringify(event);
  let sent = 0;

  for (const [_id, client] of clients) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
      sent++;
    }
  }

  if (sent > 0) {
    console.log(`[PortalWS] Broadcast ${event.type} → ${sent} client(s) for project ${projectId}`);
  }
}

// ─── Token validation helper (called from upgrade handler) ───────────────────
// Returns projectId if valid, null if invalid/expired.

import { Setting } from '../models/index';

async function validatePortalToken(rawToken: string): Promise<number | null> {
  try {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const settings  = await Setting.findAll();
    const match = (settings as any[]).find(
      s => s.section?.startsWith('portal:') && s.config?.tokenHash === tokenHash
    );

    if (!match) return null;

    const config = match.config as { expiresAt: string; projectId: number };
    if (new Date(config.expiresAt) < new Date()) return null;

    return Number(config.projectId);
  } catch {
    return null;
  }
}

// ─── Attach WebSocket server to an HTTP server ────────────────────────────────

export function attachPortalWs(httpServer: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Upgrade handler — validate portal token before accepting connection
  httpServer.on('upgrade', async (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws/portal') {
      return; // let other upgrade handlers deal with other paths
    }

    const rawToken = url.searchParams.get('token');
    if (!rawToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const projectId = await validatePortalToken(rawToken);
    if (projectId === null) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, projectId);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, projectId: number) => {
    const clientId = registerClient(projectId, ws);

    // Send initial ack
    ws.send(JSON.stringify({ type: 'connected', projectId }));

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on('close', () => {
      clearInterval(pingInterval);
      removeClient(clientId);
    });

    ws.on('error', (err) => {
      console.error(`[PortalWS] Client ${clientId} error:`, err.message);
      clearInterval(pingInterval);
      removeClient(clientId);
    });

    // Clients can send pong — ignore other messages
    ws.on('message', () => {});
  });

  console.log('[PortalWS] WebSocket server attached at /ws/portal');
  return wss;
}
