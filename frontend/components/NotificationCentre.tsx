/**
 * NotificationCentre.tsx
 *
 * Full notification centre for RISO HUB.
 * Renders as a bell icon in the sidebar footer that opens a slide-out panel.
 *
 * Notification types handled:
 *   mention          — someone @mentioned you in a note
 *   complaint_new    — new complaint logged on a project you own
 *   complaint_overdue — response deadline passed
 *   complaint_emergency — emergency complaint logged
 *   complaint_escalated — complaint escalated to RECC
 *   qual_expiring    — your qualification expiring within 60 days
 *   qual_expired     — your qualification expired
 *   checklist_issue  — non-compliant checklist item on your project
 *   handover_ready   — handover document ready for signing
 *   signature_received — someone signed a document
 *   action_assigned  — an action point was assigned to you
 *   system           — general system notice
 *
 * Features:
 *   - Unread count badge on bell icon
 *   - Polls every 30s for new notifications
 *   - Mark individual or all as read
 *   - Click notification navigates to relevant section
 *   - Filter tabs: All · Unread · Mentions · Complaints · System
 *   - Grouped by date (Today / Yesterday / Earlier)
 *
 * Props:
 *   token      — JWT access token
 *   onNavigate — (view, context?) navigates the app shell
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType =
  | "mention"
  | "complaint_new"
  | "complaint_overdue"
  | "complaint_emergency"
  | "complaint_escalated"
  | "qual_expiring"
  | "qual_expired"
  | "checklist_issue"
  | "handover_ready"
  | "signature_received"
  | "action_assigned"
  | "system";

type NotifFilter = "all" | "unread" | "mentions" | "complaints" | "system";

interface Notification {
  id:         string;
  type:       NotifType;
  title:      string;
  body:       string;
  read:       boolean;
  createdAt:  string;
  meta: {
    projectId?:   string;
    complaintId?: string;
    noteId?:      string;
    qualId?:      string;
    view?:        string;   // which view to navigate to
    section?:     string;   // which tab/section
  };
}

interface Props {
  token:      string;
  onNavigate: (view: string, meta?: Record<string, string>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotifType, { icon: string; color: string; bg: string }> = {
  mention:              { icon: "@",  color: "#7A8465", bg: "#f0f1ec" },
  complaint_new:        { icon: "◉",  color: "#c07030", bg: "#fdf4ed" },
  complaint_overdue:    { icon: "⏱",  color: "#c05050", bg: "#fdf0f0" },
  complaint_emergency:  { icon: "⚡",  color: "#c05050", bg: "#fdf0f0" },
  complaint_escalated:  { icon: "↑",  color: "#3060d0", bg: "#eff2fd" },
  qual_expiring:        { icon: "⚠",  color: "#8a7a20", bg: "#fefce8" },
  qual_expired:         { icon: "✕",  color: "#c05050", bg: "#fdf0f0" },
  checklist_issue:      { icon: "!",  color: "#c05050", bg: "#fdf0f0" },
  handover_ready:       { icon: "✓",  color: "#4a7a5a", bg: "#edf7f1" },
  signature_received:   { icon: "✍",  color: "#4a7a5a", bg: "#edf7f1" },
  action_assigned:      { icon: "→",  color: "#555",    bg: "#f5f5f2" },
  system:               { icon: "·",  color: "#888",    bg: "#f5f5f2" },
};

const FILTER_TABS: { key: NotifFilter; label: string }[] = [
  { key: "all",        label: "All"        },
  { key: "unread",     label: "Unread"     },
  { key: "mentions",   label: "Mentions"   },
  { key: "complaints", label: "Complaints" },
  { key: "system",     label: "System"     },
];

function fmtRelative(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Notification[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of notifications) {
    const d = new Date(n.createdAt);
    if (d >= today)          groups.Today.push(n);
    else if (d >= yesterday) groups.Yesterday.push(n);
    else                     groups.Earlier.push(n);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function filterNotifications(notifs: Notification[], filter: NotifFilter): Notification[] {
  switch (filter) {
    case "unread":     return notifs.filter(n => !n.read);
    case "mentions":   return notifs.filter(n => n.type === "mention");
    case "complaints": return notifs.filter(n => n.type.startsWith("complaint_"));
    case "system":     return notifs.filter(n => n.type === "system");
    default:           return notifs;
  }
}

// ─── Notification item ────────────────────────────────────────────────────────

function NotifItem({
  notif, onRead, onNavigate,
}: {
  notif:      Notification;
  onRead:     (id: string) => void;
  onNavigate: (view: string, meta?: Record<string, string>) => void;
}) {
  const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.system;

  const handleClick = () => {
    if (!notif.read) onRead(notif.id);
    if (notif.meta.view) {
      onNavigate(notif.meta.view, {
        projectId:   notif.meta.projectId   ?? "",
        complaintId: notif.meta.complaintId ?? "",
        section:     notif.meta.section     ?? "",
      });
    }
  };

  return (
    <button
      style={{ ...ni.item, ...(notif.read ? ni.itemRead : ni.itemUnread) }}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {!notif.read && <span style={ni.unreadDot} />}

      {/* Icon */}
      <div style={{ ...ni.icon, color: cfg.color, background: cfg.bg }}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div style={ni.content}>
        <div style={ni.title}>{notif.title}</div>
        <div style={ni.body}>{notif.body}</div>
        <div style={ni.time}>{fmtRelative(notif.createdAt)}</div>
      </div>
    </button>
  );
}

// ─── Bell Icon with badge ─────────────────────────────────────────────────────

export function NotificationBell({
  unreadCount, onClick,
}: { unreadCount: number; onClick: () => void }) {
  return (
    <button style={nb.bell} onClick={onClick} title="Notifications">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {unreadCount > 0 && (
        <span style={nb.badge}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotificationCentre({ token, onNavigate }: Props) {
  const [open, setOpen]       = useState(false);
  const [notifs, setNotifs]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<NotifFilter>("all");
  const panelRef              = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res  = await fetch("/api/notifications?limit=60", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifs(data.notifications ?? []);
    } catch { /* stale */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  // Poll every 30s
  useEffect(() => {
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await fetch(`/api/notifications/${id}/read`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const handleNavigate = (view: string, meta?: Record<string, string>) => {
    setOpen(false);
    onNavigate(view, meta);
  };

  const unreadCount = notifs.filter(n => !n.read).length;
  const filtered    = filterNotifications(notifs, filter);
  const grouped     = groupByDate(filtered);

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <NotificationBell unreadCount={unreadCount} onClick={() => setOpen(o => !o)} />

      {open && (
        <>
          {/* Backdrop blur on mobile */}
          <div style={nc.backdrop} onClick={() => setOpen(false)} />

          {/* Panel */}
          <div style={nc.panel}>

            {/* Panel header */}
            <div style={nc.panelHeader}>
              <div style={nc.panelTitle}>
                Notifications
                {unreadCount > 0 && (
                  <span style={nc.unreadBadge}>{unreadCount} new</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button style={nc.markAllBtn} onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div style={nc.filterTabs}>
              {FILTER_TABS.map(tab => {
                const count = filterNotifications(notifs.filter(n => !n.read), tab.key).length;
                return (
                  <button
                    key={tab.key}
                    style={{ ...nc.filterTab, ...(filter === tab.key ? nc.filterTabActive : {}) }}
                    onClick={() => setFilter(tab.key)}
                  >
                    {tab.label}
                    {tab.key !== "all" && count > 0 && (
                      <span style={nc.filterCount}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div style={nc.content}>
              {loading ? (
                <div style={nc.empty}>Loading…</div>
              ) : filtered.length === 0 ? (
                <div style={nc.emptyState}>
                  <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 8 }}>🔔</div>
                  <p style={{ fontSize: 13, color: "#aaa", margin: 0 }}>
                    {filter === "unread" ? "All caught up!" : "Nothing here yet."}
                  </p>
                </div>
              ) : (
                grouped.map(group => (
                  <div key={group.label}>
                    <div style={nc.groupLabel}>{group.label}</div>
                    {group.items.map(n => (
                      <NotifItem
                        key={n.id}
                        notif={n}
                        onRead={markRead}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const nb: Record<string, React.CSSProperties> = {
  bell:  { position: "relative", background: "none", border: "none", cursor: "pointer", color: "#9a9a8e", padding: "6px", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, background: "#c05050", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", fontFamily: "Arial, sans-serif", border: "2px solid #fff" },
};

const nc: Record<string, React.CSSProperties> = {
  backdrop:     { position: "fixed", inset: 0, zIndex: 299 },
  panel:        { position: "fixed", top: 0, right: 0, width: 380, height: "100vh", background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)", zIndex: 300, display: "flex", flexDirection: "column" as const, fontFamily: "Satoshi, sans-serif" },
  panelHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 0", flexShrink: 0 },
  panelTitle:   { fontSize: 16, fontWeight: 700, color: "#333", display: "flex", alignItems: "center", gap: 8 },
  unreadBadge:  { fontSize: 11, fontWeight: 600, color: "#7A8465", background: "#f0f1ec", padding: "2px 7px", borderRadius: 12 },
  markAllBtn:   { background: "none", border: "none", fontSize: 12, color: "#7A8465", fontWeight: 600, cursor: "pointer", padding: 0 },
  filterTabs:   { display: "flex", gap: 0, padding: "14px 20px 0", borderBottom: "1px solid #f0f1ec", flexShrink: 0, overflowX: "auto" as const },
  filterTab:    { padding: "8px 10px", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -1, fontSize: 12.5, fontWeight: 600, color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" as const, flexShrink: 0 },
  filterTabActive: { color: "#7A8465", borderBottomColor: "#7A8465" },
  filterCount:  { fontSize: 10, fontWeight: 700, color: "#fff", background: "#c05050", borderRadius: 10, padding: "1px 5px", lineHeight: 1.4 },
  content:      { flex: 1, overflowY: "auto" as const, padding: "8px 0" },
  groupLabel:   { fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: "0.08em", padding: "12px 20px 4px" },
  empty:        { color: "#aaa", fontSize: 13.5, padding: "32px 20px" },
  emptyState:   { textAlign: "center" as const, padding: "48px 20px" },
};

const ni: Record<string, React.CSSProperties> = {
  item:      { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 20px", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const, position: "relative", transition: "background 0.1s" },
  itemUnread:{ background: "#fafaf8" },
  itemRead:  { opacity: 0.75 },
  unreadDot: { position: "absolute", left: 8, top: 18, width: 6, height: 6, borderRadius: "50%", background: "#7A8465", flexShrink: 0 },
  icon:      { width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  content:   { flex: 1, minWidth: 0 },
  title:     { fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 2, lineHeight: 1.4 },
  body:      { fontSize: 12.5, color: "#666", lineHeight: 1.5, marginBottom: 4 },
  time:      { fontSize: 11, color: "#bbb" },
};
