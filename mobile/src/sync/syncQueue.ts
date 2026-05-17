// mobile/src/sync/syncQueue.ts
// Offline-first upload queue backed by SQLite.
// Operations are queued when offline and flushed when connectivity is restored.
import SQLite from 'react-native-sqlite-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, getTokens } from '../api/client';
import { useConflictStore } from './useConflictStore';

SQLite.enablePromise(true);

export type QueueOpType = 'upload_file' | 'patch_checklist' | 'post_note' | 'patch_project_status';

export interface QueuedOp {
  id?: number;
  opType: QueueOpType;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload: string;        // JSON stringified
  fileUri?: string;       // local file URI if this is a file upload
  fileName?: string;
  fileMimeType?: string;
  retries: number;
  maxRetries: number;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
}

const MAX_RETRIES = 5;
const RETRY_BACKOFF_MS = [5000, 15000, 60000, 300000, 900000]; // 5s, 15s, 1m, 5m, 15m

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabase({ name: 'risohub_queue.db', location: 'default' });
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op_type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      file_uri TEXT,
      file_name TEXT,
      file_mime_type TEXT,
      retries INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT ${MAX_RETRIES},
      created_at TEXT NOT NULL,
      last_attempt_at TEXT,
      error_message TEXT
    )
  `);
  return db;
}

export async function enqueue(op: Omit<QueuedOp, 'id' | 'retries' | 'createdAt'>): Promise<number> {
  const database = await getDb();
  const [result] = await database.executeSql(
    `INSERT INTO sync_queue
      (op_type, endpoint, method, payload, file_uri, file_name, file_mime_type, retries, max_retries, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))`,
    [
      op.opType, op.endpoint, op.method, op.payload,
      op.fileUri ?? null, op.fileName ?? null, op.fileMimeType ?? null,
      op.maxRetries ?? MAX_RETRIES,
    ]
  );
  console.log(`[SyncQueue] Enqueued op #${result.insertId}: ${op.method} ${op.endpoint}`);
  return result.insertId;
}

export async function getPendingOps(): Promise<QueuedOp[]> {
  const database = await getDb();
  const [result] = await database.executeSql(
    `SELECT * FROM sync_queue WHERE retries < max_retries ORDER BY created_at ASC LIMIT 50`
  );
  const ops: QueuedOp[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    const r = result.rows.item(i);
    ops.push({
      id: r.id, opType: r.op_type, endpoint: r.endpoint, method: r.method,
      payload: r.payload, fileUri: r.file_uri, fileName: r.file_name,
      fileMimeType: r.file_mime_type, retries: r.retries, maxRetries: r.max_retries,
      createdAt: r.created_at, lastAttemptAt: r.last_attempt_at, errorMessage: r.error_message,
    });
  }
  return ops;
}

export async function getQueueCount(): Promise<number> {
  const database = await getDb();
  const [result] = await database.executeSql(
    `SELECT COUNT(*) as count FROM sync_queue WHERE retries < max_retries`
  );
  return result.rows.item(0).count;
}

export async function deleteOp(id: number): Promise<void> {
  const database = await getDb();
  await database.executeSql(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

async function markFailed(id: number, errorMessage: string, retries: number): Promise<void> {
  const database = await getDb();
  await database.executeSql(
    `UPDATE sync_queue SET retries = ?, last_attempt_at = datetime('now'), error_message = ? WHERE id = ?`,
    [retries + 1, errorMessage, id]
  );
}

async function executeOp(op: QueuedOp): Promise<void> {
  if (op.opType === 'upload_file' && op.fileUri) {
    const formData = new FormData();
    const parsedPayload = JSON.parse(op.payload);
    formData.append('file', {
      uri: op.fileUri,
      name: op.fileName ?? 'upload',
      type: op.fileMimeType ?? 'application/octet-stream',
    } as any);
    Object.entries(parsedPayload).forEach(([k, v]) => formData.append(k, String(v)));
    await api.post(op.endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } else {
    const payload = JSON.parse(op.payload);
    await (api as any)[op.method.toLowerCase()](op.endpoint, payload);
  }
}

let flushing = false;

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;

  try {
    const ops = await getPendingOps();
    console.log(`[SyncQueue] Flushing ${ops.length} pending ops`);

    for (const op of ops) {
      try {
        await executeOpWithConflictResolution(op);
        await deleteOp(op.id!);
        flushed++;
        console.log(`[SyncQueue] ✓ Op #${op.id} (${op.opType})`);
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? err?.message ?? 'Unknown error';
        await markFailed(op.id!, msg, op.retries);
        failed++;
        console.warn(`[SyncQueue] ✗ Op #${op.id} (${op.opType}): ${msg} [retry ${op.retries + 1}/${op.maxRetries}]`);

        // Abort non-retryable HTTP errors immediately (4xx except 409/429)
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429 && status !== 409) {
          console.warn(`[SyncQueue] Non-retryable error ${status} — skipping remaining ops`);
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }

  return { flushed, failed };
}

// Start background connectivity listener — flushes automatically when online
export function startSyncListener(): () => void {
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      const tokens = await getTokens();
      if (!tokens?.accessToken) return;
      const count = await getQueueCount();
      if (count > 0) {
        console.log(`[SyncQueue] Online — flushing ${count} queued ops`);
        await flushQueue();
      }
    }
  });
  return unsubscribe;
}

export async function clearFailedOps(): Promise<void> {
  const database = await getDb();
  await database.executeSql(`DELETE FROM sync_queue WHERE retries >= max_retries`);
}

// ─── Conflict resolution ──────────────────────────────────────────────────────
//
// When the client goes offline and back online, the server may have changed
// while queued operations were pending. The strategies below define how to
// merge client-side changes with the server's current state.
//
// Strategies:
//   server-wins   — discard client change, use server value (default for status fields)
//   client-wins   — apply client change regardless (for user-authored notes)
//   merge-append  — prepend server content + client content separated by newline
//   last-write-wins — compare updatedAt timestamps; more recent one is kept
//
// Each opType maps to a per-field strategy. Unknown fields default to server-wins.

export type ConflictStrategy = 'server-wins' | 'client-wins' | 'merge-append' | 'last-write-wins';

export interface ConflictResolution {
  strategy: ConflictStrategy;
  mergedPayload: Record<string, unknown>;
  discardedFields: string[];
  note: string;
}

// Per-opType field strategies. 'default' applies to any field not listed.
const FIELD_STRATEGIES: Record<QueueOpType, Record<string, ConflictStrategy> & { default: ConflictStrategy }> = {
  patch_checklist: {
    // Checklist status: last-write-wins (most recent inspector takes precedence)
    status:   'last-write-wins',
    // Notes are user-authored — append both
    notes:    'merge-append',
    naReason: 'merge-append',
    default:  'server-wins',
  },
  post_note: {
    // Notes are always additive — client content is appended
    body:    'client-wins',
    content: 'client-wins',
    default: 'client-wins',
  },
  patch_project_status: {
    // Status changes: last-write-wins
    status:  'last-write-wins',
    default: 'server-wins',
  },
  upload_file: {
    // File uploads are idempotent — always re-attempt
    default: 'client-wins',
  },
};

/**
 * Resolve conflicts between a queued client operation and the current server state.
 *
 * @param op          The queued operation that failed with a 409 conflict
 * @param serverState The current server representation of the resource (from the 409 response body)
 * @param clientTs    ISO timestamp when the client made its change (from QueuedOp.createdAt)
 * @returns           A ConflictResolution describing the merged payload to retry with
 */
export function resolveConflict(
  op: QueuedOp,
  serverState: Record<string, unknown>,
  clientTs: string
): ConflictResolution {
  const clientPayload: Record<string, unknown> = JSON.parse(op.payload);
  const strategies = FIELD_STRATEGIES[op.opType] ?? { default: 'server-wins' };
  const mergedPayload: Record<string, unknown> = {};
  const discardedFields: string[] = [];
  const notes: string[] = [];

  for (const [field, clientValue] of Object.entries(clientPayload)) {
    const strategy: ConflictStrategy = (strategies as any)[field] ?? strategies.default;
    const serverValue = serverState[field];
    const serverTs = (serverState.updatedAt ?? serverState.updated_at) as string | undefined;

    switch (strategy) {
      case 'client-wins':
        mergedPayload[field] = clientValue;
        break;

      case 'server-wins':
        // Omit field from merged payload — server value is already current
        discardedFields.push(field);
        notes.push(`${field}: server-wins (server="${serverValue}")`);
        break;

      case 'merge-append':
        if (typeof clientValue === 'string' && typeof serverValue === 'string' && serverValue) {
          mergedPayload[field] = serverValue.includes(clientValue as string)
            ? serverValue                    // client content already in server — no-op
            : `${serverValue}\n---\n${clientValue}`;
        } else {
          mergedPayload[field] = clientValue; // server had no value — safe to write
        }
        break;

      case 'last-write-wins':
        if (serverTs && clientTs) {
          const serverTime = new Date(serverTs).getTime();
          const clientTime = new Date(clientTs).getTime();
          if (clientTime >= serverTime) {
            mergedPayload[field] = clientValue;
          } else {
            discardedFields.push(field);
            notes.push(`${field}: last-write-wins → server wins (server=${serverTs}, client=${clientTs})`);
          }
        } else {
          mergedPayload[field] = clientValue; // no timestamp to compare — prefer client
        }
        break;
    }
  }

  return {
    strategy: strategies.default,
    mergedPayload,
    discardedFields,
    note: notes.join('; ') || 'No conflicts detected',
  };
}

/**
 * Execute an op with conflict resolution on 409.
 * If the server returns 409, we fetch the current server state from the
 * response body, run resolveConflict, then retry once with the merged payload.
 */
export async function executeOpWithConflictResolution(op: QueuedOp): Promise<void> {
  try {
    await executeOp(op);
  } catch (err: any) {
    if (err?.response?.status === 409 && op.method !== 'POST') {
      const serverState: Record<string, unknown> = err.response.data ?? {};
      const resolution = resolveConflict(op, serverState, op.createdAt);

      if (Object.keys(resolution.mergedPayload).length === 0) {
        // Nothing to retry — server already has the desired state
        console.log(`[SyncQueue] Conflict resolved (no-op) for op #${op.id}: ${resolution.note}`);
        return;
      }

      console.log(`[SyncQueue] Conflict on op #${op.id} — retrying with merged payload. Discarded: [${resolution.discardedFields.join(', ')}]`);
      const mergedOp: QueuedOp = { ...op, payload: JSON.stringify(resolution.mergedPayload) };
      await executeOp(mergedOp);

      // Record in conflict store so ConflictResolutionBanner can show the user
      useConflictStore.getState().addConflict({
        opType:          op.opType,
        endpoint:        op.endpoint,
        resolvedAt:      new Date(),
        discardedFields: resolution.discardedFields,
        mergedFields:    Object.keys(resolution.mergedPayload),
        note:            resolution.note,
      });
    } else {
      throw err;
    }
  }
}
