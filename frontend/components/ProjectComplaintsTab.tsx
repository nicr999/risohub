/**
 * ProjectComplaintsTab.tsx
 *
 * Renders inside the project detail view — shows all complaints linked
 * to a specific project, with the ability to log new ones pre-filled
 * with the customer's details.
 *
 * Mount inside your project detail panel, e.g. as a tab alongside
 * Checklist, Documents, and Files.
 *
 * Props:
 *   project  — the current project object
 *   token    — JWT access token
 *   userRole — "Admin" | "Surveyor" | "Installer" | "Auditor"
 *   onNavigateToComplaints — navigate to full complaints module
 */

import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplaintStatus =
  | "new" | "in_progress" | "pending_info"
  | "escalated" | "resolved" | "closed";

interface LinkedComplaint {
  id:               string;
  ref:              string;
  status:           ComplaintStatus;
  priority:         "standard" | "emergency";
  category:         string;
  description:      string;
  receivedAt:       string;
  responseDeadline: string;
  assignedTo:       string;
  escalationStage:  string;
  customerSatisfied: boolean | null;
  closedAt:         string | null;
  actionPoints: { id: string; completedAt: string | null }[];
  contactLog:   { id: string }[];
}

interface Project {
  id:           string;
  customerName: string;
  address:      string;
  postcode:     string;
  projectType:  "ASHP" | "GSHP";
  assignedTo:   string;
}

interface Props {
  project:                   Project;
  token:                     string;
  userRole:                  string;
  onNavigateToComplaints?:   () => void;
  onOpenComplaint?:          (id: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ComplaintStatus, {
  label: string; color: string; bg: string; border: string; dot: string;
}> = {
  new:          { label: "New",          color: "#c05050", bg: "#fdf0f0", border: "#e8b4b4", dot: "#c05050" },
  in_progress:  { label: "In Progress",  color: "#c07030", bg: "#fdf4ed", border: "#e8c4a0", dot: "#d4761a" },
  pending_info: { label: "Pending Info", color: "#8a7a20", bg: "#fefce8", border: "#e8d870", dot: "#c4a800" },
  escalated:    { label: "Escalated",    color: "#3050a0", bg: "#eff2fd", border: "#a0b0e8", dot: "#3060d0" },
  resolved:     { label: "Resolved",     color: "#4a7a5a", bg: "#edf7f1", border: "#b8dfc8", dot: "#4a7a5a" },
  closed:       { label: "Closed",       color: "#555",    bg: "#f5f5f2", border: "#d0cec6", dot: "#888"    },
};

const CATEGORY_LABELS: Record<string, string> = {
  technical_installation: "Technical / Installation",
  workmanship:            "Workmanship",
  performance:            "System Performance",
  communication:          "Communication",
  billing:                "Billing / Pricing",
  damage:                 "Property Damage",
  other:                  "Other",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ─── Quick Log Form ───────────────────────────────────────────────────────────

function QuickLogForm({
  project, token, onClose, onSaved,
}: {
  project: Project; token: string; onClose: () => void; onSaved: () => void;
}) {
  const now = new Date().toISOString().slice(0, 16);
  const [form, setForm] = useState({
    receivedAt:     now,
    receivedMethod: "email",
    category:       "technical_installation",
    priority:       "standard",
    description:    "",
    assignedTo:     project.assignedTo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async () => {
    if (!form.description) { setError("Description is required."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/complaints", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          projectId:       project.id,
          customerName:    project.customerName,
          customerAddress: `${project.address}, ${project.postcode}`,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={qf.overlay}>
      <div style={qf.modal}>
        <div style={qf.header}>
          <div>
            <h2 style={qf.title}>Log complaint</h2>
            <p style={qf.sub}>
              {project.customerName} · {project.address}, {project.postcode}
            </p>
          </div>
          <button onClick={onClose} style={qf.closeBtn}>✕</button>
        </div>

        {form.priority === "emergency" && (
          <div style={qf.emergencyBanner}>
            ⚡ Emergency — RECC requires inspection within <strong>24 hours</strong>
          </div>
        )}

        <div style={qf.grid3}>
          <div style={qf.field}>
            <label style={qf.label}>Date received</label>
            <input style={qf.input} type="datetime-local" value={form.receivedAt} onChange={e => setForm(f => ({ ...f, receivedAt: e.target.value }))} />
          </div>
          <div style={qf.field}>
            <label style={qf.label}>Received by</label>
            <select style={qf.select} value={form.receivedMethod} onChange={e => setForm(f => ({ ...f, receivedMethod: e.target.value }))}>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="post">Post</option>
              <option value="in_person">In person</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={qf.field}>
            <label style={qf.label}>Category</label>
            <select style={qf.select} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div style={qf.field}>
          <label style={qf.label}>Priority</label>
          <div style={qf.radioRow}>
            {(["standard", "emergency"] as const).map(p => (
              <label key={p} style={{ ...qf.radioOpt, ...(form.priority === p ? qf.radioOptActive : {}), ...(p === "emergency" ? { borderColor: form.priority === p ? "#c05050" : "#e0ded8" } : {}) }}>
                <input type="radio" value={p} checked={form.priority === p} onChange={() => setForm(f => ({ ...f, priority: p }))} style={{ accentColor: p === "emergency" ? "#c05050" : "#7A8465" }} />
                <span style={{ fontWeight: 600, color: p === "emergency" ? "#c05050" : "#333", fontSize: 13 }}>
                  {p === "emergency" ? "⚡ Emergency (no heating/hot water)" : "Standard"}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={qf.field}>
          <label style={qf.label}>Description *</label>
          <textarea style={qf.textarea} rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Full description of the complaint as reported by the customer…" />
        </div>

        <div style={qf.field}>
          <label style={qf.label}>Assigned handler (MCS Nominee)</label>
          <input style={qf.input} value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Name or user ID" />
        </div>

        {error && <div style={qf.errorMsg}>{error}</div>}

        <div style={qf.footer}>
          <button style={qf.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={qf.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? "Logging…" : "Log complaint →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectComplaintsTab({
  project, token, userRole, onNavigateToComplaints, onOpenComplaint,
}: Props) {
  const [complaints, setComplaints] = useState<LinkedComplaint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [toast, setToast]           = useState<string | null>(null);

  const canEdit = ["Admin", "Surveyor"].includes(userRole);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchComplaints = useCallback(async () => {
    try {
      const res  = await fetch(`/api/complaints?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setComplaints(data.complaints ?? []);
    } catch { /* stale */ }
    finally { setLoading(false); }
  }, [project.id, token]);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  // Counts
  const open       = complaints.filter(c => !["resolved", "closed"].includes(c.status));
  const resolved   = complaints.filter(c => c.status === "resolved");
  const emergencies = open.filter(c => c.priority === "emergency");
  const overdue    = open.filter(c => isOverdue(c.responseDeadline));

  return (
    <div style={pt.wrap}>

      {/* Header */}
      <div style={pt.header}>
        <div>
          <h2 style={pt.title}>Complaints</h2>
          <p style={pt.subtitle}>
            {complaints.length === 0
              ? "No complaints logged for this project."
              : `${complaints.length} total · ${open.length} open · ${resolved.length} resolved`}
          </p>
        </div>
        <div style={pt.headerActions}>
          {onNavigateToComplaints && (
            <button style={pt.viewAllBtn} onClick={onNavigateToComplaints}>
              View all complaints ↗
            </button>
          )}
          {canEdit && (
            <button style={pt.logBtn} onClick={() => setShowForm(true)}>
              + Log complaint
            </button>
          )}
        </div>
      </div>

      {/* Alert strip */}
      {(emergencies.length > 0 || overdue.length > 0) && (
        <div style={pt.alertStrip}>
          {emergencies.length > 0 && (
            <div style={{ ...pt.alertChip, background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050" }}>
              ⚡ {emergencies.length} emergency — 24hr inspection required
            </div>
          )}
          {overdue.length > 0 && (
            <div style={{ ...pt.alertChip, background: "#fdf4ed", border: "1px solid #e8c4a0", color: "#8a4020" }}>
              ⏱ {overdue.length} response deadline overdue
            </div>
          )}
        </div>
      )}

      {/* Summary counts */}
      {complaints.length > 0 && (
        <div style={pt.countStrip}>
          {(["new","in_progress","pending_info","escalated","resolved","closed"] as ComplaintStatus[]).map(s => {
            const count = complaints.filter(c => c.status === s).length;
            if (count === 0) return null;
            const cfg = STATUS_CONFIG[s];
            return (
              <div key={s} style={{ ...pt.countBadge, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block", marginRight: 5 }} />
                {count} {cfg.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Complaints list */}
      {loading ? (
        <div style={pt.empty}>Loading…</div>
      ) : complaints.length === 0 ? (
        <div style={pt.emptyState}>
          <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>📋</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#777", margin: "0 0 4px" }}>No complaints logged</p>
          <p style={{ fontSize: 12.5, color: "#aaa", margin: 0 }}>
            If a customer raises a concern, log it here to maintain your MCS R06 record.
          </p>
        </div>
      ) : (
        <div style={pt.list}>
          {complaints.map(c => {
            const cfg       = STATUS_CONFIG[c.status];
            const isClosed  = ["resolved", "closed"].includes(c.status);
            const respDays  = daysUntil(c.responseDeadline);
            const respOver  = isOverdue(c.responseDeadline);
            const openAPs   = c.actionPoints.filter(a => !a.completedAt).length;
            const totalAPs  = c.actionPoints.length;

            return (
              <div
                key={c.id}
                style={pt.card}
                onClick={() => onOpenComplaint ? onOpenComplaint(c.id) : onNavigateToComplaints?.()}
              >
                {/* Card header row */}
                <div style={pt.cardTop}>
                  <div style={pt.cardLeft}>
                    <div style={pt.cardRef}>{c.ref}</div>
                    <div style={pt.cardCategory}>
                      {CATEGORY_LABELS[c.category] ?? c.category}
                      {c.priority === "emergency" && (
                        <span style={pt.emergencyTag}>⚡ Emergency</span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...pt.statusBadge, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block", marginRight: 6 }} />
                    {cfg.label}
                  </span>
                </div>

                {/* Description excerpt */}
                <div style={pt.cardDesc}>
                  {c.description.length > 120 ? c.description.slice(0, 120) + "…" : c.description}
                </div>

                {/* Meta row */}
                <div style={pt.cardMeta}>
                  <span>Received {fmtDate(c.receivedAt)}</span>
                  {c.assignedTo && <><span style={{ color: "#d0cec6" }}>·</span><span>Handler: {c.assignedTo}</span></>}
                  {!isClosed && respOver && <span style={{ color: "#c05050", fontWeight: 600 }}>· Response overdue</span>}
                  {!isClosed && !respOver && respDays !== null && respDays <= 2 && (
                    <span style={{ color: "#c07030", fontWeight: 600 }}>· Response in {respDays}d</span>
                  )}
                  {c.escalationStage !== "none" && (
                    <span style={{ color: "#3060d0", fontWeight: 600 }}>
                      · {c.escalationStage.replace(/_/g, " ")}
                    </span>
                  )}
                </div>

                {/* Progress row */}
                <div style={pt.cardProgress}>
                  {totalAPs > 0 && (
                    <div style={pt.progressWrap}>
                      <div style={pt.progressBar}>
                        <div style={{
                          ...pt.progressFill,
                          width: `${Math.round(((totalAPs - openAPs) / totalAPs) * 100)}%`,
                          background: openAPs === 0 ? "#4a7a5a" : "#7A8465",
                        }} />
                      </div>
                      <span style={pt.progressLabel}>
                        {totalAPs - openAPs}/{totalAPs} actions complete
                      </span>
                    </div>
                  )}
                  {c.contactLog.length > 0 && (
                    <span style={pt.contactCount}>
                      {c.contactLog.length} contact{c.contactLog.length === 1 ? "" : "s"} logged
                    </span>
                  )}
                  {isClosed && c.customerSatisfied !== null && (
                    <span style={{ ...pt.satisfiedTag, color: c.customerSatisfied ? "#4a7a5a" : "#c05050", background: c.customerSatisfied ? "#edf7f1" : "#fdf0f0" }}>
                      {c.customerSatisfied ? "✓ Customer satisfied" : "✕ Not satisfied"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RECC compliance reminder */}
      {open.length > 0 && (
        <div style={pt.reccReminder}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>RECC reminders:</span>
          <span style={{ fontSize: 12.5, color: "#777" }}>
            Respond within 7 working days · Inspect within 7 days (24hrs if emergency) ·
            Inform customer of RECC escalation rights if unresolved
          </span>
        </div>
      )}

      {/* Quick log form */}
      {showForm && (
        <QuickLogForm
          project={project}
          token={token}
          onClose={() => setShowForm(false)}
          onSaved={() => { fetchComplaints(); showToast("Complaint logged ✓"); }}
        />
      )}

      {toast && (
        <div style={pt.toast}>{toast}</div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pt: Record<string, React.CSSProperties> = {
  wrap:           { fontFamily: "Satoshi, sans-serif", color: "#333" },
  header:         { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title:          { fontSize: 17, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" },
  subtitle:       { fontSize: 13, color: "#888", margin: 0 },
  headerActions:  { display: "flex", gap: 8, flexShrink: 0 },
  viewAllBtn:     { padding: "8px 14px", background: "none", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: "#555", cursor: "pointer" },
  logBtn:         { padding: "8px 16px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" },

  alertStrip:     { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" as const },
  alertChip:      { display: "inline-flex", alignItems: "center", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600 },

  countStrip:     { display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 14 },
  countBadge:     { display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },

  empty:          { color: "#aaa", fontSize: 14, padding: "24px 0" },
  emptyState:     { textAlign: "center" as const, padding: "36px 24px", background: "#fafaf8", border: "1px dashed #d8d6ce", borderRadius: 10 },

  list:           { display: "flex", flexDirection: "column" as const, gap: 10 },

  card:           { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.15s" },
  cardTop:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  cardLeft:       {},
  cardRef:        { fontSize: 11, fontWeight: 700, color: "#7A8465", letterSpacing: "0.06em", marginBottom: 3 },
  cardCategory:   { fontSize: 13.5, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 8 },
  emergencyTag:   { fontSize: 11, fontWeight: 700, color: "#c05050", background: "#fdf0f0", border: "1px solid #e8b4b4", borderRadius: 12, padding: "1px 7px" },
  statusBadge:    { display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  cardDesc:       { fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 10 },
  cardMeta:       { display: "flex", gap: 8, fontSize: 12, color: "#aaa", flexWrap: "wrap" as const, marginBottom: 10 },

  cardProgress:   { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
  progressWrap:   { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  progressBar:    { flex: 1, height: 4, background: "#f0f1ec", borderRadius: 2, overflow: "hidden", minWidth: 60 },
  progressFill:   { height: "100%", borderRadius: 2, transition: "width 0.3s" },
  progressLabel:  { fontSize: 11, color: "#aaa", whiteSpace: "nowrap" as const },
  contactCount:   { fontSize: 11.5, color: "#aaa" },
  satisfiedTag:   { fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 12 },

  reccReminder:   { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, padding: "10px 14px", background: "#f7f7f4", border: "1px solid #e8e6e0", borderRadius: 8 },

  toast:          { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#333", color: "#fff", padding: "11px 22px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
};

const qf: Record<string, React.CSSProperties> = {
  overlay:       { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" },
  modal:         { background: "#fff", borderRadius: 14, padding: "28px 32px", width: "100%", maxWidth: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" as const },
  header:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:         { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  sub:           { fontSize: 13, color: "#7A8465", margin: "4px 0 0", fontWeight: 600 },
  closeBtn:      { background: "none", border: "none", fontSize: 18, color: "#aaa", cursor: "pointer" },
  emergencyBanner: { background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16 },
  grid3:         { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 4 },
  field:         { marginBottom: 14 },
  label:         { display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 5 },
  input:         { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, outline: "none" },
  select:        { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", background: "#fff", cursor: "pointer" },
  textarea:      { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif" },
  radioRow:      { display: "flex", gap: 10 },
  radioOpt:      { display: "flex", alignItems: "center", gap: 8, flex: 1, padding: "10px 12px", border: "1px solid #e0ded8", borderRadius: 8, cursor: "pointer" },
  radioOptActive:{ borderColor: "#7A8465", background: "#f0f1ec" },
  errorMsg:      { background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  footer:        { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancelBtn:     { padding: "9px 18px", border: "1px solid #e0ded8", borderRadius: 8, background: "#fff", color: "#555", fontSize: 14, cursor: "pointer" },
  saveBtn:       { padding: "9px 22px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" },
};
