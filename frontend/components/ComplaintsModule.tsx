/**
 * ComplaintsModule.tsx
 *
 * MCS + RECC compliant customer complaints management module.
 *
 * Regulatory requirements enforced:
 *   MCS:
 *     - Every complaint logged as R06 Customer Complaint Record
 *     - Assigned to MCS Nominee on receipt
 *     - Linked to CAPA (Corrective & Preventive Action) record
 *     - Reviewed at next Internal Review Meeting (flagged)
 *     - Linked to project / installation record
 *
 *   RECC Section 9:
 *     - Initial response to customer within 7 working days (hard deadline, auto-flagged)
 *     - Site inspection within 7 days of receipt
 *     - EMERGENCY: inspection within 24 hours if customer without heating/hot water
 *     - Customer informed of RECC escalation rights if unresolved
 *     - Escalation path: internal → RECC mediation → RECC arbitration
 *     - Log records whether customer was satisfied with outcome
 *     - Customer may use consumer representative — must be cooperated with
 *     - No court action without first exhausting RECC procedure
 *
 * Status colour coding:
 *   🔴 new          — just logged, no action taken
 *   🟠 in_progress  — being investigated / actioned
 *   🟡 pending_info — awaiting information from customer or third party
 *   🔵 escalated    — referred to RECC / certification body
 *   🟢 resolved     — closed, customer satisfied
 *   ⚫ closed       — closed, customer not satisfied / withdrawn
 *
 * Props:
 *   token    — JWT access token
 *   userRole — "Admin" | "Surveyor" | "Installer" | "Auditor"
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplaintStatus =
  | "new"
  | "in_progress"
  | "pending_info"
  | "escalated"
  | "resolved"
  | "closed";

type ComplaintCategory =
  | "technical_installation"
  | "workmanship"
  | "performance"
  | "communication"
  | "billing"
  | "damage"
  | "other";

type EscalationStage =
  | "none"
  | "recc_mediation"
  | "recc_arbitration"
  | "certification_body"
  | "ombudsman";

type Priority = "standard" | "emergency";

interface ActionPoint {
  id:          string;
  description: string;
  assignedTo:  string;
  dueDate:     string;
  completedAt: string | null;
  notes:       string;
  createdAt:   string;
}

interface ContactLog {
  id:        string;
  date:      string;
  method:    "phone" | "email" | "post" | "visit" | "other";
  direction: "inbound" | "outbound";
  summary:   string;
  by:        string;
}

interface Complaint {
  id:                    string;
  ref:                   string;          // R06 reference e.g. "COMP-2026-001"
  projectId:             string | null;
  customerName:          string;
  customerEmail:         string;
  customerPhone:         string;
  customerAddress:       string;
  receivedAt:            string;          // ISO datetime
  receivedMethod:        "phone" | "email" | "post" | "in_person" | "other";
  category:              ComplaintCategory;
  priority:              Priority;        // emergency = no heating/hot water
  description:           string;
  status:                ComplaintStatus;
  assignedTo:            string;          // userId of handler (MCS Nominee)
  responseDeadline:      string;          // 7 working days from receivedAt
  inspectionDeadline:    string | null;   // 7 days or 24h if emergency
  inspectionDate:        string | null;
  inspectionNotes:       string;
  escalationStage:       EscalationStage;
  escalationDate:        string | null;
  escalationNotes:       string;
  resolutionDescription: string;
  customerSatisfied:     boolean | null;  // null = not yet closed
  closedAt:              string | null;
  capaRef:               string;          // CAPA record reference
  reviewedAtMeeting:     boolean;
  hasRepresentative:     boolean;
  representativeName:    string;
  actionPoints:          ActionPoint[];
  contactLog:            ContactLog[];
  createdAt:             string;
  updatedAt:             string;
}

interface Props {
  token:    string;
  userRole: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ComplaintStatus, {
  label: string; color: string; bg: string; border: string; dot: string;
}> = {
  new:          { label: "New",           color: "#c05050", bg: "#fdf0f0", border: "#e8b4b4", dot: "#c05050" },
  in_progress:  { label: "In Progress",   color: "#c07030", bg: "#fdf4ed", border: "#e8c4a0", dot: "#d4761a" },
  pending_info: { label: "Pending Info",  color: "#8a7a20", bg: "#fefce8", border: "#e8d870", dot: "#c4a800" },
  escalated:    { label: "Escalated",     color: "#3050a0", bg: "#eff2fd", border: "#a0b0e8", dot: "#3060d0" },
  resolved:     { label: "Resolved",      color: "#4a7a5a", bg: "#edf7f1", border: "#b8dfc8", dot: "#4a7a5a" },
  closed:       { label: "Closed",        color: "#555",    bg: "#f5f5f2", border: "#d0cec6", dot: "#888"    },
};

const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  technical_installation: "Technical / Installation",
  workmanship:            "Workmanship",
  performance:            "System Performance",
  communication:          "Communication",
  billing:                "Billing / Pricing",
  damage:                 "Property Damage",
  other:                  "Other",
};

const ESCALATION_LABELS: Record<EscalationStage, string> = {
  none:                 "Not escalated",
  recc_mediation:       "RECC Mediation",
  recc_arbitration:     "RECC Arbitration",
  certification_body:   "Certification Body",
  ombudsman:            "Ombudsman",
};

const WORKING_DAYS_MS = (n: number) => n * 24 * 60 * 60 * 1000; // simplified; production should skip weekends

function addWorkingDays(from: Date, days: number): Date {
  // Simple version — production should use a proper working-days library
  const d = new Date(from);
  d.setDate(d.getDate() + Math.ceil(days * 7 / 5));
  return d;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ─── Deadline badge ───────────────────────────────────────────────────────────

function DeadlineBadge({ label, date, closed }: { label: string; date: string | null; closed: boolean }) {
  if (!date) return null;
  const days    = daysUntil(date);
  const overdue = isOverdue(date);
  if (closed) return null;

  const color  = overdue ? "#c05050" : days !== null && days <= 1 ? "#c07030" : "#8a7a20";
  const bg     = overdue ? "#fdf0f0" : days !== null && days <= 1 ? "#fdf4ed" : "#fefce8";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: bg, fontSize: 11, fontWeight: 600, color }}>
      {overdue ? "⚠ " : "⏱ "}
      {label}: {overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? "Today" : `${days}d left`}
    </div>
  );
}

// ─── Log Complaint Form ───────────────────────────────────────────────────────

function ComplaintForm({
  existing, token, onClose, onSaved,
}: {
  existing: Complaint | null; token: string; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!existing;
  const now    = new Date().toISOString().slice(0, 16);

  const [form, setForm] = useState({
    customerName:    existing?.customerName    ?? "",
    customerEmail:   existing?.customerEmail   ?? "",
    customerPhone:   existing?.customerPhone   ?? "",
    customerAddress: existing?.customerAddress ?? "",
    projectId:       existing?.projectId       ?? "",
    receivedAt:      existing?.receivedAt      ?? now,
    receivedMethod:  existing?.receivedMethod  ?? "email",
    category:        existing?.category        ?? "technical_installation",
    priority:        existing?.priority        ?? "standard",
    description:     existing?.description     ?? "",
    assignedTo:      existing?.assignedTo      ?? "",
    hasRepresentative:  existing?.hasRepresentative  ?? false,
    representativeName: existing?.representativeName ?? "",
    capaRef:         existing?.capaRef         ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async () => {
    if (!form.customerName || !form.description || !form.receivedAt) {
      setError("Customer name, date received, and description are required."); return;
    }
    setSaving(true); setError("");
    try {
      const url    = isEdit ? `/api/complaints/${existing!.id}` : "/api/complaints";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const F = (label: string, children: React.ReactNode, hint?: string) => (
    <div style={cf.field}>
      <label style={cf.label}>{label}</label>
      {hint && <div style={cf.hint}>{hint}</div>}
      {children}
    </div>
  );

  return (
    <div style={cf.overlay}>
      <div style={cf.modal}>
        <div style={cf.modalHeader}>
          <div>
            <h2 style={cf.modalTitle}>{isEdit ? "Edit complaint" : "Log new complaint"}</h2>
            <p style={cf.modalSub}>MCS R06 Customer Complaint Record</p>
          </div>
          <button onClick={onClose} style={cf.closeBtn}>✕</button>
        </div>

        {/* Emergency warning */}
        {form.priority === "emergency" && (
          <div style={cf.emergencyBanner}>
            ⚡ EMERGENCY — Customer without heating / hot water. RECC requires inspection within <strong>24 hours</strong>.
          </div>
        )}

        <div style={cf.section}>
          <div style={cf.sectionTitle}>Customer details</div>
          <div style={cf.grid2}>
            {F("Customer name *", <input style={cf.input} value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Full name" />)}
            {F("Project ID (if known)", <input style={cf.input} value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} placeholder="Link to project" />)}
          </div>
          <div style={cf.grid2}>
            {F("Email", <input style={cf.input} type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />)}
            {F("Phone", <input style={cf.input} type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />)}
          </div>
          {F("Property address", <input style={cf.input} value={form.customerAddress} onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))} />)}
          <label style={cf.checkLabel}>
            <input type="checkbox" checked={form.hasRepresentative} onChange={e => setForm(f => ({ ...f, hasRepresentative: e.target.checked }))} style={{ accentColor: "#7A8465" }} />
            Customer is using a consumer representative or observer (RECC requirement: we must cooperate fully)
          </label>
          {form.hasRepresentative && F("Representative name / organisation", <input style={cf.input} value={form.representativeName} onChange={e => setForm(f => ({ ...f, representativeName: e.target.value }))} />)}
        </div>

        <div style={cf.section}>
          <div style={cf.sectionTitle}>Complaint details</div>
          <div style={cf.grid3}>
            {F("Date / time received *", <input style={cf.input} type="datetime-local" value={form.receivedAt} onChange={e => setForm(f => ({ ...f, receivedAt: e.target.value }))} />)}
            {F("Received by", <select style={cf.select} value={form.receivedMethod} onChange={e => setForm(f => ({ ...f, receivedMethod: e.target.value as any }))}>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="post">Post</option>
              <option value="in_person">In person</option>
              <option value="other">Other</option>
            </select>)}
            {F("Category", <select style={cf.select} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>)}
          </div>
          {F("Priority", undefined, "Select Emergency if customer is currently without heating or hot water — RECC requires 24-hour inspection response.")}
          <div style={cf.radioGroup}>
            {(["standard", "emergency"] as Priority[]).map(p => (
              <label key={p} style={{ ...cf.radioOption, ...(form.priority === p ? cf.radioOptionActive : {}), ...(p === "emergency" ? { borderColor: "#c05050", background: form.priority === p ? "#fdf0f0" : "transparent" } : {}) }}>
                <input type="radio" value={p} checked={form.priority === p} onChange={() => setForm(f => ({ ...f, priority: p }))} style={{ accentColor: p === "emergency" ? "#c05050" : "#7A8465" }} />
                <div>
                  <div style={{ fontWeight: 700, color: p === "emergency" ? "#c05050" : "#333" }}>
                    {p === "emergency" ? "⚡ Emergency" : "Standard"}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {p === "emergency" ? "No heating / hot water — 24hr inspection required" : "Normal complaint — 7 working day response"}
                  </div>
                </div>
              </label>
            ))}
          </div>
          {F("Description of complaint *", <textarea style={cf.textarea} rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Full description of the complaint as reported by the customer…" />)}
        </div>

        <div style={cf.section}>
          <div style={cf.sectionTitle}>Assignment &amp; tracking</div>
          <div style={cf.grid2}>
            {F("Assigned handler (MCS Nominee)", <input style={cf.input} value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Name or user ID" />)}
            {F("CAPA reference", <input style={cf.input} value={form.capaRef} onChange={e => setForm(f => ({ ...f, capaRef: e.target.value }))} placeholder="e.g. CAPA-2026-001" />, "Link to Corrective & Preventive Action record (MCS requirement)")}
          </div>
        </div>

        {error && <div style={cf.errorMsg}>{error}</div>}

        <div style={cf.modalFooter}>
          <button style={cf.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={cf.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Log complaint →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action Points Panel ──────────────────────────────────────────────────────

function ActionPointsPanel({
  complaintId, points, token, canEdit, onUpdated,
}: {
  complaintId: string; points: ActionPoint[]; token: string;
  canEdit: boolean; onUpdated: () => void;
}) {
  const [adding, setAdding]   = useState(false);
  const [newAP, setNewAP]     = useState({ description: "", assignedTo: "", dueDate: "", notes: "" });
  const [saving, setSaving]   = useState(false);

  const handleAdd = async () => {
    if (!newAP.description || !newAP.dueDate) return;
    setSaving(true);
    try {
      await fetch(`/api/complaints/${complaintId}/actions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(newAP),
      });
      setNewAP({ description: "", assignedTo: "", dueDate: "", notes: "" });
      setAdding(false);
      onUpdated();
    } finally { setSaving(false); }
  };

  const handleComplete = async (apId: string) => {
    await fetch(`/api/complaints/${complaintId}/actions/${apId}/complete`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    });
    onUpdated();
  };

  return (
    <div style={ap.wrap}>
      <div style={ap.header}>
        <div style={ap.title}>Action Points</div>
        {canEdit && <button style={ap.addBtn} onClick={() => setAdding(true)}>+ Add action</button>}
      </div>

      {points.length === 0 && !adding && (
        <div style={ap.empty}>No action points yet.</div>
      )}

      {points.map(p => {
        const overdue    = !p.completedAt && isOverdue(p.dueDate);
        const daysLeft   = !p.completedAt ? daysUntil(p.dueDate) : null;
        return (
          <div key={p.id} style={{ ...ap.row, ...(p.completedAt ? ap.rowDone : overdue ? ap.rowOverdue : {}) }}>
            <div style={ap.rowLeft}>
              <button
                style={{ ...ap.checkbox, ...(p.completedAt ? ap.checkboxDone : {}) }}
                onClick={() => !p.completedAt && canEdit && handleComplete(p.id)}
                disabled={!!p.completedAt || !canEdit}
              >
                {p.completedAt ? "✓" : ""}
              </button>
              <div style={ap.rowBody}>
                <div style={{ ...ap.apDesc, ...(p.completedAt ? { textDecoration: "line-through", color: "#aaa" } : {}) }}>
                  {p.description}
                </div>
                <div style={ap.apMeta}>
                  {p.assignedTo && <span>{p.assignedTo}</span>}
                  <span style={{ color: overdue ? "#c05050" : "#aaa" }}>
                    Due {fmtDate(p.dueDate)}
                    {daysLeft !== null && !p.completedAt && (
                      <span style={{ marginLeft: 4, fontWeight: 600 }}>
                        {overdue ? `(${Math.abs(daysLeft)}d overdue)` : daysLeft === 0 ? "(today)" : `(${daysLeft}d)`}
                      </span>
                    )}
                  </span>
                  {p.completedAt && <span style={{ color: "#4a7a5a" }}>Completed {fmtDate(p.completedAt)}</span>}
                </div>
                {p.notes && <div style={ap.apNotes}>{p.notes}</div>}
              </div>
            </div>
          </div>
        );
      })}

      {adding && (
        <div style={ap.addForm}>
          <input style={ap.input} placeholder="Action description *" value={newAP.description} onChange={e => setNewAP(f => ({ ...f, description: e.target.value }))} />
          <div style={ap.addFormRow}>
            <input style={ap.input} placeholder="Assigned to" value={newAP.assignedTo} onChange={e => setNewAP(f => ({ ...f, assignedTo: e.target.value }))} />
            <input style={ap.input} type="date" value={newAP.dueDate} onChange={e => setNewAP(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <textarea style={ap.textarea} rows={2} placeholder="Notes (optional)" value={newAP.notes} onChange={e => setNewAP(f => ({ ...f, notes: e.target.value }))} />
          <div style={ap.addFormActions}>
            <button style={ap.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
            <button style={ap.saveBtn} onClick={handleAdd} disabled={saving}>{saving ? "…" : "Add action"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact Log Panel ────────────────────────────────────────────────────────

function ContactLogPanel({
  complaintId, entries, token, canEdit, onUpdated,
}: {
  complaintId: string; entries: ContactLog[]; token: string;
  canEdit: boolean; onUpdated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [entry, setEntry]   = useState({ date: new Date().toISOString().slice(0, 16), method: "phone", direction: "outbound", summary: "", by: "" });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!entry.summary) return;
    setSaving(true);
    try {
      await fetch(`/api/complaints/${complaintId}/contacts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(entry),
      });
      setAdding(false);
      onUpdated();
    } finally { setSaving(false); }
  };

  const METHOD_ICONS: Record<string, string> = { phone: "📞", email: "✉", post: "📬", visit: "🏠", other: "·" };

  return (
    <div style={cl.wrap}>
      <div style={cl.header}>
        <div style={cl.title}>Contact Log</div>
        {canEdit && <button style={cl.addBtn} onClick={() => setAdding(true)}>+ Log contact</button>}
      </div>
      <p style={cl.hint}>
        RECC requires all contacts (or attempted contacts) with the customer to be recorded while resolving the complaint.
      </p>

      {entries.length === 0 && !adding && (
        <div style={cl.empty}>No contacts logged yet.</div>
      )}

      {[...entries].reverse().map(e => (
        <div key={e.id} style={cl.row}>
          <div style={cl.rowIcon}>{METHOD_ICONS[e.method] ?? "·"}</div>
          <div style={cl.rowBody}>
            <div style={cl.rowTop}>
              <span style={cl.rowDate}>{fmtDateTime(e.date)}</span>
              <span style={{ ...cl.dirBadge, background: e.direction === "inbound" ? "#edf7f1" : "#f0f1ec", color: e.direction === "inbound" ? "#4a7a5a" : "#555" }}>
                {e.direction === "inbound" ? "↙ Inbound" : "↗ Outbound"}
              </span>
              <span style={cl.rowMethod}>{e.method}</span>
            </div>
            <div style={cl.rowSummary}>{e.summary}</div>
            {e.by && <div style={cl.rowBy}>Logged by {e.by}</div>}
          </div>
        </div>
      ))}

      {adding && (
        <div style={cl.addForm}>
          <div style={cl.addFormRow}>
            <input style={cl.input} type="datetime-local" value={entry.date} onChange={e => setEntry(f => ({ ...f, date: e.target.value }))} />
            <select style={cl.select} value={entry.method} onChange={e => setEntry(f => ({ ...f, method: e.target.value }))}>
              {["phone", "email", "post", "visit", "other"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select style={cl.select} value={entry.direction} onChange={e => setEntry(f => ({ ...f, direction: e.target.value }))}>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>
          <textarea style={cl.textarea} rows={3} placeholder="Summary of contact / attempted contact *" value={entry.summary} onChange={e => setEntry(f => ({ ...f, summary: e.target.value }))} />
          <div style={cl.addFormActions}>
            <button style={cl.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
            <button style={cl.saveBtn} onClick={handleAdd} disabled={saving}>{saving ? "…" : "Log contact"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Complaint Detail View ────────────────────────────────────────────────────

function ComplaintDetail({
  complaint, token, userRole, onBack, onUpdated,
}: {
  complaint: Complaint; token: string; userRole: string; onBack: () => void; onUpdated: () => void;
}) {
  const canEdit  = ["Admin", "Surveyor"].includes(userRole);
  const cfg      = STATUS_CONFIG[complaint.status];
  const isClosed = ["resolved", "closed"].includes(complaint.status);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [escalationModal, setEscalationModal] = useState(false);
  const [resolution, setResolution] = useState({ description: "", customerSatisfied: "" });
  const [escalation, setEscalation] = useState({ stage: "recc_mediation", notes: "" });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const updateStatus = async (status: ComplaintStatus, extra?: object) => {
    setStatusUpdating(true);
    try {
      await fetch(`/api/complaints/${complaint.id}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status, ...extra }),
      });
      showToast("Status updated ✓");
      onUpdated();
    } catch { showToast("Update failed."); }
    finally { setStatusUpdating(false); }
  };

  const handleResolve = async () => {
    if (!resolution.description || !resolution.customerSatisfied) return;
    await updateStatus(resolution.customerSatisfied === "yes" ? "resolved" : "closed", {
      resolutionDescription: resolution.description,
      customerSatisfied:     resolution.customerSatisfied === "yes",
      closedAt:              new Date().toISOString(),
    });
  };

  const handleEscalate = async () => {
    await updateStatus("escalated", {
      escalationStage: escalation.stage,
      escalationNotes: escalation.notes,
      escalationDate:  new Date().toISOString(),
    });
    setEscalationModal(false);
  };

  return (
    <div style={dd.wrap}>
      {/* Breadcrumb */}
      <button style={dd.back} onClick={onBack}>← All complaints</button>

      {/* Header */}
      <div style={dd.header}>
        <div style={dd.headerLeft}>
          <div style={dd.ref}>{complaint.ref}</div>
          <h1 style={dd.name}>{complaint.customerName}</h1>
          <div style={dd.meta}>{complaint.customerAddress}</div>
          <div style={dd.meta}>{CATEGORY_LABELS[complaint.category]}</div>
        </div>
        <div style={dd.headerRight}>
          <span style={{ ...dd.statusBadge, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, display: "inline-block", marginRight: 7 }} />
            {cfg.label}
          </span>
          {complaint.priority === "emergency" && (
            <span style={dd.emergencyBadge}>⚡ Emergency</span>
          )}
        </div>
      </div>

      {/* Deadline alerts */}
      {!isClosed && (
        <div style={dd.deadlines}>
          <DeadlineBadge label="Initial response" date={complaint.responseDeadline} closed={isClosed} />
          {complaint.inspectionDeadline && (
            <DeadlineBadge label="Inspection" date={complaint.inspectionDeadline} closed={isClosed} />
          )}
        </div>
      )}

      {/* RECC info box */}
      {complaint.escalationStage !== "none" && (
        <div style={dd.escalationBox}>
          <div style={dd.escalationTitle}>
            {ESCALATION_LABELS[complaint.escalationStage]} — {fmtDate(complaint.escalationDate)}
          </div>
          {complaint.escalationNotes && <div style={dd.escalationNotes}>{complaint.escalationNotes}</div>}
        </div>
      )}

      <div style={dd.grid}>
        {/* Left column */}
        <div>
          {/* Complaint description */}
          <div style={dd.card}>
            <div style={dd.cardTitle}>Complaint description</div>
            <div style={dd.description}>{complaint.description}</div>
            <div style={dd.detailGrid}>
              <div style={dd.detailRow}><span style={dd.detailKey}>Received</span><span style={dd.detailVal}>{fmtDateTime(complaint.receivedAt)} via {complaint.receivedMethod}</span></div>
              <div style={dd.detailRow}><span style={dd.detailKey}>Assigned to</span><span style={dd.detailVal}>{complaint.assignedTo || "—"}</span></div>
              <div style={dd.detailRow}><span style={dd.detailKey}>CAPA ref</span><span style={{ ...dd.detailVal, fontFamily: "monospace" }}>{complaint.capaRef || "—"}</span></div>
              <div style={dd.detailRow}><span style={dd.detailKey}>Reviewed at meeting</span><span style={dd.detailVal}>{complaint.reviewedAtMeeting ? "✓ Yes" : "Pending"}</span></div>
              {complaint.hasRepresentative && <div style={dd.detailRow}><span style={dd.detailKey}>Representative</span><span style={dd.detailVal}>{complaint.representativeName || "Yes"}</span></div>}
            </div>
          </div>

          {/* Inspection record */}
          <div style={dd.card}>
            <div style={dd.cardTitle}>Inspection record</div>
            <div style={dd.detailGrid}>
              <div style={dd.detailRow}><span style={dd.detailKey}>Inspection deadline</span><span style={{ ...dd.detailVal, color: complaint.inspectionDeadline && isOverdue(complaint.inspectionDeadline) && !isClosed ? "#c05050" : "#333" }}>{fmtDate(complaint.inspectionDeadline)}</span></div>
              <div style={dd.detailRow}><span style={dd.detailKey}>Inspection completed</span><span style={dd.detailVal}>{fmtDate(complaint.inspectionDate)}</span></div>
            </div>
            {complaint.inspectionNotes && <div style={dd.inspectionNotes}>{complaint.inspectionNotes}</div>}
            {canEdit && !isClosed && (
              <button style={dd.smallBtn} onClick={async () => {
                const date = prompt("Enter inspection date (YYYY-MM-DD):");
                if (!date) return;
                await fetch(`/api/complaints/${complaint.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ inspectionDate: date }),
                });
                onUpdated();
              }}>
                Record inspection
              </button>
            )}
          </div>

          {/* Resolution */}
          {(isClosed || complaint.resolutionDescription) && (
            <div style={{ ...dd.card, borderLeftColor: complaint.customerSatisfied ? "#4a7a5a" : "#c05050", borderLeftWidth: 3 }}>
              <div style={dd.cardTitle}>Resolution</div>
              <div style={dd.description}>{complaint.resolutionDescription || "—"}</div>
              <div style={dd.detailGrid}>
                <div style={dd.detailRow}>
                  <span style={dd.detailKey}>Customer satisfied</span>
                  <span style={{ ...dd.detailVal, color: complaint.customerSatisfied === true ? "#4a7a5a" : complaint.customerSatisfied === false ? "#c05050" : "#888", fontWeight: 600 }}>
                    {complaint.customerSatisfied === true ? "✓ Yes" : complaint.customerSatisfied === false ? "✕ No" : "—"}
                  </span>
                </div>
                <div style={dd.detailRow}><span style={dd.detailKey}>Closed</span><span style={dd.detailVal}>{fmtDate(complaint.closedAt)}</span></div>
              </div>
            </div>
          )}

          {/* Status actions */}
          {canEdit && !isClosed && (
            <div style={dd.actionsCard}>
              <div style={dd.cardTitle}>Update status</div>
              <div style={dd.actionBtns}>
                {complaint.status !== "in_progress" && (
                  <button style={dd.actionBtn} onClick={() => updateStatus("in_progress")} disabled={statusUpdating}>
                    Mark in progress
                  </button>
                )}
                {complaint.status !== "pending_info" && (
                  <button style={dd.actionBtn} onClick={() => updateStatus("pending_info")} disabled={statusUpdating}>
                    Awaiting information
                  </button>
                )}
                <button style={{ ...dd.actionBtn, color: "#3060d0", borderColor: "#a0b0e8" }} onClick={() => setEscalationModal(true)} disabled={statusUpdating}>
                  Escalate to RECC →
                </button>
              </div>

              {/* Resolve / close */}
              <div style={dd.resolveSection}>
                <div style={dd.cardTitle}>Close complaint</div>
                <textarea style={dd.resolveTextarea} rows={3} placeholder="Resolution description — what was done to resolve the complaint?" value={resolution.description} onChange={e => setResolution(r => ({ ...r, description: e.target.value }))} />
                <div style={dd.resolveRow}>
                  <select style={dd.resolveSelect} value={resolution.customerSatisfied} onChange={e => setResolution(r => ({ ...r, customerSatisfied: e.target.value }))}>
                    <option value="">Was the customer satisfied?</option>
                    <option value="yes">Yes — customer satisfied</option>
                    <option value="no">No — not satisfied / withdrawn</option>
                  </select>
                  <button style={{ ...dd.actionBtn, background: "#7A8465", color: "#fff", borderColor: "#7A8465" }} onClick={handleResolve} disabled={statusUpdating || !resolution.description || !resolution.customerSatisfied}>
                    Close complaint
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          <ActionPointsPanel complaintId={complaint.id} points={complaint.actionPoints} token={token} canEdit={canEdit} onUpdated={onUpdated} />
          <div style={{ marginTop: 16 }}>
            <ContactLogPanel complaintId={complaint.id} entries={complaint.contactLog} token={token} canEdit={canEdit} onUpdated={onUpdated} />
          </div>

          {/* RECC rights notice */}
          <div style={dd.reccNotice}>
            <div style={dd.reccNoticeTitle}>RECC escalation rights</div>
            <p style={dd.reccNoticeText}>
              If this complaint cannot be resolved, the customer has the right to refer it to RECC's dispute resolution procedure.
              RECC will allocate a caseworker to mediate. If mediation fails, the customer may refer to RECC's independent arbitration service.
              We must cooperate with both processes.
            </p>
            <a href="https://www.recc.org.uk/consumers/how-to-complain" target="_blank" rel="noopener noreferrer" style={dd.reccLink}>
              recc.org.uk/consumers/how-to-complain ↗
            </a>
          </div>
        </div>
      </div>

      {/* Escalation modal */}
      {escalationModal && (
        <div style={cf.overlay}>
          <div style={{ ...cf.modal, maxWidth: 460 }}>
            <div style={cf.modalHeader}>
              <h2 style={cf.modalTitle}>Escalate complaint</h2>
              <button onClick={() => setEscalationModal(false)} style={cf.closeBtn}>✕</button>
            </div>
            <div style={cf.field}>
              <label style={cf.label}>Escalation route</label>
              <select style={cf.select} value={escalation.stage} onChange={e => setEscalation(s => ({ ...s, stage: e.target.value }))}>
                <option value="recc_mediation">RECC Mediation</option>
                <option value="recc_arbitration">RECC Arbitration</option>
                <option value="certification_body">Certification Body (NICEIC/NAPIT etc.)</option>
                <option value="ombudsman">Ombudsman</option>
              </select>
            </div>
            <div style={cf.field}>
              <label style={cf.label}>Notes</label>
              <textarea style={cf.textarea} rows={3} value={escalation.notes} onChange={e => setEscalation(s => ({ ...s, notes: e.target.value }))} placeholder="Reason for escalation, reference numbers, caseworker name…" />
            </div>
            <div style={cf.modalFooter}>
              <button style={cf.cancelBtn} onClick={() => setEscalationModal(false)}>Cancel</button>
              <button style={cf.saveBtn} onClick={handleEscalate}>Confirm escalation</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#333", color: "#fff", padding: "11px 22px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>{toast}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ComplaintsModule({ token, userRole }: Props) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Complaint | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [filterStatus, setFilter]   = useState<ComplaintStatus | "all">("all");
  const [search, setSearch]         = useState("");

  const canEdit = ["Admin", "Surveyor"].includes(userRole);

  const fetchAll = useCallback(async () => {
    try {
      const res  = await fetch("/api/complaints", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setComplaints(data.complaints ?? []);
      // Refresh selected if open
      if (selected) {
        const refreshed = (data.complaints ?? []).find((c: Complaint) => c.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch { /* stale */ }
    finally { setLoading(false); }
  }, [token, selected?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // If a complaint is selected, show detail view
  if (selected) {
    return (
      <ComplaintDetail
        complaint={selected}
        token={token}
        userRole={userRole}
        onBack={() => { setSelected(null); fetchAll(); }}
        onUpdated={fetchAll}
      />
    );
  }

  // Summary counts
  const counts = {
    all:          complaints.length,
    new:          complaints.filter(c => c.status === "new").length,
    in_progress:  complaints.filter(c => c.status === "in_progress").length,
    escalated:    complaints.filter(c => c.status === "escalated").length,
    resolved:     complaints.filter(c => c.status === "resolved").length,
  };

  const overdueResponse  = complaints.filter(c => !["resolved","closed"].includes(c.status) && isOverdue(c.responseDeadline));
  const overdueInspect   = complaints.filter(c => !["resolved","closed"].includes(c.status) && c.inspectionDeadline && isOverdue(c.inspectionDeadline));
  const emergencies      = complaints.filter(c => c.priority === "emergency" && !["resolved","closed"].includes(c.status));

  const filtered = complaints.filter(c => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchSearch = c.customerName.toLowerCase().includes(search.toLowerCase()) ||
                        c.ref.toLowerCase().includes(search.toLowerCase()) ||
                        c.customerAddress.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div style={cm.wrap}>

      {/* Page header */}
      <div style={cm.pageHeader}>
        <div>
          <h1 style={cm.pageTitle}>Customer Complaints</h1>
          <p style={cm.pageSubtitle}>MCS R06 Complaint Record · RECC Section 9 Compliant</p>
        </div>
        {canEdit && (
          <button style={cm.newBtn} onClick={() => setShowForm(true)}>+ Log complaint</button>
        )}
      </div>

      {/* Alert banners */}
      {emergencies.length > 0 && (
        <div style={{ ...cm.alertBanner, background: "#fdf0f0", border: "1px solid #e8b4b4" }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <div>
            <strong>{emergencies.length} emergency complaint{emergencies.length > 1 ? "s" : ""}</strong> — customer{emergencies.length > 1 ? "s" : ""} without heating/hot water.
            RECC requires inspection within <strong>24 hours</strong>.
            {emergencies.map(e => <div key={e.id} style={{ fontSize: 13, marginTop: 4 }}>{e.customerName} — {e.customerAddress}</div>)}
          </div>
        </div>
      )}
      {overdueResponse.length > 0 && (
        <div style={{ ...cm.alertBanner, background: "#fdf4ed", border: "1px solid #e8c4a0" }}>
          <span style={{ fontSize: 18 }}>⏱</span>
          <div>
            <strong>{overdueResponse.length} complaint{overdueResponse.length > 1 ? "s" : ""}</strong> past the 7 working day initial response deadline.
          </div>
        </div>
      )}

      {/* Status strip */}
      <div style={cm.strip}>
        {([
          { key: "all",         label: "All",         value: counts.all         },
          { key: "new",         label: "New",         value: counts.new         },
          { key: "in_progress", label: "In Progress", value: counts.in_progress },
          { key: "escalated",   label: "Escalated",   value: counts.escalated   },
          { key: "resolved",    label: "Resolved",    value: counts.resolved    },
        ] as const).map(s => {
          const cfg = s.key !== "all" ? STATUS_CONFIG[s.key as ComplaintStatus] : null;
          return (
            <button key={s.key} style={{ ...cm.stripItem, ...(filterStatus === s.key ? cm.stripItemActive : {}) }} onClick={() => setFilter(s.key as any)}>
              {cfg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, display: "inline-block", marginBottom: 4 }} />}
              <span style={cm.stripCount}>{s.value}</span>
              <span style={cm.stripLabel}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input style={cm.search} placeholder="Search by name, reference or address…" value={search} onChange={e => setSearch(e.target.value)} />

      {/* Complaints list */}
      {loading ? (
        <div style={cm.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={cm.emptyState}>
          <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#555", margin: "0 0 6px" }}>
            {filterStatus === "all" ? "No complaints logged yet." : `No ${filterStatus.replace("_", " ")} complaints.`}
          </p>
          {canEdit && filterStatus === "all" && (
            <p style={{ fontSize: 13, color: "#aaa" }}>Click "Log complaint" to record a new complaint.</p>
          )}
        </div>
      ) : (
        <div style={cm.list}>
          {filtered.map(c => {
            const cfg       = STATUS_CONFIG[c.status];
            const respDays  = daysUntil(c.responseDeadline);
            const respOver  = isOverdue(c.responseDeadline);
            const isClosed  = ["resolved", "closed"].includes(c.status);

            return (
              <button key={c.id} style={cm.card} onClick={() => setSelected(c)}>
                <div style={cm.cardTop}>
                  <div style={cm.cardLeft}>
                    <div style={cm.cardRef}>{c.ref}</div>
                    <div style={cm.cardName}>{c.customerName}</div>
                    <div style={cm.cardAddr}>{c.customerAddress}</div>
                  </div>
                  <div style={cm.cardRight}>
                    <span style={{ ...cm.statusBadge, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block", marginRight: 6 }} />
                      {cfg.label}
                    </span>
                    {c.priority === "emergency" && <span style={cm.emergencyPill}>⚡ Emergency</span>}
                  </div>
                </div>
                <div style={cm.cardMeta}>
                  <span>{CATEGORY_LABELS[c.category]}</span>
                  <span style={{ color: "#d0cec6" }}>·</span>
                  <span>Received {fmtDate(c.receivedAt)}</span>
                  {!isClosed && respOver && <span style={{ color: "#c05050", fontWeight: 600 }}>· Response overdue</span>}
                  {!isClosed && !respOver && respDays !== null && respDays <= 2 && <span style={{ color: "#c07030", fontWeight: 600 }}>· Response due in {respDays}d</span>}
                  {c.escalationStage !== "none" && <span style={{ color: "#3060d0", fontWeight: 600 }}>· {ESCALATION_LABELS[c.escalationStage]}</span>}
                </div>
                {c.actionPoints.length > 0 && (
                  <div style={cm.apRow}>
                    <span style={cm.apCount}>{c.actionPoints.filter(a => !a.completedAt).length} open action{c.actionPoints.filter(a => !a.completedAt).length === 1 ? "" : "s"}</span>
                    <span style={{ color: "#d0cec6" }}>·</span>
                    <span style={cm.apCount}>{c.actionPoints.filter(a => a.completedAt).length} complete</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <ComplaintForm
          existing={null}
          token={token}
          onClose={() => setShowForm(false)}
          onSaved={() => { fetchAll(); setShowForm(false); }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cm: Record<string, React.CSSProperties> = {
  wrap:           { fontFamily: "Satoshi, sans-serif", color: "#333" },
  pageHeader:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  pageTitle:      { fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" },
  pageSubtitle:   { fontSize: 13, color: "#888", margin: 0 },
  newBtn:         { padding: "10px 20px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  alertBanner:    { display: "flex", gap: 12, alignItems: "flex-start", borderRadius: 10, padding: "14px 18px", marginBottom: 12 },
  strip:          { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as const },
  stripItem:      { display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "12px 18px", background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, cursor: "pointer", minWidth: 80 },
  stripItemActive:{ borderColor: "#7A8465", background: "#f0f1ec" },
  stripCount:     { fontSize: 22, fontWeight: 700, color: "#333", lineHeight: 1 },
  stripLabel:     { fontSize: 11, color: "#999", marginTop: 3, textAlign: "center" as const },
  search:         { width: "100%", padding: "9px 14px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", background: "#fff", outline: "none", boxSizing: "border-box" as const, marginBottom: 16 },
  list:           { display: "flex", flexDirection: "column" as const, gap: 10 },
  card:           { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "16px 18px", cursor: "pointer", textAlign: "left" as const, width: "100%", display: "block" },
  cardTop:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  cardLeft:       {},
  cardRef:        { fontSize: 11, fontWeight: 700, color: "#7A8465", letterSpacing: "0.05em", marginBottom: 3 },
  cardName:       { fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 2 },
  cardAddr:       { fontSize: 12.5, color: "#888" },
  cardRight:      { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 6, flexShrink: 0 },
  statusBadge:    { display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  emergencyPill:  { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#fdf0f0", color: "#c05050", border: "1px solid #e8b4b4" },
  cardMeta:       { display: "flex", gap: 8, fontSize: 12.5, color: "#888", flexWrap: "wrap" as const },
  apRow:          { display: "flex", gap: 6, fontSize: 11.5, color: "#aaa", marginTop: 8 },
  apCount:        {},
  empty:          { color: "#aaa", fontSize: 14, padding: "32px 0" },
  emptyState:     { textAlign: "center" as const, padding: "48px 24px", background: "#fafaf8", border: "1px dashed #d8d6ce", borderRadius: 10 },
};

const dd: Record<string, React.CSSProperties> = {
  wrap:             { fontFamily: "Satoshi, sans-serif", color: "#333" },
  back:             { background: "none", border: "none", color: "#7A8465", fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: "0 0 16px", display: "block" },
  header:           { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerLeft:       {},
  ref:              { fontSize: 12, fontWeight: 700, color: "#7A8465", letterSpacing: "0.06em", marginBottom: 4 },
  name:             { fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" },
  meta:             { fontSize: 13, color: "#888", marginBottom: 2 },
  headerRight:      { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 8 },
  statusBadge:      { display: "inline-flex", alignItems: "center", padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700 },
  emergencyBadge:   { display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#fdf0f0", color: "#c05050", border: "1px solid #e8b4b4" },
  deadlines:        { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 },
  escalationBox:    { background: "#eff2fd", border: "1px solid #a0b0e8", borderRadius: 10, padding: "12px 16px", marginBottom: 16 },
  escalationTitle:  { fontSize: 13, fontWeight: 700, color: "#3060d0", marginBottom: 4 },
  escalationNotes:  { fontSize: 13, color: "#555" },
  grid:             { display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" },
  card:             { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "18px 20px", marginBottom: 12 },
  cardTitle:        { fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 },
  description:      { fontSize: 14, color: "#444", lineHeight: 1.7, marginBottom: 14 },
  detailGrid:       { display: "flex", flexDirection: "column" as const, gap: 8 },
  detailRow:        { display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid #f0f1ec", fontSize: 13 },
  detailKey:        { color: "#999", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  detailVal:        { color: "#333", textAlign: "right" as const },
  inspectionNotes:  { fontSize: 13, color: "#555", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f1ec" },
  smallBtn:         { marginTop: 12, padding: "7px 14px", background: "none", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: "#555", cursor: "pointer" },
  actionsCard:      { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "18px 20px", marginBottom: 12 },
  actionBtns:       { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 },
  actionBtn:        { padding: "8px 16px", background: "none", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#555", cursor: "pointer" },
  resolveSection:   { borderTop: "1px solid #f0f1ec", paddingTop: 14, marginTop: 4 },
  resolveTextarea:  { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif", marginBottom: 10 },
  resolveRow:       { display: "flex", gap: 8 },
  resolveSelect:    { flex: 1, padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13, color: "#333", background: "#fff" },
  reccNotice:       { background: "#f7f7f4", border: "1px solid #e8e6e0", borderRadius: 10, padding: "16px 18px", marginTop: 12 },
  reccNoticeTitle:  { fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  reccNoticeText:   { fontSize: 12.5, color: "#666", lineHeight: 1.6, margin: "0 0 10px" },
  reccLink:         { fontSize: 12, color: "#7A8465", fontWeight: 600 },
};

const cf: Record<string, React.CSSProperties> = {
  overlay:       { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" },
  modal:         { background: "#fff", borderRadius: 14, padding: "28px 32px", width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "92vh", overflowY: "auto" as const },
  modalHeader:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  modalTitle:    { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  modalSub:      { fontSize: 12, color: "#7A8465", margin: "3px 0 0", fontWeight: 600 },
  closeBtn:      { background: "none", border: "none", fontSize: 18, color: "#aaa", cursor: "pointer", flexShrink: 0 },
  emergencyBanner:{ background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "12px 16px", fontSize: 13.5, fontWeight: 600, marginBottom: 20 },
  section:       { marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #f0f1ec" },
  sectionTitle:  { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 14 },
  field:         { marginBottom: 14 },
  label:         { display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 5 },
  hint:          { fontSize: 11.5, color: "#aaa", marginBottom: 6 },
  input:         { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, outline: "none" },
  select:        { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", background: "#fff", cursor: "pointer" },
  textarea:      { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif" },
  checkLabel:    { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#555", cursor: "pointer", marginTop: 8, lineHeight: 1.5 },
  grid2:         { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3:         { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  radioGroup:    { display: "flex", gap: 10, marginBottom: 16 },
  radioOption:   { display: "flex", alignItems: "flex-start", gap: 10, flex: 1, padding: "12px 14px", border: "1px solid #e0ded8", borderRadius: 8, cursor: "pointer" },
  radioOptionActive: { borderColor: "#7A8465", background: "#f0f1ec" },
  errorMsg:      { background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  modalFooter:   { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancelBtn:     { padding: "9px 18px", border: "1px solid #e0ded8", borderRadius: 8, background: "#fff", color: "#555", fontSize: 14, cursor: "pointer" },
  saveBtn:       { padding: "9px 22px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" },
};

const ap: Record<string, React.CSSProperties> = {
  wrap:        { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "16px 18px" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title:       { fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  addBtn:      { padding: "5px 12px", background: "none", border: "1px solid #e0ded8", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#7A8465", cursor: "pointer" },
  empty:       { fontSize: 13, color: "#bbb", padding: "8px 0" },
  row:         { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #f7f7f4" },
  rowDone:     { opacity: 0.6 },
  rowOverdue:  { background: "#fdf0f0", margin: "0 -6px", padding: "10px 6px", borderRadius: 6 },
  rowLeft:     { display: "flex", gap: 10, flex: 1, alignItems: "flex-start" },
  checkbox:    { width: 18, height: 18, border: "2px solid #d0cec6", borderRadius: 4, flexShrink: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", marginTop: 2 },
  checkboxDone:{ background: "#4a7a5a", borderColor: "#4a7a5a" },
  rowBody:     { flex: 1 },
  apDesc:      { fontSize: 13.5, color: "#333", marginBottom: 3 },
  apMeta:      { display: "flex", gap: 8, fontSize: 11.5, color: "#aaa", flexWrap: "wrap" as const },
  apNotes:     { fontSize: 12, color: "#aaa", marginTop: 4 },
  addForm:     { marginTop: 12, padding: "12px", background: "#f7f7f4", borderRadius: 8 },
  addFormRow:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8, marginTop: 8 },
  addFormActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  input:       { width: "100%", padding: "7px 10px", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 13, color: "#333", boxSizing: "border-box" as const, marginBottom: 8 },
  textarea:    { width: "100%", padding: "7px 10px", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 13, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif" },
  cancelBtn:   { padding: "6px 14px", border: "1px solid #e0ded8", borderRadius: 6, background: "#fff", color: "#555", fontSize: 13, cursor: "pointer" },
  saveBtn:     { padding: "6px 14px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
};

const cl: Record<string, React.CSSProperties> = {
  wrap:        { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "16px 18px" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title:       { fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  addBtn:      { padding: "5px 12px", background: "none", border: "1px solid #e0ded8", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#7A8465", cursor: "pointer" },
  hint:        { fontSize: 11.5, color: "#aaa", marginBottom: 12, lineHeight: 1.5 },
  empty:       { fontSize: 13, color: "#bbb", padding: "8px 0" },
  row:         { display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f7f7f4", alignItems: "flex-start" },
  rowIcon:     { fontSize: 16, flexShrink: 0, marginTop: 1 },
  rowBody:     { flex: 1, minWidth: 0 },
  rowTop:      { display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" as const },
  rowDate:     { fontSize: 12, color: "#888" },
  dirBadge:    { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12 },
  rowMethod:   { fontSize: 11, color: "#aaa", textTransform: "capitalize" as const },
  rowSummary:  { fontSize: 13.5, color: "#333", lineHeight: 1.5 },
  rowBy:       { fontSize: 11.5, color: "#aaa", marginTop: 4 },
  addForm:     { marginTop: 12, padding: "12px", background: "#f7f7f4", borderRadius: 8 },
  addFormRow:  { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 },
  addFormActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  input:       { width: "100%", padding: "7px 10px", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 13, color: "#333", boxSizing: "border-box" as const },
  select:      { width: "100%", padding: "7px 10px", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 13, color: "#333", background: "#fff" },
  textarea:    { width: "100%", padding: "7px 10px", border: "1px solid #e0ded8", borderRadius: 7, fontSize: 13, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif", marginTop: 8 },
  cancelBtn:   { padding: "6px 14px", border: "1px solid #e0ded8", borderRadius: 6, background: "#fff", color: "#555", fontSize: 13, cursor: "pointer" },
  saveBtn:     { padding: "6px 14px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
};
