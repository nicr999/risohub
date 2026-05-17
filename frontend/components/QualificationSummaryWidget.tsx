/**
 * QualificationSummaryWidget.tsx
 *
 * Compact qualification compliance summary for the main dashboard.
 * Shows:
 *   - Expired / expiring / valid counts
 *   - Per-installer compliance status (required quals only)
 *   - "View all" link navigates to the Qualifications tab
 *
 * Props:
 *   token      — JWT access token
 *   onNavigate — callback to navigate to "qualifications" view
 */

import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type QualStatus = "valid" | "expiring" | "expired" | "missing";

interface InstallerSummary {
  staffId:   string;
  name:      string;
  role:      string;
  expired:   number;
  expiring:  number;
  valid:     number;
  missing:   string[]; // required qual types not held
  overall:   QualStatus;
}

interface WidgetData {
  totalExpired:   number;
  totalExpiring:  number;
  totalValid:     number;
  installers:     InstallerSummary[];
  compliantCount: number;
  totalInstallers: number;
}

interface Props {
  token:      string;
  onNavigate: () => void;
}

// ─── Required qual types (mirrors mis3005Items / QUAL_TYPES) ──────────────────

const REQUIRED_TYPES = [
  "MCS Installer Certification",
  "Microgeneration Installation Standard",
  "WRAS Water Regulations",
  "RECC Membership",
  "Manual Handling",
  "Health & Safety (CSCS/SSSTS)",
  "First Aid at Work",
];

const EXPIRY_WARNING_DAYS = 60;

function computeStatus(q: { expiresAt: string | null; neverExpires: boolean }): QualStatus {
  if (q.neverExpires || !q.expiresAt) return "valid";
  const days = Math.floor((new Date(q.expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0)                    return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QualificationSummaryWidget({ token, onNavigate }: Props) {
  const [data, setData]       = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const [usersRes, qualsRes] = await Promise.all([
        fetch("/api/users?active=true",  { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/qualifications",     { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const { users }          = await usersRes.json();
      const { qualifications } = await qualsRes.json();

      const installers = (users ?? []).filter((u: any) =>
        ["Installer", "Surveyor"].includes(u.role)
      );

      let totalExpired = 0, totalExpiring = 0, totalValid = 0;

      const installerSummaries: InstallerSummary[] = installers.map((u: any) => {
        const myQuals = (qualifications ?? []).filter((q: any) => q.staffId === u.id);

        let expired = 0, expiring = 0, valid = 0;
        for (const q of myQuals) {
          const s = computeStatus(q);
          if (s === "expired")  { expired++;  totalExpired++;  }
          if (s === "expiring") { expiring++; totalExpiring++; }
          if (s === "valid")    { valid++;    totalValid++;    }
        }

        const activeQualTypes = myQuals
          .filter((q: any) => computeStatus(q) !== "expired")
          .map((q: any) => q.type);
        const missing = REQUIRED_TYPES.filter(rt => !activeQualTypes.includes(rt));

        const overall: QualStatus =
          expired > 0   ? "expired"  :
          missing.length > 0 ? "missing"  :
          expiring > 0  ? "expiring" : "valid";

        return { staffId: u.id, name: u.name, role: u.role, expired, expiring, valid, missing, overall };
      });

      const compliantCount = installerSummaries.filter(i => i.overall === "valid").length;

      setData({
        totalExpired,
        totalExpiring,
        totalValid,
        installers:      installerSummaries,
        compliantCount,
        totalInstallers: installers.length,
      });
    } catch {
      /* fail silently — widget is non-critical */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (loading) return <div style={w.card}><div style={w.shimmer} /></div>;
  if (!data)   return null;

  const allCompliant = data.compliantCount === data.totalInstallers;
  const hasIssues    = data.totalExpired > 0 || data.installers.some(i => i.missing.length > 0);

  return (
    <div style={w.card}>
      {/* Header */}
      <div style={w.header}>
        <div style={w.headerLeft}>
          <div style={w.titleRow}>
            <span style={w.title}>Qualifications</span>
            {allCompliant
              ? <span style={{ ...w.pill, color: "#4a7a5a", background: "#edf7f1" }}>All compliant ✓</span>
              : <span style={{ ...w.pill, color: "#a05050", background: "#fdf0f0" }}>Action required</span>
            }
          </div>
          <div style={w.subtitle}>
            {data.compliantCount} of {data.totalInstallers} installer{data.totalInstallers === 1 ? "" : "s"} fully compliant
          </div>
        </div>
        <button style={w.viewAll} onClick={onNavigate}>View all →</button>
      </div>

      {/* Stat row */}
      <div style={w.statRow}>
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.totalExpired > 0 ? "#c05050" : "#4a7a5a" }}>
            {data.totalExpired}
          </span>
          <span style={w.statLabel}>Expired</span>
        </div>
        <div style={w.statDivider} />
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: data.totalExpiring > 0 ? "#d4a828" : "#4a7a5a" }}>
            {data.totalExpiring}
          </span>
          <span style={w.statLabel}>Expiring soon</span>
        </div>
        <div style={w.statDivider} />
        <div style={w.stat}>
          <span style={{ ...w.statNum, color: "#4a7a5a" }}>{data.totalValid}</span>
          <span style={w.statLabel}>Valid</span>
        </div>
      </div>

      {/* Per-installer rows */}
      {data.installers.length > 0 && (
        <div style={w.installerList}>
          {data.installers.map(inst => {
            const dot =
              inst.overall === "expired"  ? "#c05050" :
              inst.overall === "missing"  ? "#c05050" :
              inst.overall === "expiring" ? "#d4a828" : "#4a7a5a";

            return (
              <div key={inst.staffId} style={w.installerRow}>
                <div style={w.installerLeft}>
                  <span style={{ ...w.statusDot, background: dot }} />
                  <div>
                    <div style={w.installerName}>{inst.name}</div>
                    {inst.missing.length > 0 && (
                      <div style={w.installerIssue}>
                        Missing: {inst.missing.slice(0, 2).join(", ")}
                        {inst.missing.length > 2 && ` +${inst.missing.length - 2} more`}
                      </div>
                    )}
                    {inst.expired > 0 && inst.missing.length === 0 && (
                      <div style={w.installerIssue}>{inst.expired} expired cert{inst.expired === 1 ? "" : "s"}</div>
                    )}
                    {inst.expiring > 0 && inst.overall === "expiring" && (
                      <div style={{ ...w.installerIssue, color: "#8a7a50" }}>
                        {inst.expiring} cert{inst.expiring === 1 ? "" : "s"} expiring soon
                      </div>
                    )}
                  </div>
                </div>
                <span style={w.installerRole}>{inst.role}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert footer */}
      {hasIssues && (
        <button style={w.alertFooter} onClick={onNavigate}>
          ⚠ Review qualification issues →
        </button>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const w: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff", border: "1px solid #e8e6e0", borderRadius: 12,
    padding: "20px", fontFamily: "Satoshi, sans-serif",
  },
  shimmer: {
    height: 120, background: "linear-gradient(90deg,#f0f1ec 25%,#e8e6e0 50%,#f0f1ec 75%)",
    borderRadius: 8, animation: "shimmer 1.5s infinite",
  },
  header:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerLeft: { flex: 1 },
  titleRow:   { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  title:      { fontSize: 14, fontWeight: 700, color: "#333" },
  subtitle:   { fontSize: 12, color: "#888" },
  pill:       { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 },
  viewAll:    { background: "none", border: "none", fontSize: 12, color: "#7A8465", fontWeight: 600, cursor: "pointer", padding: 0, whiteSpace: "nowrap" },

  statRow:     { display: "flex", gap: 0, marginBottom: 16, background: "#f7f7f4", borderRadius: 8, overflow: "hidden" },
  stat:        { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 8px" },
  statNum:     { fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 3 },
  statLabel:   { fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" },
  statDivider: { width: 1, background: "#e8e6e0", flexShrink: 0 },

  installerList: { display: "flex", flexDirection: "column", gap: 1 },
  installerRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f7f7f4" },
  installerLeft: { display: "flex", alignItems: "flex-start", gap: 9 },
  statusDot:     { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5 },
  installerName: { fontSize: 13, fontWeight: 600, color: "#333" },
  installerIssue:{ fontSize: 11, color: "#c05050", marginTop: 2 },
  installerRole: { fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },

  alertFooter: {
    display: "block", width: "100%", marginTop: 14,
    padding: "9px", background: "#fdf6e3",
    border: "1px solid #e8d48a", borderRadius: 8,
    fontSize: 12, fontWeight: 600, color: "#8a7a50",
    cursor: "pointer", textAlign: "center",
  },
};
