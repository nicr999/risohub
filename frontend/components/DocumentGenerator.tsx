import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentVersion {
  id: string;
  projectId: string;
  version: number;
  pdfUrl: string;
  generatedAt: Date;
  generatedBy: string;
  sha256Hash: string;
  sections: DocumentSectionKey[];
  sizeBytes: number;
}

export type DocumentSectionKey =
  | "cover"
  | "summary"
  | "checklist"
  | "signatures"
  | "warranty"
  | "appendices";

export interface DocumentSectionConfig {
  key: DocumentSectionKey;
  name: string;
  description: string;
  /** Required sections cannot be toggled off */
  required: boolean;
  enabled: boolean;
}

export interface Prerequisite {
  key: string;
  label: string;
  met: boolean;
  /** If unmet, this short hint is shown in the tooltip */
  hint?: string;
}

export interface GenerateRequest {
  projectId: string;
  sections: DocumentSectionKey[];
  deliverByEmail: boolean;
  syncToDrive: boolean;
  submitToMCS: boolean;
}

export interface GenerateResponse {
  document: DocumentVersion;
  emailSent: boolean;
  driveSynced: boolean;
}

interface DocumentGeneratorProps {
  projectId: string;
  projectName: string;
  customerName: string;
  projectAddress: string;
  currentStage: string;
  /** Pre-computed from ChecklistService.getComplianceSummary */
  prerequisitesMet: Prerequisite[];
  onDocumentGenerated?: (doc: DocumentVersion) => void;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("riso_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGetVersionHistory(projectId: string): Promise<DocumentVersion[]> {
  const res = await fetch(`/api/documents?projectId=${projectId}&docType=handover`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to load document history");
  const data = await res.json();
  return data.map((d: DocumentVersion & { generatedAt: string }) => ({
    ...d,
    generatedAt: new Date(d.generatedAt),
  }));
}

async function apiGenerateDocument(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch("/api/documents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Document generation failed");
  const data = await res.json();
  return {
    ...data,
    document: { ...data.document, generatedAt: new Date(data.document.generatedAt) },
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SECTIONS: DocumentSectionConfig[] = [
  {
    key: "cover",
    name: "Cover page",
    description: "Branded RH cover with customer name, address, and date",
    required: false,
    enabled: true,
  },
  {
    key: "summary",
    name: "Project summary",
    description: "Property details, system specification, and equipment list",
    required: false,
    enabled: true,
  },
  {
    key: "checklist",
    name: "Commissioning checklist",
    description: "Auto-filled MCS checklist with completion status and N/A reasons",
    required: true,
    enabled: true,
  },
  {
    key: "signatures",
    name: "Signature pages",
    description: "Installer and customer signatures with timestamp and SHA256 hash",
    required: true,
    enabled: true,
  },
  {
    key: "warranty",
    name: "Warranty & maintenance",
    description: "Standard warranty terms and annual servicing schedule",
    required: false,
    enabled: true,
  },
  {
    key: "appendices",
    name: "Appendices",
    description: "EPC, risk assessments, F-Gas certificate, equipment manuals",
    required: false,
    enabled: true,
  },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ checked, disabled = false, onChange }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
      <div style={{ width: 34, height: 19, borderRadius: 10, background: checked ? "#7A8465" : "#DBD2C4", transition: "background .2s", display: "flex", alignItems: "center", padding: "0 2px" }}>
        <div style={{ width: 13, height: 13, background: "#fff", borderRadius: "50%", transform: checked ? "translateX(15px)" : "translateX(0)", transition: "transform .2s" }} />
      </div>
    </label>
  );
}

function SectionRow({ section, onChange }: {
  section: DocumentSectionConfig;
  onChange: (key: DocumentSectionKey, enabled: boolean) => void;
}) {
  const iconMap: Record<DocumentSectionKey, string> = {
    cover: "🎨", summary: "🏠", checklist: "✅", signatures: "✍", warranty: "🛡", appendices: "📎",
  };
  const bgMap: Record<DocumentSectionKey, { bg: string; color: string }> = {
    cover:      { bg: "#f0f1ec", color: "#7A8465" },
    summary:    { bg: "#e8edf5", color: "#3a5a8a" },
    checklist:  { bg: "#e8f5f0", color: "#2a7a5a" },
    signatures: { bg: "#f5f0e8", color: "#8a6a2a" },
    warranty:   { bg: "#f0edf8", color: "#6a4aaa" },
    appendices: { bg: "#fce8e8", color: "#8a3030" },
  };
  const colors = bgMap[section.key];

  return (
    <div style={css.sectionRow}>
      <div style={{ ...css.sectionIcon, background: colors.bg }}>
        <span style={{ fontSize: 14 }}>{iconMap[section.key]}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={css.sectionName}>
          {section.name}
          {section.required && (
            <span style={{ fontSize: 10, color: "#7A8465", marginLeft: 6, fontWeight: 700 }}>required</span>
          )}
        </div>
        <div style={css.sectionSub}>{section.description}</div>
      </div>
      {section.required ? (
        <span style={{ fontSize: 11, color: "#aaa", paddingRight: 4 }}>Always on</span>
      ) : (
        <Toggle checked={section.enabled} onChange={v => onChange(section.key, v)} />
      )}
    </div>
  );
}

function PrerequisiteRow({ prereq }: { prereq: Prerequisite }) {
  return (
    <div style={css.prereqRow}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: prereq.met ? "#e8f5f0" : "#fce8e8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12,
      }}>
        {prereq.met ? <span style={{ color: "#2a7a5a" }}>✓</span> : <span style={{ color: "#b03030" }}>○</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: prereq.met ? "#333" : "#888" }}>{prereq.label}</div>
        {!prereq.met && prereq.hint && (
          <div style={{ fontSize: 11, color: "#c07020", marginTop: 1 }}>{prereq.hint}</div>
        )}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
        background: prereq.met ? "#e8f5f0" : "#fce8e8",
        color: prereq.met ? "#2a7a5a" : "#b03030",
      }}>
        {prereq.met ? "Done" : "Pending"}
      </div>
    </div>
  );
}

function VersionRow({ doc, isLatest }: { doc: DocumentVersion; isLatest: boolean }) {
  return (
    <div data-testid="document-row" style={css.versionRow}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#7A8465", width: 28, flexShrink: 0 }}>
        v{doc.version}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#333" }}>{formatDate(doc.generatedAt)}</span>
          {isLatest && (
            <span style={{ fontSize: 10, fontWeight: 700, background: "#e8f5f0", color: "#2a7a5a", padding: "1px 6px", borderRadius: 8 }}>
              Latest
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#aaa" }}>
          {doc.generatedBy} · {formatBytes(doc.sizeBytes)}
        </div>
        <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace" }}>
          sha256: {doc.sha256Hash.slice(0, 8)}…
        </div>
      </div>
      <a
        href={doc.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={css.downloadBtn}
        aria-label={`Download v${doc.version}`}
      >
        ⬇
      </a>
    </div>
  );
}

function GenerateProgress({ step, pct }: { step: string; pct: number }) {
  return (
    <div style={{ minHeight: 360, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 12 }}>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #DBD2C4", width: "100%", maxWidth: 340, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 4 }}>
          Generating handover pack…
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>{step}</div>
        <div style={{ height: 5, background: "#f0f1ec", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", background: "#7A8465", borderRadius: 3, width: `${pct}%`, transition: "width .4s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>{pct}%</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentGenerator({
  projectId,
  projectName,
  customerName,
  projectAddress,
  currentStage,
  prerequisitesMet,
  onDocumentGenerated,
}: DocumentGeneratorProps) {
  const [sections, setSections] = useState<DocumentSectionConfig[]>(DEFAULT_SECTIONS);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);

  // Delivery options
  const [deliverEmail, setDeliverEmail] = useState(true);
  const [syncDrive, setSyncDrive] = useState(true);
  const [submitMCS, setSubmitMCS] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState("");
  const [genPct, setGenPct] = useState(0);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiGetVersionHistory(projectId)
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
  }, [projectId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const allPrerequisitesMet = prerequisitesMet.every(p => p.met);

  const handleSectionToggle = useCallback((key: DocumentSectionKey, enabled: boolean) => {
    setSections(prev => prev.map(s => s.key === key ? { ...s, enabled } : s));
  }, []);

  const enabledSections = sections.filter(s => s.enabled || s.required).map(s => s.key);

  // Simulate multi-step generation progress
  const handleGenerate = useCallback(async () => {
    if (!allPrerequisitesMet) return;
    setGenerating(true);

    const steps: { pct: number; msg: string }[] = [
      { pct: 10, msg: "Assembling project data" },
      { pct: 22, msg: "Rendering cover page" },
      { pct: 38, msg: "Populating checklist" },
      { pct: 55, msg: "Embedding signatures" },
      { pct: 70, msg: "Appending documents" },
      { pct: 85, msg: "Generating SHA256 hash" },
      { pct: 95, msg: "Uploading to S3" },
      { pct: 100, msg: "Syncing to Google Drive" },
    ];

    // Animate progress steps
    for (const step of steps) {
      setGenStep(step.msg);
      setGenPct(step.pct);
      await new Promise(r => setTimeout(r, step.pct === 100 ? 700 : 450));
    }

    try {
      const result = await apiGenerateDocument({
        projectId,
        sections: enabledSections,
        deliverByEmail: deliverEmail,
        syncToDrive: syncDrive,
        submitToMCS: submitMCS,
      });
      setVersions(prev => [result.document, ...prev]);
      onDocumentGenerated?.(result.document);
      setToast(`Handover pack v${result.document.version} generated and uploaded`);
    } catch {
      setToast("Generation failed — please try again");
    } finally {
      setGenerating(false);
      setGenPct(0);
      setGenStep("");
    }
  }, [allPrerequisitesMet, enabledSections, deliverEmail, syncDrive, submitMCS, projectId, onDocumentGenerated]);

  if (generating) {
    return (
      <div style={css.wrap}>
        <div style={css.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={css.logo}>RH</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Document Generator</div>
              <div style={{ fontSize: 11, color: "#aaa" }}>{projectName}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <GenerateProgress step={genStep} pct={genPct} />
        </div>
      </div>
    );
  }

  return (
    <div style={css.wrap}>
      {toast && <div style={css.toast}>{toast}</div>}

      <div style={css.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={css.logo}>RH</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Document Generator</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{projectName} — {customerName}</div>
          </div>
        </div>
        <span style={css.stageBadge}>{currentStage} stage</span>
      </div>

      <div style={css.layout}>
        {/* Left — config + preview */}
        <div style={css.main}>

          {/* Section toggles */}
          <div style={css.card}>
            <div style={css.cardHead}>
              <div>
                <div style={css.cardTitle}>Handover pack sections</div>
                <div style={css.cardSub}>Toggle optional sections to include in the generated PDF</div>
              </div>
            </div>
            <div style={css.cardBody}>
              {sections.map(s => (
                <SectionRow key={s.key} section={s} onChange={handleSectionToggle} />
              ))}
            </div>
          </div>

          {/* Prerequisites */}
          <div style={css.card}>
            <div style={css.cardHead}>
              <div style={css.cardTitle}>Generation prerequisites</div>
            </div>
            <div style={css.cardBody}>
              {prerequisitesMet.map(p => (
                <PrerequisiteRow key={p.key} prereq={p} />
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div style={css.card}>
            <div style={css.cardHead}>
              <div style={css.cardTitle}>Live preview</div>
              <span style={{ fontSize: 11, color: "#aaa" }}>Updates as you toggle sections</span>
            </div>
            <LivePreview
              sections={sections}
              customerName={customerName}
              address={projectAddress}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div style={css.sidebar}>

          {/* Generate button */}
          <div>
            <div style={css.sidebarLabel}>Generate</div>
            <button
              onClick={handleGenerate}
              disabled={!allPrerequisitesMet}
              style={{
                ...css.genBtn,
                ...(!allPrerequisitesMet ? css.genBtnDisabled : {}),
              }}
            >
              📄 Generate handover pack
            </button>
            <div style={{ fontSize: 11, marginTop: 8, textAlign: "center", color: allPrerequisitesMet ? "#3a7a43" : "#aaa" }}>
              {allPrerequisitesMet
                ? "All prerequisites met — ready to generate"
                : `${prerequisitesMet.filter(p => !p.met).length} prerequisite${prerequisitesMet.filter(p => !p.met).length !== 1 ? "s" : ""} outstanding`}
            </div>
          </div>

          {/* Delivery options */}
          <div style={css.card}>
            <div style={css.cardHead}><div style={css.cardTitle}>Delivery</div></div>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#888" }}>Once generated, send to:</div>
              {[
                { label: "Email to customer", value: deliverEmail, set: setDeliverEmail },
                { label: "Sync to Google Drive", value: syncDrive, set: setSyncDrive },
                { label: "Submit to MCS portal", value: submitMCS, set: setSubmitMCS },
              ].map(opt => (
                <label key={opt.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={opt.value}
                    onChange={e => opt.set(e.target.checked)}
                    style={{ accentColor: "#7A8465" }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Version history */}
          <div style={css.card}>
            <div style={css.cardHead}><div style={css.cardTitle}>Version history</div></div>
            <div style={{ padding: "10px 16px" }}>
              {loadingVersions ? (
                <div style={{ fontSize: 12, color: "#aaa", padding: "8px 0" }}>Loading…</div>
              ) : versions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#aaa", padding: "8px 0" }}>No documents generated yet.</div>
              ) : (
                versions.map((v, i) => (
                  <VersionRow key={v.id} doc={v} isLatest={i === 0} />
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Live preview panel ───────────────────────────────────────────────────────
// Renders a condensed visual replica of the PDF inside the UI.

function LivePreview({ sections, customerName, address }: {
  sections: DocumentSectionConfig[];
  customerName: string;
  address: string;
}) {
  const on = (key: DocumentSectionKey) => sections.find(s => s.key === key)?.enabled || sections.find(s => s.key === key)?.required || false;

  return (
    <div style={{ background: "#fff" }}>
      {on("cover") && (
        <div style={{ background: "#7A8465", padding: "24px 20px 20px" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>
            MCS Handover Pack
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{address}</div>
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[customerName, "RISO HOME", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })].map(m => (
              <span key={m} style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>{m}</span>
            ))}
          </div>
        </div>
      )}
      {on("summary") && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f1ec" }}>
          <div style={css.previewSecTitle}>🏠 Project summary</div>
          {[["System type", "Air source heat pump"], ["Model", "Vaillant aroTHERM plus 7kW"], ["Flow temp", "45°C"], ["Design COP", "3.2"]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", borderBottom: "1px solid #f8f8f5" }}>
              <span style={{ color: "#888" }}>{l}</span>
              <span style={{ fontWeight: 500, color: "#333" }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {on("checklist") && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f1ec" }}>
          <div style={css.previewSecTitle}>✅ Commissioning checklist</div>
          {[
            { ok: true, na: false, l: "Site survey completed" },
            { ok: true, na: false, l: "Heat loss calculation performed" },
            { ok: false, na: true, l: "Buffer vessel — low-loss header fitted" },
            { ok: true, na: false, l: "Unit installed per manufacturer spec" },
            { ok: false, na: true, l: "F-Gas — monoblock unit, not applicable" },
          ].map(item => (
            <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "2px 0" }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                background: item.na ? "#f0edf8" : "#e8f5f0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: item.na ? "#6a4aaa" : "#2a7a5a",
              }}>
                {item.na ? "—" : "✓"}
              </div>
              <span style={{ color: item.na ? "#888" : "#333" }}>{item.l}</span>
            </div>
          ))}
        </div>
      )}
      {on("signatures") && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f1ec" }}>
          <div style={css.previewSecTitle}>✍ Signatures</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { name: "Callum Reid", role: "MCS Installer", signed: true },
              { name: customerName, role: "Customer", signed: false },
            ].map(sig => (
              <div key={sig.name} style={{ border: "1px solid #DBD2C4", borderRadius: 8, padding: "8px 10px", background: "#fafaf8" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#333" }}>{sig.name}</div>
                <div style={{ fontSize: 10, color: "#aaa" }}>{sig.role}</div>
                <div style={{ height: 24, borderBottom: sig.signed ? "none" : "1px dashed #DBD2C4", margin: "6px 0 3px", fontSize: 11, color: "#7A8465", fontStyle: "italic" }}>
                  {sig.signed ? "Signed ✓" : "Awaiting…"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {on("warranty") && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f1ec" }}>
          <div style={css.previewSecTitle}>🛡 Warranty & maintenance</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
            5-year manufacturer warranty. Annual servicing recommended to maintain MCS compliance and warranty validity.
          </div>
        </div>
      )}
      {on("appendices") && (
        <div style={{ padding: "12px 20px" }}>
          <div style={css.previewSecTitle}>📎 Appendices</div>
          {["EPC Certificate (B rating)", "HeatEngineer heat loss report v2", "Risk assessment v1", "Electrical installation certificate"].map(a => (
            <div key={a} style={{ fontSize: 12, color: "#555", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#aaa" }}>📄</span>{a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "'Satoshi', sans-serif", background: "#F5F5F2", color: "#333", borderRadius: 12, overflow: "hidden", position: "relative" },
  toast: { position: "absolute", top: 12, right: 12, zIndex: 50, background: "#333", color: "#fff", fontSize: 12, fontWeight: 500, padding: "8px 16px", borderRadius: 8 },
  header: { background: "#fff", borderBottom: "1px solid #DBD2C4", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  logo: { width: 32, height: 32, background: "#7A8465", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  stageBadge: { fontSize: 12, color: "#7A8465", background: "#f0f1ec", padding: "4px 12px", borderRadius: 20, fontWeight: 500 },
  layout: { display: "grid", gridTemplateColumns: "1fr 300px" },
  main: { padding: 24, display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid #DBD2C4" },
  sidebar: { padding: 20, display: "flex", flexDirection: "column", gap: 14, background: "#fff" },
  sidebarLabel: { fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #DBD2C4", overflow: "hidden" },
  cardHead: { padding: "12px 16px", borderBottom: "1px solid #f0f1ec", display: "flex", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#333" },
  cardSub: { fontSize: 11, color: "#aaa", marginTop: 2 },
  cardBody: { display: "flex", flexDirection: "column" },
  sectionRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f5f5f2" },
  sectionIcon: { width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sectionName: { fontSize: 13, fontWeight: 500, color: "#333", flex: 1 },
  sectionSub: { fontSize: 11, color: "#aaa", marginTop: 1 },
  prereqRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid #f5f5f2" },
  genBtn: { fontFamily: "'Satoshi', sans-serif", fontSize: 13, fontWeight: 700, padding: "11px 0", borderRadius: 10, border: "none", background: "#7A8465", color: "#fff", cursor: "pointer", width: "100%" },
  genBtnDisabled: { background: "#C9C8BE", cursor: "not-allowed" },
  versionRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f5f5f2" },
  downloadBtn: { fontSize: 14, color: "#aaa", textDecoration: "none", padding: "4px 7px", border: "1px solid #DBD2C4", borderRadius: 6 },
  previewSecTitle: { fontSize: 11, fontWeight: 700, color: "#7A8465", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 },
};
