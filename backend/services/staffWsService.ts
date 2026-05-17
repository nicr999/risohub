// services/staffWsService.ts
// WebSocket server for authenticated staff (mobile app + future browser clients).
// Clients connect via:  wss://api.risohome.co.uk/ws/staff?token=<jwt>&projectId=<id>
//
// Broadcast project-level events to connected staff:
//   broadcastToStaff(projectId, { type: 'project.status_changed', ... })
//
// The portal WS service handles /ws/portal (customer-facing).
// This service handles /ws/staff (staff JWT-authenticated).

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export type StaffWsEvent =
  | { type: 'project.status_changed'; projectId: number; newStatus: string; previousStatus: string }
  | { type: 'document.added'; projectId: number; documentId: string; docType: string }
  | { type: 'checklist.updated'; projectId: number; itemKey: string; status: string }
  | { type: 'ping' };

interface StaffClient {
  ws:          WebSocket;
  projectId:   number;
  userId:      string;
  connectedAt: Date;
}

const clients = new Map<string, StaffClient>();

// ─── Broadcast to all staff watching a project ───────────────────────────────

export function broadcastToStaff(projectId: number, event: StaffWsEvent): void {
  const msg  = JSON.stringify(event);
  let   sent = 0;

  for (const [, client] of clients) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
      sent++;
    }
  }

  if (sent > 0) {
    console.log(`[StaffWS] Broadcast ${event.type} → ${sent} client(s) for project ${projectId}`);
  }
}

// ─── Token validation ─────────────────────────────────────────────────────────

function verifyJwt(token: string): { id: string } | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as any;
    return { id: String(payload.id ?? payload.userId ?? payload.sub ?? '') };
  } catch {
    return null;
  }
}

// ─── Attach to HTTP server ────────────────────────────────────────────────────

export function attachStaffWs(httpServer: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws/staff') return; // let other upgrade handlers deal with it

    const token     = url.searchParams.get('token');
    const projectId = parseInt(url.searchParams.get('projectId') ?? '', 10);

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = verifyJwt(token);
    if (!user || !user.id) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!projectId || isNaN(projectId)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, { projectId, userId: user.id });
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, meta: { projectId: number; userId: string }) => {
    const clientId = crypto.randomUUID();
    clients.set(clientId, { ws, projectId: meta.projectId, userId: meta.userId, connectedAt: new Date() });
    console.log(`[StaffWS] Client ${clientId} connected (user=${meta.userId}, project=${meta.projectId}). Total: ${clients.size}`);

    ws.send(JSON.stringify({ type: 'connected', projectId: meta.projectId }));

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30_000);

    const cleanup = () => {
      clearInterval(pingInterval);
      clients.delete(clientId);
      console.log(`[StaffWS] Client ${clientId} disconnected. Total: ${clients.size}`);
    };

    ws.on('close', cleanup);
    ws.on('error', (err) => {
      console.error(`[StaffWS] Client ${clientId} error:`, err.message);
      cleanup();
    });
    ws.on('message', () => {}); // read-only channel
  });

  console.log('[StaffWS] WebSocket server attached at /ws/staff');
  return wss;
}
