import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import TwoFactorSetupPanel from "./TwoFactorSetupPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgSettings {
  companyName: string;
  tagline: string;
  primaryColor: string;
  mcsNumber: string;
  registeredAddress: string;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  complianceAlerts: boolean;
  signOffReminders: boolean;
  weeklyDigest: boolean;
}

export interface DocumentSettings {
  includeCoverPage: boolean;
  includeCommissioningChecklist: boolean;
  includeSignaturePages: boolean;
  includeWarrantySection: boolean;
  includeAppendices: boolean;
}

export interface AgentSettings {
  workflowAgentEnabled: boolean;
  complianceAgentEnabled: boolean;
  reminderAgentEnabled: boolean; // Phase 2 — off by default
}

export interface SignatureSettings {
  deliveryMethod: "email" | "sms" | "both";
  linkExpiryMinutes: 10 | 15 | 30 | 60;
  captureGPS: boolean;
}

export interface StorageSettings {
  s3Bucket: string;
  presignExpiryMinutes: 15 | 30 | 60;
  googleDriveFolderId: string;
}

export type RetentionYears = "3" | "5" | "7" | "10" | "15";

export interface RetentionSettings {
  projectRecordYears: RetentionYears;
  auditLogYears: RetentionYears;
  gdprErasureEnabled: boolean;
}

export interface IntegrationSettings {
  heatEngineer: boolean;
  busChecker: boolean;
  googleDriveSync: boolean;
}

export interface SecuritySettings {
  twoFaAllUsers: boolean;
  sessionTimeoutMinutes: 15 | 30 | 60 | 240;
  ipAllowlist: string[];
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
}

export interface AllSettings {
  org: OrgSettings;
  notifications: NotificationSettings;
  documents: DocumentSettings;
  agents: AgentSettings;
  signatures: SignatureSettings;
  storage: StorageSettings;
  retention: RetentionSettings;
  integrations: IntegrationSettings;
  security: SecuritySettings;
}

type SettingsSection =
  | "branding"
  | "notifications"
  | "documents"
  | "agents"
  | "signatures"
  | "storage"
  | "retention"
  | "integrations"
  | "security"
  | "auditlog"
  | "danger";

type DangerAction = "export" | "resetAudit" | "deleteOrg";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: AllSettings = {
  org: {
    companyName: "RISO HOME",
    tagline: "Smart heat pump compliance.",
    primaryColor: "#7A8465",
    mcsNumber: "",
    registeredAddress: "",
  },
  notifications: {
    emailNotifications: true,
    inAppNotifications: true,
    complianceAlerts: true,
    signOffReminders: true,
    weeklyDigest: false,
  },
  documents: {
    includeCoverPage: true,
    includeCommissioningChecklist: true,
    includeSignaturePages: true,
    includeWarrantySection: true,
    includeAppendices: true,
  },
  agents: {
    workflowAgentEnabled: true,
    complianceAgentEnabled: true,
    reminderAgentEnabled: false, // Phase 2
  },
  signatures: {
    deliveryMethod: "email",
    linkExpiryMinutes: 15,
    captureGPS: false,
  },
  storage: {
    s3Bucket: "riso-hub-prod-eu-west-2",
    presignExpiryMinutes: 30,
    googleDriveFolderId: "",
  },
  retention: {
    projectRecordYears: "7",
    auditLogYears: "10",
    gdprErasureEnabled: true,
  },
  integrations: {
    heatEngineer: false,
    busChecker: false,
    googleDriveSync: false,
  },
  security: {
    twoFaAllUsers: false,
    sessionTimeoutMinutes: 60,
    ipAllowlist: [],
  },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiGetSettings(): Promise<AllSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function apiSaveSection<K extends keyof AllSettings>(
  section: K,
  data: AllSettings[K]
): Promise<void> {
  const res = await fetch(`/api/settings/${section}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

async function apiGetAuditLog(limit = 50): Promise<AuditEntry[]> {
  const res = await fetch(`/api/audit-log?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load audit log");
  const data = await res.json();
  return data.map((e: AuditEntry & { timestamp: string }) => ({
    ...e,
    timestamp: new Date(e.timestamp),
  }));
}

async function apiExportData(): Promise<void> {
  const res = await fetch("/api/settings/export", { method: "POST" });
  if (!res.ok) throw new Error("Export request failed");
}

async function apiResetAuditLog(): Promise<void> {
  const res = await fetch("/api/settings/reset-audit-log", { method: "POST" });
  if (!res.ok) throw new Error("Audit log reset failed");
}

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV_GROUPS: { group: string; items: { key: SettingsSection; label: string; icon: string }[] }[] = [
  {
    group: "Organisation",
    items: [
      { key: "branding", label: "Branding", icon: "🎨" },
      { key: "notifications", label: "Notifications", icon: "🔔" },
      { key: "documents", label: "Documents", icon: "📄" },
    ],
  },
  {
    group: "Automation",
    items: [
      { key: "agents", label: "Agents", icon: "🤖" },
      { key: "signatures", label: "Signatures", icon: "✍" },
    ],
  },
  {
    group: "Compliance",
    items: [
      { key: "storage", label: "Storage", icon: "🗄" },
      { key: "retention", label: "Data retention", icon: "📦" },
      { key: "integrations", label: "Integrations", icon: "🔌" },
    ],
  },
  {
    group: "System",
    items: [
      { key: "security", label: "Security", icon: "🔒" },
      { key: "auditlog", label: "Audit log", icon: "📋" },
      { key: "danger", label: "Danger zone", icon: "⚠" },
    ],
  },
];

// ─── Danger zone action definitions ──────────────────────────────────────────

interface DangerDef {
  title: string;
  body: string;
  confirmWord: string | null; // null = no typing required
  confirmLabel: string | null;
  buttonLabel: string;
}

const DANGER_DEFS: Record<DangerAction, DangerDef> = {
  export: {
    title: "Export all data",
    body: "A complete archive of all projects, files, signatures, and audit logs will be prepared and emailed to the admin address on file. This may take up to 30 minutes.",
    confirmWord: null,
    confirmLabel: null,
    buttonLabel: "Queue export",
  },
  resetAudit: {
    title: "Reset audit log",
    body: "This will permanently delete all audit log entries. This action cannot be undone and is only available in staging environments — it is disabled in production.",
    confirmWord: "RESET",
    confirmLabel: 'Type RESET to confirm',
    buttonLabel: "Reset audit log",
  },
  deleteOrg: {
    title: "Delete organisation",
    body: "This will permanently delete RISO HOME — all projects, files, users, audit records, and generated documents. There is absolutely no recovery. Contact support if you are unsure.",
    confirmWord: "DELETE",
    confirmLabel: 'Type DELETE to confirm',
    buttonLabel: "Delete organisation",
  },
};

// ─── Shared primitives ────────────────────────────────────────────────────────

function Toggle({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
      />
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? "#7A8465" : "#DBD2C4",
          transition: "background .2s",
          display: "flex",
          alignItems: "center",
          padding: "0 3px",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            background: "#fff",
            borderRadius: "50%",
            transform: checked ? "translateX(16px)" : "translateX(0)",
            transition: "transform .2s",
          }}
        />
      </div>
    </label>
  );
}

function SegBar<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", border: "1px solid #DBD2C4", borderRadius: 8, overflow: "hidden" }}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "'Satoshi', sans-serif",
            background: o.value === value ? "#7A8465" : "transparent",
            color: o.value === value ? "#fff" : "#888",
            border: "none",
            borderRight: i < options.length - 1 ? "1px solid #DBD2C4" : "none",
            cursor: "pointer",
            transition: "all .15s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RowItem({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={css.row}>
      <div>
        <div style={css.rowLabel}>{label}</div>
        {sub && <div style={css.rowSub}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={css.fieldLabel}>{children}</label>;
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        fontFamily: "'Satoshi', sans-serif",
        fontSize: 13,
        padding: "8px 11px",
        border: "1px solid #DBD2C4",
        borderRadius: 8,
        color: "#333",
        background: "#fff",
        outline: "none",
        ...(props.style ?? {}),
      }}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        fontFamily: "'Satoshi', sans-serif",
        fontSize: 13,
        padding: "8px 11px",
        border: "1px solid #DBD2C4",
        borderRadius: 8,
        color: "#333",
        background: "#fff",
        outline: "none",
        resize: "vertical",
        minHeight: 68,
        ...(props.style ?? {}),
      }}
    />
  );
}

function SectionCard({
  title,
  sub,
  danger = false,
  action,
  children,
}: {
  title: string;
  sub?: string;
  danger?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...css.card, ...(danger ? css.dangerCard : {}) }}>
      <div style={css.cardHead}>
        <div>
          <div style={{ ...css.cardTitle, ...(danger ? { color: "#b03030" } : {}) }}>{title}</div>
          {sub && <div style={css.cardSub}>{sub}</div>}
        </div>
        {action}
      </div>
      <div style={css.cardBody}>{children}</div>
    </div>
  );
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button onClick={onClick} disabled={saving} style={css.saveBtn}>
      {saving ? "Saving…" : "Save changes"}
    </button>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#f0f1ec", borderRadius: 8, padding: "10px 13px", fontSize: 12, color: "#5a6348" }}>
      {children}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
  confirming,
}: {
  action: DangerAction;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const def = DANGER_DEFS[action];
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (def.confirmWord && inputRef.current) inputRef.current.focus();
  }, [def.confirmWord]);

  const canConfirm = def.confirmWord ? typed === def.confirmWord : true;

  return (
    // Faux viewport so the dialog occupies layout height correctly
    <div
      style={{
        minHeight: 420,
        background: "rgba(0,0,0,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #DBD2C4",
          width: "100%",
          maxWidth: 400,
          overflow: "hidden",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={def.title}
      >
        {/* Head */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid #f0f1ec",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#fce8e8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b03030",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            ⚠
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{def.title}</div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", fontSize: 13, color: "#555", lineHeight: 1.65 }}>
          {def.body}
        </div>

        {/* Confirm word input */}
        {def.confirmWord && (
          <div style={{ padding: "0 20px 16px" }}>
            <FieldLabel>{def.confirmLabel}</FieldLabel>
            <Inp
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={def.confirmWord}
              style={{
                borderColor: typed && typed !== def.confirmWord ? "#e8a0a0" : "#DBD2C4",
              }}
            />
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #f0f1ec",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onCancel} style={css.btnCancel}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || confirming}
            style={{
              ...css.btnConfirm,
              ...((!canConfirm || confirming) ? { background: "#ddd", color: "#aaa", cursor: "default" } : {}),
            }}
          >
            {confirming ? "Working…" : def.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section panels ───────────────────────────────────────────────────────────

function BrandingPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: OrgSettings;
  onChange: (d: OrgSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (k: keyof OrgSettings, v: string) => onChange({ ...data, [k]: v });

  return (
    <SectionCard
      title="Organisation branding"
      sub="Used on all generated documents and handover packs"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      {/* Live preview */}
      <div style={css.brandPreview}>
        <div style={{ ...css.previewLogo, background: data.primaryColor }}>RH</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>{data.companyName || "Company name"}</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>{data.tagline || "Tagline"}</div>
        </div>
      </div>

      <div style={css.fieldRow}>
        <div>
          <FieldLabel>Company name</FieldLabel>
          <Inp value={data.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="RISO HOME" />
        </div>
        <div>
          <FieldLabel>Tagline</FieldLabel>
          <Inp value={data.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Smart heat pump compliance." />
        </div>
      </div>

      <div>
        <FieldLabel>Primary colour</FieldLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{ width: 28, height: 28, borderRadius: 6, background: data.primaryColor, border: "1px solid #DBD2C4", cursor: "pointer", flexShrink: 0 }}
            onClick={() => document.getElementById("colorPickInput")?.click()}
          />
          <Inp
            value={data.primaryColor}
            onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set("primaryColor", e.target.value); }}
            style={{ width: 110 }}
            maxLength={7}
            placeholder="#7A8465"
          />
          <input
            id="colorPickInput"
            type="color"
            value={data.primaryColor}
            onChange={(e) => set("primaryColor", e.target.value)}
            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
          />
        </div>
      </div>

      <div style={css.fieldRow}>
        <div>
          <FieldLabel>MCS certificate number</FieldLabel>
          <Inp value={data.mcsNumber} onChange={(e) => set("mcsNumber", e.target.value)} placeholder="MCS-XXXX-XXXX" />
        </div>
        <div>
          <FieldLabel>Registered address (PDF footers)</FieldLabel>
          <Textarea value={data.registeredAddress} onChange={(e) => set("registeredAddress", e.target.value)} placeholder="Company registered address" />
        </div>
      </div>
    </SectionCard>
  );
}

function NotificationsPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: NotificationSettings;
  onChange: (d: NotificationSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const rows: { key: keyof NotificationSettings; label: string; sub: string }[] = [
    { key: "emailNotifications", label: "Email notifications", sub: "Send emails for project updates and stage changes" },
    { key: "inAppNotifications", label: "In-app notifications", sub: "Show the notification bell and live alert feed" },
    { key: "complianceAlerts", label: "Compliance alerts", sub: "Notify team when a checklist item is non-compliant" },
    { key: "signOffReminders", label: "Sign-off reminders", sub: "Remind customers when their signature is pending" },
    { key: "weeklyDigest", label: "Weekly digest", sub: "Summary email every Monday morning for all admins" },
  ];

  return (
    <SectionCard
      title="Notification preferences"
      sub="Controls what triggers alerts across your team"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      {rows.map((r) => (
        <RowItem key={r.key} label={r.label} sub={r.sub}>
          <Toggle checked={data[r.key]} onChange={(v) => onChange({ ...data, [r.key]: v })} />
        </RowItem>
      ))}
    </SectionCard>
  );
}

function DocumentsPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: DocumentSettings;
  onChange: (d: DocumentSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const rows: { key: keyof DocumentSettings; label: string; sub: string }[] = [
    { key: "includeCoverPage", label: "Cover page", sub: "Branded RH cover with customer name, address, and date" },
    { key: "includeCommissioningChecklist", label: "Commissioning checklist", sub: "Auto-filled MCS checklist with completion status" },
    { key: "includeSignaturePages", label: "Signature pages", sub: "Installer and customer signatures with timestamp and SHA256 hash" },
    { key: "includeWarrantySection", label: "Warranty & maintenance", sub: "Standard warranty terms and annual servicing guidance" },
    { key: "includeAppendices", label: "Appendices", sub: "EPC certificate, risk assessments, and equipment manuals" },
  ];

  return (
    <SectionCard
      title="Handover pack sections"
      sub="Choose which sections appear in generated PDF handover packs"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      {rows.map((r) => (
        <RowItem key={r.key} label={r.label} sub={r.sub}>
          <Toggle checked={data[r.key]} onChange={(v) => onChange({ ...data, [r.key]: v })} />
        </RowItem>
      ))}
    </SectionCard>
  );
}

function AgentsPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: AgentSettings;
  onChange: (d: AgentSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const agents: {
    key: keyof AgentSettings;
    name: string;
    sub: string;
    phase: "live" | "phase2";
  }[] = [
    {
      key: "workflowAgentEnabled",
      name: "Workflow agent",
      sub: "Listens to checklist.completed, signatures.captured, handover.generated — auto-advances project status",
      phase: "live",
    },
    {
      key: "complianceAgentEnabled",
      name: "Compliance agent",
      sub: "Listens to document.uploaded and checklist.updated — checks MIS 3005 rules, emits reminder.nonCompliant",
      phase: "live",
    },
    {
      key: "reminderAgentEnabled",
      name: "Reminder agent",
      sub: "Time-based alerts via scheduled jobs — Phase 2 feature, disabled by default (reminders.json: enabled: false)",
      phase: "phase2",
    },
  ];

  return (
    <SectionCard
      title="Agent controls"
      sub="Manage the three RabbitMQ-connected background automation agents"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      {agents.map((a) => {
        const on = data[a.key];
        return (
          <div
            key={a.key}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #f5f5f2" }}
          >
            <div
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: on ? "#5a9a62" : "#ccc",
                flexShrink: 0, marginTop: 1,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>
                {a.name}
                <span
                  style={{
                    fontSize: 10, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 10,
                    marginLeft: 7,
                    background: a.phase === "live" ? "#e8f5f0" : "#fef3e2",
                    color: a.phase === "live" ? "#2a7a5a" : "#8a6020",
                  }}
                >
                  {a.phase === "live" ? "Running" : "Phase 2"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{a.sub}</div>
            </div>
            <Toggle checked={on} onChange={(v) => onChange({ ...data, [a.key]: v })} />
          </div>
        );
      })}
      <InfoBox>
        All agent actions are logged in AuditLog identically to human actions. Disabling an agent stops it consuming events from RabbitMQ but does not drain the queue.
      </InfoBox>
    </SectionCard>
  );
}

function SignaturesPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: SignatureSettings;
  onChange: (d: SignatureSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <SectionCard
      title="Signature settings"
      sub="Controls for the digital signature and customer sign-off workflow"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      <RowItem label="Customer delivery method" sub="How signing links are sent to customers (no RISO HUB login required)">
        <select
          value={data.deliveryMethod}
          onChange={(e) => onChange({ ...data, deliveryMethod: e.target.value as SignatureSettings["deliveryMethod"] })}
          style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 13, padding: "7px 10px", border: "1px solid #DBD2C4", borderRadius: 8, color: "#333", background: "#fff", outline: "none" }}
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="both">Email + SMS</option>
        </select>
      </RowItem>

      <div>
        <FieldLabel>Signing link expiry</FieldLabel>
        <SegBar
          options={[
            { label: "10 min", value: 10 as const },
            { label: "15 min", value: 15 as const },
            { label: "30 min", value: 30 as const },
            { label: "60 min", value: 60 as const },
          ]}
          value={data.linkExpiryMinutes}
          onChange={(v) => onChange({ ...data, linkExpiryMinutes: v })}
        />
      </div>

      <RowItem label="Capture GPS coordinates" sub="Record device location metadata with each signature (customer consent shown)">
        <Toggle checked={data.captureGPS} onChange={(v) => onChange({ ...data, captureGPS: v })} />
      </RowItem>

      <InfoBox>
        Each signing session uses a one-time token. Signature data is Base64-encoded, embedded into the PDF, and a new SHA256 hash is written to the Signatures table.
      </InfoBox>
    </SectionCard>
  );
}

function StoragePanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: StorageSettings;
  onChange: (d: StorageSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <SectionCard
      title="Storage configuration"
      sub="Primary S3 storage and Google Drive async sync settings"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      <div style={css.fieldRow}>
        <div>
          <FieldLabel>S3 bucket name</FieldLabel>
          <Inp
            value={data.s3Bucket}
            onChange={(e) => onChange({ ...data, s3Bucket: e.target.value })}
            placeholder="your-bucket-name-eu-west-2"
          />
        </div>
        <div>
          <FieldLabel>Presigned URL expiry</FieldLabel>
          <SegBar
            options={[
              { label: "15 min", value: 15 as const },
              { label: "30 min", value: 30 as const },
              { label: "60 min", value: 60 as const },
            ]}
            value={data.presignExpiryMinutes}
            onChange={(v) => onChange({ ...data, presignExpiryMinutes: v })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>
          Google Drive folder ID{" "}
          <span style={{ fontSize: 10, fontWeight: 400, color: "#bbb", textTransform: "none" }}>
            (service account — file.create + file.readonly scope)
          </span>
        </FieldLabel>
        <Inp
          value={data.googleDriveFolderId}
          onChange={(e) => onChange({ ...data, googleDriveFolderId: e.target.value })}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      <InfoBox>
        S3 is the authoritative source for all system operations. Google Drive sync is async — Drive failures do not block uploads or interrupt the user workflow.
      </InfoBox>
    </SectionCard>
  );
}

function RetentionPanel({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: RetentionSettings;
  onChange: (d: RetentionSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <SectionCard
      title="Data retention"
      sub="MCS requires 7-year project records and 10-year audit logs minimum"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      <div style={{ paddingBottom: 14, borderBottom: "1px solid #f5f5f2" }}>
        <div style={css.rowLabel}>Project records</div>
        <div style={{ ...css.rowSub, marginBottom: 10 }}>Files, checklists, signatures, and generated documents</div>
        <SegBar
          options={[
            { label: "3 yrs", value: "3" as RetentionYears },
            { label: "5 yrs", value: "5" as RetentionYears },
            { label: "7 yrs", value: "7" as RetentionYears },
            { label: "10 yrs", value: "10" as RetentionYears },
          ]}
          value={data.projectRecordYears}
          onChange={(v) => onChange({ ...data, projectRecordYears: v })}
        />
      </div>

      <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: "1px solid #f5f5f2" }}>
        <div style={css.rowLabel}>Audit logs</div>
        <div style={{ ...css.rowSub, marginBottom: 10 }}>All system actions — append-only WORM policy, non-PII</div>
        <SegBar
          options={[
            { label: "5 yrs", value: "5" as RetentionYears },
            { label: "7 yrs", value: "7" as RetentionYears },
            { label: "10 yrs", value: "10" as RetentionYears },
            { label: "15 yrs", value: "15" as RetentionYears },
          ]}
          value={data.auditLogYears}
          onChange={(v) => onChange({ ...data, auditLogYears: v })}
        />
      </div>

      <RowItem label="GDPR erasure requests" sub="30-day soft delete (reversible), then hard delete and anonymisation">
        <Toggle checked={data.gdprErasureEnabled} onChange={(v) => onChange({ ...data, gdprErasureEnabled: v })} />
      </RowItem>
    </SectionCard>
  );
}

function IntegrationsPanel({
  data,
  onChange,
}: {
  data: IntegrationSettings;
  onChange: (d: IntegrationSettings) => void;
}) {
  const items: { key: keyof IntegrationSettings; label: string; sub: string; phase: "live" | "phase3" }[] = [
    { key: "heatEngineer", label: "HeatEngineer", sub: "Import heat loss calculation outputs directly via API connector", phase: "phase3" },
    { key: "busChecker", label: "BUS eligibility checker", sub: "Boiler Upgrade Scheme pre-application verification helper", phase: "phase3" },
    { key: "googleDriveSync", label: "Google Drive sync", sub: "Async copy-on-upload to Drive service account folder", phase: "live" },
  ];

  return (
    <SectionCard title="Integrations" sub="Connect external services to RISO HUB">
      {items.map((item) => (
        <RowItem key={item.key} label={item.label} sub={item.sub}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                background: item.phase === "live" ? "#e8f5f0" : "#f5f5f2",
                color: item.phase === "live" ? "#2a7a5a" : "#aaa",
              }}
            >
              {item.phase === "live" ? "Available" : "Phase 3"}
            </span>
            <Toggle checked={data[item.key]} onChange={(v) => onChange({ ...data, [item.key]: v })} />
          </div>
        </RowItem>
      ))}
    </SectionCard>
  );
}

function SecurityPanel({
  data,
  onChange,
  onSave,
  saving,
  token,
}: {
  data: SecuritySettings;
  onChange: (d: SecuritySettings) => void;
  onSave: () => void;
  saving: boolean;
  token: string;
}) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTwoFactorEnabled(!!d.twoFactorEnabled))
      .catch(() => {});
  }, [token]);

  return (
    <SectionCard
      title="Security"
      sub="Authentication and session management controls"
      action={<SaveBtn onClick={onSave} saving={saving} />}
    >
      <RowItem label="Require 2FA for admins" sub="Mandatory — enforced by system, cannot be disabled">
        <Toggle checked={true} disabled onChange={() => {}} />
      </RowItem>

      <RowItem label="Require 2FA for all users" sub="Extends mandatory 2FA to Surveyors, Installers, and Auditors">
        <Toggle checked={data.twoFaAllUsers} onChange={(v) => onChange({ ...data, twoFaAllUsers: v })} />
      </RowItem>

      <div>
        <FieldLabel>Session timeout</FieldLabel>
        <SegBar
          options={[
            { label: "15 min", value: 15 as const },
            { label: "30 min", value: 30 as const },
            { label: "60 min", value: 60 as const },
            { label: "4 hrs", value: 240 as const },
          ]}
          value={data.sessionTimeoutMinutes}
          onChange={(v) => onChange({ ...data, sessionTimeoutMinutes: v })}
        />
      </div>

      <div>
        <FieldLabel>
          IP allowlist{" "}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#888", textTransform: "none" }}>
            (optional — CIDR notation, one per line; empty = allow all)
          </span>
        </FieldLabel>
        <Textarea
          value={data.ipAllowlist.join("\n")}
          onChange={(e) =>
            onChange({
              ...data,
              ipAllowlist: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean),
            })
          }
          placeholder={"Leave blank to allow all IPs\n192.168.1.0/24\n10.0.0.1"}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      {twoFactorEnabled !== null && (
        <div>
          <FieldLabel>Your two-factor authentication</FieldLabel>
          <TwoFactorSetupPanel
            enabled={twoFactorEnabled}
            onStatusChange={setTwoFactorEnabled}
          />
        </div>
      )}
    </SectionCard>
  );
}

function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetAuditLog()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function formatTime(d: Date): string {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  return (
    <SectionCard
      title="Recent audit log"
      sub="Last 50 entries — append-only, SHA256 checksummed, WORM policy in S3"
      action={
        <button
          style={{ fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 8, border: "1px solid #DBD2C4", background: "#fff", color: "#555", cursor: "pointer" }}
          onClick={() => window.open("/api/audit-log/export?format=csv")}
        >
          Download CSV
        </button>
      }
    >
      {/* Column headers */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "72px 1fr 100px",
          gap: 10, paddingBottom: 8, borderBottom: "1px solid #DBD2C4",
          fontSize: 11, fontWeight: 700, color: "#999",
          textTransform: "uppercase", letterSpacing: ".06em",
        }}
      >
        <div>Time</div>
        <div>Action</div>
        <div style={{ textAlign: "right" }}>User</div>
      </div>

      {loading ? (
        <div style={{ color: "#aaa", fontSize: 13, padding: "16px 0" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: "#aaa", fontSize: 13, padding: "16px 0" }}>No audit entries yet.</div>
      ) : (
        entries.map((e) => (
          <div
            key={e.id}
            style={{ display: "grid", gridTemplateColumns: "72px 1fr 100px", gap: 10, padding: "8px 0", borderBottom: "1px solid #f5f5f2", alignItems: "start" }}
          >
            <div style={{ fontSize: 11, color: "#aaa" }}>{formatTime(e.timestamp)}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#333" }}>{e.action}</div>
            <div style={{ fontSize: 11, color: "#7A8465", textAlign: "right" }}>{e.userName}</div>
          </div>
        ))
      )}
    </SectionCard>
  );
}

function DangerPanel({
  onAction,
}: {
  onAction: (a: DangerAction) => void;
}) {
  const items: { id: DangerAction; label: string; sub: string; btnLabel: string }[] = [
    { id: "export", label: "Export all data", sub: "Download a full archive of projects, files, and audit logs — emailed when ready", btnLabel: "Export" },
    { id: "resetAudit", label: "Reset audit log", sub: "Clears test/staging data only — disabled in production environments", btnLabel: "Reset log" },
    { id: "deleteOrg", label: "Delete organisation", sub: "Permanently removes all data, users, and projects — contact support to action", btnLabel: "Delete org" },
  ];

  return (
    <SectionCard title="Danger zone" sub="Irreversible actions — all require confirmation" danger>
      {items.map((item) => (
        <RowItem key={item.id} label={item.label} sub={item.sub}>
          <button onClick={() => onAction(item.id)} style={css.dangerBtn}>
            {item.btnLabel}
          </button>
        </RowItem>
      ))}
    </SectionCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { accessToken } = useAuth();
  const [settings, setSettings] = useState<AllSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SettingsSection>("branding");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Danger confirm state
  const [pendingAction, setPendingAction] = useState<DangerAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    apiGetSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const save = useCallback(
    async <K extends keyof AllSettings>(key: K, data: AllSettings[K]) => {
      setSaving(true);
      try {
        await apiSaveSection(key, data);
        setSettings((prev) => ({ ...prev, [key]: data }));
        setToast("Settings saved");
      } catch {
        setToast("Could not save — please try again");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const handleDangerConfirm = useCallback(async () => {
    if (!pendingAction) return;
    setConfirming(true);
    try {
      if (pendingAction === "export") await apiExportData();
      if (pendingAction === "resetAudit") await apiResetAuditLog();
      if (pendingAction === "deleteOrg") {
        // Hard-guard: redirect to support rather than API call
        window.location.href = "mailto:support@risohome.co.uk?subject=Delete organisation request";
        return;
      }
      setToast(
        pendingAction === "export"
          ? "Export queued — check your email shortly"
          : "Audit log reset successfully"
      );
    } catch {
      setToast("Action failed — please try again");
    } finally {
      setConfirming(false);
      setPendingAction(null);
    }
  }, [pendingAction]);

  // If a danger confirm is open, render it full-screen in place of the layout
  if (pendingAction) {
    return (
      <div style={css.wrap}>
        {toast && <div style={css.toast}>{toast}</div>}
        <div style={css.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={css.logo}>RH</div>
            <span style={css.headerTitle}>Settings</span>
          </div>
          <span style={css.adminTag}>Admin only</span>
        </div>
        <ConfirmDialog
          action={pendingAction}
          onConfirm={handleDangerConfirm}
          onCancel={() => setPendingAction(null)}
          confirming={confirming}
        />
      </div>
    );
  }

  return (
    <div style={css.wrap}>
      {toast && <div style={css.toast}>{toast}</div>}

      <div style={css.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={css.logo}>RH</div>
          <span style={css.headerTitle}>Settings</span>
        </div>
        <span style={css.adminTag}>Admin only</span>
      </div>

      <div style={css.layout}>
        {/* Sidebar */}
        <nav style={css.sidebar} aria-label="Settings navigation">
          {NAV_GROUPS.map((grp) => (
            <div key={grp.group}>
              <div style={css.navGroup}>{grp.group}</div>
              {grp.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  style={{ ...css.navItem, ...(section === item.key ? css.navItemActive : {}) }}
                  aria-current={section === item.key ? "page" : undefined}
                >
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Content */}
        <main style={css.content}>
          {loading ? (
            <div style={{ color: "#aaa", fontSize: 13 }}>Loading settings…</div>
          ) : (
            <>
              {section === "branding" && (
                <BrandingPanel data={settings.org} onChange={(d) => setSettings((p) => ({ ...p, org: d }))} onSave={() => save("org", settings.org)} saving={saving} />
              )}
              {section === "notifications" && (
                <NotificationsPanel data={settings.notifications} onChange={(d) => setSettings((p) => ({ ...p, notifications: d }))} onSave={() => save("notifications", settings.notifications)} saving={saving} />
              )}
              {section === "documents" && (
                <DocumentsPanel data={settings.documents} onChange={(d) => setSettings((p) => ({ ...p, documents: d }))} onSave={() => save("documents", settings.documents)} saving={saving} />
              )}
              {section === "agents" && (
                <AgentsPanel data={settings.agents} onChange={(d) => setSettings((p) => ({ ...p, agents: d }))} onSave={() => save("agents", settings.agents)} saving={saving} />
              )}
              {section === "signatures" && (
                <SignaturesPanel data={settings.signatures} onChange={(d) => setSettings((p) => ({ ...p, signatures: d }))} onSave={() => save("signatures", settings.signatures)} saving={saving} />
              )}
              {section === "storage" && (
                <StoragePanel data={settings.storage} onChange={(d) => setSettings((p) => ({ ...p, storage: d }))} onSave={() => save("storage", settings.storage)} saving={saving} />
              )}
              {section === "retention" && (
                <RetentionPanel data={settings.retention} onChange={(d) => setSettings((p) => ({ ...p, retention: d }))} onSave={() => save("retention", settings.retention)} saving={saving} />
              )}
              {section === "integrations" && (
                <IntegrationsPanel
                  data={settings.integrations}
                  onChange={(d) => {
                    setSettings((p) => ({ ...p, integrations: d }));
                    save("integrations", d);
                  }}
                />
              )}
              {section === "security" && (
                <SecurityPanel data={settings.security} onChange={(d) => setSettings((p) => ({ ...p, security: d }))} onSave={() => save("security", settings.security)} saving={saving} token={accessToken ?? ""} />
              )}
              {section === "auditlog" && <AuditLogPanel />}
              {section === "danger" && <DangerPanel onAction={setPendingAction} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "'Satoshi', sans-serif", background: "#F5F5F2", color: "#333", borderRadius: 12, overflow: "hidden", position: "relative" },
  toast: { position: "absolute", top: 12, right: 12, zIndex: 50, background: "#333", color: "#fff", fontSize: 12, fontWeight: 500, padding: "8px 16px", borderRadius: 8 },
  header: { background: "#fff", borderBottom: "1px solid #DBD2C4", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 32, height: 32, background: "#7A8465", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11 },
  headerTitle: { fontSize: 14, fontWeight: 700, color: "#333" },
  adminTag: { fontSize: 12, color: "#7A8465", background: "#f0f1ec", padding: "4px 12px", borderRadius: 20, fontWeight: 500 },
  layout: { display: "grid", gridTemplateColumns: "190px 1fr", minHeight: 640 },
  sidebar: { background: "#fff", borderRight: "1px solid #DBD2C4", padding: "16px 0" },
  navGroup: { fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: ".08em", textTransform: "uppercase", padding: "14px 18px 4px" },
  navItem: { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 18px", fontSize: 13, fontWeight: 500, color: "#555", background: "none", border: "none", borderLeft: "2px solid transparent", cursor: "pointer", textAlign: "left", fontFamily: "'Satoshi', sans-serif", transition: "all .15s" },
  navItemActive: { color: "#5a6448", background: "#eef0e8", borderLeftColor: "#7A8465", fontWeight: 600 },
  content: { padding: 24, display: "flex", flexDirection: "column", gap: 18 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #C8C0B4", overflow: "hidden" },
  dangerCard: { borderColor: "#f0d0d0" },
  cardHead: { padding: "14px 20px", borderBottom: "1px solid #eae8e2", display: "flex", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#222" },
  cardSub: { fontSize: 12, color: "#666", marginTop: 3 },
  cardBody: { padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #f0ede8" },
  rowLabel: { fontSize: 14, fontWeight: 500, color: "#222" },
  rowSub: { fontSize: 12, color: "#666", marginTop: 3 },
  fieldLabel: { display: "block", fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  brandPreview: { background: "#F5F5F2", borderRadius: 8, border: "1px solid #DBD2C4", padding: "13px 16px", display: "flex", alignItems: "center", gap: 14 },
  previewLogo: { width: 38, height: 38, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 },
  saveBtn: { fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 8, border: "none", background: "#7A8465", color: "#fff", cursor: "pointer" },
  dangerBtn: { fontFamily: "'Satoshi', sans-serif", fontSize: 12, fontWeight: 700, padding: "7px 13px", borderRadius: 8, border: "1px solid #e8a0a0", background: "#fff", color: "#b03030", cursor: "pointer" },
  btnCancel: { fontFamily: "'Satoshi', sans-serif", fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "1px solid #DBD2C4", background: "#fff", color: "#555", cursor: "pointer" },
  btnConfirm: { fontFamily: "'Satoshi', sans-serif", fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none", background: "#b03030", color: "#fff", cursor: "pointer" },
};
