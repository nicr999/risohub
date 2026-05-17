/**
 * ComplaintsSummaryWidget.tsx
 *
 * Compact complaints summary for the main dashboard.
 * Shows open complaints, emergencies, overdue response deadlines,
 * and a per-status count strip.
 *
 * Props:
 *   token      — JWT access token
 *   onNavigate — navigates to complaints view
 */

import React, { useState, useEffect, useCallback } from "react";

interface ComplaintSummary {
  total:         number;
  open:          number;
  emergencies:   number;
  overdueCount:  number;
  escalated:     number;
  resolvedMonth: number;
  recentOpen: {
    id:       string;
    ref:      string;
    name:     string;
    status:   string;
    priority: string;
    days:     number | null; // days until response deadline (negative = overdue)
  }[];
}

const STATUS_DOTS: Record<string, string> = {
  new:          "#c05050",
  in_progress:  "#d4761a",
  pending_info: "#c4a800",
  escalated:    "#3060d0",
  resolved:     "#4a7a5a",
  closed:       "#888",
};

export default function ComplaintsSummaryWidget({
  token, onNavigate,
}: { token: string; onNavigate: () => void }) {
  const [data, setData]       = useState<ComplaintSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res    = await fetch("/api/complaints", { headers: { Authorization: `Bearer ${token}` } });
      const { complaints } = await res.json();

      const now       = Date.now();
      const openStatuses = ["new", "in_progress", "pending_info", "escalated"];
      const open      = (complaints ?? []).filter((c: any) => openStatuses.includes(c.status));
      const emergencies = open.filter((c: any) => c.priority === "emergency");
      const overdue   = open.filter((c: any) => c.responseDeadline && new Date(c.responseDeadline) < new Date());
      const escalated = open.filter((c: any) => c.status === "escalated");
      const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
      const resolvedMonth = (complaints ?? []).filter((c: any) =>
        c.status === "resolved" && c.closedAt && new Date(c.closedAt) >= thisMonth
      );

      const recentOpen = open.slice(0, 5).map((c: any) => ({
        id:       c.id,
        ref:      c.ref,
        name:     c.customerName,
        status:   c.status,
        priority: c.priority,
        days:     c.responseDeadline
          ? Math.floor((new Date(c.responseDeadline).getTime() - now) / 86_400_000)
          : null,
      }));

      setData({
        total:         (complaints ?? []).length,
        open:          open.length,
        emergencies:   emergencies.length,
        overdueCount:  overdue.length,
        escalated:     escalated.length,
        resolvedMonth: resolvedMonth.length,
        recentOpen,
      });
    } catch { /* fail silently */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div style={w.card}>
      <div style={{ height: 100, background: "#f0f1ec", borderRadius: 8 }} />
    </div>
  );
  if (!data) return null;

  const hasUrgent = data.emergencies > 0 || data.overdueCount > 0;

  return (
    <div style={w.card}>
      {/* Header */}
      <div style={w.header}>
        <div>
          <div style={w.titleRow}>
            <span style={w.title}>Complaints</span>
            {hasUrgent
              ? <span style={{ ...w.pill, color: "#c05050", background: "#fdf0f0" }}>Action required</span>
              : data.open === 0
              ? <span style={{ ...w.pill, color: "#4a7a5a", background: "#edf7f1" }}>All clear ✓</span>
              : <span style={{ ...w.pill, color: "#8a7a20", background: "#fefce8" }}>{data.open} open</span>
            }
          </div>
          <div style={w.subtitle}>{data.open} open · {data.resolvedMonth} resolved this month</div>
        </div>
        <button style={w.viewAll} onClick={onNavigate}>View all →</button>
      </div>

      {/* Stat row */}
      <div style={w.statRow}>
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.open > 0 ? "#c07030" : "#4a7a5a" }}>{data.open}</span>
          <span style={w.statLabel}>Open</span>
        </div>
        <div style={w.statDivider} />
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.emergencies > 0 ? "#c05050" : "#4a7a5a" }}>{data.emergencies}</span>
          <span style={w.statLabel}>Emergency</span>
        </div>
        <div style={w.statDivider} />
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.overdueCount > 0 ? "#c05050" : "#4a7a5a" }}>{data.overdueCount}</span>
          <span style={w.statLabel}>Overdue</span>
        </div>
        <div style={w.statDivider} />
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.escalated > 0 ? "#3060d0" : "#4a7a5a" }}>{data.escalated}</span>
          <span style={w.statLabel}>Escalated</span>
        </div>
      </div>

      {/* Recent open complaints */}
      {data.recentOpen.length > 0 && (
        <div style={w.list}>
          {data.recentOpen.map(c => {
            const overdue = c.days !== null && c.days < 0;
            const urgent  = c.priority === "emergency" || overdue;
            return (
              <button key={c.id} style={w.row} onClick={onNavigate}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_DOTS[c.status] ?? "#aaa", flexShrink: 0, marginTop: 5 }} />
                <div style={w.rowBody}>
                  <div style={w.rowName}>
                    {c.priority === "emergency" && <span style={w.emergencyTag}>⚡ </span>}
                    {c.name}
                  </div>
                  <div style={{ ...w.rowMeta, color: urgent ? "#c05050" : "#aaa" }}>
                    {c.ref}
                    {c.days !== null && (
                      <span style={{ marginLeft: 6, fontWeight: 600 }}>
                        {overdue ? `${Math.abs(c.days)}d overdue` : c.days === 0 ? "Due today" : `${c.days}d left`}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#ccc" }}>›</span>
              </button>
            );
          })}
        </div>
      )}

      {data.open === 0 && (
        <div style={w.allClear}>No open complaints.</div>
      )}

      {hasUrgent && (
        <button style={w.alertFooter} onClick={onNavigate}>
          ⚠ {data.emergencies > 0 ? `${data.emergencies} emergency` : ""}{data.emergencies > 0 && data.overdueCount > 0 ? " · " : ""}{data.overdueCount > 0 ? `${data.overdueCount} overdue` : ""} — review now →
        </button>
      )}
    </div>
  );
}

const w: Record<string, React.CSSProperties> = {
  card:        { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 12, padding: "20px", fontFamily: "Satoshi, sans-serif" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  titleRow:    { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  title:       { fontSize: 14, fontWeight: 700, color: "#333" },
  subtitle:    { fontSize: 12, color: "#888" },
  pill:        { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 },
  viewAll:     { background: "none", border: "none", fontSize: 12, color: "#7A8465", fontWeight: 600, cursor: "pointer", padding: 0, whiteSpace: "nowrap" as const },
  statRow:     { display: "flex", background: "#f7f7f4", borderRadius: 8, overflow: "hidden", marginBottom: 14 },
  stat:        { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "10px 6px" },
  statNum:     { fontSize: 20, fontWeight: 700, lineHeight: 1, marginBottom: 3 },
  statLabel:   { fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "center" as const },
  statDivider: { width: 1, background: "#e8e6e0", flexShrink: 0 },
  list:        { display: "flex", flexDirection: "column" as const },
  row:         { display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "1px solid #f7f7f4", background: "none", border: "none", borderBottom: "1px solid #f7f7f4", cursor: "pointer", textAlign: "left" as const, width: "100%" },
  rowBody:     { flex: 1, minWidth: 0 },
  rowName:     { fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 2 },
  rowMeta:     { fontSize: 11.5 },
  emergencyTag:{ color: "#c05050" },
  allClear:    { fontSize: 13, color: "#bbb", padding: "8px 0", textAlign: "center" as const },
  alertFooter: { display: "block", width: "100%", marginTop: 12, padding: "9px", background: "#fdf0f0", border: "1px solid #e8b4b4", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#a05050", cursor: "pointer", textAlign: "center" as const },
};


// ─── RisoHub.jsx wiring patch ─────────────────────────────────────────────────
/*

// 1. Add to imports at the top of RisoHub.jsx:
import ComplaintsModule        from "./ComplaintsModule";
import ComplaintsSummaryWidget from "./ComplaintsSummaryWidget";

// 2. Add "complaints" to the View type:
type View = ... | "complaints";

// 3. Add to NAV_ITEMS (after "qualifications"):
{ view: "complaints", label: "Complaints", icon: "◉", roles: ["Admin", "Surveyor", "Auditor"] },

// 4. Add the widget to DashboardOverview alongside QualificationSummaryWidget.
//    Replace the right-column section with a stacked layout:

<div>
  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#444", margin: "0 0 12px" }}>
    Team Compliance
  </h2>
  <QualificationSummaryWidget token={token} onNavigate={() => onNavigate("qualifications")} />
  <div style={{ marginTop: 16 }}>
    <ComplaintsSummaryWidget token={token} onNavigate={() => onNavigate("complaints")} />
  </div>
</div>

// 5. Add the view mount in AppShell:
{activeView === "complaints" && (
  <ComplaintsModule token={token!} userRole={user?.role ?? "Auditor"} />
)}

*/
