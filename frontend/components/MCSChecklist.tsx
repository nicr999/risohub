import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChecklistSection,
  ItemStatus,
  SECTION_META,
  ProjectType,
  COMMON_NA_REASONS,
} from "./mis3005Items";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  projectId: string;
  key: string;
  section: ChecklistSection;
  name: string;
  ref: string;
  guidance: string;
  required: boolean;
  status: ItemStatus;
  notes: string;
  /** Free-text reason required whenever status === "na" */
  naReason: string;
  uploadCount: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export type FilterOption = ItemStatus | "all" | "required";

interface MCSChecklistProps {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  currentUserName: string;
  onReadyForHandover?: () => void;
  onItemUpdated?: (item: ChecklistItem) => void;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("riso_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGetChecklist(projectId: string): Promise<ChecklistItem[]> {
  const res = await fetch(`/api/checklist/${projectId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to load checklist");
  const data = await res.json();
  // API returns { items: [...], ... } or a plain array
  const itemList: any[] = Array.isArray(data) ? data : (data.items ?? []);
  return itemList.map((item: ChecklistItem & { updatedAt: string }) => ({
    ...item,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
    naReason: item.naReason ?? "",
  }));
}

async function apiUpdateItem(
  itemId: string,
  patch: { status?: ItemStatus; notes?: string; naReason?: string }
): Promise<ChecklistItem> {
  const res = await fetch(`/api/checklist/item/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update checklist item");
  return res.json();
}

// ─── Compliance stats ─────────────────────────────────────────────────────────
// N/A items are excluded from the compliance percentage calculation.
// The score reflects: complete / (total − na).

function complianceStats(items: ChecklistItem[]) {
  const applicable = items.filter((i) => i.status !== "na");
  const total = applicable.length;
  const complete = applicable.filter((i) => i.status === "complete").length;
  const nonCompliant = items.filter((i) => i.status === "noncompliant").length;
  const pending = applicable.filter((i) => i.status === "pending").length;
  const naCount = items.filter((i) => i.status === "na").length;
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);

  // Ready = all required applicable items complete, no non-compliant
  const requiredApplicable = items.filter((i) => i.required && i.status !== "na");
  const allRequiredComplete =
    requiredApplicable.length > 0 &&
    requiredApplicable.every((i) => i.status === "complete");

  const blockingIssues = items
    .filter((i) => i.required && i.status === "noncompliant")
    .map((i) => i.key);

  return {
    total, complete, nonCompliant, pending, naCount, pct,
    allRequiredComplete,
    readyForHandover: allRequiredComplete && nonCompliant === 0,
    blockingIssues,
  };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function StatusSelect({
  itemKey,
  status,
  onChange,
}: {
  itemKey: string;
  status: ItemStatus;
  onChange: (s: ItemStatus) => void;
}) {
  const styles: Record<ItemStatus, React.CSSProperties> = {
    pending:       { background: "#f5f5f2", color: "#888",    border: "1px solid #C9C8BE" },
    complete:      { background: "#e8f5f0", color: "#2a7a5a", border: "1px solid #9fd4b8" },
    noncompliant:  { background: "#fce8e8", color: "#b03030", border: "1px solid #f0a0a0" },
    na:            { background: "#f0edf8", color: "#6a4aaa", border: "1px solid #c4b0e8" },
  };
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as ItemStatus)}
      style={{
        fontFamily: "'Satoshi', sans-serif",
        fontSize: 11, fontWeight: 700,
        padding: "4px 8px", borderRadius: 6,
        cursor: "pointer", outline: "none",
        width: "100%",
        ...styles[status],
      }}
    >
      <option value="pending">Pending</option>
      <option value="complete">Complete</option>
      <option value="noncompliant">Non-compliant</option>
      <option value="na">Not applicable</option>
    </select>
  );
}

function NaReasonPanel({
  item,
  onSave,
}: {
  item: ChecklistItem;
  onSave: (reason: string) => void;
}) {
  const [draft, setDraft] = useState(item.naReason);
  const suggestions = COMMON_NA_REASONS[item.key] ?? [];

  useEffect(() => setDraft(item.naReason), [item.naReason]);

  return (
    <div style={css.notePanel}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6a4aaa", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
        Reason not applicable
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setDraft(s)}
              style={{
                fontFamily: "'Satoshi', sans-serif",
                fontSize: 11, fontWeight: 500,
                padding: "3px 10px", borderRadius: 20,
                border: "1px solid #c4b0e8",
                background: draft === s ? "#f0edf8" : "#fff",
                color: "#6a4aaa", cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Monoblock unit — F-Gas not applicable"
          style={{
            flex: 1,
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 12, padding: "7px 10px",
            border: "1px solid #c4b0e8", borderRadius: 7,
            color: "#333", background: "#fff", outline: "none",
          }}
        />
        <button onClick={() => onSave(draft)} style={css.naSaveBtn}>
          Save reason
        </button>
      </div>

      {!draft.trim() && (
        <div style={{ fontSize: 11, color: "#c07020", marginTop: 6 }}>
          A reason is recommended — it appears in the audit log and handover pack.
        </div>
      )}
    </div>
  );
}

function NotePanel({
  item,
  onSave,
}: {
  item: ChecklistItem;
  onSave: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(item.notes);
  useEffect(() => setDraft(item.notes), [item.notes]);
  return (
    <div style={css.notePanel}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add note or remediation steps…"
        style={css.noteTextarea}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button onClick={() => onSave(draft)} style={css.noteSaveBtn}>
          Save note
        </button>
        {item.updatedBy && (
          <span style={{ fontSize: 11, color: "#bbb", alignSelf: "center" }}>
            Last updated by {item.updatedBy}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Checklist item row ───────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  onStatusChange,
  onNoteSave,
  onNaReasonSave,
}: {
  item: ChecklistItem;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onNoteSave: (id: string, notes: string) => void;
  onNaReasonSave: (id: string, reason: string) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const isNA = item.status === "na";

  // Auto-open the panel when switching to N/A so user is prompted for a reason
  const handleStatusChange = (s: ItemStatus) => {
    if (s === "na") setPanelOpen(true);
    onStatusChange(item.id, s);
  };

  const hasAnnotation = isNA ? !!item.naReason : !!item.notes;

  return (
    <>
      <div
        data-testid="checklist-item"
        style={{
          ...css.itemRow,
          opacity: isNA ? 0.6 : 1,
          transition: "opacity .2s",
        }}
      >
        {/* Clause ref number */}
        <div style={css.itemNum}>{item.ref.split("§")[1] ?? ""}</div>

        {/* Main content */}
        <div style={{ minWidth: 0 }}>
          <div style={css.itemName}>
            {item.name}
            {!item.required && <span style={css.optBadge}>optional</span>}
            <span
              style={{
                ...css.uploadBadge,
                background: item.uploadCount > 0 ? "#e8f5f0" : "#f5f5f2",
                color: item.uploadCount > 0 ? "#2a7a5a" : "#bbb",
              }}
              title={`${item.uploadCount} file${item.uploadCount !== 1 ? "s" : ""} attached`}
            >
              📎 {item.uploadCount}
            </span>
          </div>
          <div style={css.itemRef}>{item.ref}</div>
          {item.guidance && <div style={css.itemGuidance}>{item.guidance}</div>}

          {/* Show inline annotation (collapsed) */}
          {isNA && item.naReason && !panelOpen && (
            <div style={css.naReasonInline}>
              <span style={{ color: "#9a7acc" }}>⊘</span> {item.naReason}
            </div>
          )}
          {!isNA && item.notes && !panelOpen && (
            <div style={css.noteInline}>"{item.notes}"</div>
          )}
        </div>

        {/* Status selector */}
        <div>
          <StatusSelect itemKey={item.key} status={item.status} onChange={handleStatusChange} />
        </div>

        {/* Note / reason toggle */}
        <div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            style={{ ...css.noteBtn, ...(hasAnnotation ? css.noteBtnActive : {}) }}
            title={isNA ? "Add N/A reason" : "Add note"}
            aria-label={`${isNA ? "N/A reason" : "Note"} for ${item.name}`}
            aria-expanded={panelOpen}
          >
            {isNA ? "⊘" : "📝"}
          </button>
        </div>
      </div>

      {panelOpen && (
        isNA ? (
          <NaReasonPanel
            item={item}
            onSave={(reason) => {
              onNaReasonSave(item.id, reason);
              setPanelOpen(false);
            }}
          />
        ) : (
          <NotePanel
            item={item}
            onSave={(notes) => {
              onNoteSave(item.id, notes);
              setPanelOpen(false);
            }}
          />
        )
      )}
    </>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({
  sectionKey,
  items,
  onStatusChange,
  onNoteSave,
  onNaReasonSave,
}: {
  sectionKey: ChecklistSection;
  items: ChecklistItem[];
  onStatusChange: (id: string, status: ItemStatus) => void;
  onNoteSave: (id: string, notes: string) => void;
  onNaReasonSave: (id: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = SECTION_META[sectionKey];
  const applicable = items.filter((i) => i.status !== "na");
  const complete = applicable.filter((i) => i.status === "complete").length;
  const nonCompliant = items.filter((i) => i.status === "noncompliant").length;
  const naCount = items.filter((i) => i.status === "na").length;

  return (
    <div style={css.sectionBlock}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={css.sectionHead}
        aria-expanded={open}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={css.sectionTitle}>{meta.label}</span>
          {nonCompliant > 0 && (
            <span style={css.ncBadge}>{nonCompliant} issue{nonCompliant > 1 ? "s" : ""}</span>
          )}
          {naCount > 0 && (
            <span style={css.naBadge}>{naCount} N/A</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#aaa" }}>
            {complete} / {applicable.length} applicable
          </span>
          <span style={{ fontSize: 12, color: "#bbb", display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
            ▾
          </span>
        </div>
      </button>

      {open && items.map((item) => (
        <ChecklistItemRow
          key={item.id}
          item={item}
          onStatusChange={onStatusChange}
          onNoteSave={onNoteSave}
          onNaReasonSave={onNaReasonSave}
        />
      ))}
    </div>
  );
}

// ─── Score cards ──────────────────────────────────────────────────────────────

function StatCards({ items }: { items: ChecklistItem[] }) {
  const s = complianceStats(items);
  const cards = [
    { value: s.complete,     label: "Complete",        color: "#2a7a5a" },
    { value: s.pending,      label: "Pending",         color: "#888" },
    { value: s.nonCompliant, label: "Non-compliant",   color: "#b03030" },
    { value: s.naCount,      label: "Not applicable",  color: "#6a4aaa" },
    { value: `${s.pct}%`,   label: "Compliance",      color: "#7A8465" },
  ];
  return (
    <div style={css.statRow}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={css.statCard}
          {...(c.label === 'Compliance' ? { 'data-testid': 'compliance-score' } : {})}
        >
          <div style={{ ...css.statNum, color: c.color }}>{c.value}</div>
          <div style={css.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Segmented progress bar ───────────────────────────────────────────────────

function ProgressBar({ items }: { items: ChecklistItem[] }) {
  const s = complianceStats(items);
  const total = items.length;
  if (total === 0) return null;
  const seg = (count: number, color: string, border?: string) =>
    count > 0 ? (
      <div
        key={color}
        style={{ flex: count, background: color, height: "100%", borderRadius: 2, border: border ? `1px solid ${border}` : "none", transition: "flex .4s ease" }}
      />
    ) : null;

  return (
    <div style={css.progressWrap}>
      <div style={css.progressLabel}>
        <span style={css.progressTitle}>Compliance progress</span>
        <span style={{ ...css.progressTitle, color: s.nonCompliant > 0 ? "#c06060" : s.pct === 100 ? "#3a7a43" : "#7A8465" }}>
          {s.pct}%
        </span>
      </div>
      <div style={{ height: 6, background: "#f0f1ec", borderRadius: 3, overflow: "hidden", display: "flex", gap: 1 }}>
        {seg(s.complete, "#3a7a43")}
        {seg(s.nonCompliant, "#c06060")}
        {seg(s.naCount, "#c4b0e8")}
        {seg(s.pending, "#e8e8e4", "#DBD2C4")}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {[
          { color: "#3a7a43", label: "Complete" },
          { color: "#c06060", label: "Non-compliant" },
          { color: "#c4b0e8", label: "Not applicable" },
          { color: "#e0e0da", label: "Pending", border: "#C9C8BE" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: `1px solid ${l.border ?? l.color}`, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({ items }: { items: ChecklistItem[] }) {
  const { nonCompliant, readyForHandover } = complianceStats(items);
  const requiredNc = items.filter((i) => i.required && i.status === "noncompliant");

  if (requiredNc.length > 0) {
    return (
      <div style={css.warnBanner}>
        <span style={{ fontSize: 18, color: "#c07020", flexShrink: 0 }}>⚠</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5010" }}>
            {requiredNc.length} required item{requiredNc.length > 1 ? "s" : ""} non-compliant
          </div>
          <div style={{ fontSize: 12, color: "#8a6020", marginTop: 2 }}>
            Resolve all issues before generating the handover pack
          </div>
        </div>
      </div>
    );
  }
  if (readyForHandover) {
    return (
      <div style={css.readyBanner}>
        <span style={{ fontSize: 18, color: "#3a7a43", flexShrink: 0 }}>✓</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#2a5a33" }}>
            All applicable items complete
          </div>
          <div style={{ fontSize: 12, color: "#3a6a40", marginTop: 2 }}>
            Ready to generate handover pack once both parties have signed
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ active, onChange }: { active: FilterOption; onChange: (f: FilterOption) => void }) {
  const filters: { key: FilterOption; label: string }[] = [
    { key: "all",           label: "All items" },
    { key: "pending",       label: "Pending" },
    { key: "complete",      label: "Complete" },
    { key: "noncompliant",  label: "Non-compliant" },
    { key: "na",            label: "Not applicable" },
    { key: "required",      label: "Required only" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          style={{
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 12, fontWeight: 500,
            padding: "5px 13px", borderRadius: 20,
            border: `1px solid ${active === f.key ? "#7A8465" : "#C9C8BE"}`,
            background: active === f.key ? "#7A8465" : "#fff",
            color: active === f.key ? "#fff" : "#888",
            cursor: "pointer",
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MCSChecklist({
  projectId,
  projectName,
  projectType,
  currentUserName,
  onReadyForHandover,
  onItemUpdated,
}: MCSChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiGetChecklist(projectId)
      .then(setItems)
      .catch(() => setToast("Could not load checklist"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const { readyForHandover } = complianceStats(items);
    if (readyForHandover && items.length > 0) onReadyForHandover?.();
  }, [items, onReadyForHandover]);

  // Optimistic status update
  const handleStatusChange = useCallback(
    async (id: string, status: ItemStatus) => {
      const prev = items.find((i) => i.id === id);
      if (!prev || prev.status === status) return;

      setItems((curr) =>
        curr.map((i) => i.id === id ? { ...i, status, updatedBy: currentUserName, updatedAt: new Date() } : i)
      );

      try {
        const updated = await apiUpdateItem(id, { status });
        setItems((curr) => curr.map((i) => i.id === updated.id ? updated : i));
        onItemUpdated?.(updated);
        setToast(
          status === "na" ? "Marked not applicable — add a reason below" :
          status === "complete" ? "Marked complete" :
          status === "noncompliant" ? "Flagged non-compliant" : "Reset to pending"
        );
      } catch {
        setItems((curr) => curr.map((i) => i.id === id ? prev : i));
        setToast("Could not save — please try again");
      }
    },
    [items, currentUserName, onItemUpdated]
  );

  // Optimistic note save
  const handleNoteSave = useCallback(
    async (id: string, notes: string) => {
      const prev = items.find((i) => i.id === id);
      if (!prev) return;
      setItems((curr) => curr.map((i) => i.id === id ? { ...i, notes, updatedBy: currentUserName, updatedAt: new Date() } : i));
      try {
        const updated = await apiUpdateItem(id, { notes });
        setItems((curr) => curr.map((i) => i.id === updated.id ? updated : i));
        setToast("Note saved");
      } catch {
        setItems((curr) => curr.map((i) => i.id === id ? prev : i));
        setToast("Could not save note");
      }
    },
    [items, currentUserName]
  );

  // Optimistic N/A reason save
  const handleNaReasonSave = useCallback(
    async (id: string, naReason: string) => {
      const prev = items.find((i) => i.id === id);
      if (!prev) return;
      setItems((curr) => curr.map((i) => i.id === id ? { ...i, naReason, updatedBy: currentUserName, updatedAt: new Date() } : i));
      try {
        const updated = await apiUpdateItem(id, { naReason });
        setItems((curr) => curr.map((i) => i.id === updated.id ? updated : i));
        setToast("Reason saved");
      } catch {
        setItems((curr) => curr.map((i) => i.id === id ? prev : i));
        setToast("Could not save reason");
      }
    },
    [items, currentUserName]
  );

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === "all") return true;
      if (filter === "required") return item.required && item.status !== "na";
      return item.status === filter;
    });
  }, [items, filter]);

  const sections = (["S1", "S2", "S3", "S4", "S5"] as ChecklistSection[]).filter((sk) =>
    visibleItems.some((i) => i.section === sk)
  );

  return (
    <div style={css.wrap}>
      {toast && <div style={css.toast}>{toast}</div>}

      <div style={css.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={css.logo}>RH</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>MCS Compliance Checklist</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{projectName}</div>
          </div>
        </div>
        <span style={css.typeBadge}>
          MIS 3005 — {projectType === "ASHP" ? "Air source" : "Ground source"}
        </span>
      </div>

      <div style={css.body}>
        {loading ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>Loading checklist…</div>
        ) : (
          <>
            <StatCards items={items} />
            <ProgressBar items={items} />
            <FilterBar active={filter} onChange={setFilter} />
            <StatusBanner items={items} />

            {sections.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#aaa", fontSize: 13 }}>
                No items match this filter.
              </div>
            ) : (
              sections.map((sk) => (
                <SectionBlock
                  key={sk}
                  sectionKey={sk}
                  items={visibleItems.filter((i) => i.section === sk)}
                  onStatusChange={handleStatusChange}
                  onNoteSave={handleNoteSave}
                  onNaReasonSave={handleNaReasonSave}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "'Satoshi', sans-serif", background: "#F5F5F2", color: "#333", borderRadius: 12, overflow: "hidden", position: "relative" },
  toast: { position: "absolute", top: 12, right: 12, zIndex: 50, background: "#333", color: "#fff", fontSize: 12, fontWeight: 500, padding: "8px 16px", borderRadius: 8 },
  header: { background: "#fff", borderBottom: "1px solid #DBD2C4", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  logo: { width: 32, height: 32, background: "#7A8465", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  typeBadge: { fontSize: 12, color: "#7A8465", background: "#f0f1ec", padding: "4px 12px", borderRadius: 20, fontWeight: 500 },
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 },
  statCard: { background: "#fff", borderRadius: 8, border: "1px solid #DBD2C4", padding: "12px 14px" },
  statNum: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 10, color: "#999", marginTop: 2, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".05em" },
  progressWrap: { background: "#fff", borderRadius: 12, border: "1px solid #DBD2C4", padding: "14px 18px" },
  progressLabel: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  progressTitle: { fontSize: 13, fontWeight: 700, color: "#333" },
  warnBanner: { background: "#fef3e2", border: "1px solid #f5c87a", borderRadius: 10, padding: "13px 18px", display: "flex", alignItems: "center", gap: 12 },
  readyBanner: { background: "#e8f5f0", border: "1px solid #9fd4b8", borderRadius: 10, padding: "13px 18px", display: "flex", alignItems: "center", gap: 12 },
  sectionBlock: { background: "#fff", borderRadius: 12, border: "1px solid #DBD2C4", overflow: "hidden" },
  sectionHead: { width: "100%", padding: "11px 16px", background: "#F5F5F2", borderBottom: "1px solid #DBD2C4", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", border: "none", fontFamily: "'Satoshi', sans-serif", textAlign: "left" },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".06em" },
  ncBadge: { fontSize: 10, fontWeight: 700, background: "#fce8e8", color: "#b03030", padding: "2px 7px", borderRadius: 10 },
  naBadge: { fontSize: 10, fontWeight: 700, background: "#f0edf8", color: "#6a4aaa", padding: "2px 7px", borderRadius: 10 },
  itemRow: { display: "grid", gridTemplateColumns: "36px 1fr 130px 36px", gap: 10, padding: "11px 16px", borderBottom: "1px solid #f5f5f2", alignItems: "start" },
  itemNum: { fontSize: 10, fontWeight: 700, color: "#bbb", paddingTop: 3, fontFamily: "monospace" },
  itemName: { fontSize: 13, fontWeight: 500, color: "#333", lineHeight: 1.4 },
  itemRef: { fontSize: 10, color: "#bbb", marginTop: 2, fontFamily: "monospace" },
  itemGuidance: { fontSize: 11, color: "#999", marginTop: 4, lineHeight: 1.5 },
  naReasonInline: { fontSize: 11, color: "#9a7acc", marginTop: 3, display: "flex", alignItems: "center", gap: 4 },
  noteInline: { fontSize: 11, color: "#7A8465", marginTop: 3, fontStyle: "italic" },
  optBadge: { fontSize: 10, fontWeight: 500, color: "#bbb", marginLeft: 5 },
  uploadBadge: { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 5, cursor: "pointer" },
  noteBtn: { background: "none", border: "1px solid #DBD2C4", borderRadius: 6, cursor: "pointer", fontSize: 13, padding: "4px 7px", transition: "all .15s", lineHeight: 1 },
  noteBtnActive: { borderColor: "#7A8465", background: "#f0f1ec" },
  notePanel: { padding: "12px 16px 14px 58px", background: "#fafaf8", borderTop: "1px solid #f0f1ec" },
  noteTextarea: { width: "100%", fontFamily: "'Satoshi', sans-serif", fontSize: 12, padding: "8px 10px", border: "1px solid #DBD2C4", borderRadius: 7, color: "#333", background: "#fff", resize: "none", outline: "none", minHeight: 56 },
  noteSaveBtn: { fontFamily: "'Satoshi', sans-serif", fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", background: "#7A8465", color: "#fff", cursor: "pointer" },
  naSaveBtn: { fontFamily: "'Satoshi', sans-serif", fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, border: "none", background: "#6a4aaa", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const },
};
