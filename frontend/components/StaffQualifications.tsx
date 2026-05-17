/**
 * StaffQualifications.tsx  — v2
 *
 * Changes from v1:
 *   - Tab bar: "All Staff" tab + one tab per Installer/Surveyor
 *   - Per-installer tab shows:
 *       · Compliance header (compliant / action required badge)
 *       · Required qualifications checklist — tick or cross per item
 *       · Full qualification cards with edit/remove
 *       · Inline "Add qualification" pre-scoped to that person
 *   - All Staff view condensed to card-strip layout with quick-edit
 *
 * Props:
 *   token    — JWT access token
 *   userRole — "Admin" | "Surveyor" | "Installer" | "Auditor"
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id:             string;
  name:           string;
  email:          string;
  role:           string;
  active:         boolean;
  avatarInitials: string;
}

type QualStatus = "valid" | "expiring" | "expired" | "missing";

interface Qualification {
  id:              string;
  staffId:         string;
  type:            string;
  category:        string;
  certNumber:      string;
  issuingBody:     string;
  issuedAt:        string;
  expiresAt:       string | null;
  neverExpires:    boolean;
  fileUrl:         string | null;
  notes:           string;
  status:          QualStatus;
  daysUntilExpiry: number | null;
}

interface Props {
  token:    string;
  userRole: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 60;

const QUAL_TYPES: { type: string; category: string; issuingBody: string; required: boolean }[] = [
  { type: "MCS Installer Certification",           category: "Certification", issuingBody: "MCS",                    required: true  },
  { type: "Microgeneration Installation Standard", category: "Certification", issuingBody: "MCS",                    required: true  },
  { type: "F-Gas Category 1",                      category: "Certification", issuingBody: "REFCOM / City & Guilds", required: false },
  { type: "Part P Electrical Competency",          category: "Certification", issuingBody: "NICEIC / NAPIT",         required: false },
  { type: "WRAS Water Regulations",                category: "Training",      issuingBody: "WRAS",                   required: true  },
  { type: "RECC Membership",                       category: "Membership",    issuingBody: "RECC",                   required: true  },
  { type: "Manual Handling",                       category: "Training",      issuingBody: "Internal / CITB",        required: true  },
  { type: "Health & Safety (CSCS/SSSTS)",          category: "Training",      issuingBody: "CITB",                   required: true  },
  { type: "First Aid at Work",                     category: "Training",      issuingBody: "St John / Red Cross",    required: true  },
  { type: "Asbestos Awareness",                    category: "Training",      issuingBody: "Internal / CITB",        required: false },
  { type: "Working at Height",                     category: "Training",      issuingBody: "PASMA / IPAF",           required: false },
  { type: "Other",                                 category: "Other",         issuingBody: "",                       required: false },
];

const REQUIRED_TYPES = QUAL_TYPES.filter(q => q.required).map(q => q.type);

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  Certification: { color: "#4a7a5a", bg: "#edf7f1" },
  Membership:    { color: "#5a5a9a", bg: "#eff0fa" },
  Training:      { color: "#8a7a50", bg: "#fdf6e3" },
  Other:         { color: "#777",    bg: "#f5f5f2" },
};

const STATUS_CONFIG: Record<QualStatus, { label: string; color: string; bg: string; dot: string }> = {
  valid:    { label: "Valid",         color: "#4a7a5a", bg: "#edf7f1", dot: "#4a7a5a" },
  expiring: { label: "Expiring soon", color: "#8a7a50", bg: "#fdf6e3", dot: "#d4a828" },
  expired:  { label: "Expired",       color: "#a05050", bg: "#fdf0f0", dot: "#c05050" },
  missing:  { label: "Missing",       color: "#a05050", bg: "#fdf0f0", dot: "#c05050" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(q: { expiresAt: string | null; neverExpires: boolean }): {
  status: QualStatus; daysUntilExpiry: number | null;
} {
  if (q.neverExpires || !q.expiresAt) return { status: "valid", daysUntilExpiry: null };
  const days = Math.floor((new Date(q.expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0)                    return { status: "expired",  daysUntilExpiry: days };
  if (days <= EXPIRY_WARNING_DAYS) return { status: "expiring", daysUntilExpiry: days };
  return { status: "valid", daysUntilExpiry: days };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Qual Form Modal ──────────────────────────────────────────────────────────

function QualForm({
  staffId, existing, token, onClose, onSaved,
}: {
  staffId: string; existing: Qualification | null;
  token: string; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    type:         existing?.type         ?? QUAL_TYPES[0].type,
    category:     existing?.category     ?? QUAL_TYPES[0].category,
    certNumber:   existing?.certNumber   ?? "",
    issuingBody:  existing?.issuingBody  ?? QUAL_TYPES[0].issuingBody,
    issuedAt:     existing?.issuedAt     ?? "",
    expiresAt:    existing?.expiresAt    ?? "",
    neverExpires: existing?.neverExpires ?? false,
    notes:        existing?.notes        ?? "",
  });
  const [file, setFile]     = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const fileRef             = useRef<HTMLInputElement>(null);

  const handleTypeChange = (type: string) => {
    const preset = QUAL_TYPES.find(q => q.type === type);
    setForm(f => ({ ...f, type, category: preset?.category ?? f.category, issuingBody: preset?.issuingBody ?? f.issuingBody }));
  };

  const handleSubmit = async () => {
    if (!form.type || !form.issuedAt) { setError("Qualification type and issue date are required."); return; }
    if (!form.neverExpires && !form.expiresAt) { setError("Enter an expiry date, or check 'No expiry date'."); return; }
    setSaving(true); setError("");
    try {
      let fileUrl: string | null = existing?.fileUrl ?? null;
      if (file) {
        const pr = await fetch("/api/qualifications/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
        });
        const { uploadUrl, publicUrl } = await pr.json();
        await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        fileUrl = publicUrl;
      }
      const url    = isEdit ? `/api/qualifications/${existing!.id}` : "/api/qualifications";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, staffId, fileUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>
        <div style={ms.modalHeader}>
          <h2 style={ms.modalTitle}>{isEdit ? "Edit qualification" : "Add qualification"}</h2>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>
        <div style={ms.grid2}>
          <div style={ms.field}>
            <label style={ms.label}>Qualification type</label>
            <select style={ms.select} value={form.type} onChange={e => handleTypeChange(e.target.value)}>
              {QUAL_TYPES.map(q => <option key={q.type} value={q.type}>{q.type}</option>)}
            </select>
          </div>
          <div style={ms.field}>
            <label style={ms.label}>Category</label>
            <select style={ms.select} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {["Certification", "Membership", "Training", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={ms.grid2}>
          <div style={ms.field}>
            <label style={ms.label}>Certificate / membership number</label>
            <input style={ms.input} value={form.certNumber} onChange={e => setForm(f => ({ ...f, certNumber: e.target.value }))} placeholder="e.g. MCS-12345" />
          </div>
          <div style={ms.field}>
            <label style={ms.label}>Issuing body</label>
            <input style={ms.input} value={form.issuingBody} onChange={e => setForm(f => ({ ...f, issuingBody: e.target.value }))} />
          </div>
        </div>
        <div style={ms.grid2}>
          <div style={ms.field}>
            <label style={ms.label}>Issue date</label>
            <input style={ms.input} type="date" value={form.issuedAt} onChange={e => setForm(f => ({ ...f, issuedAt: e.target.value }))} />
          </div>
          <div style={ms.field}>
            <label style={ms.label}>Expiry date</label>
            <input style={{ ...ms.input, opacity: form.neverExpires ? 0.4 : 1 }} type="date" value={form.expiresAt} disabled={form.neverExpires} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            <label style={ms.checkLabel}>
              <input type="checkbox" checked={form.neverExpires} onChange={e => setForm(f => ({ ...f, neverExpires: e.target.checked, expiresAt: "" }))} style={{ accentColor: "#7A8465" }} />
              No expiry date
            </label>
          </div>
        </div>
        <div style={ms.field}>
          <label style={ms.label}>Certificate scan / evidence</label>
          <div style={ms.fileZone} onClick={() => fileRef.current?.click()}>
            {file ? <span style={{ color: "#7A8465", fontWeight: 600 }}>📎 {file.name}</span>
              : existing?.fileUrl ? <span style={{ color: "#7A8465" }}>File attached — click to replace</span>
              : <span style={{ color: "#aaa" }}>Click to upload PDF, JPG or PNG</span>}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div style={ms.field}>
          <label style={ms.label}>Notes</label>
          <textarea style={ms.textarea} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes for audit record" />
        </div>
        {error && <div style={ms.errorMsg}>{error}</div>}
        <div style={ms.modalFooter}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={ms.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add qualification"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Per-Installer Tab ────────────────────────────────────────────────────────

function InstallerTab({
  staff, quals, canEdit, token, onRefresh,
}: {
  staff: StaffMember; quals: Qualification[];
  canEdit: boolean; token: string; onRefresh: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Qualification | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this qualification record?")) return;
    try {
      await fetch(`/api/qualifications/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      showToast("Removed ✓"); onRefresh();
    } catch { showToast("Failed — try again."); }
  };

  // Compliance logic
  const activeTypes = quals.filter(q => q.status !== "expired").map(q => q.type);
  const missing     = REQUIRED_TYPES.filter(rt => !activeTypes.includes(rt));
  const hasExpired  = quals.some(q => q.status === "expired");
  const isCompliant = missing.length === 0 && !hasExpired;

  return (
    <div>

      {/* Installer header card */}
      <div style={it.headerCard}>
        <div style={it.avatarLg}>{staff.avatarInitials}</div>
        <div style={it.headerInfo}>
          <div style={it.headerName}>{staff.name}</div>
          <div style={it.headerMeta}>{staff.role} · {staff.email}</div>
        </div>
        <div style={{
          ...it.complianceBadge,
          background: isCompliant ? "#edf7f1" : "#fdf0f0",
          color:      isCompliant ? "#4a7a5a" : "#a05050",
          border:     `1px solid ${isCompliant ? "#b8dfc8" : "#e8b4b4"}`,
        }}>
          {isCompliant ? "✓ MCS Compliant" : "⚠ Action Required"}
        </div>
      </div>

      {/* Required qualifications checklist */}
      <div style={it.sectionTitle}>Required qualifications checklist</div>
      <div style={it.checkList}>
        {QUAL_TYPES.filter(q => q.required).map(req => {
          const held   = quals.find(q => q.type === req.type && q.status !== "expired");
          const expRec = quals.find(q => q.type === req.type && q.status === "expired");
          const tick   = !!held;
          const qcfg   = held ? STATUS_CONFIG[held.status]
                       : expRec ? STATUS_CONFIG.expired
                       : STATUS_CONFIG.missing;
          return (
            <div key={req.type} style={it.checkRow}>
              <span style={{ ...it.checkIcon, color: tick ? "#4a7a5a" : "#c05050" }}>
                {tick ? "✓" : "✕"}
              </span>
              <div style={it.checkBody}>
                <span style={it.checkName}>{req.type}</span>
                <span style={it.checkSub}>
                  {held && `${held.certNumber ? held.certNumber + " · " : ""}${held.issuingBody}${held.neverExpires ? " · No expiry" : " · Expires " + fmtDate(held.expiresAt)}`}
                  {expRec && !held && <span style={{ color: "#c05050" }}>Expired {fmtDate(expRec.expiresAt)} — renewal required</span>}
                  {!held && !expRec && <span style={{ color: "#c05050" }}>Not recorded</span>}
                  {held?.daysUntilExpiry !== null && held?.daysUntilExpiry !== undefined && held.daysUntilExpiry >= 0 && held.daysUntilExpiry <= EXPIRY_WARNING_DAYS && (
                    <span style={{ color: "#d4a828", fontWeight: 600, marginLeft: 6 }}>
                      {held.daysUntilExpiry}d remaining
                    </span>
                  )}
                </span>
              </div>
              <span style={{ ...it.statusPill, color: qcfg.color, background: qcfg.bg }}>
                {qcfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* All records */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "28px 0 12px" }}>
        <div style={it.sectionTitle} >All qualification records</div>
        {canEdit && (
          <button style={it.addBtn} onClick={() => { setEditing(null); setFormOpen(true); }}>
            + Add qualification
          </button>
        )}
      </div>

      {quals.length === 0 && (
        <div style={it.empty}>No qualifications recorded yet.</div>
      )}

      {quals.map(q => {
        const qcfg   = STATUS_CONFIG[q.status];
        const catcfg = CATEGORY_COLORS[q.category] ?? CATEGORY_COLORS.Other;
        return (
          <div key={q.id} style={it.qualCard}>
            <div style={it.qualTop}>
              <div>
                <div style={it.qualName}>{q.type}</div>
                <div style={it.qualMeta}>
                  <span style={{ ...it.catBadge, color: catcfg.color, background: catcfg.bg }}>{q.category}</span>
                  {q.certNumber && <span style={it.certNum}>{q.certNumber}</span>}
                  <span style={it.issuingBody}>{q.issuingBody}</span>
                </div>
              </div>
              <span style={{ ...it.statusPill, color: qcfg.color, background: qcfg.bg }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: qcfg.dot, display: "inline-block", marginRight: 5 }} />
                {qcfg.label}
              </span>
            </div>
            <div style={it.qualBottom}>
              <div style={it.qualDates}>
                <span>Issued {fmtDate(q.issuedAt)}</span>
                <span style={{ color: "#d0cec6" }}>·</span>
                <span style={{ color: q.status === "expired" ? "#c05050" : q.status === "expiring" ? "#d4a828" : "#888" }}>
                  {q.neverExpires ? "No expiry" : `Expires ${fmtDate(q.expiresAt)}`}
                  {q.daysUntilExpiry !== null && q.daysUntilExpiry >= 0 && (
                    <span style={{ marginLeft: 4, fontWeight: 600 }}>({q.daysUntilExpiry}d)</span>
                  )}
                </span>
              </div>
              <div style={it.qualActions}>
                {q.fileUrl && (
                  <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" style={it.actionBtn}>↓ Cert</a>
                )}
                {canEdit && (
                  <>
                    <button style={it.actionBtn} onClick={() => { setEditing(q); setFormOpen(true); }}>Edit</button>
                    <button style={{ ...it.actionBtn, color: "#c05050" }} onClick={() => handleDelete(q.id)}>Remove</button>
                  </>
                )}
              </div>
            </div>
            {q.notes && <div style={it.qualNotes}>{q.notes}</div>}
          </div>
        );
      })}

      {formOpen && (
        <QualForm
          staffId={staff.id}
          existing={editing}
          token={token}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { onRefresh(); showToast("Qualification saved ✓"); }}
        />
      )}

      {toast && <div style={it.toast}>{toast}</div>}
    </div>
  );
}

// ─── All Staff view ───────────────────────────────────────────────────────────

function AllStaffView({
  staff, quals, canEdit, token, onRefresh,
}: {
  staff: StaffMember[]; quals: Qualification[];
  canEdit: boolean; token: string; onRefresh: () => void;
}) {
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilter]   = useState<QualStatus | "all">("all");
  const [formState, setFormState]   = useState<{ open: boolean; staffId: string; existing: Qualification | null }>({ open: false, staffId: "", existing: null });
  const [toast, setToast]           = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this qualification?")) return;
    try {
      await fetch(`/api/qualifications/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      showToast("Removed ✓"); onRefresh();
    } catch { showToast("Failed — try again."); }
  };

  const totalExpired  = quals.filter(q => q.status === "expired").length;
  const totalExpiring = quals.filter(q => q.status === "expiring").length;

  const complianceIssues = staff
    .filter(s => ["Installer", "Surveyor"].includes(s.role))
    .map(s => {
      const active  = quals.filter(q => q.staffId === s.id && q.status !== "expired").map(q => q.type);
      const missing = REQUIRED_TYPES.filter(rt => !active.includes(rt));
      return { name: s.name, missing };
    })
    .filter(i => i.missing.length > 0);

  const filtered = staff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                        s.email.toLowerCase().includes(search.toLowerCase());
    const sq = quals.filter(q => q.staffId === s.id);
    const matchStatus = filterStatus === "all" || sq.some(q => q.status === filterStatus);
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {/* Alert banner */}
      {(totalExpired > 0 || totalExpiring > 0 || complianceIssues.length > 0) && (
        <div style={av.alertBanner}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div>
            {totalExpired > 0 && <div style={av.alertLine}><strong>{totalExpired}</strong> expired qualification{totalExpired === 1 ? "" : "s"} — action required before MCS audit.</div>}
            {totalExpiring > 0 && <div style={av.alertLine}><strong>{totalExpiring}</strong> expiring within {EXPIRY_WARNING_DAYS} days.</div>}
            {complianceIssues.length > 0 && <div style={av.alertLine}><strong>{complianceIssues.length}</strong> installer{complianceIssues.length === 1 ? "" : "s"} missing required qualifications: {complianceIssues.map(i => i.name).join(", ")}.</div>}
          </div>
        </div>
      )}

      {/* Strip */}
      <div style={av.strip}>
        {[
          { label: "Total",         value: quals.length,                                   key: "all"      },
          { label: "Valid",         value: quals.filter(q => q.status === "valid").length, key: "valid"    },
          { label: "Expiring soon", value: totalExpiring,                                  key: "expiring" },
          { label: "Expired",       value: totalExpired,                                   key: "expired"  },
        ].map(s => (
          <button key={s.key} style={{ ...av.stripItem, ...(filterStatus === s.key ? av.stripItemActive : {}) }} onClick={() => setFilter(s.key as any)}>
            <span style={av.stripCount}>{s.value}</span>
            <span style={av.stripLabel}>{s.label}</span>
          </button>
        ))}
      </div>

      <input style={av.search} placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {filtered.map(s => {
          const sq        = quals.filter(q => q.staffId === s.id);
          const expired   = sq.filter(q => q.status === "expired").length;
          const expiring  = sq.filter(q => q.status === "expiring").length;
          const valid     = sq.filter(q => q.status === "valid").length;
          const overall: QualStatus = expired > 0 ? "expired" : expiring > 0 ? "expiring" : sq.length === 0 ? "missing" : "valid";
          const cfg = STATUS_CONFIG[overall];

          return (
            <div key={s.id} style={{ ...av.card, borderLeftColor: cfg.dot }}>
              <div style={av.cardTop}>
                <div style={av.avatar}>{s.avatarInitials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={av.staffName}>{s.name}</div>
                  <div style={av.staffMeta}>{s.role} · {s.email}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {expired  > 0 && <span style={{ ...av.badge, color: STATUS_CONFIG.expired.color,  background: STATUS_CONFIG.expired.bg  }}>{expired} expired</span>}
                  {expiring > 0 && <span style={{ ...av.badge, color: STATUS_CONFIG.expiring.color, background: STATUS_CONFIG.expiring.bg }}>{expiring} expiring</span>}
                  {valid    > 0 && <span style={{ ...av.badge, color: STATUS_CONFIG.valid.color,    background: STATUS_CONFIG.valid.bg    }}>{valid} valid</span>}
                  {sq.length === 0 && <span style={{ ...av.badge, color: "#aaa", background: "#f5f5f2" }}>No records</span>}
                </div>
              </div>

              {sq.length > 0 && (
                <div style={av.qualList}>
                  {sq.map(q => {
                    const qcfg = STATUS_CONFIG[q.status];
                    return (
                      <div key={q.id} style={av.qualRow}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: qcfg.dot, flexShrink: 0, marginTop: 1 }} />
                        <span style={av.qualRowName}>{q.type}</span>
                        <span style={{ ...av.qualRowDate, color: q.status === "expired" ? "#c05050" : q.status === "expiring" ? "#d4a828" : "#aaa" }}>
                          {q.neverExpires ? "No expiry" : fmtDate(q.expiresAt)}
                          {q.daysUntilExpiry !== null && q.daysUntilExpiry >= 0 && q.daysUntilExpiry <= EXPIRY_WARNING_DAYS && ` (${q.daysUntilExpiry}d)`}
                        </span>
                        {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" style={av.microLink}>↓</a>}
                        {canEdit && (
                          <>
                            <button style={av.microBtn} onClick={() => setFormState({ open: true, staffId: s.id, existing: q })}>Edit</button>
                            <button style={{ ...av.microBtn, color: "#c05050" }} onClick={() => handleDelete(q.id)}>✕</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit && (
                <button style={av.addBtn} onClick={() => setFormState({ open: true, staffId: s.id, existing: null })}>
                  + Add qualification
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ color: "#aaa", fontSize: 14, padding: "24px 0" }}>No staff match your search.</div>}
      </div>

      {formState.open && (
        <QualForm
          staffId={formState.staffId}
          existing={formState.existing}
          token={token}
          onClose={() => setFormState({ open: false, staffId: "", existing: null })}
          onSaved={() => { onRefresh(); showToast("Saved ✓"); }}
        />
      )}
      {toast && <div style={av.toast}>{toast}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffQualifications({ token, userRole }: Props) {
  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [quals, setQuals]     = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");

  const canEdit  = userRole === "Admin";
  const tabStaff = staff.filter(s => ["Installer", "Surveyor"].includes(s.role));

  const fetchAll = useCallback(async () => {
    try {
      const [staffRes, qualsRes] = await Promise.all([
        fetch("/api/users?active=true", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/qualifications",    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const { users }          = await staffRes.json();
      const { qualifications } = await qualsRes.json();

      setStaff((users ?? []).map((u: any) => ({ ...u, avatarInitials: initials(u.name) })));
      setQuals((qualifications ?? []).map((q: any) => ({ ...q, ...computeStatus(q) })));
    } catch { /* show stale */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleExport = () => {
    const rows = [
      ["Name", "Role", "Qualification", "Category", "Cert Number", "Issuing Body", "Issued", "Expires", "Status", "Notes"],
      ...quals.map(q => {
        const s = staff.find(m => m.id === q.staffId);
        return [s?.name ?? "", s?.role ?? "", q.type, q.category, q.certNumber, q.issuingBody, fmtDate(q.issuedAt), q.neverExpires ? "No expiry" : fmtDate(q.expiresAt), q.status, q.notes];
      }),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a    = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `riso-qualifications-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
  };

  const activeStaff = tabStaff.find(s => s.id === activeTab) ?? null;

  return (
    <div style={sq.wrap}>
      {/* Page header */}
      <div style={sq.pageHeader}>
        <div>
          <h1 style={sq.pageTitle}>Staff Qualifications</h1>
          <p style={sq.pageSubtitle}>MCS-compliant qualification registry — all installer certifications in one place.</p>
        </div>
        <button style={sq.exportBtn} onClick={handleExport}>↓ Export CSV</button>
      </div>

      {/* Tab bar */}
      <div style={sq.tabBar}>
        <button style={{ ...sq.tab, ...(activeTab === "all" ? sq.tabActive : {}) }} onClick={() => setActiveTab("all")}>
          All Staff
        </button>
        {tabStaff.map(s => {
          const myQuals   = quals.filter(q => q.staffId === s.id);
          const active    = myQuals.filter(q => q.status !== "expired").map(q => q.type);
          const hasIssue  = myQuals.some(q => q.status === "expired") ||
                            REQUIRED_TYPES.some(rt => !active.includes(rt));
          return (
            <button key={s.id} style={{ ...sq.tab, ...(activeTab === s.id ? sq.tabActive : {}) }} onClick={() => setActiveTab(s.id)}>
              <span style={{ ...sq.tabDot, background: hasIssue ? "#c05050" : "#4a7a5a" }} />
              {s.name.split(" ")[0]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: "#aaa", fontSize: 14, padding: "32px 0" }}>Loading…</div>
      ) : activeTab === "all" ? (
        <AllStaffView staff={staff} quals={quals} canEdit={canEdit} token={token} onRefresh={fetchAll} />
      ) : activeStaff ? (
        <InstallerTab staff={activeStaff} quals={quals.filter(q => q.staffId === activeStaff.id)} canEdit={canEdit} token={token} onRefresh={fetchAll} />
      ) : null}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sq: Record<string, React.CSSProperties> = {
  wrap:         { fontFamily: "Satoshi, sans-serif", color: "#333" },
  pageHeader:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  pageTitle:    { fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" },
  pageSubtitle: { fontSize: 13.5, color: "#777", margin: 0 },
  exportBtn:    { padding: "9px 18px", background: "#f0f1ec", border: "1px solid #c8cabb", color: "#7A8465", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tabBar:       { display: "flex", gap: 2, marginBottom: 28, borderBottom: "2px solid #f0f1ec" },
  tab:          { padding: "9px 16px", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -2, fontSize: 13.5, fontWeight: 600, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, borderRadius: "6px 6px 0 0", whiteSpace: "nowrap" },
  tabActive:    { color: "#7A8465", borderBottomColor: "#7A8465", background: "#f7f7f4" },
  tabDot:       { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
};

const it: Record<string, React.CSSProperties> = {
  headerCard:     { display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "#fff", border: "1px solid #e8e6e0", borderRadius: 12, marginBottom: 24 },
  avatarLg:       { width: 48, height: 48, background: "#7A8465", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 17, fontWeight: 700, flexShrink: 0 },
  headerInfo:     { flex: 1 },
  headerName:     { fontSize: 16, fontWeight: 700, color: "#333", marginBottom: 3 },
  headerMeta:     { fontSize: 13, color: "#888" },
  complianceBadge:{ padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, flexShrink: 0 },
  sectionTitle:   { fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 },
  checkList:      { display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 8 },
  checkRow:       { display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", background: "#fff", border: "1px solid #f0f1ec", borderRadius: 8 },
  checkIcon:      { fontSize: 14, fontWeight: 700, width: 18, flexShrink: 0, marginTop: 2 },
  checkBody:      { flex: 1, minWidth: 0 },
  checkName:      { fontSize: 13.5, fontWeight: 600, color: "#333", display: "block", marginBottom: 3 },
  checkSub:       { fontSize: 12, color: "#888" },
  statusPill:     { display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0 },
  addBtn:         { padding: "8px 18px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  empty:          { color: "#bbb", fontSize: 13, padding: "16px 0" },
  qualCard:       { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "14px 16px", marginBottom: 8 },
  qualTop:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  qualName:       { fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 4 },
  qualMeta:       { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  catBadge:       { padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  certNum:        { fontSize: 12, color: "#7A8465", fontFamily: "monospace" },
  issuingBody:    { fontSize: 12, color: "#aaa" },
  qualBottom:     { display: "flex", justifyContent: "space-between", alignItems: "center" },
  qualDates:      { display: "flex", gap: 8, fontSize: 12, color: "#888" },
  qualActions:    { display: "flex", gap: 6 },
  actionBtn:      { padding: "4px 10px", background: "none", border: "1px solid #e0ded8", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#555", cursor: "pointer", textDecoration: "none", display: "inline-block" },
  qualNotes:      { fontSize: 12, color: "#aaa", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f7f7f4" },
  toast:          { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#333", color: "#fff", padding: "11px 22px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
};

const av: Record<string, React.CSSProperties> = {
  alertBanner:    { display: "flex", gap: 12, alignItems: "flex-start", background: "#fdf6e3", border: "1px solid #e8d48a", borderRadius: 10, padding: "14px 18px", marginBottom: 20 },
  alertLine:      { fontSize: 13.5, color: "#6a5a30", marginBottom: 3, lineHeight: 1.5 },
  strip:          { display: "flex", gap: 10, marginBottom: 16 },
  stripItem:      { display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "12px 20px", background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, cursor: "pointer", minWidth: 90 },
  stripItemActive:{ borderColor: "#7A8465", background: "#f0f1ec" },
  stripCount:     { fontSize: 24, fontWeight: 700, color: "#333", lineHeight: 1 },
  stripLabel:     { fontSize: 11, color: "#999", marginTop: 3 },
  search:         { width: "100%", padding: "9px 14px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", background: "#fff", outline: "none", boxSizing: "border-box" as const },
  card:           { background: "#fff", border: "1px solid #e8e6e0", borderLeft: "3px solid", borderRadius: 10, padding: "14px 18px" },
  cardTop:        { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  avatar:         { width: 34, height: 34, background: "#7A8465", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  staffName:      { fontSize: 14, fontWeight: 700, color: "#333" },
  staffMeta:      { fontSize: 12, color: "#888", marginTop: 2 },
  badge:          { padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  qualList:       { display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 10 },
  qualRow:        { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f7f7f4", borderRadius: 6 },
  qualRowName:    { flex: 1, fontSize: 12.5, color: "#444" },
  qualRowDate:    { fontSize: 11, fontWeight: 500 },
  microLink:      { fontSize: 11, color: "#7A8465", fontWeight: 700, textDecoration: "none" },
  microBtn:       { background: "none", border: "none", fontSize: 11, color: "#aaa", cursor: "pointer", padding: "0 2px" },
  addBtn:         { display: "block", width: "100%", padding: "8px", background: "none", border: "1px dashed #d0cec6", borderRadius: 7, fontSize: 12.5, color: "#7A8465", fontWeight: 600, cursor: "pointer", textAlign: "center" as const },
  toast:          { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#333", color: "#fff", padding: "11px 22px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999 },
};

const ms: Record<string, React.CSSProperties> = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" },
  modal:       { background: "#fff", borderRadius: 14, padding: "28px 32px", width: "100%", maxWidth: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  modalTitle:  { fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn:    { background: "none", border: "none", fontSize: 18, color: "#aaa", cursor: "pointer" },
  grid2:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 4 },
  field:       { marginBottom: 16 },
  label:       { display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 },
  input:       { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", boxSizing: "border-box" as const, outline: "none" },
  select:      { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", background: "#fff", cursor: "pointer" },
  textarea:    { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif" },
  checkLabel:  { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666", marginTop: 7, cursor: "pointer" },
  fileZone:    { padding: "16px", border: "1px dashed #d0cec6", borderRadius: 8, background: "#fafaf8", cursor: "pointer", fontSize: 13, textAlign: "center" as const },
  errorMsg:    { background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn:   { padding: "9px 18px", border: "1px solid #e0ded8", borderRadius: 8, background: "#fff", color: "#555", fontSize: 14, cursor: "pointer" },
  saveBtn:     { padding: "9px 22px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" },
};
