/**
 * DriveSyncPanel.tsx
 *
 * Admin UI panel showing Google Drive sync status for a project.
 * Mount inside SettingsPage or DocumentGenerator — wherever makes sense
 * in your admin workflow.
 *
 * Features:
 *   - Summary strip: total / synced / pending / failed counts
 *   - Per-file table with status, stage, retry counts, Drive link
 *   - "Retry failed" button — requeues all failed syncs
 *   - "Full resync" button — re-syncs everything for the project from scratch
 *   - Drive health indicator (checks API connectivity)
 *   - Auto-refreshes every 20s while any sync is pending
 *
 * Props:
 *   projectId — project to show sync status for
 *   token     — JWT access token (Admin only)
 */

import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncStatus = "pending" | "synced" | "failed" | "skipped";

interface SyncRecord {
  id:          string;
  entityType:  "file" | "document";
  entityId:    string;
  fileName:    string;
  stage:       string;
  status:      SyncStatus;
  attempts:    number;
  driveUrl:    string | null;
  lastError:   string | null;
  syncedAt:    string | null;
  createdAt:   string;
}

interface SyncSummary {
  total:   number;
  synced:  number;
  pending: number;
  failed:  number;
  skipped: number;
}

interface DriveHealth {
  ok:           boolean;
  error?:       string;
  rootFolderId?: string;
}

interface Props {
  projectId: string;
  token:     string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; bg: string; dot: string }> = {
  synced:  { label: "Synced",  color: "#4a7a5a", bg: "#edf7f1", dot: "#4a7a5a" },
  pending: { label: "Pending", color: "#8a7a50", bg: "#fdf6e3", dot: "#d4a828" },
  failed:  { label: "Failed",  color: "#a05050", bg: "#fdf0f0", dot: "#c05050" },
  skipped: { label: "Skipped", color: "#999",    bg: "#f5f5f2", dot: "#ccc"    },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriveSyncPanel({ projectId, token }: Props) {
  const [summary, setSummary]   = useState<SyncSummary | null>(null);
  const [records, setRecords]   = useState<SyncRecord[]>([]);
  const [health, setHealth]     = useState<DriveHealth | null>(null);
  const [loading, setLoading]   = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<SyncStatus | "all">("all");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch status ────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/drive-sync/status/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSummary(data.summary ?? null);
      setRecords(data.records ?? []);
    } catch {
      /* show stale data */
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/drive-sync/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHealth(await res.json());
    } catch {
      setHealth({ ok: false, error: "API unreachable" });
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    fetchHealth();
  }, [fetchStatus, fetchHealth]);

  // Auto-refresh while pending items exist
  useEffect(() => {
    if (!summary || summary.pending === 0) return;
    const id = setInterval(fetchStatus, 20_000);
    return () => clearInterval(id);
  }, [summary, fetchStatus]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/drive-sync/retry/${projectId}`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      showToast(`Requeued ${data.queued} failed sync${data.queued === 1 ? "" : "s"} ✓`);
      setTimeout(fetchStatus, 2000);
    } catch {
      showToast("Retry request failed — check your connection.");
    } finally {
      setRetrying(false);
    }
  };

  const handleFullResync = async () => {
    if (!window.confirm(
      "This will re-sync ALL files for this project from S3 to Drive, even those already synced. Continue?"
    )) return;

    setResyncing(true);
    try {
      const res = await fetch(`/api/drive-sync/resync/${projectId}`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      showToast(`Full resync queued — ${data.queued} file${data.queued === 1 ? "" : "s"} ✓`);
      setTimeout(fetchStatus, 3000);
    } catch {
      showToast("Resync failed — check server logs.");
    } finally {
      setResyncing(false);
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────

  const visible = filter === "all" ? records : records.filter(r => r.status === filter);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={ds.wrap}>

      {/* Header */}
      <div style={ds.header}>
        <div>
          <h2 style={ds.title}>Google Drive Sync</h2>
          <div style={ds.healthRow}>
            <span
              style={{
                ...ds.healthDot,
                background: health === null ? "#ccc" : health.ok ? "#4a7a5a" : "#c05050",
              }}
            />
            <span style={ds.healthLabel}>
              {health === null
                ? "Checking…"
                : health.ok
                ? "Drive connected"
                : `Drive error: ${health.error}`}
            </span>
          </div>
        </div>
        <div style={ds.headerActions}>
          {summary && summary.failed > 0 && (
            <button
              style={ds.retryBtn}
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? "Retrying…" : `↺ Retry ${summary.failed} failed`}
            </button>
          )}
          <button
            style={ds.resyncBtn}
            onClick={handleFullResync}
            disabled={resyncing}
          >
            {resyncing ? "Queuing…" : "⟳ Full resync"}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div style={ds.strip}>
          {(["total", "synced", "pending", "failed"] as const).map(key => (
            <button
              key={key}
              style={{
                ...ds.stripItem,
                ...(filter === (key === "total" ? "all" : key) ? ds.stripItemActive : {}),
              }}
              onClick={() => setFilter(key === "total" ? "all" : key as SyncStatus)}
            >
              <span style={ds.stripCount}>{summary[key]}</span>
              <span style={ds.stripLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={ds.empty}>Loading sync status…</div>
      ) : visible.length === 0 ? (
        <div style={ds.emptyState}>
          <div style={ds.emptyIcon}>☁</div>
          <p style={ds.emptyText}>
            {filter === "all"
              ? "No sync records yet. Files will sync automatically after upload."
              : `No ${filter} records.`}
          </p>
        </div>
      ) : (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <span>File</span>
            <span>Stage</span>
            <span>Type</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Synced at</span>
            <span></span>
          </div>
          {visible.map(r => {
            const cfg = STATUS_CONFIG[r.status];
            return (
              <div key={r.id} style={ds.tableRow}>
                <span style={ds.fileName} title={r.fileName}>
                  {r.fileName}
                </span>
                <span style={ds.cell}>{r.stage}</span>
                <span style={{ ...ds.cell, textTransform: "capitalize" }}>{r.entityType}</span>
                <span style={ds.cell}>
                  <span style={{ ...ds.statusPill, color: cfg.color, background: cfg.bg }}>
                    <span style={{ ...ds.dot, background: cfg.dot }} />
                    {cfg.label}
                  </span>
                </span>
                <span style={{ ...ds.cell, color: r.attempts > 3 ? "#c05050" : "#888" }}>
                  {r.attempts}
                  {r.attempts >= 5 && " (max)"}
                </span>
                <span style={{ ...ds.cell, fontSize: 12, color: "#999" }}>
                  {r.syncedAt
                    ? new Date(r.syncedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
                    : "—"}
                </span>
                <span style={ds.cell}>
                  {r.driveUrl ? (
                    <a
                      href={r.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={ds.driveLink}
                    >
                      Open ↗
                    </a>
                  ) : r.lastError ? (
                    <span style={ds.errorHint} title={r.lastError}>
                      Error ⓘ
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && <div style={ds.toast}>{toast}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ds: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "Satoshi, sans-serif", color: "#333" },

  header: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 20,
  },
  title: { fontSize: 18, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" },
  healthRow: { display: "flex", alignItems: "center", gap: 7 },
  healthDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  healthLabel: { fontSize: 12.5, color: "#777" },

  headerActions: { display: "flex", gap: 8, flexShrink: 0 },
  retryBtn: {
    padding: "8px 16px", background: "#fdf0f0",
    border: "1px solid #e8b4b4", color: "#a05050",
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  resyncBtn: {
    padding: "8px 16px", background: "#f0f1ec",
    border: "1px solid #c8cabb", color: "#7A8465",
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  strip: {
    display: "flex", gap: 8, marginBottom: 20,
  },
  stripItem: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "12px 20px", background: "#fff",
    border: "1px solid #e8e6e0", borderRadius: 10,
    cursor: "pointer", minWidth: 80,
    transition: "border-color 0.15s",
  },
  stripItemActive: {
    borderColor: "#7A8465", background: "#f0f1ec",
  },
  stripCount: { fontSize: 24, fontWeight: 700, color: "#333", lineHeight: 1 },
  stripLabel: { fontSize: 11, color: "#999", marginTop: 3, textTransform: "capitalize" },

  table: {
    background: "#fff", border: "1px solid #e8e6e0",
    borderRadius: 10, overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 0.8fr 1.1fr 0.8fr 1.2fr 0.6fr",
    padding: "9px 16px",
    background: "#f7f7f4", borderBottom: "1px solid #e8e6e0",
    fontSize: 11, fontWeight: 600, color: "#9a9a8e",
    letterSpacing: "0.06em", textTransform: "uppercase",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 0.8fr 1.1fr 0.8fr 1.2fr 0.6fr",
    padding: "11px 16px",
    borderBottom: "1px solid #f0f1ec",
    alignItems: "center",
  },
  fileName: {
    fontSize: 13, fontWeight: 500, color: "#333",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    paddingRight: 8,
  },
  cell: { fontSize: 13, color: "#555" },

  statusPill: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 9px", borderRadius: 20,
    fontSize: 12, fontWeight: 600,
  },
  dot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },

  driveLink: {
    fontSize: 12, color: "#7A8465", fontWeight: 600,
    textDecoration: "none",
  },
  errorHint: {
    fontSize: 12, color: "#c05050", cursor: "help",
  },

  empty: { padding: "32px 16px", color: "#aaa", fontSize: 14 },
  emptyState: {
    textAlign: "center", padding: "48px 24px",
    background: "#fafaf8", border: "1px dashed #d8d6ce",
    borderRadius: 10,
  },
  emptyIcon: { fontSize: 36, opacity: 0.25, marginBottom: 10 },
  emptyText: { fontSize: 14, color: "#aaa", margin: 0 },

  toast: {
    position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
    background: "#333", color: "#fff", padding: "11px 22px",
    borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999,
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
  },
};
